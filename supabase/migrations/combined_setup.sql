create extension if not exists "uuid-ossp";

create table if not exists public.users (
  id uuid primary key,
  email text unique not null,
  language_preference text not null default 'en' check (language_preference in ('en', 'es', 'km')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  business_name text not null,
  industry text not null,
  revenue_range text not null,
  employee_count int not null check (employee_count >= 0),
  zip_code text not null,
  years_in_business int not null check (years_in_business >= 0),
  is_immigrant_owned boolean not null default true,
  is_minority_owned boolean not null default false,
  is_woman_owned boolean not null default false,
  is_artist boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('grant', 'loan', 'benefit')),
  funder text not null,
  amount_min numeric,
  amount_max numeric,
  description text not null,
  eligibility_rules jsonb not null default '{}'::jsonb,
  deadline date,
  is_active boolean not null default true,
  geographic_scope text,
  languages_available text[] not null default array['en'],
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'draft',
  draft_content jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  document_type text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_referrals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  partner_name text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.documents enable row level security;
alter table public.partner_referrals enable row level security;

create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "business_profiles_select_own" on public.business_profiles for select using (auth.uid() = user_id);
create policy "business_profiles_insert_own" on public.business_profiles for insert with check (auth.uid() = user_id);
create policy "business_profiles_update_own" on public.business_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "opportunities_select_active" on public.opportunities for select using (is_active = true);
create policy "applications_select_own" on public.applications for select using (auth.uid() = user_id);
create policy "applications_insert_own" on public.applications for insert with check (auth.uid() = user_id);
create policy "applications_update_own" on public.applications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_select_own" on public.documents for select using (auth.uid() = user_id);
create policy "documents_insert_own" on public.documents for insert with check (auth.uid() = user_id);
create policy "documents_update_own" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "partner_referrals_select_own" on public.partner_referrals for select using (auth.uid() = user_id);
create policy "partner_referrals_insert_own" on public.partner_referrals for insert with check (auth.uid() = user_id);
create policy "partner_referrals_update_own" on public.partner_referrals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  version int not null default 1,
  steps jsonb not null,
  locale text not null check (locale in ('en', 'es', 'km')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_definitions_opportunity_id_idx on public.workflow_definitions(opportunity_id);
create index if not exists opportunities_matching_tags_gin_idx on public.opportunities using gin (matching_tags) where is_active = true;
create index if not exists opportunities_is_active_idx on public.opportunities(is_active);

alter table public.workflow_definitions enable row level security;
alter table public.ingest_runs enable row level security;

create policy "workflow_definitions_select_active" on public.workflow_definitions for select using (exists (select 1 from public.opportunities o where o.id = workflow_definitions.opportunity_id and o.is_active = true));
create policy "ingest_runs_no_user_select" on public.ingest_runs for select using (false);
create policy "ingest_runs_no_user_insert" on public.ingest_runs for insert with check (false);
create policy "ingest_runs_no_user_update" on public.ingest_runs for update using (false) with check (false);
