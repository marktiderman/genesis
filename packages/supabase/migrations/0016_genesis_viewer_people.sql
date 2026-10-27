-- Genesis viewer people: private.genesis_viewer_person_ids()
--
-- The people records the signed-in person is, one per tenant. A person record is the app's, not a
-- login: a gym member who bought a pack, or a coaching client invited before they signed up, has
-- one before they have a login, and keeps it once they do. Genesis blocks that give something to a
-- person record (genesis-work's attendees, the feature registry's person entitlements in 0017) ask
-- through this one wrapper, so every block resolves "who is the viewer here" the same way.
--
-- Your app answers through one hook. Genesis never defines it:
--
--   private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
--     Every person record the login is, across tenants: the personal record (whose tenant is its
--     own id, if your app has one) and one row per organization the login belongs to.
--
-- It runs with your migration's (the owner's) rights, so it reads your people tables whatever their
-- row security. For example:
--
--   create function private.genesis_viewer_people(viewer uuid)
--   returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
--     select p.organization_id, p.id from public.people p where p.user_id = viewer
--   $$;
--   revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
--
-- This file ships the wrapper that blocks call in their policies and functions. It fails closed: a
-- missing hook, a hook that errors or returns the wrong type, or no signed-in person gives an empty
-- set. Duplicates and rows with a null id are dropped.
--
--   private.genesis_viewer_person_ids() returns table (tenant_id uuid, person_id uuid)
--     The signed-in person's records, from genesis_viewer_people(auth.uid()).
--
-- It is stable, security definer with search_path ''. In row security, compare against it in an
-- uncorrelated subquery, so Postgres calls it once per statement rather than once per row:
--
--   using ((tenant_id, person_id) in (select v.tenant_id, v.person_id from private.genesis_viewer_person_ids() v))
--
-- Row security runs as the caller, so authenticated may execute it; it only ever answers for
-- auth.uid(). anon and public may not.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0016_genesis_viewer_people.test.sql`).

create schema if not exists private;

create or replace function private.genesis_viewer_person_ids()
returns table (tenant_id uuid, person_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regprocedure('private.genesis_viewer_people(uuid)') is null then
    return;
  end if;
  return query execute
    'select distinct r.tenant_id::uuid, r.person_id::uuid from private.genesis_viewer_people($1) r
     where r.tenant_id is not null and r.person_id is not null'
    using auth.uid();
exception when others then
  return;
end;
$$;

comment on function private.genesis_viewer_person_ids() is
  'The signed-in person''s person records, one per tenant, from the app''s private.genesis_viewer_people(viewer) hook. Empty when there is no hook or nobody is signed in. Genesis viewer people.';

revoke execute on function private.genesis_viewer_person_ids() from public, anon, authenticated;
grant execute on function private.genesis_viewer_person_ids() to authenticated;
