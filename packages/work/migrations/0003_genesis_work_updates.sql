-- Genesis updates: genesis_work.status_updates and genesis_work.update_requests
--
-- A status update is a dated note on a pursuit, a work item or a metric: how it's going
-- (on track, at risk, off track) and why. An update request asks one person for an update on
-- one of those items by a due time; the first update that person posts on the item answers it.
-- Overdue requests are what a screen shows as "update due", on the item and in every rollup
-- above it.
--
-- This file needs 0001_genesis_work_pursuits and 0002_genesis_work_metrics, and uses the same app hooks:
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
--
-- Who may do what:
--   - read updates and requests: whoever may read the item; also the person a request asks;
--   - post an update: whoever may write the item, and the person an open request on it asks;
--   - ask for an update: whoever may read the item (your hook decides who that is; an app that
--     wants "only people tied to it, and leaders above its team" answers that in its hook);
--   - cancel a request: whoever asked.
-- An update or a request takes its item's tenant and owner; nobody writes those.
--
-- An update with a health on a pursuit also sets that pursuit's health, so lists show the latest.
--
-- Reminders aren't sent from here. An app job, scheduled with genesis_schedule_job (the jobs
-- block), reads update_requests_due and sends one notification per request through
-- genesis-notifications, keyed "update-request:<id>:<due date>" so a re-run sends once, and
-- cancels it when the request is answered. "Due today" is the recipient's own day
-- (genesis-core/dates), not UTC.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0010. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0003_genesis_work_updates.test.sql`).

create schema if not exists private;
create schema if not exists genesis_work;

-- Tables ---------------------------------------------------------------------------------------

create table genesis_work.status_updates (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null
    constraint status_updates_item_kind check (item_kind in ('pursuit', 'work_item', 'metric')),
  item_id uuid not null,
  -- Copied from the item, for access; never written by the app.
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  health text
    constraint status_updates_health check (health in ('on_track', 'at_risk', 'off_track')),
  body text
    constraint status_updates_body_length check (body is null or char_length(body) <= 10000),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint status_updates_says_something check (health is not null or nullif(btrim(body), '') is not null)
);

comment on table genesis_work.status_updates is
  'Dated updates on a pursuit, work item or metric: health and a note. Genesis updates. @genesis {"label": "Status updates", "labelField": "body"}';

create index status_updates_item_idx on genesis_work.status_updates (item_kind, item_id, created_at desc);
create index status_updates_tenant_owner_idx on genesis_work.status_updates (tenant_id, coalesce(person_id, team_id, organization_id));
create index status_updates_author_idx on genesis_work.status_updates (author_id);

create table genesis_work.update_requests (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null
    constraint update_requests_item_kind check (item_kind in ('pursuit', 'work_item', 'metric')),
  item_id uuid not null,
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  asked_by uuid default auth.uid() references auth.users (id) on delete set null,
  asked_of uuid not null references auth.users (id) on delete cascade,
  due_at timestamptz not null,
  note text
    constraint update_requests_note_length check (note is null or char_length(note) <= 2000),
  status text not null default 'open'
    constraint update_requests_status check (status in ('open', 'answered', 'cancelled')),
  answered_by uuid references genesis_work.status_updates (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint update_requests_answer_matches check ((status = 'answered') = (answered_at is not null))
);

comment on table genesis_work.update_requests is
  'A request to one person for an update on an item by a due time. Genesis updates. @genesis {"label": "Update requests", "labelField": "note"}';

create index update_requests_item_idx on genesis_work.update_requests (item_kind, item_id) where status = 'open';
create index update_requests_asked_of_idx on genesis_work.update_requests (asked_of, due_at) where status = 'open';
create index update_requests_tenant_owner_idx on genesis_work.update_requests (tenant_id, coalesce(person_id, team_id, organization_id));
create index update_requests_asked_by_idx on genesis_work.update_requests (asked_by);
create index update_requests_answered_by_idx on genesis_work.update_requests (answered_by);

-- Guards ---------------------------------------------------------------------------------------

-- Copies an item's tenant and owner onto the new row, or refuses an item that doesn't exist.
create or replace function private.genesis_updates_fill_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid; p uuid; tm uuid; o uuid;
begin
  if tg_op = 'UPDATE' and (new.item_kind, new.item_id) is distinct from (old.item_kind, old.item_id) then
    raise exception 'An update or request never moves to another item' using errcode = '22023';
  end if;
  if new.item_kind = 'pursuit' then
    select x.tenant_id, x.person_id, x.team_id, x.organization_id into t, p, tm, o from genesis_work.pursuits x where x.id = new.item_id;
  elsif new.item_kind = 'work_item' then
    select x.tenant_id, x.person_id, x.team_id, x.organization_id into t, p, tm, o from genesis_work.work_items x where x.id = new.item_id;
  else
    select x.tenant_id, x.person_id, x.team_id, x.organization_id into t, p, tm, o from genesis_work.metrics x where x.id = new.item_id;
  end if;
  if current_setting('role', true) = 'authenticated'
     and (t is null or (not private.genesis_owner_allows(t, p, tm, o, 'read')
                        and not private.genesis_updates_asked(new.item_kind, new.item_id))) then
    raise exception 'permission denied for %', tg_table_name using errcode = '42501';
  end if;
  if t is null then
    raise exception 'No such %', new.item_kind using errcode = '23503';
  end if;
  new.tenant_id := t; new.person_id := p; new.team_id := tm; new.organization_id := o;

  if current_setting('role', true) = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
    if tg_table_name = 'update_requests' and tg_op = 'INSERT' then
      -- Ask someone else, who may read the item themselves.
      if new.asked_of = auth.uid() then
        raise exception 'Ask someone other than yourself' using errcode = '22023';
      end if;
      if not private.genesis_updates_person_can(new.asked_of, t, p, tm, o, 'read') then
        raise exception 'The person asked must be able to read the item' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger status_updates_fill_item
  before insert or update on genesis_work.status_updates
  for each row execute function private.genesis_updates_fill_item();
create trigger update_requests_fill_item
  before insert or update on genesis_work.update_requests
  for each row execute function private.genesis_updates_fill_item();

-- A new update answers the author's open requests on the item, and sets a pursuit's health.
create or replace function private.genesis_status_update_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_work.update_requests r
     set status = 'answered', answered_by = new.id, answered_at = new.created_at
   where r.item_kind = new.item_kind and r.item_id = new.item_id
     and r.asked_of = new.author_id and r.status = 'open';
  -- Only an update from someone who may write the pursuit sets its health; an answer from
  -- someone who was only asked is a note.
  if new.item_kind = 'pursuit' and new.health is not null
     and (current_setting('role', true) is distinct from 'authenticated'
          or private.genesis_updates_person_can(new.author_id, new.tenant_id, new.person_id, new.team_id, new.organization_id, 'write')) then
    update genesis_work.pursuits p set health = new.health where p.id = new.item_id;
  end if;
  return null;
end;
$$;

create trigger status_updates_after
  after insert on genesis_work.status_updates
  for each row execute function private.genesis_status_update_after();

-- When server code moves an item to another owner, its updates and requests move with it, so a
-- former owner can't still read them.
create or replace function private.genesis_updates_carry_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := case tg_table_name when 'pursuits' then 'pursuit' when 'work_items' then 'work_item' else 'metric' end;
begin
  update genesis_work.status_updates u
     set person_id = new.person_id, team_id = new.team_id, organization_id = new.organization_id
   where u.item_kind = kind and u.item_id = new.id;
  update genesis_work.update_requests r
     set person_id = new.person_id, team_id = new.team_id, organization_id = new.organization_id
   where r.item_kind = kind and r.item_id = new.id;
  return null;
end;
$$;

create trigger pursuits_carry_updates
  after update of person_id, team_id, organization_id on genesis_work.pursuits
  for each row
  when ((old.person_id, old.team_id, old.organization_id) is distinct from (new.person_id, new.team_id, new.organization_id))
  execute function private.genesis_updates_carry_owner();
create trigger work_items_carry_updates
  after update of person_id, team_id, organization_id on genesis_work.work_items
  for each row
  when ((old.person_id, old.team_id, old.organization_id) is distinct from (new.person_id, new.team_id, new.organization_id))
  execute function private.genesis_updates_carry_owner();
create trigger metrics_carry_updates
  after update of person_id, team_id, organization_id on genesis_work.metrics
  for each row
  when ((old.person_id, old.team_id, old.organization_id) is distinct from (new.person_id, new.team_id, new.organization_id))
  execute function private.genesis_updates_carry_owner();

-- Requests: only the status moves (to cancelled, by the asker), and only the database answers.
create or replace function private.genesis_update_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.answered_by is not null or new.answered_at is not null then
      raise exception 'A request starts open' using errcode = '22023';
    end if;
    return new;
  end if;
  -- The answer trigger runs as the table owner; a signed-in person may only cancel.
  if current_user = 'authenticated' then
    if new.status is distinct from old.status and not (old.status = 'open' and new.status = 'cancelled') then
      raise exception 'A request can only be cancelled; posting an update answers it' using errcode = '22023';
    end if;
    if (new.asked_of, new.due_at, new.answered_by, new.answered_at, new.asked_by)
       is distinct from (old.asked_of, old.due_at, old.answered_by, old.answered_at, old.asked_by) then
      raise exception 'Only a request''s status changes' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger update_requests_guard
  before insert or update on genesis_work.update_requests
  for each row execute function private.genesis_update_requests_guard();

-- Access ---------------------------------------------------------------------------------------

-- The app's hook, asked about any person (not only the signed-in one). No hook, or a hook that
-- errors, means no.
create or replace function private.genesis_updates_person_can(viewer uuid, tenant uuid, person uuid, team uuid, organization uuid, action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if viewer is null or tenant is null
     or to_regprocedure('private.genesis_owner_can(uuid,uuid,uuid,uuid,uuid,text)') is null then
    return false;
  end if;
  execute 'select (private.genesis_owner_can($1, $2, $3, $4, $5, $6))::boolean'
    into allowed using tenant, viewer, person, team, organization, action;
  return coalesce(allowed, false);
exception when others then
  return false;
end;
$$;

-- Whether the signed-in person has an open request on this item.
create or replace function private.genesis_updates_asked(kind text, item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from genesis_work.update_requests r
                 where r.item_kind = kind and r.item_id = item and r.asked_of = auth.uid() and r.status = 'open')
$$;

revoke execute on function private.genesis_updates_fill_item() from public, anon, authenticated;
revoke execute on function private.genesis_status_update_after() from public, anon, authenticated;
revoke execute on function private.genesis_updates_carry_owner() from public, anon, authenticated;
revoke execute on function private.genesis_update_requests_guard() from public, anon, authenticated;
revoke execute on function private.genesis_owner_readable() from public, anon;
revoke execute on function private.genesis_updates_asked(text, uuid) from public, anon;
revoke execute on function private.genesis_updates_person_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.genesis_owner_readable() to authenticated;
grant execute on function private.genesis_updates_asked(text, uuid) to authenticated;

alter table genesis_work.status_updates enable row level security;
alter table genesis_work.update_requests enable row level security;

create policy status_updates_read on genesis_work.status_updates for select to authenticated
  using (author_id = (select auth.uid()) or exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = status_updates.tenant_id
                   and r.owner_id = coalesce(status_updates.person_id, status_updates.team_id, status_updates.organization_id)));
create policy status_updates_insert on genesis_work.status_updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write')
         or private.genesis_updates_asked(item_kind, item_id)));
-- Updates are a record: nobody signed in edits or deletes them.

create policy update_requests_read on genesis_work.update_requests for select to authenticated
  using (asked_of = (select auth.uid())
         or exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = update_requests.tenant_id
                   and r.owner_id = coalesce(update_requests.person_id, update_requests.team_id, update_requests.organization_id)));
create policy update_requests_insert on genesis_work.update_requests for insert to authenticated
  with check (asked_by = (select auth.uid())
              and private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'read'));
create policy update_requests_cancel on genesis_work.update_requests for update to authenticated
  using (asked_by = (select auth.uid())) with check (asked_by = (select auth.uid()));

revoke all on genesis_work.status_updates, genesis_work.update_requests from public, anon, authenticated;
grant select, insert on genesis_work.status_updates to authenticated;
grant select, insert, update on genesis_work.update_requests to authenticated;
grant all on genesis_work.status_updates, genesis_work.update_requests to service_role;

-- What's due ------------------------------------------------------------------------------------

create view genesis_work.update_requests_due
with (security_invoker = true) as
select r.id, r.item_kind, r.item_id, r.tenant_id, r.asked_by, r.asked_of, r.due_at, r.note,
       r.due_at < now() as overdue
from genesis_work.update_requests r
where r.status = 'open';

comment on view genesis_work.update_requests_due is
  'Open update requests, with whether each is overdue. What a screen shows as "update due", and what a reminder job reads. Genesis updates.';

revoke all on genesis_work.update_requests_due from public, anon, authenticated;
grant select on genesis_work.update_requests_due to authenticated, service_role;
