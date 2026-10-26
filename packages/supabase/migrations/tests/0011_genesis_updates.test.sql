-- @feat:status-updates
-- pgTAP test for 0011_genesis_updates.sql (needs 0009 and 0010 applied first).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants, teams and hooks and rolls everything back.
-- If your app already has the hooks (`private.genesis_owner_can`,
-- `private.genesis_readable_owners`), they are dropped and replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- People: a1 (leader) and b2 on tenant 1's team t1; c3 in tenant 2; d4 in tenant 1 but not the team.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-updates-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
create function pg_temp.pursuit(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-b000-00000000000' || n)::uuid $$;
create function pg_temp.request(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-d000-00000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.team(int), pg_temp.pursuit(int), pg_temp.request(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create table public.genesis_test_members (tenant_id uuid, team_id uuid, person uuid, leader boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(1), null, pg_temp.person('d4'), false),
  (pg_temp.tenant(2), null, pg_temp.person('c3'), false);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);
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
    when team_id is not null then exists (
      select 1 from public.genesis_test_members m
      where m.tenant_id = tenant and m.team_id = genesis_owner_can.team_id and m.person = viewer)
    else exists (select 1 from public.genesis_test_members m where m.tenant_id = tenant and m.person = viewer
                 and (action = 'read' or m.leader))
  end
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

insert into public.pursuits (id, tenant_id, team_id, title) values
  (pg_temp.pursuit(1), pg_temp.tenant(1), pg_temp.team(1), 'Launch online booking');
insert into public.pursuits (id, tenant_id, organization_id, title) values
  (pg_temp.pursuit(2), pg_temp.tenant(1), pg_temp.tenant(1), 'Open a second site');

-- Shape -------------------------------------------------------------------------------------
select has_table('public', 'status_updates', 'status_updates exists');
select has_table('public', 'update_requests', 'update_requests exists');
select has_view('public', 'update_requests_due', 'update_requests_due exists');
select ok(not has_table_privilege('anon', 'public.status_updates', 'select,insert'), 'anon has no privilege');
select ok(not has_table_privilege('authenticated', 'public.status_updates', 'update,delete,truncate'), 'updates are a record: nobody signed in edits or deletes them');

-- Posting updates ---------------------------------------------------------------------------
select pg_temp.sign_in('b2');
select lives_ok(
  $$ insert into public.status_updates (item_kind, item_id, health, body) values ('pursuit', pg_temp.pursuit(1), 'at_risk', 'Payment provider review took a week.') $$,
  'a team member posts an update on the team''s pursuit');
select is((select health from public.pursuits where id = pg_temp.pursuit(1)), 'at_risk', 'the update sets the pursuit''s health');
select is((select team_id from public.status_updates limit 1), pg_temp.team(1), 'an update takes its item''s owner');
select throws_ok(
  $$ insert into public.status_updates (item_kind, item_id, health) values ('pursuit', pg_temp.pursuit(2), 'on_track') $$,
  '42501', null, 'a non-leader can''t post on a tenant-owned pursuit without being asked');
select throws_ok(
  $$ insert into public.status_updates (item_kind, item_id, health) values ('pursuit', gen_random_uuid(), 'on_track') $$,
  '42501', null, 'an item that doesn''t exist looks the same as one you can''t read');
select throws_ok(
  $$ insert into public.status_updates (item_kind, item_id, body) values ('pursuit', pg_temp.pursuit(1), '  ') $$,
  '23514', null, 'an update says something');

-- Asking ------------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
select lives_ok(
  $$ insert into public.update_requests (id, item_kind, item_id, asked_of, due_at, note)
     values (pg_temp.request(1), 'pursuit', pg_temp.pursuit(2), pg_temp.person('b2'), now() + interval '2 days', 'Where are we on the lease?') $$,
  'a leader asks b2 for an update');
select lives_ok(
  $$ insert into public.update_requests (id, item_kind, item_id, asked_of, due_at)
     values (pg_temp.request(2), 'pursuit', pg_temp.pursuit(1), pg_temp.person('b2'), now() - interval '1 hour') $$,
  'asking with a due time already past');
select pg_temp.sign_in('c3');
select throws_ok(
  $$ insert into public.update_requests (item_kind, item_id, asked_of, due_at) values ('pursuit', pg_temp.pursuit(1), pg_temp.person('b2'), now()) $$,
  '42501', null, 'someone who can''t read the item can''t ask about it');
select is((select count(*)::int from public.update_requests), 0, 'another tenant sees no requests');

select pg_temp.sign_in('b2');
select set_eq($$ select id from public.update_requests_due $$, array[pg_temp.request(1), pg_temp.request(2)], 'b2 sees what they''ve been asked');
select is((select overdue from public.update_requests_due where id = pg_temp.request(2)), true, 'a past due time is overdue');
select is_empty(
  $$ update public.update_requests set status = 'answered', answered_at = now() where id = pg_temp.request(1) returning id $$,
  'the person asked can''t mark it answered by hand');

-- Answering ---------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.status_updates (item_kind, item_id, health, body) values ('pursuit', pg_temp.pursuit(2), 'on_track', 'Lease signed Friday.') $$,
  'the person asked may post on an item they can''t otherwise write');
select is((select status from public.update_requests where id = pg_temp.request(1)), 'answered', 'posting answers the request');
select is((select answered_by from public.update_requests where id = pg_temp.request(1)),
  (select id from public.status_updates where item_id = pg_temp.pursuit(2)), 'the request points at its answer');
select is((select status from public.update_requests where id = pg_temp.request(2)), 'open', 'a request on another item stays open');

select is((select health from public.pursuits where id = pg_temp.pursuit(2)), null,
  'an answer from someone who can''t write the pursuit doesn''t set its health');
select is((select count(*)::int from public.status_updates where author_id = pg_temp.person('b2') and item_id = pg_temp.pursuit(2)), 1,
  'the person asked reads back their own answer');

-- Gate's review: asking yourself, or someone who can't read the item ------------------------
select throws_ok(
  $$ insert into public.update_requests (item_kind, item_id, asked_of, due_at) values ('pursuit', pg_temp.pursuit(2), pg_temp.person('b2'), now()) $$,
  '22023', null, 'nobody asks themselves (and so gets write rights)');
select throws_ok(
  $$ insert into public.update_requests (item_kind, item_id, asked_of, due_at) values ('pursuit', pg_temp.pursuit(1), pg_temp.person('c3'), now()) $$,
  '22023', null, 'nobody asks someone who can''t read the item');
select lives_ok(
  $$ insert into public.update_requests (item_kind, item_id, asked_of, due_at, created_at)
     values ('pursuit', pg_temp.pursuit(2), pg_temp.person('d4'), now() + interval '1 day', '2000-01-01') $$,
  'asking someone in the tenant who can read the item');
select isnt((select created_at::date from public.update_requests where asked_of = pg_temp.person('d4')), '2000-01-01'::date,
  'created_at is the database''s, not the client''s');

-- Cancelling --------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
select lives_ok($$ update public.update_requests set status = 'cancelled' where id = pg_temp.request(2) $$, 'the asker cancels a request');
select throws_ok(
  $$ update public.update_requests set due_at = now() + interval '9 days' where id = pg_temp.request(2) $$,
  '22023', null, 'only a request''s status changes');

-- Owner moves ------------------------------------------------------------------------------
select pg_temp.as_server();
select lives_ok($$ update public.pursuits set team_id = null, person_id = pg_temp.person('a1') where id = pg_temp.pursuit(1) $$,
  'server code moves a pursuit to another owner');
select is((select count(*)::int from public.status_updates where item_id = pg_temp.pursuit(1) and person_id is distinct from pg_temp.person('a1')), 0,
  'its updates move with it');

select * from finish();
rollback;
