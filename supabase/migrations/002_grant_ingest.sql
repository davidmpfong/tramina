alter table public.opportunities
  add column if not exists source_url text,
  add column if not exists raw_content text,
  add column if not exists ingest_run_id uuid,
  add column if not exists application_url text,
  add column if not exists contact_email text,
  add column if not exists required_documents text[] not null default array[]::text[],
  add column if not exists application_window_start date,
  add column if not exists application_window_end date,
  add column if not exists award_type text,
  add column if not exists matching_tags text[] not null default array[]::text[];

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  grant_name text not null,
  source_url text,
  status text not null check (status in ('running', 'success', 'partial_success', 'failed')),
  stage_durations_ms jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  warnings text[] not null default array[]::text[],
  sources_used text[] not null default array[]::text[],
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  version int not null default 1,
  steps jsonb not null,
  locale text not null check (locale in ('en', 'es', 'km')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_definitions_opportunity_id_idx
  on public.workflow_definitions(opportunity_id);

create index if not exists opportunities_matching_tags_gin_idx
  on public.opportunities using gin (matching_tags)
  where is_active = true;

create index if not exists opportunities_is_active_idx
  on public.opportunities(is_active);

alter table public.workflow_definitions enable row level security;
alter table public.ingest_runs enable row level security;

create policy "workflow_definitions_select_active"
on public.workflow_definitions
for select
using (
  exists (
    select 1
    from public.opportunities o
    where o.id = workflow_definitions.opportunity_id
      and o.is_active = true
  )
);

create policy "ingest_runs_no_user_select"
on public.ingest_runs
for select
using (false);

create policy "ingest_runs_no_user_insert"
on public.ingest_runs
for insert
with check (false);

create policy "ingest_runs_no_user_update"
on public.ingest_runs
for update
using (false)
with check (false);
