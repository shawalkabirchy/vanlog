create function public.vanlog_restore(p_backup jsonb,p_replace boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload jsonb; cfg vanlog.settings;
begin
  select * into cfg from vanlog.settings where id for update;
  if p_backup->>'appId'<>'P07' or p_backup->>'formatVersion'<>'1' then raise exception 'IMPORT_INVALID'; end if;
  payload:=p_backup->'payload';
  if payload is null or jsonb_array_length(payload->'equipment')>100 or jsonb_array_length(payload->'accounts')>10
    or jsonb_array_length(payload->'readings')+jsonb_array_length(payload->'services')>10000 then raise exception 'IMPORT_INVALID'; end if;
  if exists(select 1 from vanlog.equipment) and not p_replace then raise exception 'RESTORE_REQUIRES_EMPTY'; end if;
  if payload#>>'{settings,currency}' not in ('USD','BDT') or not exists(select 1 from pg_catalog.pg_timezone_names where name=payload#>>'{settings,time_zone}') then raise exception 'IMPORT_INVALID'; end if;
  delete from vanlog.sessions;
  delete from vanlog.mutation_receipts;
  delete from vanlog.services;
  delete from vanlog.readings;
  delete from vanlog.tasks;
  delete from vanlog.equipment;
  insert into vanlog.accounts(id,display_name,role,disabled,created_at,updated_at)
    select id,display_name,role,true,created_at,updated_at from jsonb_populate_recordset(null::vanlog.accounts,payload->'accounts')
    on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,disabled=true,updated_at=now();
  insert into vanlog.equipment(id,name,category,initial_meter_minutes,current_meter_minutes,archived,version,created_at,updated_at)
    select id,name,category,initial_meter_minutes,current_meter_minutes,archived,version,created_at,updated_at
    from jsonb_populate_recordset(null::vanlog.equipment,payload->'equipment');
  insert into vanlog.tasks select * from jsonb_populate_recordset(null::vanlog.tasks,payload->'tasks');
  insert into vanlog.readings select * from jsonb_populate_recordset(null::vanlog.readings,payload->'readings');
  insert into vanlog.services select * from jsonb_populate_recordset(null::vanlog.services,payload->'services');
  if (select count(*) from vanlog.accounts)>10 or exists(select 1 from vanlog.tasks group by equipment_id having count(*)>20)
    or exists(select 1 from vanlog.readings r join vanlog.equipment e on e.id=r.equipment_id where r.meter_minutes>e.current_meter_minutes)
    or exists(select 1 from vanlog.services s join vanlog.tasks t on t.id=s.task_id where s.equipment_id<>t.equipment_id)
    or exists(select 1 from vanlog.tasks t join vanlog.equipment e on e.id=t.equipment_id where t.baseline_meter_minutes>e.current_meter_minutes) then raise exception 'IMPORT_INVALID'; end if;
  update vanlog.settings set currency=payload#>>'{settings,currency}',time_zone=payload#>>'{settings,time_zone}' where id;
  return jsonb_build_object('restored',true,'equipmentCount',(select count(*) from vanlog.equipment),'accountsRequireProvisioning',true);
end $$;
revoke all on function public.vanlog_restore(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.vanlog_restore(jsonb,boolean) to service_role;
