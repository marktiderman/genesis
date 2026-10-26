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
-- The app hooks: who may read and write a row is your app's answer, through two functions this
-- file calls but doesn't define. Without them nobody signed in reads or writes anything, so a
-- fresh install fails closed. The service role (server code) is not limited.
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
-- Guards: tenant_id and the owner columns never change after insert; a parent pursuit and a
-- work item's pursuit must be in the same tenant; a pursuit is never its own ancestor.
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

-- updated_at, completed_at, the fixed tenant and owner, and same-tenant links.
create or replace function private.genesis_pursuits_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ancestor uuid;
  hops integer := 0;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.person_id is distinct from old.person_id
       or new.team_id is distinct from old.team_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'A pursuit''s tenant and owner never change' using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;

  if new.parent_id is not null then
    if not exists (select 1 from public.pursuits p where p.id = new.parent_id and p.tenant_id = new.tenant_id) then
      raise exception 'A pursuit''s parent must be in the same tenant' using errcode = '22023';
    end if;
    ancestor := new.parent_id;
    while ancestor is not null loop
      if ancestor = new.id then
        raise exception 'A pursuit can''t be its own ancestor' using errcode = '22023';
      end if;
      hops := hops + 1;
      if hops > 100 then
        raise exception 'Pursuits nest at most 100 deep' using errcode = '22023';
      end if;
      select p.parent_id into ancestor from public.pursuits p where p.id = ancestor;
    end loop;
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
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.person_id is distinct from old.person_id
       or new.team_id is distinct from old.team_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'A work item''s tenant and owner never change' using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;

  if new.pursuit_id is not null
     and not exists (select 1 from public.pursuits p where p.id = new.pursuit_id and p.tenant_id = new.tenant_id) then
    raise exception 'A work item''s pursuit must be in the same tenant' using errcode = '22023';
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

-- The (tenant, owner) pairs the signed-in person may read, from the app's hook. No hook, no rows.
create or replace function private.genesis_pursuits_readable()
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
  return query execute 'select r.tenant_id, r.owner_id from private.genesis_readable_owners($1) r' using auth.uid();
end;
$$;

-- Whether the signed-in person may write a row with this tenant and owner. No hook, no writes.
create or replace function private.genesis_pursuits_can_write(tenant uuid, person uuid, team uuid, organization uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null or tenant is null
     or to_regprocedure('private.genesis_owner_can(uuid,uuid,uuid,uuid,uuid,text)') is null then
    return false;
  end if;
  execute 'select private.genesis_owner_can($1, $2, $3, $4, $5, ''write'')'
    into allowed using tenant, auth.uid(), person, team, organization;
  return coalesce(allowed, false);
end;
$$;

revoke execute on function private.genesis_pursuits_guard() from public, anon, authenticated;
revoke execute on function private.genesis_work_items_guard() from public, anon, authenticated;
revoke execute on function private.genesis_pursuits_readable() from public, anon;
revoke execute on function private.genesis_pursuits_can_write(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.genesis_pursuits_readable() to authenticated;
grant execute on function private.genesis_pursuits_can_write(uuid, uuid, uuid, uuid) to authenticated;

alter table public.pursuits enable row level security;
alter table public.work_items enable row level security;

create policy pursuits_read on public.pursuits for select to authenticated
  using ((tenant_id, coalesce(person_id, team_id, organization_id)) in (select r.tenant_id, r.owner_id from private.genesis_pursuits_readable() r));
create policy pursuits_insert on public.pursuits for insert to authenticated
  with check (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));
create policy pursuits_update on public.pursuits for update to authenticated
  using (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));
create policy pursuits_delete on public.pursuits for delete to authenticated
  using (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));

create policy work_items_read on public.work_items for select to authenticated
  using ((tenant_id, coalesce(person_id, team_id, organization_id)) in (select r.tenant_id, r.owner_id from private.genesis_pursuits_readable() r));
create policy work_items_insert on public.work_items for insert to authenticated
  with check (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));
create policy work_items_update on public.work_items for update to authenticated
  using (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));
create policy work_items_delete on public.work_items for delete to authenticated
  using (private.genesis_pursuits_can_write(tenant_id, person_id, team_id, organization_id));

revoke all on public.pursuits, public.work_items from public, anon, authenticated;
grant select, insert, update, delete on public.pursuits, public.work_items to authenticated;
grant all on public.pursuits, public.work_items to service_role;
