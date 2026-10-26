-- @feat:pursuits
-- pgTAP test for 0009_genesis_pursuits.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants, teams and hooks and rolls everything back.
-- If your app already has the hooks (`private.genesis_owner_can`,
-- `private.genesis_readable_owners`), they are dropped and replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- People: a1 and b2 are members of tenant 1's team t1; a1 leads it. c3 belongs to tenant 2 only.
-- d4 belongs to nothing.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-pursuits-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.team(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

-- An app's membership: tenant members, and team members with a role.
create table public.genesis_test_members (tenant_id uuid, team_id uuid, person uuid, leader boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(2), null, pg_temp.person('c3'), false);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);

-- Shape -------------------------------------------------------------------------------------
select has_table('public', 'pursuits', 'pursuits exists');
select has_table('public', 'work_items', 'work_items exists');
select ok((select relrowsecurity from pg_class where oid = 'public.pursuits'::regclass), 'RLS is on for pursuits');
select ok((select relrowsecurity from pg_class where oid = 'public.work_items'::regclass), 'RLS is on for work items');
select ok(not has_table_privilege('anon', 'public.pursuits', 'select,insert,update,delete'), 'anon has no privilege on pursuits');
select ok(not has_table_privilege('anon', 'public.work_items', 'select,insert,update,delete'), 'anon has no privilege on work items');
select ok(not has_function_privilege('authenticated', 'private.genesis_pursuits_guard()', 'execute'), 'the guard is not callable');
select ok(not has_table_privilege('authenticated', 'public.pursuits', 'truncate,references,trigger'), 'signed-in people get only select, insert, update and delete');

-- Without the hooks: fail closed ------------------------------------------------------------
select pg_temp.as_server();
insert into public.pursuits (id, tenant_id, team_id, title, is_goal, is_project)
values ('00000000-0000-4000-b000-000000000001', pg_temp.tenant(1), pg_temp.team(1), 'Open two new sites', true, false);
select pg_temp.sign_in('a1');
select is((select count(*)::int from public.pursuits), 0, 'without the read hook a member sees nothing');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, team_id, title) values (pg_temp.tenant(1), pg_temp.team(1), 'x') $$,
  '42501', null, 'without the write hook nobody signed in can insert');

-- The app's hooks ---------------------------------------------------------------------------
select pg_temp.as_server();
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select m.tenant_id, m.person from public.genesis_test_members m where m.person = viewer
  union all
  select m.tenant_id, m.team_id from public.genesis_test_members m where m.person = viewer and m.team_id is not null
  union all
  select m.tenant_id, m.tenant_id from public.genesis_test_members m where m.person = viewer
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when person_id is not null then person_id = viewer
      and exists (select 1 from public.genesis_test_members m where m.tenant_id = tenant and m.person = viewer)
    when team_id is not null then exists (
      select 1 from public.genesis_test_members m
      where m.tenant_id = tenant and m.team_id = genesis_owner_can.team_id and m.person = viewer
)
    else exists (select 1 from public.genesis_test_members m where m.tenant_id = tenant and m.person = viewer and m.leader)
  end
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- Reading ------------------------------------------------------------------------------------
insert into public.pursuits (id, tenant_id, person_id, title) values
  ('00000000-0000-4000-b000-000000000002', pg_temp.tenant(1), pg_temp.person('a1'), 'Run a marathon'),
  ('00000000-0000-4000-b000-000000000003', pg_temp.tenant(2), pg_temp.person('c3'), 'Hire a CFO');
insert into public.pursuits (id, tenant_id, organization_id, title, is_goal, is_project, label, period_start, period_end) values
  ('00000000-0000-4000-b000-000000000004', pg_temp.tenant(1), pg_temp.tenant(1), 'Launch online booking', true, true, 'rock', '2026-10-01', '2026-12-31');

select pg_temp.sign_in('a1');
select set_eq($$ select id from public.pursuits $$,
  array['00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000004']::uuid[],
  'a1 reads their own, their team''s and their tenant''s pursuits');
select pg_temp.sign_in('b2');
select set_eq($$ select id from public.pursuits $$,
  array['00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000004']::uuid[],
  'b2 reads the team''s and tenant''s pursuits, not a1''s own');
select pg_temp.sign_in('c3');
select set_eq($$ select id from public.pursuits $$, array['00000000-0000-4000-b000-000000000003']::uuid[],
  'c3 reads only tenant 2');
select pg_temp.sign_in('d4');
select is((select count(*)::int from public.pursuits), 0, 'a stranger reads nothing');
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.pursuits $$, '42501', null, 'anon is refused');

-- Writing ------------------------------------------------------------------------------------
select pg_temp.sign_in('b2');
select lives_ok(
  $$ insert into public.pursuits (tenant_id, team_id, title) values (pg_temp.tenant(1), pg_temp.team(1), 'Cut costing errors') $$,
  'a team member adds a team pursuit');
select lives_ok(
  $$ insert into public.pursuits (tenant_id, person_id, title) values (pg_temp.tenant(1), pg_temp.person('b2'), 'Read 12 books') $$,
  'a member adds their own pursuit');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, person_id, title) values (pg_temp.tenant(1), pg_temp.person('a1'), 'Not mine') $$,
  '42501', null, 'nobody adds a pursuit owned by someone else');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, organization_id, title) values (pg_temp.tenant(1), pg_temp.tenant(1), 'Company goal') $$,
  '42501', null, 'a non-leader can''t add a tenant-owned pursuit');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, team_id, title) values (pg_temp.tenant(2), pg_temp.team(1), 'Wrong tenant') $$,
  '42501', null, 'a write into another tenant is refused');
select is_empty(
  $$ update public.pursuits set title = 'Hijacked' where id = '00000000-0000-4000-b000-000000000002' returning id $$,
  'b2 can''t change a1''s own pursuit');
select is_empty(
  $$ delete from public.pursuits where id = '00000000-0000-4000-b000-000000000004' returning id $$,
  'a non-leader can''t delete a tenant-owned pursuit');

select pg_temp.sign_in('a1');
select isnt_empty(
  $$ update public.pursuits set health = 'off_track' where id = '00000000-0000-4000-b000-000000000004' returning id $$,
  'a leader updates a tenant-owned pursuit');

-- Guards -------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.pursuits set team_id = null, person_id = pg_temp.person('a1') where id = '00000000-0000-4000-b000-000000000001' $$,
  '22023', null, 'the owner never changes');
select throws_ok(
  $$ update public.pursuits set tenant_id = pg_temp.tenant(2) where id = '00000000-0000-4000-b000-000000000002' $$,
  '22023', null, 'the tenant never changes');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, team_id, person_id, title) values (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1'), 'Two owners') $$,
  '23514', null, 'exactly one owner');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, team_id, title, is_goal, is_project) values (pg_temp.tenant(1), pg_temp.team(1), 'Neither', false, false) $$,
  '23514', null, 'a pursuit is a goal, a project or both');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, organization_id, title) values (pg_temp.tenant(1), pg_temp.tenant(2), 'Other org') $$,
  '23514', null, 'a tenant-owned pursuit names its own tenant');
select lives_ok(
  $$ update public.pursuits set parent_id = '00000000-0000-4000-b000-000000000004' where id = '00000000-0000-4000-b000-000000000001' $$,
  'a pursuit nests under another in its tenant');
select throws_ok(
  $$ update public.pursuits set parent_id = '00000000-0000-4000-b000-000000000001' where id = '00000000-0000-4000-b000-000000000004' $$,
  '22023', null, 'no cycles');

select pg_temp.as_server();
select throws_ok(
  $$ update public.pursuits set parent_id = '00000000-0000-4000-b000-000000000003' where id = '00000000-0000-4000-b000-000000000002' $$,
  '22023', null, 'a parent must be in the same tenant');

-- The owner-access contract ----------------------------------------------------------------
select pg_temp.sign_in('a1');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'write'), true, 'the wrapper answers for the signed-in person');
select is(private.genesis_owner_allows(pg_temp.tenant(1), null, pg_temp.team(1), null, 'delete'), false, 'an action other than read or write is no');
select ok(not has_function_privilege('anon', 'private.genesis_owner_allows(uuid,uuid,uuid,uuid,text)', 'execute'), 'anon can''t call the wrappers');

-- Links through a row the caller can't see (Gate's review) ----------------------------------
-- X (team) -> Y (a1's own, hidden from b2) -> Z (team). b2 can't close Z -> X.
select pg_temp.as_server();
insert into public.pursuits (id, tenant_id, team_id, title) values
  ('00000000-0000-4000-b000-000000000013', pg_temp.tenant(1), pg_temp.team(1), 'Z');
insert into public.pursuits (id, tenant_id, person_id, title, parent_id) values
  ('00000000-0000-4000-b000-000000000012', pg_temp.tenant(1), pg_temp.person('a1'), 'Y', '00000000-0000-4000-b000-000000000013');
insert into public.pursuits (id, tenant_id, team_id, title, parent_id) values
  ('00000000-0000-4000-b000-000000000011', pg_temp.tenant(1), pg_temp.team(1), 'X', '00000000-0000-4000-b000-000000000012');
select pg_temp.sign_in('b2');
select throws_ok(
  $$ update public.pursuits set parent_id = '00000000-0000-4000-b000-000000000011' where id = '00000000-0000-4000-b000-000000000013' $$,
  '22023', null, 'a loop through a pursuit the caller can''t see is still refused');
select isnt_empty(
  $$ update public.pursuits set title = 'X renamed' where id = '00000000-0000-4000-b000-000000000011' returning id $$,
  'a pursuit under a hidden parent can still be renamed');
select lives_ok(
  $$ insert into public.pursuits (id, tenant_id, team_id, title, created_by)
     values ('00000000-0000-4000-b000-000000000014', pg_temp.tenant(1), pg_temp.team(1), 'Spoof', pg_temp.person('a1')) $$,
  'a member adds a pursuit naming someone else as its maker');
select is((select created_by from public.pursuits where id = '00000000-0000-4000-b000-000000000014'), pg_temp.person('b2'),
  'created_by is always the signed-in person');
select pg_temp.as_server();
select lives_ok(
  $$ update public.pursuits set team_id = null, person_id = pg_temp.person('b2') where id = '00000000-0000-4000-b000-000000000014' $$,
  'server code may move a pursuit to another owner');

-- Work items ---------------------------------------------------------------------------------
select pg_temp.sign_in('b2');
select lives_ok(
  $$ insert into public.work_items (id, tenant_id, team_id, pursuit_id, kind, title, assignee_id, rank)
     values ('00000000-0000-4000-c000-000000000001', pg_temp.tenant(1), pg_temp.team(1), '00000000-0000-4000-b000-000000000001', 'task', 'Call three landlords', pg_temp.person('b2'), 1) $$,
  'a member adds a team to-do under the team''s pursuit');
select lives_ok(
  $$ insert into public.work_items (id, tenant_id, team_id, kind, title, term, priority, decider_id)
     values ('00000000-0000-4000-c000-000000000002', pg_temp.tenant(1), pg_temp.team(1), 'issue', 'Tour no-shows doubled', 'short', 5, pg_temp.person('a1')) $$,
  'a member raises a team issue');
select throws_ok(
  $$ insert into public.work_items (tenant_id, team_id, kind, title, term) values (pg_temp.tenant(1), pg_temp.team(1), 'task', 'Not an issue', 'short') $$,
  '23514', null, 'only issues carry a term, decider and solution');
select throws_ok(
  $$ insert into public.work_items (tenant_id, team_id, kind, title, pursuit_id) values (pg_temp.tenant(1), pg_temp.team(1), 'task', 'Cross-tenant', '00000000-0000-4000-b000-000000000003') $$,
  '22023', null, 'a work item''s pursuit must be in the same tenant');
select lives_ok(
  $$ update public.work_items set status = 'done', solution = 'Text reminders the day before' where id = '00000000-0000-4000-c000-000000000002' $$,
  'solving an issue');
select isnt((select completed_at from public.work_items where id = '00000000-0000-4000-c000-000000000002'), null, 'done stamps completed_at');
select lives_ok(
  $$ update public.work_items set status = 'open' where id = '00000000-0000-4000-c000-000000000002' $$,
  'reopening an issue');
select is((select completed_at from public.work_items where id = '00000000-0000-4000-c000-000000000002'), null, 'reopening clears completed_at');

select pg_temp.sign_in('c3');
select is((select count(*)::int from public.work_items), 0, 'another tenant''s member sees no work items');

-- A hook that returns the wrong type fails closed -------------------------------------------
select pg_temp.as_server();
drop function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns text language sql stable set search_path = '' as $$ select 'maybe' $$;
select pg_temp.sign_in('b2');
select throws_ok(
  $$ insert into public.pursuits (tenant_id, team_id, title) values (pg_temp.tenant(1), pg_temp.team(1), 'Broken hook') $$,
  '42501', null, 'a hook that errors means no write');

select * from finish();
rollback;
