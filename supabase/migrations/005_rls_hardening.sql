-- Explicitly deny all user writes on opportunities (service role only can write)
-- These tables are admin-managed, not user-managed
create policy "opportunities_no_user_insert"
on public.opportunities
for insert
with check (false);

create policy "opportunities_no_user_update"
on public.opportunities
for update
using (false)
with check (false);

create policy "opportunities_no_user_delete"
on public.opportunities
for delete
using (false);

-- Explicitly deny all user writes on workflow_definitions (service role only can write)
create policy "workflow_definitions_no_user_insert"
on public.workflow_definitions
for insert
with check (false);

create policy "workflow_definitions_no_user_update"
on public.workflow_definitions
for update
using (false)
with check (false);

create policy "workflow_definitions_no_user_delete"
on public.workflow_definitions
for delete
using (false);
