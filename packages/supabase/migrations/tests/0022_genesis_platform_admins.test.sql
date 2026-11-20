-- @feat:settings
-- pgTAP test for 0022_genesis_platform_admins.sql: the default hook reads an explicit list that
-- starts empty, so nobody is a platform admin until added; only the service role reaches the list.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-admins-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['c1', 'd2']) n;
create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
grant execute on function pg_temp.person(text) to anon, authenticated, service_role;

select has_table('public', 'genesis_platform_admins', 'genesis_platform_admins exists');
select col_is_pk('public', 'genesis_platform_admins', array['person'], 'one row per person');
select ok(to_regprocedure('private.genesis_platform_admin(uuid)') is not null, 'the default hook exists when the app has none');
select is((select count(*)::int from public.genesis_platform_admins where person in (pg_temp.person('c1'), pg_temp.person('d2'))), 0, 'the list starts without them');

-- Run the test against the default hook, whatever the app has.
create or replace function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.genesis_platform_admins a where a.person = $1)
$$;

select is(private.genesis_platform_admin(pg_temp.person('c1')), false, 'nobody is an admin while the list is empty');
insert into public.genesis_platform_admins (person) select id from auth.users where lower(email) = lower('Genesis-Admins-c1@example.test');
select is(private.genesis_platform_admin(pg_temp.person('c1')), true, 'a person added by email is an admin');
select is(private.genesis_platform_admin(pg_temp.person('d2')), false, '... and nobody else is');

-- Who reaches the list.
set local role authenticated;
select throws_ok($$ select count(*) from public.genesis_platform_admins $$, '42501', null, 'a signed-in person cannot read the list');
select throws_ok($$ insert into public.genesis_platform_admins (person) values (pg_temp.person('d2')) $$, '42501', null, '... nor add to it');
select throws_ok($$ select private.genesis_platform_admin(pg_temp.person('d2')) $$, '42501', null, '... nor call the hook');
reset role;
set local role service_role;
select lives_ok($$ insert into public.genesis_platform_admins (person) values (pg_temp.person('d2')) $$, 'the service role adds an admin');
reset role;

select * from finish();
rollback;
