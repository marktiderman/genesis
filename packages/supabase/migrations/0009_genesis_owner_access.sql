-- Genesis owner access: private.genesis_owner_readable() and private.genesis_owner_allows()
--
-- The owner-access contract, shared by every Genesis block whose rows have an owner (genesis-work's
-- goals, projects, tasks, issues, metrics, status updates and sessions). A row belongs to a tenant
-- and has exactly one owner: a person, a team or the tenant itself. Who may read and write it is
-- your app's answer, through two hooks. Genesis never defines them:
--
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
--     action is 'read' or 'write'.
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--     Every (tenant, owner) pair the viewer may read, across tenants, so a policy checks once per
--     statement instead of calling a function per row. owner_id is the row's person_id, team_id
--     or organization_id, whichever is set.
--
-- Both run with your migration's (the owner's) rights, so they read your membership tables
-- whatever their row security. For example:
--
--   create function private.genesis_readable_owners(viewer uuid)
--   returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
--     select m.team_id, m.user_id from public.memberships m where m.user_id = viewer   -- my own rows
--     union all
--     select m.team_id, m.team_id from public.memberships m where m.user_id = viewer   -- my team's rows
--   $$;
--   revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
--
-- This file ships the two wrappers that blocks call in their policies. They fail closed: a missing
-- hook, a hook that errors or returns the wrong type, no signed-in person, a null tenant, or an
-- action other than 'read' or 'write' gives false or an empty set.
--
--   private.genesis_owner_readable() returns table (tenant_id uuid, owner_id uuid)
--     The signed-in person's set, from genesis_readable_owners(auth.uid()).
--   private.genesis_owner_allows(tenant uuid, person_id uuid, team_id uuid, organization_id uuid,
--                                action text) returns boolean
--     genesis_owner_can(tenant, auth.uid(), person_id, team_id, organization_id, action).
--
-- Both are security definer with search_path ''. Row security runs as the caller, so authenticated
-- may execute them; they only ever answer for auth.uid(). anon and public may not.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0009_genesis_owner_access.test.sql`).

create schema if not exists private;

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

revoke execute on function private.genesis_owner_readable() from public, anon, authenticated;
revoke execute on function private.genesis_owner_allows(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.genesis_owner_readable() to authenticated;
grant execute on function private.genesis_owner_allows(uuid, uuid, uuid, uuid, text) to authenticated;
