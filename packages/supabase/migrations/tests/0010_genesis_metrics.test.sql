-- @feat:metrics
-- pgTAP test for 0010_genesis_metrics.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants, teams and hooks and rolls everything back.
-- If your app already has the hooks (`private.genesis_owner_can`,
-- `private.genesis_readable_owners`), they are dropped and replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- People: a1 (leader) and b2 on tenant 1's team t1; c3 in tenant 2; d4 in nothing.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-metrics-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
create function pg_temp.metric(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-b000-00000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.team(int), pg_temp.metric(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create table public.genesis_test_members (tenant_id uuid, team_id uuid, person uuid, leader boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(2), null, pg_temp.person('c3'), false);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);

-- Shape -------------------------------------------------------------------------------------
select has_table('public', 'metrics', 'metrics exists');
select has_table('public', 'metric_values', 'metric_values exists');
select has_table('public', 'metric_goal_changes', 'metric_goal_changes exists');
select has_view('public', 'metric_values_with_goal', 'metric_values_with_goal exists');
select ok((select relrowsecurity from pg_class where oid = 'public.metrics'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.metric_values'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.metric_goal_changes'::regclass), 'RLS is on for all three tables');
select ok(not has_table_privilege('anon', 'public.metrics', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.metric_values', 'select,insert,update,delete'), 'anon has no privilege');
select ok(not has_table_privilege('authenticated', 'public.metric_goal_changes', 'insert,update,delete'), 'nobody signed in writes the goal history');

-- Fail closed without the hooks -------------------------------------------------------------
select pg_temp.as_server();
insert into public.metrics (id, tenant_id, team_id, name, goal_value, unit) values
  (pg_temp.metric(1), pg_temp.tenant(1), pg_temp.team(1), 'New leads', 50, 'leads');
select pg_temp.sign_in('a1');
select is((select count(*)::int from public.metrics), 0, 'without the read hook a member sees nothing');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(1), '2026-10-19', 41) $$,
  '42501', null, 'without the write hook nobody signed in enters a value');

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
      where m.tenant_id = tenant and m.team_id = genesis_owner_can.team_id and m.person = viewer)
    else exists (select 1 from public.genesis_test_members m where m.tenant_id = tenant and m.person = viewer and m.leader)
  end
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

insert into public.metrics (id, tenant_id, organization_id, name, unit_type, cadence, goal_value, sensitive) values
  (pg_temp.metric(2), pg_temp.tenant(1), pg_temp.tenant(1), 'Revenue', 'currency', 'monthly', 410000, true);
insert into public.metrics (id, tenant_id, person_id, name, unit_type, cadence, goal_value) values
  (pg_temp.metric(3), pg_temp.tenant(1), pg_temp.person('a1'), 'Morning walk', 'yes_no', 'daily', 1),
  (pg_temp.metric(4), pg_temp.tenant(2), pg_temp.person('c3'), 'Calls', 'number', 'weekly', 20);

-- Reading and writing -----------------------------------------------------------------------
select pg_temp.sign_in('b2');
select set_eq($$ select id from public.metrics $$, array[pg_temp.metric(1), pg_temp.metric(2)],
  'b2 reads the team''s and tenant''s metrics, not a1''s habit');
select lives_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(1), '2026-10-19', 41) $$,
  'a team member enters the team''s number');
select is((select tenant_id from public.metric_values where metric_id = pg_temp.metric(1)), pg_temp.tenant(1),
  'a value takes its metric''s tenant');
select is((select team_id from public.metric_values where metric_id = pg_temp.metric(1)), pg_temp.team(1),
  'a value takes its metric''s owner');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(1), '2026-10-19', 44) $$,
  '23505', null, 'one value per metric and period');
select lives_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(1), '2026-10-19', 44)
     on conflict (metric_id, period_start) do update set value = excluded.value $$,
  'entering the same period again updates it');
select is((select value from public.metric_values where metric_id = pg_temp.metric(1) and period_start = '2026-10-19'), 44::numeric,
  'the period holds the newer value');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(2), '2026-10-01', 427000) $$,
  '42501', null, 'a non-leader can''t enter the tenant''s number');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value, tenant_id, team_id)
     values (pg_temp.metric(4), '2026-10-19', 5, pg_temp.tenant(1), pg_temp.team(1)) $$,
  '42501', null, 'claiming a different tenant on a value doesn''t get past the metric''s own');

select pg_temp.sign_in('a1');
select lives_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(3), '2026-10-26', 1) $$,
  'a person ticks their own habit');
select lives_ok(
  $$ insert into public.metric_values (metric_id, period_start, value, source, source_ref)
     values (pg_temp.metric(3), '2026-10-25', 0, 'worksheet', 'entry:00000000-0000-4000-e000-000000000001') $$,
  'a worksheet answer records where its value came from');
select is((select entered_by from public.metric_values where metric_id = pg_temp.metric(3) and period_start = '2026-10-25'), pg_temp.person('a1'),
  'a value records who entered it');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(3), '2026-10-27', 2) $$,
  '22023', null, 'a yes or no metric takes 1 or 0');
select lives_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(2), '2026-09-01', 398000) $$,
  'a leader enters the tenant''s number');

select pg_temp.sign_in('c3');
select set_eq($$ select id from public.metrics $$, array[pg_temp.metric(4)], 'c3 reads only tenant 2');
select is((select count(*)::int from public.metric_values), 0, 'c3 reads no values of tenant 1');
select pg_temp.sign_in('d4');
select is((select count(*)::int from public.metrics), 0, 'a stranger reads nothing');

-- Guards ------------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
select throws_ok(
  $$ update public.metrics set team_id = null, organization_id = pg_temp.tenant(1) where id = pg_temp.metric(1) $$,
  '22023', null, 'the owner never changes');
select throws_ok(
  $$ update public.metrics set unit_type = 'percent' where id = pg_temp.metric(1) $$,
  '22023', null, 'the unit type is fixed once there are values');
select throws_ok(
  $$ insert into public.metrics (tenant_id, team_id, name, goal_direction, goal_value, goal_max)
     values (pg_temp.tenant(1), pg_temp.team(1), 'Bad range', 'between', 10, 5) $$,
  '23514', null, 'a range''s top is at least its bottom');
select throws_ok(
  $$ insert into public.metrics (tenant_id, team_id, name, source) values (pg_temp.tenant(1), pg_temp.team(1), 'No formula', 'formula') $$,
  '23514', null, 'a formula metric needs a formula');

select throws_ok(
  $$ insert into public.metrics (tenant_id, team_id, name, source, source_config) values (pg_temp.tenant(1), pg_temp.team(1), 'Synced', 'quickbooks', '{"report": "pl"}') $$,
  '23514', null, 'a synced metric names its connection');
select lives_ok(
  $$ insert into public.metrics (tenant_id, team_id, name, source, connection_id, source_config)
     values (pg_temp.tenant(1), pg_temp.team(1), 'Synced', 'sheet', '00000000-0000-4000-f000-000000000001', '{"range": "A1"}') $$,
  'a synced metric with its connection');

select pg_temp.sign_in('b2');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(1), '2026-10-21', 3) $$,
  '22023', null, 'a weekly value starts on a Monday');
select is((select entered_by from public.metric_values where metric_id = pg_temp.metric(1) and period_start = '2026-10-19'), pg_temp.person('b2'),
  'entered_by is always the signed-in person');
select pg_temp.sign_in('a1');
select throws_ok(
  $$ update public.metrics set cadence = 'monthly' where id = pg_temp.metric(1) $$,
  '22023', null, 'the cadence is fixed once there are values');
select pg_temp.sign_in('c3');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (pg_temp.metric(3), '2026-10-26', 7) $$,
  '42501', null, 'writing to another tenant''s metric is refused before anything about it is checked');
select throws_ok(
  $$ insert into public.metric_values (metric_id, period_start, value) values (gen_random_uuid(), '2026-10-26', 7) $$,
  '42501', null, 'a metric that doesn''t exist looks the same as one you can''t write');
select ok(not has_sequence_privilege('authenticated', 'public.metric_goal_changes_id_seq', 'usage,select,update'),
  'nobody signed in uses the goal history''s sequence');
select pg_temp.sign_in('a1');

-- Goals over time ---------------------------------------------------------------------------
select set_config('genesis.today', '2026-10-28', true);
select lives_ok(
  $$ update public.metrics set goal_value = 60 where id = pg_temp.metric(1) $$,
  'changing a goal');
select is((select until_period from public.metric_goal_changes where metric_id = pg_temp.metric(1)), '2026-10-26'::date,
  'the old goal applies until the period that contains the tenant''s today');
select is((select count(*)::int from public.metric_goal_changes where metric_id = pg_temp.metric(1)), 1,
  'the old goal is kept');
select is((select goal_value from public.metric_values_with_goal where metric_id = pg_temp.metric(1) and period_start = '2026-10-19'), 50::numeric,
  'a past value is judged against the goal of its time');
select is((select on_goal from public.metric_values_with_goal where metric_id = pg_temp.metric(1) and period_start = '2026-10-19'), false,
  '44 against a goal of at least 50 is off goal');

select * from finish();
rollback;
