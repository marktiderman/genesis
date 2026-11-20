-- @feat:settings
-- pgTAP test for 0022_genesis_platform_admins.sql: without the app's hook, Genesis's wrapper reads an
-- explicit list that starts empty, so nobody is a platform admin until added by a confirmed email;
-- the app's own hook, however it is written, wins; only the service role reaches the list.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`. It writes only its own
-- users and rows, drops the app's hook and empties the list inside this transaction, and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, aud, role, email, email_confirmed_at, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-admins-' || n || '@example.test',
  case when n = 'e3' then null else now() end, '00000000-0000-0000-0000-000000000000'
from unnest(array['c1', 'd2', 'e3']) n;
create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text) to anon, authenticated, service_role;
-- The first-admin snippet from the migration's header, for an email.
create function pg_temp.add_admin(address text) returns void language plpgsql as $$
begin
  if (select count(*) from auth.users where lower(email) = lower(address) and email_confirmed_at is not null) <> 1 then
    raise exception 'no single confirmed person has that email: nobody was added';
  end if;
  insert into public.genesis_platform_admins (person)
  select id from auth.users where lower(email) = lower(address) and email_confirmed_at is not null
  on conflict do nothing;
end $$;

drop function if exists private.genesis_platform_admin(uuid);
delete from public.genesis_platform_admins;

select has_table('public', 'genesis_platform_admins', 'genesis_platform_admins exists');
select col_is_pk('public', 'genesis_platform_admins', array['person'], 'one row per person');
select ok(to_regprocedure('private.genesis_platform_admin(uuid)') is null, 'Genesis never takes the app''s hook name');

-- The list, while the app has no hook.
select is(private.genesis_person_is_platform_admin(pg_temp.person('c1')), false, 'nobody is an admin while the list is empty');
select pg_temp.sign_in('c1');
set local role authenticated;
select throws_ok($$ select public.set_genesis_setting('support.inbox', 'false') $$, '42501', 'set_genesis_setting: nobody may change settings yet', 'set_genesis_setting says so while the list is empty');
reset role;
select throws_ok($$ select pg_temp.add_admin('genesis-admins-e3@example.test') $$, 'P0001', 'no single confirmed person has that email: nobody was added', 'an unconfirmed email is refused');
select lives_ok($$ select pg_temp.add_admin('Genesis-Admins-c1@example.test') $$, 'a confirmed email adds its person');
select is(private.genesis_person_is_platform_admin(pg_temp.person('c1')), true, 'a person in the list is an admin');
select is(private.genesis_is_platform_admin(), true, '... through 0020''s wrapper too');
select is(private.genesis_person_is_platform_admin(pg_temp.person('d2')), false, '... and nobody else is');

-- The app's own hook wins, with a parameter of its own name, and a plain create works.
create function private.genesis_platform_admin(who uuid) returns boolean
language sql stable set search_path = '' as $$ select who = '00000000-0000-4000-8000-0000000000d2'::uuid $$;
revoke execute on function private.genesis_platform_admin(uuid) from public, anon, authenticated;
select is(private.genesis_person_is_platform_admin(pg_temp.person('d2')), true, 'the app''s hook decides once it exists');
select is(private.genesis_person_is_platform_admin(pg_temp.person('c1')), false, '... and the list is unused');

-- Who reaches the list.
set local role authenticated;
select throws_ok($$ select count(*) from public.genesis_platform_admins $$, '42501', null, 'a signed-in person cannot read the list');
select throws_ok($$ insert into public.genesis_platform_admins (person) values (pg_temp.person('d2')) $$, '42501', null, '... nor add to it');
reset role;
set local role service_role;
select lives_ok($$ insert into public.genesis_platform_admins (person) values (pg_temp.person('d2')) $$, 'the service role adds an admin');
reset role;

select * from finish();
rollback;
