alter table public.opportunities
  add constraint opportunities_name_funder_unique unique (name, funder);
