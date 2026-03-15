-- Add expectation fields to opportunities
alter table public.opportunities
  add column if not exists wizard_estimated_minutes integer,
  add column if not exists application_overview text;
