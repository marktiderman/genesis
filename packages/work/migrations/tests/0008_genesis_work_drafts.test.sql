-- @feat:pursuits
-- pgTAP test for 0008_genesis_work_drafts.sql (needs genesis-supabase 0009 and genesis-work
-- 0001 applied first). Copy into your app's `supabase/tests/database/` and run
-- `supabase test db`. It writes only its own users, tenants and hooks and rolls everything back.
-- If your app already has the hooks, they are dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- a1 runs tenant 1's gym; b2 and d4 are members (b2 has a person record, d4 only a login); p5 is a
-- member's person record with no login yet; c3 belongs to tenant 2.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-drafts-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.record(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-d000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.session(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-c000-00000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.record(text), pg_temp.tenant(int), pg_temp.session(int),
  pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create table public.genesis_test_members (tenant_id uuid, person uuid, lead boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.person('a1'), true), (pg_temp.tenant(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(1), pg_temp.person('d4'), false), (pg_temp.tenant(2), pg_temp.person('c3'), true);
create table public.genesis_test_records (tenant_id uuid, record uuid, login uuid);
insert into public.genesis_test_records values
  (pg_temp.tenant(1), pg_temp.record('b2'), pg_temp.person('b2')),
  (pg_temp.tenant(1), pg_temp.record('e5'), null);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);
drop function if exists private.genesis_viewer_people(uuid);
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select m.tenant_id, m.tenant_id from public.genesis_test_members m where m.person = viewer
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select organization_id = tenant and exists (select 1 from public.genesis_test_members m
    where m.tenant_id = tenant and m.person = viewer and (action = 'read' or m.lead))
$$;
create function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select r.tenant_id, r.record from public.genesis_test_records r where r.login = viewer
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;

-- A lead (a1) drafts goals for the gym; members (b2, d4) read the gym's goals once they're set.
select pg_temp.as_server();
insert into genesis_work.pursuits (tenant_id, organization_id, title, status)
values (pg_temp.tenant(1), pg_temp.tenant(1), 'Draft goal', 'draft'), (pg_temp.tenant(1), pg_temp.tenant(1), 'Live goal', 'active');
insert into genesis_work.work_items (tenant_id, organization_id, kind, title, status)
values (pg_temp.tenant(1), pg_temp.tenant(1), 'task', 'Draft task', 'draft');

select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_work.pursuits where title = 'Live goal'), 1, 'a member reads a set goal');
select is((select count(*)::int from genesis_work.pursuits where title = 'Draft goal'), 0, 'but not a draft');
select is((select count(*)::int from genesis_work.work_items where title = 'Draft task'), 0, 'nor a draft task');
select pg_temp.sign_in('a1');
select is((select count(*)::int from genesis_work.pursuits where title = 'Draft goal'), 1, 'whoever may write it reads a draft');
select isnt_empty($$ update genesis_work.pursuits set status = 'active' where title = 'Draft goal' returning id $$, 'and sets it');
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_work.pursuits where title = 'Draft goal'), 1, 'then everyone who reads the owner sees it');
select pg_temp.as_server();
select throws_ok($$ insert into genesis_work.pursuits (tenant_id, organization_id, title, status)
                    values (pg_temp.tenant(1), pg_temp.tenant(1), 'x', 'pending') $$, '23514', null, 'a status is one of the known ones');

select * from finish();
rollback;
