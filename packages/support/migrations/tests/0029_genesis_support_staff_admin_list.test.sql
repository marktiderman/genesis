-- @feat:support-feedback
-- pgTAP test for 0029_genesis_support_staff_admin_list.sql, with genesis-supabase 0022 applied and no
-- hooks of the app's own: a person in public.genesis_platform_admins is support staff; the app's own
-- staff or platform-admin hook, once it exists, decides instead. Drops the app's hooks and empties the
-- list inside this transaction only. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000029' || n)::uuid $$;
insert into auth.users (id, aud, role, email, email_confirmed_at, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-staff-list-' || n || '@example.test', now(), '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

drop function if exists private.genesis_support_staff(uuid);
drop function if exists private.genesis_platform_admin(uuid);
delete from public.genesis_platform_admins;

select is(private.genesis_support_staff_hook(pg_temp.person('a1')), false, 'nobody is staff while the list is empty');
insert into public.genesis_platform_admins (person) values (pg_temp.person('a1'));
select is(private.genesis_support_staff_hook(pg_temp.person('a1')), true, 'a person in the platform-admin list is staff');
select is(private.genesis_support_staff_hook(pg_temp.person('b2')), false, '... and nobody else is');

create function private.genesis_platform_admin(who uuid) returns boolean
language sql stable set search_path = '' as $$ select who = '00000000-0000-4000-8000-0000000029b2'::uuid $$;
select is(private.genesis_support_staff_hook(pg_temp.person('b2')), true, 'the app''s platform-admin hook decides once it exists');

create function private.genesis_support_staff(who uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
select is(private.genesis_support_staff_hook(pg_temp.person('b2')), false, 'and the app''s staff hook before it');

select * from finish();
rollback;
