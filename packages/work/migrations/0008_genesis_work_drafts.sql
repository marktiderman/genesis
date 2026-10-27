-- Genesis pursuits, part 2: drafts.
--
-- A goal, project, task or issue can be a draft (status 'draft'): written and arranged by those who
-- may write its owner, and hidden from everyone else until it's set to another status. For a coach
-- preparing a client's plan, or a leadership team drafting next quarter's goals before they're
-- revealed. Reading a draft takes the same right as writing it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0001 (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0008_genesis_work_drafts.test.sql`).

alter table genesis_work.pursuits drop constraint pursuits_status;
alter table genesis_work.pursuits
  add constraint pursuits_status check (status in ('draft', 'active', 'done', 'missed', 'dropped'));
alter table genesis_work.work_items drop constraint work_items_status;
alter table genesis_work.work_items
  add constraint work_items_status check (status in ('draft', 'open', 'done', 'dropped'));

drop policy pursuits_read on genesis_work.pursuits;
create policy pursuits_read on genesis_work.pursuits for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = pursuits.tenant_id
                   and r.owner_id = coalesce(pursuits.person_id, pursuits.team_id, pursuits.organization_id))
         and (status <> 'draft' or private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write')));

drop policy work_items_read on genesis_work.work_items;
create policy work_items_read on genesis_work.work_items for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = work_items.tenant_id
                   and r.owner_id = coalesce(work_items.person_id, work_items.team_id, work_items.organization_id))
         and (status <> 'draft' or private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write')));
