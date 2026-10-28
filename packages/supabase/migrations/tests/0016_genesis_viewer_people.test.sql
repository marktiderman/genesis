-- @feat:feature-mirror
-- pgTAP test for 0016_genesis_viewer_people.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and hook and rolls everything back. If your app already has the
-- hook, it is dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000016' || n)::uuid, 'authenticated', 'authenticated', 'genesis-viewer-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.login(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000016' || n)::uuid $$;
-- The wrapper is called as the owner with a person's claims, the way a policy calls it for that
-- person (signed-in callers can't name the private schema themselves).
create function pg_temp.claims(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.login(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.login(n)::text, true);
end $$;
create function pg_temp.no_one() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

drop function if exists private.genesis_viewer_people(uuid);

select ok(not has_function_privilege('anon', 'private.genesis_viewer_person_ids()', 'execute'), 'anon can''t call genesis_viewer_person_ids');
select ok(has_function_privilege('authenticated', 'private.genesis_viewer_person_ids()', 'execute'), 'authenticated can, for row security');

-- No hook: fail closed, without an error.
select pg_temp.claims('a1');
select lives_ok($$select * from private.genesis_viewer_person_ids()$$, 'without the hook, no error');
select is((select count(*)::int from private.genesis_viewer_person_ids()), 0, '... and an empty set');

-- The app's hook: a1 has a personal record (its tenant is its own id) and records in two
-- organizations, one listed twice and one row with a null person; b2 has none.
create function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t, p from (values
    ('00000000-0000-4000-9000-0000000016c1'::uuid, '00000000-0000-4000-9000-0000000016c1'::uuid),
    ('00000000-0000-4000-9000-0000000016d1'::uuid, '00000000-0000-4000-a000-0000000016d1'::uuid),
    ('00000000-0000-4000-9000-0000000016d2'::uuid, '00000000-0000-4000-a000-0000000016d2'::uuid),
    ('00000000-0000-4000-9000-0000000016d2'::uuid, '00000000-0000-4000-a000-0000000016d2'::uuid),
    ('00000000-0000-4000-9000-0000000016d3'::uuid, null::uuid)
  ) r (t, p)
  where viewer = '00000000-0000-4000-8000-0000000016a1'::uuid
$$;

select set_eq(
  $$select tenant_id, person_id from private.genesis_viewer_person_ids()$$,
  $$values ('00000000-0000-4000-9000-0000000016c1'::uuid, '00000000-0000-4000-9000-0000000016c1'::uuid),
           ('00000000-0000-4000-9000-0000000016d1'::uuid, '00000000-0000-4000-a000-0000000016d1'::uuid),
           ('00000000-0000-4000-9000-0000000016d2'::uuid, '00000000-0000-4000-a000-0000000016d2'::uuid)$$,
  'a personal record and two organizations, without duplicates or null ids');
select is((select count(*)::int from private.genesis_viewer_person_ids()), 3, '... once each');

select pg_temp.claims('b2');
select is((select count(*)::int from private.genesis_viewer_person_ids()), 0, 'a login with no people gets an empty set');

select pg_temp.no_one();
select is((select count(*)::int from private.genesis_viewer_person_ids()), 0, 'nobody signed in gets an empty set');

-- A hook that errors fails closed.
drop function private.genesis_viewer_people(uuid);
create function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language plpgsql stable set search_path = '' as $$
begin
  raise exception 'broken hook';
end $$;
select pg_temp.claims('a1');
select is((select count(*)::int from private.genesis_viewer_person_ids()), 0, 'a hook that errors gives an empty set');

select * from finish();
rollback;
