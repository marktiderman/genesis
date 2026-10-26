-- Genesis pursuits: public.pursuits and public.work_items
--
-- A pursuit is something a person or a team works toward. It's a goal, a project, or both
-- (is_goal, is_project): a goal carries success criteria, a project carries dates and work.
-- Pursuits nest (parent_id), and a pursuit for a quarter is what many operating systems call
-- a quarterly priority. Work items are the tasks, issues and milestones: on their own, or under
-- a pursuit. An issue adds a term (short or long), a priority, a rank, who decides and the
-- solution.
--
-- Tenants and owners: a tenant is any uuid your app groups people by. Every row belongs to
-- one tenant and has exactly one owner: a person (person_id), a team (team_id) or the tenant
-- itself (organization_id, which must equal tenant_id). This file names no table of yours: add
-- your foreign keys in a later migration, for example
--
--   alter table public.pursuits add foreign key (tenant_id) references public.organizations (id) on delete cascade;
--   alter table public.pursuits add foreign key (team_id) references public.teams (id) on delete cascade;
--
-- The owner-access contract (shared by every Genesis block whose rows have an owner; this file
-- defines it first):
--
--   Your app defines two hooks. Genesis never defines them.
--     private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                               organization_id uuid, action text) returns boolean
--       action is 'read' or 'write'.
--     private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--       Every (tenant, owner) pair the viewer may read, across tenants.
--   Genesis ships two wrappers that blocks call. They fail closed: a missing hook, a hook that
--   errors or returns the wrong type, a null tenant or viewer, or an action other than 'read' or
--   'write' gives false or an empty set.
--     private.genesis_owner_readable() returns table (tenant_id uuid, owner_id uuid)
--       The signed-in viewer's set, from genesis_readable_owners(auth.uid()).
--     private.genesis_owner_allows(tenant uuid, person_id uuid, team_id uuid,
--                                  organization_id uuid, action text) returns boolean
--       genesis_owner_can(tenant, auth.uid(), person_id, team_id, organization_id, action).
--   Both are security definer with search_path ''. Only authenticated may execute them (row
--   security runs as the caller), and they only ever answer for auth.uid().
--
-- The app hooks: who may read and write a row is your app's answer, through those two functions,
-- which this file calls but doesn't define. Without them nobody signed in reads or writes anything, so a
-- fresh install fails closed, and so does a hook that errors. The service role (server code) is not limited by
-- row security.
--
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
--     action is 'read' or 'write'.
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--     Every (tenant, owner) pair the viewer may read, so a policy checks once per statement
--     instead of calling a function per row. owner_id is the row's person_id, team_id or
--     organization_id, whichever is set.
--
-- Both run with this file's (the owner's) rights, so they read your membership tables whatever
-- their row security:
--
--   create function private.genesis_readable_owners(viewer uuid)
--   returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
--     select m.team_id, m.user_id from public.memberships m where m.user_id = viewer   -- my own rows
--     union all
--     select m.team_id, m.team_id from public.memberships m where m.user_id = viewer   -- my team's rows
--   $$;
--   revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
--
-- Guards: a signed-in person never changes a row's tenant or owner (server code may, for a merge
-- or when someone leaves) and never sets created_by; a parent pursuit and a work item's pursuit
-- must be in the same tenant; a pursuit is never its own ancestor. Links are checked as the table
-- owner, so a row the caller can't see still counts, under a per-tenant lock, and only when a
-- link is set or changes.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0009_genesis_pursuits.test.sql`).

create schema if not exists private;

-- Pursuits -------------------------------------------------------------------------------------

create table public.pursuits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  parent_id uuid references public.pursuits (id) on delete set null,
  title text not null
    constraint pursuits_title_length check (char_length(btrim(title)) between 1 and 300),
  description text,
  -- The tenant's own word for it, such as 'rock' or 'okr'. Display only.
  label text
    constraint pursuits_label_format check (label is null or label ~ '^[a-z][a-z0-9_-]{0,39}$'),
  is_goal boolean not null default true,
  is_project boolean not null default false,
  period_start date,
  period_end date,
  start_on date,
  due_on date,
  status text not null default 'active'
    constraint pursuits_status check (status in ('active', 'done', 'missed', 'dropped')),
  health text
    constraint pursuits_health check (health in ('on_track', 'at_risk', 'off_track')),
  -- Success criteria or key results: [{ "text": ..., "met": true|false|null }, ...].
  criteria jsonb not null default '[]'::jsonb
    constraint pursuits_criteria_array check (jsonb_typeof(criteria) = 'array'),
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pursuits_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint pursuits_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint pursuits_goal_or_project check (is_goal or is_project),
  constraint pursuits_period_order check (period_end is null or period_start is null or period_end >= period_start),
  constraint pursuits_dates_order check (due_on is null or start_on is null or due_on >= start_on),
  constraint pursuits_not_own_parent check (parent_id is distinct from id)
);

comment on table public.pursuits is
  'Goals and projects, owned by a person, a team or the tenant. Genesis pursuits. @genesis {"label": "Pursuits", "labelField": "title"}';
comment on column public.pursuits.is_goal is 'Has success criteria. @genesis {"label": "Goal"}';
comment on column public.pursuits.is_project is 'Has dates and work. @genesis {"label": "Project"}';
comment on column public.pursuits.health is 'On track, at risk or off track. @genesis {"label": "Health"}';

create index pursuits_tenant_owner_idx on public.pursuits (tenant_id, coalesce(person_id, team_id, organization_id));
create index pursuits_parent_idx on public.pursuits (parent_id);
create index pursuits_period_idx on public.pursuits (tenant_id, period_start);
create index pursuits_created_by_idx on public.pursuits (created_by);

-- Work items -----------------------------------------------------------------------------------

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  pursuit_id uuid references public.pursuits (id) on delete set null,
  kind text not null
    constraint work_items_kind check (kind in ('task', 'issue', 'milestone')),
  title text not null
    constraint work_items_title_length check (char_length(btrim(title)) between 1 and 300),
  notes text,
  -- Who does it, when the owner is a team or the tenant.
  assignee_id uuid,
  status text not null default 'open'
    constraint work_items_status check (status in ('open', 'done', 'dropped')),
  due_on date,
  completed_at timestamptz,
  priority smallint
    constraint work_items_priority check (priority between 1 and 5),
  -- Manual order within a list; any number, so a move writes one row.
  rank double precision,
  -- Issues only.
  term text
    constraint work_items_term check (term in ('short', 'long')),
  decider_id uuid,
  solution text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint work_items_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint work_items_issue_fields check (kind = 'issue' or (term is null and decider_id is null and solution is null))
);

comment on table public.work_items is
  'Tasks, issues and milestones, alone or under a pursuit. Genesis pursuits. @genesis {"label": "Work items", "labelField": "title"}';
comment on column public.work_items.rank is 'Manual order within a list. @genesis {"label": "Rank"}';
comment on column public.work_items.term is 'Issues: short (this week) or long (this quarter or later). @genesis {"label": "Term"}';

create index work_items_tenant_owner_idx on public.work_items (tenant_id, coalesce(person_id, team_id, organization_id));
create index work_items_pursuit_idx on public.work_items (pursuit_id);
create index work_items_assignee_idx on public.work_items (assignee_id);
create index work_items_open_idx on public.work_items (tenant_id, kind, status);
create index work_items_created_by_idx on public.work_items (created_by);

-- Guards ---------------------------------------------------------------------------------------

-- Whether the caller is a signed-in person (not server code or a migration): the session's role,
-- which security definer functions don't change and a session can't set without being granted
-- that role. Never the JWT claims, which a session can overwrite with set_config.
create or replace function private.genesis_pursuits_caller_is_person()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_setting('role', true) = 'authenticated'
$$;

-- A parent link, checked as the table owner (so a pursuit hidden from the caller still counts)
-- and under a per-tenant lock (so two links made at once can't close a loop between them).
create or replace function private.genesis_pursuits_check_parent(tenant uuid, child uuid, parent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ancestor uuid := parent;
  hops integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('genesis_pursuits:' || tenant::text, 0));
  if not exists (select 1 from public.pursuits p where p.id = parent and p.tenant_id = tenant) then
    raise exception 'A pursuit''s parent must be in the same tenant' using errcode = '22023';
  end if;
  while ancestor is not null loop
    if ancestor = child then
      raise exception 'A pursuit can''t be its own ancestor' using errcode = '22023';
    end if;
    hops := hops + 1;
    if hops > 100 then
      raise exception 'Pursuits nest at most 100 deep' using errcode = '22023';
    end if;
    select p.parent_id into ancestor from public.pursuits p where p.id = ancestor;
  end loop;
end;
$$;

-- A work item's pursuit, checked as the table owner.
create or replace function private.genesis_work_items_check_pursuit(tenant uuid, pursuit uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pursuits p where p.id = pursuit and p.tenant_id = tenant) then
    raise exception 'A work item''s pursuit must be in the same tenant' using errcode = '22023';
  end if;
end;
$$;

-- updated_at, who made it, the fixed tenant and owner (server code may move a row between
-- owners, for a merge or when someone leaves), and same-tenant links, checked only when a link
-- is set or changes.
create or replace function private.genesis_pursuits_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.genesis_pursuits_caller_is_person() then
      new.created_by := auth.uid();
    end if;
  else
    if private.genesis_pursuits_caller_is_person() then
      if new.tenant_id is distinct from old.tenant_id
         or new.person_id is distinct from old.person_id
         or new.team_id is distinct from old.team_id
         or new.organization_id is distinct from old.organization_id then
        raise exception 'A pursuit''s tenant and owner never change' using errcode = '22023';
      end if;
      new.created_by := old.created_by;
    end if;
    new.updated_at := now();
  end if;

  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id or new.tenant_id is distinct from old.tenant_id) then
    perform private.genesis_pursuits_check_parent(new.tenant_id, new.id, new.parent_id);
  end if;
  return new;
end;
$$;

create trigger pursuits_guard
  before insert or update on public.pursuits
  for each row execute function private.genesis_pursuits_guard();

create or replace function private.genesis_work_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.genesis_pursuits_caller_is_person() then
      new.created_by := auth.uid();
    end if;
  else
    if private.genesis_pursuits_caller_is_person() then
      if new.tenant_id is distinct from old.tenant_id
         or new.person_id is distinct from old.person_id
         or new.team_id is distinct from old.team_id
         or new.organization_id is distinct from old.organization_id then
        raise exception 'A work item''s tenant and owner never change' using errcode = '22023';
      end if;
      new.created_by := old.created_by;
    end if;
    new.updated_at := now();
  end if;

  if new.pursuit_id is not null
     and (tg_op = 'INSERT' or new.pursuit_id is distinct from old.pursuit_id or new.tenant_id is distinct from old.tenant_id) then
    perform private.genesis_work_items_check_pursuit(new.tenant_id, new.pursuit_id);
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger work_items_guard
  before insert or update on public.work_items
  for each row execute function private.genesis_work_items_guard();

-- Access ---------------------------------------------------------------------------------------

-- The owner-access contract: the two fail-closed wrappers every Genesis block with owners calls.
create or replace function private.genesis_owner_readable()
returns table (tenant_id uuid, owner_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regprocedure('private.genesis_readable_owners(uuid)') is null then
    return;
  end if;
  return query execute 'select r.tenant_id::uuid, r.owner_id::uuid from private.genesis_readable_owners($1) r' using auth.uid();
exception when others then
  return;
end;
$$;

create or replace function private.genesis_owner_allows(tenant uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null or tenant is null or action is null or action not in ('read', 'write')
     or to_regprocedure('private.genesis_owner_can(uuid,uuid,uuid,uuid,uuid,text)') is null then
    return false;
  end if;
  execute 'select (private.genesis_owner_can($1, $2, $3, $4, $5, $6))::boolean'
    into allowed using tenant, auth.uid(), person_id, team_id, organization_id, action;
  return coalesce(allowed, false);
exception when others then
  return false;
end;
$$;

revoke execute on function private.genesis_pursuits_guard() from public, anon, authenticated;
revoke execute on function private.genesis_work_items_guard() from public, anon, authenticated;
revoke execute on function private.genesis_pursuits_check_parent(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_work_items_check_pursuit(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_pursuits_caller_is_person() from public, anon, authenticated;
revoke execute on function private.genesis_owner_readable() from public, anon, authenticated;
revoke execute on function private.genesis_owner_allows(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
-- Row security runs as the caller, so signed-in people need to execute the wrappers. That's safe:
-- they only ever answer for auth.uid().
grant execute on function private.genesis_owner_readable() to authenticated;
grant execute on function private.genesis_owner_allows(uuid, uuid, uuid, uuid, text) to authenticated;

alter table public.pursuits enable row level security;
alter table public.work_items enable row level security;

-- An exists form, so the planner can use the (tenant, owner) indexes.
create policy pursuits_read on public.pursuits for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = pursuits.tenant_id
                   and r.owner_id = coalesce(pursuits.person_id, pursuits.team_id, pursuits.organization_id)));
create policy pursuits_insert on public.pursuits for insert to authenticated
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy pursuits_update on public.pursuits for update to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy pursuits_delete on public.pursuits for delete to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

create policy work_items_read on public.work_items for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = work_items.tenant_id
                   and r.owner_id = coalesce(work_items.person_id, work_items.team_id, work_items.organization_id)));
create policy work_items_insert on public.work_items for insert to authenticated
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy work_items_update on public.work_items for update to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy work_items_delete on public.work_items for delete to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

revoke all on public.pursuits, public.work_items from public, anon, authenticated;
grant select, insert, update, delete on public.pursuits, public.work_items to authenticated;
grant all on public.pursuits, public.work_items to service_role;
