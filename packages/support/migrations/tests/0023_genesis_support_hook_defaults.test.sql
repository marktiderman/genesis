-- @feat:support-feedback
-- pgTAP test for 0021 and 0023_genesis_support_hook_defaults.sql, applied with no hooks of the
-- app's own: support works on Genesis's reserved tenant with its platform admins as staff, no
-- viewer-people hook is defined, and the app's own hook migrations run after both, with a plain
-- `create function` and their own parameter names, and take over. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000023' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-hooks-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

-- 1. Zero config ----------------------------------------------------------------------------------

select is(to_regprocedure('private.genesis_support_default_tenant()'), null, '0021''s stand-in is gone after 0023');
select is(to_regprocedure('private.genesis_viewer_people(uuid)'), null, 'Genesis defines no viewer-people hook');
select is(to_regprocedure('private.genesis_support_staff(uuid)'), null, 'nor a staff hook of the app''s name');
select is(private.genesis_support_default_tenant_id(), '00000000-0000-0000-0000-000000000001'::uuid, 'the app''s own tenant is Genesis''s reserved one');
select is(private.genesis_support_staff_hook(pg_temp.person('b2')), false, 'without a platform-admin hook, nobody is staff');

create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000023b2'::uuid $$;
select is(private.genesis_support_staff_hook(pg_temp.person('b2')), true, 'a platform admin is staff');

select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$insert into public.tickets (type, message) values ('bug', 'zero-config report')$$, 'a person sends a report');
select is((select count(*)::int from public.tickets), 1, 'and reads their own');
reset role;
select is((select tenant_id from public.tickets where message = 'zero-config report'), '00000000-0000-0000-0000-000000000001'::uuid, 'it lands in the reserved tenant');
select pg_temp.sign_in('b2');
set local role authenticated;
select is(public.support_is_staff(), true, 'the platform admin is support staff');
select is((select count(*)::int from public.tickets), 1, 'and reads the report');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.tickets), 0, 'someone else reads nothing');
reset role;

-- 2. The app's own hooks, written later ------------------------------------------------------------

select lives_ok(
  $$create function private.genesis_support_default_tenant() returns uuid language sql stable set search_path = ''
      as 'select ''00000000-0000-4000-8000-0000000023a0''::uuid'$$,
  'a plain create function of the default tenant works after the defaults');
select lives_ok(
  $$create function private.genesis_support_staff(p uuid) returns boolean language sql stable set search_path = ''
      as 'select p = ''00000000-0000-4000-8000-0000000023c3''::uuid'$$,
  'so does a staff hook with its own parameter name');
select ok(
  private.genesis_support_default_tenant_id() = '00000000-0000-4000-8000-0000000023a0'::uuid
  and private.genesis_support_staff_hook(pg_temp.person('c3'))
  and not private.genesis_support_staff_hook(pg_temp.person('b2')),
  'and the app''s hooks take over from the defaults');

select * from finish();
rollback;
