create schema vanlog;
revoke all on schema vanlog from public, anon, authenticated;
grant usage on schema vanlog to service_role;

create table vanlog.settings (
  id boolean primary key default true check (id),
  currency text not null default 'USD' check (currency in ('USD','BDT')),
  time_zone text not null default 'UTC',
  demo_mode boolean not null default true
);
insert into vanlog.settings default values;

create table vanlog.accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(display_name) between 1 and 80),
  role text not null check (role in ('owner','staff')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table vanlog.sessions (
  id uuid primary key default gen_random_uuid(),
  token_digest text unique not null check (length(token_digest)=64),
  account_id uuid not null references vanlog.accounts(id),
  expires_at timestamptz not null default now()+interval '8 hours',
  created_at timestamptz not null default now()
);
create index sessions_account on vanlog.sessions(account_id);
create table vanlog.rate_buckets (
  scope_key text not null,
  window_start timestamptz not null,
  expires_at timestamptz not null,
  count integer not null default 1,
  primary key(scope_key,window_start)
);
create table vanlog.equipment (
  id uuid primary key,
  name text not null check (length(name) between 1 and 80),
  name_key text generated always as (lower(btrim(name))) stored,
  category text not null check (length(category) between 1 and 80),
  initial_meter_minutes integer not null check (initial_meter_minutes between 0 and 6000000 and initial_meter_minutes%6=0),
  current_meter_minutes integer not null check (current_meter_minutes between 0 and 6000000 and current_meter_minutes%6=0),
  archived boolean not null default false,
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_meter_minutes>=initial_meter_minutes)
);
create index equipment_name on vanlog.equipment(name_key,id);
create table vanlog.tasks (
  id uuid primary key,
  equipment_id uuid not null references vanlog.equipment(id),
  label text not null check (length(label) between 1 and 80),
  interval_days integer check (interval_days between 1 and 3650),
  interval_minutes integer check (interval_minutes between 6 and 600000 and interval_minutes%6=0),
  baseline_on date not null,
  baseline_meter_minutes integer not null check (baseline_meter_minutes between 0 and 6000000 and baseline_meter_minutes%6=0),
  archived boolean not null default false,
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (interval_days is not null or interval_minutes is not null)
);
create index tasks_equipment on vanlog.tasks(equipment_id,id);
create table vanlog.readings (
  id uuid primary key,
  equipment_id uuid not null references vanlog.equipment(id),
  previous_meter_minutes integer not null,
  meter_minutes integer not null check (meter_minutes between 0 and 6000000 and meter_minutes%6=0),
  account_id uuid not null references vanlog.accounts(id),
  note text not null default '' check (length(note)<=1000),
  created_at timestamptz not null default now(),
  check (meter_minutes>=previous_meter_minutes)
);
create index readings_history on vanlog.readings(equipment_id,created_at desc,id desc);
create table vanlog.services (
  id uuid primary key,
  task_id uuid not null references vanlog.tasks(id),
  equipment_id uuid not null references vanlog.equipment(id),
  meter_minutes integer not null check (meter_minutes between 0 and 6000000 and meter_minutes%6=0),
  performed_on date not null,
  cost_minor integer not null default 0 check (cost_minor between 0 and 1000000000),
  note text not null default '' check (length(note)<=1000),
  account_id uuid not null references vanlog.accounts(id),
  created_at timestamptz not null default now()
);
create index services_equipment_history on vanlog.services(equipment_id,created_at desc,id desc);
create index services_task_baseline on vanlog.services(task_id,created_at desc,id desc);
create index services_report on vanlog.services(performed_on,equipment_id);
create table vanlog.mutation_receipts (
  actor_scope text not null,
  request_id uuid not null,
  request_digest text not null,
  result_record_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_scope,request_id)
);

do $$ declare t text;
begin
  foreach t in array array['settings','accounts','sessions','rate_buckets','equipment','tasks','readings','services','mutation_receipts'] loop
    execute format('alter table vanlog.%I enable row level security',t);
    execute format('revoke all on vanlog.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on vanlog.%I to service_role',t);
  end loop;
end $$;

create function vanlog.business_today() returns date language sql stable security invoker set search_path='' as $$
  select (now() at time zone time_zone)::date from vanlog.settings where id;
$$;
create function vanlog.due_status(today date, meter integer, baseline_date date, baseline_meter integer, days integer, minutes integer)
returns text language sql immutable security invoker set search_path='' as $$
  select case
    when (days is not null and today>baseline_date+days) or (minutes is not null and meter>baseline_meter+minutes) then 'overdue'
    when (days is not null and today=baseline_date+days) or (minutes is not null and meter=baseline_meter+minutes) then 'due_now'
    when (days is not null and baseline_date+days-today<=7) or (minutes is not null and baseline_meter+minutes-meter<=minutes*0.1) then 'due_soon'
    else 'current' end;
$$;
create function vanlog.equipment_doc(e vanlog.equipment) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',e.id,'name',e.name,'category',e.category,
    'initialMeterMinutes',e.initial_meter_minutes,'currentMeterMinutes',e.current_meter_minutes,
    'archived',e.archived,'version',e.version,'createdAt',e.created_at,'updatedAt',e.updated_at);
$$;
create function vanlog.task_doc(t vanlog.tasks) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('id',t.id,'equipmentId',t.equipment_id,'label',t.label,
    'intervalDays',t.interval_days,'intervalMinutes',t.interval_minutes,'baselineOn',t.baseline_on,
    'baselineMeterMinutes',t.baseline_meter_minutes,'archived',t.archived,'version',t.version,
    'createdAt',t.created_at,'updatedAt',t.updated_at,'equipmentName',e.name,'equipmentArchived',e.archived,
    'currentMeterMinutes',e.current_meter_minutes,'lastServiceOn',s.performed_on,
    'lastServiceMeterMinutes',s.meter_minutes,'dueOn',coalesce(s.performed_on,t.baseline_on)+t.interval_days,
    'dueMeterMinutes',coalesce(s.meter_minutes,t.baseline_meter_minutes)+t.interval_minutes,
    'status',vanlog.due_status(vanlog.business_today(),e.current_meter_minutes,
      coalesce(s.performed_on,t.baseline_on),coalesce(s.meter_minutes,t.baseline_meter_minutes),t.interval_days,t.interval_minutes)))
  from vanlog.equipment e left join lateral (
    select performed_on,meter_minutes from vanlog.services where task_id=t.id order by created_at desc,id desc limit 1
  ) s on true where e.id=t.equipment_id;
$$;

create view vanlog.history with (security_invoker=true) as
  select id,equipment_id,account_id,created_at,jsonb_build_object('kind','reading','id',id,'equipmentId',equipment_id,
    'previousMeterMinutes',previous_meter_minutes,'meterMinutes',meter_minutes,'accountId',account_id,'note',note,'createdAt',created_at) doc
  from vanlog.readings
  union all
  select id,equipment_id,account_id,created_at,jsonb_build_object('kind','service','id',id,'taskId',task_id,
    'equipmentId',equipment_id,'meterMinutes',meter_minutes,'performedOn',performed_on,
    'costMinor',cost_minor,'accountId',account_id,'note',note,'createdAt',created_at) doc
  from vanlog.services;
grant select on vanlog.history to service_role;

revoke all on all functions in schema vanlog from public,anon,authenticated;
grant execute on all functions in schema vanlog to service_role;
