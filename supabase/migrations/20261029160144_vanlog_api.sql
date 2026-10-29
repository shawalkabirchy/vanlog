create function public.vanlog_rate(p_scope text,p_limit integer,p_seconds integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare starts timestamptz; hits integer;
begin
  starts:=to_timestamp(floor(extract(epoch from now())/p_seconds)*p_seconds);
  insert into vanlog.rate_buckets(scope_key,window_start,expires_at) values(p_scope,starts,starts+make_interval(secs=>p_seconds))
  on conflict(scope_key,window_start) do update set count=vanlog.rate_buckets.count+1 returning count into hits;
  return jsonb_build_object('allowed',hits<=p_limit,'retryAfter',greatest(1,ceil(extract(epoch from starts+make_interval(secs=>p_seconds)-now()))));
end $$;
revoke all on function public.vanlog_rate(text,integer,integer) from public,anon,authenticated;
grant execute on function public.vanlog_rate(text,integer,integer) to service_role;

create function public.vanlog_api(p_operation text,p_session_digest text default null,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor vanlog.accounts; sess vanlog.sessions; eq vanlog.equipment; task vanlog.tasks;
  cfg vanlog.settings; receipt vanlog.mutation_receipts;
  target uuid; request_id uuid; scope text; fingerprint text; result jsonb; rows jsonb;
  size integer:=coalesce((p_input->>'limit')::integer,25); write_op boolean;
  new_minutes integer; total bigint; test_ids uuid[];
begin
  select * into cfg from vanlog.settings where id;
  if p_operation='configure' then
    perform 1 from vanlog.settings where id for update;
    if p_input->>'currency' not in ('USD','BDT') or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_input->>'timeZone') then
      raise exception 'VALIDATION_ERROR';
    end if;
    if cfg.currency<>p_input->>'currency' and exists(select 1 from vanlog.services) then raise exception 'CURRENCY_LOCKED'; end if;
    update vanlog.settings set currency=p_input->>'currency',time_zone=p_input->>'timeZone',demo_mode=(p_input->>'demoMode')::boolean where id;
    return jsonb_build_object('configured',true);
  elsif p_operation='account_provision' then
    perform 1 from vanlog.settings where id for update;
    select * into actor from vanlog.accounts where auth_user_id=(p_input->>'authUserId')::uuid;
    if not found and p_input ? 'accountId' then select * into actor from vanlog.accounts where id=(p_input->>'accountId')::uuid; end if;
    if actor.id is null then
      if (select count(*) from vanlog.accounts)>=10 then raise exception 'ACCOUNT_CAPACITY_REACHED'; end if;
      insert into vanlog.accounts(auth_user_id,display_name,role) values((p_input->>'authUserId')::uuid,p_input->>'displayName',p_input->>'role') returning * into actor;
    else
      update vanlog.accounts set auth_user_id=(p_input->>'authUserId')::uuid,display_name=p_input->>'displayName',role=p_input->>'role',disabled=false,updated_at=now() where id=actor.id returning * into actor;
      delete from vanlog.sessions where account_id=actor.id;
    end if;
    return jsonb_build_object('id',actor.id,'displayName',actor.display_name,'role',actor.role);
  elsif p_operation in ('account_revoke','account_disable') then
    perform 1 from vanlog.settings where id for update;
    select * into actor from vanlog.accounts where auth_user_id=(p_input->>'authUserId')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    delete from vanlog.sessions where account_id=actor.id;
    if p_operation='account_disable' then update vanlog.accounts set disabled=true,updated_at=now() where id=actor.id; end if;
    return jsonb_build_object('revoked',true);
  elsif p_operation='session_create' then
    select * into actor from vanlog.accounts where auth_user_id=(p_input->>'authUserId')::uuid and not disabled;
    if not found then raise exception 'UNAUTHENTICATED'; end if;
    insert into vanlog.sessions(token_digest,account_id) values(p_input->>'tokenDigest',actor.id) returning * into sess;
    return jsonb_build_object('user',jsonb_build_object('id',actor.id,'displayName',actor.display_name,'role',actor.role,'expiresAt',sess.expires_at));
  elsif p_operation='session_delete' then
    delete from vanlog.sessions where token_digest=p_session_digest;
    return '{}'::jsonb;
  elsif p_operation='cleanup' then
    delete from vanlog.sessions where id in (select id from vanlog.sessions where expires_at<now() limit 500);
    delete from vanlog.rate_buckets where (scope_key,window_start) in (select scope_key,window_start from vanlog.rate_buckets where expires_at<now() limit 500);
    delete from vanlog.mutation_receipts where (actor_scope,request_id) in (select actor_scope,request_id from vanlog.mutation_receipts where created_at<now()-interval '24 hours' limit 500);
    return jsonb_build_object('cleaned',true);
  elsif p_operation='export' then
    perform 1 from vanlog.settings where id for update;
    return jsonb_build_object('appId','P07','formatVersion',1,'exportedAt',now(),'payload',jsonb_build_object(
      'settings',to_jsonb(cfg),
      'accounts',(select coalesce(jsonb_agg(to_jsonb(a)-'auth_user_id'||jsonb_build_object('disabled',true)),'[]') from vanlog.accounts a),
      'equipment',(select coalesce(jsonb_agg(to_jsonb(e)-'name_key'),'[]') from vanlog.equipment e),
      'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from vanlog.tasks t),
      'readings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from vanlog.readings r),
      'services',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from vanlog.services s)));
  elsif p_operation in ('demo_reset','test_cleanup') then
    perform 1 from vanlog.settings where id for update;
    if not cfg.demo_mode then raise exception 'FORBIDDEN'; end if;
    if p_operation='demo_reset' then
      delete from vanlog.mutation_receipts;
      delete from vanlog.services; delete from vanlog.readings; delete from vanlog.tasks; delete from vanlog.equipment;
    else
      select array_agg(value::uuid) into test_ids from jsonb_array_elements_text(p_input->'equipmentIds');
      if exists(select 1 from vanlog.equipment where id=any(test_ids) and name not like 'QA-%') then raise exception 'FORBIDDEN'; end if;
      delete from vanlog.mutation_receipts where result_record_id in (
        select id from vanlog.services where equipment_id=any(test_ids) union select id from vanlog.readings where equipment_id=any(test_ids)
        union select id from vanlog.tasks where equipment_id=any(test_ids) union select unnest(test_ids));
      delete from vanlog.services where equipment_id=any(test_ids);
      delete from vanlog.readings where equipment_id=any(test_ids);
      delete from vanlog.tasks where equipment_id=any(test_ids);
      delete from vanlog.equipment where id=any(test_ids);
    end if;
    return jsonb_build_object('cleaned',true);
  elsif p_operation='readiness' then
    if cfg.currency<>p_input->>'currency' or cfg.time_zone<>p_input->>'timeZone' or cfg.demo_mode<>(p_input->>'demoMode')::boolean then raise exception 'CONFIGURATION_MISMATCH'; end if;
    return jsonb_build_object('ready',true);
  end if;

  select * into sess from vanlog.sessions where token_digest=p_session_digest and expires_at>now();
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  select * into actor from vanlog.accounts where id=sess.account_id and not disabled and auth_user_id is not null;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  if p_operation='session_get' then
    return jsonb_build_object('user',jsonb_build_object('id',actor.id,'displayName',actor.display_name,'role',actor.role,'expiresAt',sess.expires_at));
  end if;
  if p_operation in ('equipment_create','equipment_update','task_create','task_update','tasks_list','history_list','dashboard','costs') and actor.role<>'owner' then raise exception 'FORBIDDEN'; end if;
  if size<1 or size>100 then raise exception 'VALIDATION_ERROR'; end if;
  target:=(p_input->>'id')::uuid;

  if p_operation='equipment_list' then
    if coalesce((p_input->>'archived')::boolean,false) and actor.role<>'owner' then raise exception 'FORBIDDEN'; end if;
    select coalesce(jsonb_agg(item order by key_name,key_id),'[]') into rows from (
      select e.name_key key_name,e.id key_id,vanlog.equipment_doc(e)||jsonb_build_object('_sortKey',jsonb_build_array(e.name_key,e.id),
        'taskCounts',coalesce((select jsonb_object_agg(status,n) from (
          select vanlog.task_doc(t)->>'status' status,count(*) n from vanlog.tasks t where t.equipment_id=e.id and not t.archived group by 1
        ) x),'{}')) item
      from vanlog.equipment e where e.archived=coalesce((p_input->>'archived')::boolean,false)
        and (p_input->>'q' is null or position(lower(p_input->>'q') in e.name_key)>0 or position(lower(p_input->>'q') in lower(e.category))>0)
        and (p_input->'after' is null or (e.name_key,e.id)>(p_input#>>'{after,0}',(p_input#>>'{after,1}')::uuid))
      order by e.name_key,e.id limit size+1
    ) page;
    return jsonb_build_object('items',rows);
  elsif p_operation in ('equipment_get','equipment_history') then
    select * into eq from vanlog.equipment where id=target;
    if not found or (eq.archived and actor.role<>'owner') then raise exception 'NOT_FOUND'; end if;
    if p_operation='equipment_get' then
      return jsonb_build_object('equipment',vanlog.equipment_doc(eq),'tasks',coalesce((select jsonb_agg(vanlog.task_doc(t) order by t.label,t.id) from vanlog.tasks t where t.equipment_id=target and not t.archived),'[]'));
    end if;
  end if;
  if p_operation in ('history_list','equipment_history') then
    select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]') into rows from (
      select h.created_at,h.id,(case when actor.role='staff' then h.doc-'costMinor' else h.doc end)||jsonb_build_object(
        'equipmentName',e.name,'actorName',a.display_name,'taskLabel',t.label,'_sortKey',jsonb_build_array(h.created_at,h.id)) item
      from vanlog.history h join vanlog.equipment e on e.id=h.equipment_id join vanlog.accounts a on a.id=h.account_id
      left join vanlog.tasks t on t.id=(h.doc->>'taskId')::uuid
      where (target is null or h.equipment_id=target) and (p_input->>'kind' is null or h.doc->>'kind'=p_input->>'kind')
        and (p_input->'after' is null or (h.created_at,h.id)<((p_input#>>'{after,0}')::timestamptz,(p_input#>>'{after,1}')::uuid))
      order by h.created_at desc,h.id desc limit size+1
    ) page;
    return jsonb_build_object('items',rows);
  elsif p_operation='tasks_list' then
    select coalesce(jsonb_agg(item order by rank,label_key,id),'[]') into rows from (
      select d||jsonb_build_object('_sortKey',jsonb_build_array(rank,label_key,id)) item,rank,label_key,id from (
        select t.id,lower(t.label) label_key,vanlog.task_doc(t) d,
          array_position(array['overdue','due_now','due_soon','current'],vanlog.task_doc(t)->>'status') rank
        from vanlog.tasks t join vanlog.equipment e on e.id=t.equipment_id
        where not t.archived and not e.archived and (target is null or t.equipment_id=target)
      ) all_tasks where (p_input->>'status' is null or d->>'status'=p_input->>'status')
        and (p_input->'after' is null or (rank,label_key,id)>((p_input#>>'{after,0}')::integer,p_input#>>'{after,1}',(p_input#>>'{after,2}')::uuid))
      order by rank,label_key,id limit size+1
    ) page;
    return jsonb_build_object('items',rows);
  elsif p_operation='dashboard' then
    return jsonb_build_object('equipmentCount',(select count(*) from vanlog.equipment where not archived),
      'taskCounts',coalesce((select jsonb_object_agg(status,n) from (
        select vanlog.task_doc(t)->>'status' status,count(*) n from vanlog.tasks t join vanlog.equipment e on e.id=t.equipment_id where not t.archived and not e.archived group by 1
      ) counts),'{}'),'currency',cfg.currency,'timeZone',cfg.time_zone,'businessDate',vanlog.business_today());
  elsif p_operation='costs' then
    if (p_input->>'endOn')::date<=(p_input->>'startOn')::date or (p_input->>'endOn')::date-(p_input->>'startOn')::date>366 then raise exception 'VALIDATION_ERROR'; end if;
    select coalesce(sum(cost_minor),0) into total from vanlog.services where performed_on>=(p_input->>'startOn')::date and performed_on<(p_input->>'endOn')::date;
    return jsonb_build_object('currency',cfg.currency,'period',jsonb_build_object('startOn',p_input->>'startOn','endOn',p_input->>'endOn'),
      'totalMinor',total,'equipmentTotals',coalesce((select jsonb_agg(to_jsonb(x) order by x."costMinor" desc,x."equipmentName") from (
        select e.id "equipmentId",e.name "equipmentName",sum(s.cost_minor) "costMinor",count(*) "serviceCount"
        from vanlog.services s join vanlog.equipment e on e.id=s.equipment_id where s.performed_on>=(p_input->>'startOn')::date and s.performed_on<(p_input->>'endOn')::date group by e.id
      ) x),'[]'));
  end if;

  write_op:=p_operation in ('equipment_create','equipment_update','task_create','task_update','reading_create','service_create');
  if not write_op then raise exception 'NOT_FOUND'; end if;
  -- One small business: a single lock also makes the demo's collection caps atomic.
  select * into cfg from vanlog.settings where id for update;
  if not exists(select 1 from vanlog.accounts where id=actor.id and not disabled and auth_user_id is not null) then raise exception 'UNAUTHENTICATED'; end if;
  request_id:=(p_input->>'requestId')::uuid;
  if request_id is not null then
    scope:=actor.id::text||':'||p_operation||':'||coalesce(target::text,'');
    fingerprint:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    select * into receipt from vanlog.mutation_receipts where actor_scope=scope and mutation_receipts.request_id=vanlog_api.request_id;
    if found then
      if receipt.created_at<now()-interval '24 hours' then raise exception 'REQUEST_ALREADY_RECORDED'; end if;
      if receipt.request_digest<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return receipt.result;
    end if;
    if (p_operation='equipment_create' and exists(select 1 from vanlog.equipment where id=request_id))
      or (p_operation='task_create' and exists(select 1 from vanlog.tasks where id=request_id))
      or (p_operation='reading_create' and exists(select 1 from vanlog.readings where id=request_id))
      or (p_operation='service_create' and exists(select 1 from vanlog.services where id=request_id)) then raise exception 'REQUEST_ALREADY_RECORDED'; end if;
  end if;
  if p_operation='equipment_create' then
    if (select count(*) from vanlog.equipment)>=100 then raise exception 'EQUIPMENT_CAPACITY_REACHED'; end if;
    insert into vanlog.equipment(id,name,category,initial_meter_minutes,current_meter_minutes)
      values(request_id,p_input->>'name',p_input->>'category',(p_input->>'initialMeterMinutes')::integer,(p_input->>'initialMeterMinutes')::integer) returning * into eq;
    result:=vanlog.equipment_doc(eq);
  elsif p_operation='equipment_update' then
    update vanlog.equipment set name=coalesce(p_input->>'name',name),category=coalesce(p_input->>'category',category),
      archived=coalesce((p_input->>'archived')::boolean,archived),version=version+1,updated_at=now()
      where id=target and version=(p_input->>'expectedVersion')::integer returning * into eq;
    if not found then
      if not exists(select 1 from vanlog.equipment where id=target) then raise exception 'NOT_FOUND'; end if;
      raise exception 'STALE_VERSION';
    end if;
    result:=vanlog.equipment_doc(eq);
  else
    if p_operation in ('task_update','service_create') then
      select * into task from vanlog.tasks where id=target;
      if not found then raise exception 'NOT_FOUND'; end if;
      select * into eq from vanlog.equipment where id=task.equipment_id for update;
    else
      select * into eq from vanlog.equipment where id=target for update;
    end if;
    if not found then raise exception 'NOT_FOUND'; end if;
    if eq.archived then raise exception 'EQUIPMENT_ARCHIVED'; end if;
    if p_operation='task_create' then
      if (select count(*) from vanlog.tasks where equipment_id=eq.id)>=20 then raise exception 'TASK_CAPACITY_REACHED'; end if;
      if (p_input->>'baselineOn')::date>vanlog.business_today() or (p_input->>'baselineMeterMinutes')::integer>eq.current_meter_minutes then raise exception 'INVALID_BASELINE'; end if;
      insert into vanlog.tasks(id,equipment_id,label,interval_days,interval_minutes,baseline_on,baseline_meter_minutes)
        values(request_id,eq.id,p_input->>'label',(p_input->>'intervalDays')::integer,(p_input->>'intervalMinutes')::integer,(p_input->>'baselineOn')::date,(p_input->>'baselineMeterMinutes')::integer) returning * into task;
      result:=vanlog.task_doc(task);
    elsif p_operation='task_update' then
      if task.version<>(p_input->>'expectedVersion')::integer then raise exception 'STALE_VERSION'; end if;
      if (case when p_input ? 'intervalDays' then (p_input->>'intervalDays')::integer else task.interval_days end) is null
        and (case when p_input ? 'intervalMinutes' then (p_input->>'intervalMinutes')::integer else task.interval_minutes end) is null then raise exception 'INTERVAL_REQUIRED'; end if;
      update vanlog.tasks set label=coalesce(p_input->>'label',label),
        interval_days=case when p_input ? 'intervalDays' then (p_input->>'intervalDays')::integer else interval_days end,
        interval_minutes=case when p_input ? 'intervalMinutes' then (p_input->>'intervalMinutes')::integer else interval_minutes end,
        archived=coalesce((p_input->>'archived')::boolean,archived),version=version+1,updated_at=now() where id=task.id returning * into task;
      result:=vanlog.task_doc(task);
    else
      if cfg.demo_mode and (select (select count(*) from vanlog.readings)+(select count(*) from vanlog.services))>=10000 then raise exception 'DEMO_CAPACITY_REACHED'; end if;
      if p_operation='reading_create' then
        if eq.version<>(p_input->>'expectedVersion')::integer then raise exception 'STALE_VERSION'; end if;
        new_minutes:=(p_input->>'meterMinutes')::integer;
        if new_minutes<eq.current_meter_minutes then raise exception 'METER_BELOW_CURRENT'; end if;
        insert into vanlog.readings(id,equipment_id,previous_meter_minutes,meter_minutes,account_id,note)
          values(request_id,eq.id,eq.current_meter_minutes,new_minutes,actor.id,coalesce(p_input->>'note',''));
        update vanlog.equipment set current_meter_minutes=new_minutes,version=version+1,updated_at=now() where id=eq.id returning * into eq;
        select jsonb_build_object('reading',doc,'equipment',vanlog.equipment_doc(eq)) into result from vanlog.history where id=request_id and doc->>'kind'='reading';
      else
        if task.archived then raise exception 'TASK_ARCHIVED'; end if;
        if eq.version<>(p_input->>'expectedEquipmentVersion')::integer then raise exception 'STALE_VERSION'; end if;
        insert into vanlog.services(id,task_id,equipment_id,meter_minutes,performed_on,cost_minor,note,account_id)
          values(request_id,task.id,eq.id,eq.current_meter_minutes,vanlog.business_today(),coalesce((p_input->>'costMinor')::integer,0),coalesce(p_input->>'note',''),actor.id);
        update vanlog.equipment set version=version+1,updated_at=now() where id=eq.id returning * into eq;
        select jsonb_build_object('service',doc,'equipment',vanlog.equipment_doc(eq)) into result from vanlog.history where id=request_id and doc->>'kind'='service';
      end if;
    end if;
  end if;
  if request_id is not null then insert into vanlog.mutation_receipts(actor_scope,request_id,request_digest,result_record_id,result) values(scope,request_id,fingerprint,request_id,result); end if;
  return result;
end $$;
revoke all on function public.vanlog_api(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vanlog_api(text,text,jsonb) to service_role;
