create extension if not exists pgcrypto;

create table if not exists public.service_record_structured (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_note_id text not null,
  schedule_task_id text,
  helper_email text,
  helper_name text,
  user_name text,
  service_date text,
  start_time text,
  end_time text,
  location text,
  location_note text,
  time_of_day text,
  temperature numeric(4,1),
  physical_state text,
  mental_state text,
  risk_flags jsonb not null default '[]'::jsonb,
  action_result text,
  difficulty text,
  assist_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists service_record_structured_source_note_uidx
  on public.service_record_structured (source_type, source_note_id);

create index if not exists service_record_structured_schedule_task_idx
  on public.service_record_structured (schedule_task_id);

create index if not exists service_record_structured_service_date_idx
  on public.service_record_structured (service_date);

create index if not exists service_record_structured_risk_flags_gin_idx
  on public.service_record_structured
  using gin (risk_flags);

create table if not exists public.service_action_logs (
  id uuid primary key default gen_random_uuid(),
  structured_record_id uuid not null references public.service_record_structured(id) on delete cascade,
  action_type text not null,
  action_detail text,
  action_detail_other text,
  actor text,
  target text,
  start_time text,
  end_time text,
  duration integer,
  action_result text,
  difficulty text,
  assist_level text,
  created_at timestamptz not null default now()
);

create index if not exists service_action_logs_structured_record_idx
  on public.service_action_logs (structured_record_id);

create index if not exists service_action_logs_action_type_idx
  on public.service_action_logs (action_type);

create table if not exists public.service_irregular_events (
  id uuid primary key default gen_random_uuid(),
  structured_record_id uuid not null references public.service_record_structured(id) on delete cascade,
  event_type text not null,
  before_state text,
  after_action text,
  created_at timestamptz not null default now()
);

create index if not exists service_irregular_events_structured_record_idx
  on public.service_irregular_events (structured_record_id);

create index if not exists service_irregular_events_event_type_idx
  on public.service_irregular_events (event_type);
