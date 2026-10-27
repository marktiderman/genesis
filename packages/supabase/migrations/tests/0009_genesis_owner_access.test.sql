-- @feat:owner-access
-- pgTAP test for 0009_genesis_owner_access.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and hooks and rolls everything back. If your app already has the
-- hooks, they are dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-owner-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
-- The wrappers are called as the owner with a person's claims, the way a policy calls them for
-- that person (signed-in callers can't name the private schema themselves).
create function pg_temp.claims(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.no_one() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);

-- Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'private.genesis_owner_allows(uuid,uuid,uuid,uuid,text)', 'execute'), 'anon can''t call genesis_owner_allows');
select ok(not has_function_privilege('anon', 'private.genesis_owner_readable()', 'execute'), 'anon can''t call genesis_owner_readable');

-- No hooks: fail closed -----------------------------------------------------------------------
select pg_temp.claims('a1');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'write'), false, 'without the hook, no');
select is((select count(*)::int from private.genesis_owner_readable()), 0, 'without the hook, an empty set');

-- The app's hooks -----------------------------------------------------------------------------
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-9000-000000000001'::uuid, '00000000-0000-4000-a000-000000000001'::uuid
  where viewer = '00000000-0000-4000-8000-0000000000a1'::uuid
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select viewer = '00000000-0000-4000-8000-0000000000a1'::uuid and team_id = '00000000-0000-4000-a000-000000000001'::uuid
$$;

select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'write'), true, 'the wrapper answers for the signed-in person');
select is((select count(*)::int from private.genesis_owner_readable()), 1, 'the readable set for the signed-in person');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'delete'), false, 'an action other than read or write is no');
select is(private.genesis_owner_allows(null, null, pg_temp.team(1), null, 'read'), false, 'a null tenant is no');
select pg_temp.claims('b2');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'read'), false, 'it answers only for the signed-in person');
select pg_temp.no_one();
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'read'), false, 'nobody signed in is no');

-- A hook with the wrong return type fails closed -----------------------------------------------
drop function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns text language sql stable set search_path = '' as $$ select 'maybe' $$;
select pg_temp.claims('a1');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'write'), false, 'a hook that errors means no');

select * from finish();
rollback;
