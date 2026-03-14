create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key,
  email text unique not null,
  language_preference text not null default 'en' check (language_preference in ('en', 'es', 'km')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'draft',
  draft_content jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  document_type text not null,
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
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

create policy "users_select_own" on public.users
for select using (auth.uid() = id);

create policy "users_insert_own" on public.users
for insert with check (auth.uid() = id);

create policy "users_update_own" on public.users
for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "business_profiles_select_own" on public.business_profiles
for select using (auth.uid() = user_id);

create policy "business_profiles_insert_own" on public.business_profiles
for insert with check (auth.uid() = user_id);

create policy "business_profiles_update_own" on public.business_profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "opportunities_select_active" on public.opportunities
for select using (is_active = true);

create policy "applications_select_own" on public.applications
for select using (auth.uid() = user_id);

create policy "applications_insert_own" on public.applications
for insert with check (auth.uid() = user_id);

create policy "applications_update_own" on public.applications
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "documents_select_own" on public.documents
for select using (auth.uid() = user_id);

create policy "documents_insert_own" on public.documents
for insert with check (auth.uid() = user_id);

create policy "documents_update_own" on public.documents
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "partner_referrals_select_own" on public.partner_referrals
for select using (auth.uid() = user_id);

create policy "partner_referrals_insert_own" on public.partner_referrals
for insert with check (auth.uid() = user_id);

create policy "partner_referrals_update_own" on public.partner_referrals
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
