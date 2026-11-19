-- @feat:support-feedback
-- pgTAP test for 0021_genesis_support_default_hooks.sql, applied with no hooks of the app's own:
-- 0004 ran on the default tenant, staff are the platform admins, every login is a person in the
-- app's tenant, and an app's own hook replaces a default with create or replace. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000021' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-hooks-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

-- 1. The defaults ---------------------------------------------------------------------------------

select is(private.genesis_support_default_tenant(), '00000000-0000-4000-8000-0000000000a1'::uuid, 'the app is its own tenant');
select alike(obj_description('private.genesis_support_default_tenant()'::regprocedure), 'Genesis default:%', 'and says it is the default');
select is(private.genesis_support_staff(pg_temp.person('a1')), false, 'without a platform-admin hook, nobody is staff');
select is(
  (select array_agg(row(v.tenant_id, v.person_id)::text) from private.genesis_viewer_people(pg_temp.person('a1')) v),
  array[row('00000000-0000-4000-8000-0000000000a1'::uuid, pg_temp.person('a1'))::text],
  'a login is one person in the app''s tenant');
select is((select count(*)::int from private.genesis_viewer_people('00000000-0000-4000-8000-0000000021ff')), 0, 'nobody for an id that isn''t a login');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_staff(uuid)', 'execute'), 'people can''t call the hooks');

-- 2. Staff are the platform admins ----------------------------------------------------------------

create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000021b2'::uuid $$;
select is(private.genesis_support_staff(pg_temp.person('b2')), true, 'a platform admin is staff');
select is(private.genesis_support_staff(pg_temp.person('a1')), false, 'and nobody else');

-- 3. Support works with no SQL of the app's own ---------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$insert into public.tickets (type, message) values ('bug', 'zero-config report')$$, 'a person sends a report');
reset role;
select is((select tenant_id from public.tickets where message = 'zero-config report'), '00000000-0000-4000-8000-0000000000a1'::uuid, 'it lands in the app''s tenant');
select pg_temp.sign_in('b2');
set local role authenticated;
select is(public.support_is_staff(), true, 'the platform admin is support staff');
select is((select count(*)::int from public.tickets), 1, 'and reads the report');
reset role;

-- 4. An app's own hook replaces a default ------------------------------------------------------

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-0000000021a0'::uuid $$;
select is(
  (select v.tenant_id from private.genesis_viewer_people(pg_temp.person('a1')) v),
  '00000000-0000-4000-8000-0000000021a0'::uuid,
  'the default viewer people follow the app''s tenant');

select * from finish();
rollback;
