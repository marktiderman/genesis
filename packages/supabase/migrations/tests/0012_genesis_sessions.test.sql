-- @feat:sessions
-- pgTAP test for 0012_genesis_sessions.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants, teams and hooks and rolls everything back.
-- If your app already has the hooks (`private.genesis_owner_can`,
-- `private.genesis_readable_owners`), they are dropped and replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- People: a1 and b2 on tenant 1's team t1; c3 in tenant 2; e5 is a guest of tenant 1 (no team).
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-sessions-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
create function pg_temp.stype(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-b000-00000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.team(int), pg_temp.stype(int), pg_temp.session(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create table public.genesis_test_members (tenant_id uuid, team_id uuid, person uuid);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1')),
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('b2')),
  (pg_temp.tenant(2), null, pg_temp.person('c3'));

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select m.tenant_id, m.team_id from public.genesis_test_members m where m.person = viewer and m.team_id is not null
  union all
  select m.tenant_id, m.person from public.genesis_test_members m where m.person = viewer
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when person_id is not null then person_id = viewer
    when team_id is not null then exists (select 1 from public.genesis_test_members m
      where m.tenant_id = tenant and m.team_id = genesis_owner_can.team_id and m.person = viewer)
    else false
  end
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- Shape -------------------------------------------------------------------------------------
select has_table('public', 'session_types', 'session_types exists');
select has_table('public', 'sessions', 'sessions exists');
select has_table('public', 'session_attendees', 'session_attendees exists');
select has_table('public', 'session_links', 'session_links exists');
select has_view('public', 'session_ratings', 'session_ratings exists');
select ok(not has_table_privilege('anon', 'public.sessions', 'select,insert,update,delete'), 'anon has no privilege');

-- Types and sessions ------------------------------------------------------------------------
select pg_temp.sign_in('a1');
select lives_ok(
  $$ insert into public.session_types (id, tenant_id, team_id, name, default_minutes, agenda)
     values (pg_temp.stype(1), pg_temp.tenant(1), pg_temp.team(1), 'Weekly team meeting', 90,
             '[{"key":"checkin","title":"Check-in","minutes":5},{"key":"issues","title":"Issues","minutes":60}]') $$,
  'a team member adds a session type');
select lives_ok(
  $$ insert into public.sessions (id, tenant_id, team_id, session_type_id, title, scheduled_at, duration_minutes, calendar_event_id)
     values (pg_temp.session(1), pg_temp.tenant(1), pg_temp.team(1), pg_temp.stype(1), 'Tuesday meeting', '2026-10-27 14:00+00', 90, 'gcal:abc123') $$,
  'a team member schedules a session');
select is((select kind from public.sessions where id = pg_temp.session(1)), 'meeting', 'a session takes its type''s kind');
select lives_ok(
  $$ insert into public.sessions (tenant_id, team_id, kind, title, scheduled_at, duration_minutes)
     values (pg_temp.tenant(1), pg_temp.team(1), 'workshop', 'Hiring workshop', '2026-11-03 15:00+00', 180) $$,
  'a workshop without a type');
select throws_ok(
  $$ insert into public.sessions (tenant_id, team_id, kind, title) values (pg_temp.tenant(1), pg_temp.team(1), 'party', 'x') $$,
  '23514', null, 'a session''s kind is one of the known kinds');
select throws_ok(
  $$ insert into public.sessions (tenant_id, team_id, session_type_id, title) values (pg_temp.tenant(2), pg_temp.team(1), pg_temp.stype(1), 'x') $$,
  '42501', null, 'scheduling in another tenant is refused');
select lives_ok(
  $$ insert into public.session_attendees (session_id, user_id) values
     (pg_temp.session(1), pg_temp.person('a1')), (pg_temp.session(1), pg_temp.person('b2')), (pg_temp.session(1), pg_temp.person('e5')) $$,
  'inviting attendees, a guest included');
select is((select team_id from public.session_attendees where user_id = pg_temp.person('e5')), pg_temp.team(1),
  'an attendee row takes its session''s owner');
select lives_ok(
  $$ insert into public.session_links (session_id, kind, ref, title) values (pg_temp.session(1), 'prework', 'form:weekly-prework', 'Wins and numbers') $$,
  'adding pre-work');

-- Running -----------------------------------------------------------------------------------
select lives_ok($$ update public.sessions set status = 'live' where id = pg_temp.session(1) $$, 'starting the session');
select is((select jsonb_array_length(agenda) from public.sessions where id = pg_temp.session(1)), 2, 'starting copies the type''s agenda');
select isnt((select started_at from public.sessions where id = pg_temp.session(1)), null, 'starting stamps started_at');
select lives_ok($$ update public.session_types set agenda = '[]' where id = pg_temp.stype(1) $$, 'editing the type afterwards');
select is((select jsonb_array_length(agenda) from public.sessions where id = pg_temp.session(1)), 2, 'the session keeps the agenda it started with');
select lives_ok($$ update public.sessions set current_step = 1 where id = pg_temp.session(1) $$, 'moving to the next step');

-- Rating ------------------------------------------------------------------------------------
select pg_temp.sign_in('e5');
select is((select count(*)::int from public.sessions), 1, 'a guest attendee reads the session they attend');
select is((select count(*)::int from public.session_links), 1, 'and its pre-work');
select isnt_empty(
  $$ update public.session_attendees set rating = 9, rating_note = 'Great IDS' where session_id = pg_temp.session(1) and user_id = pg_temp.person('e5') returning user_id $$,
  'an attendee rates the session');
select throws_ok(
  $$ update public.session_attendees set present = true where session_id = pg_temp.session(1) and user_id = pg_temp.person('e5') $$,
  '42501', null, 'an attendee who can''t run the session doesn''t mark presence');
select is_empty(
  $$ update public.session_attendees set rating = 1 where session_id = pg_temp.session(1) and user_id = pg_temp.person('b2') returning user_id $$,
  'an attendee doesn''t rate for someone else');
select pg_temp.sign_in('a1');
select throws_ok(
  $$ update public.session_attendees set rating = 10 where session_id = pg_temp.session(1) and user_id = pg_temp.person('b2') $$,
  '42501', null, 'even the session''s runner doesn''t rate for someone else');
select lives_ok($$ update public.session_attendees set present = true where session_id = pg_temp.session(1) $$, 'the runner marks presence');
select lives_ok($$ update public.session_attendees set rating = 8 where session_id = pg_temp.session(1) and user_id = pg_temp.person('a1') $$, 'the runner rates too');
select is((select average from public.session_ratings where session_id = pg_temp.session(1)), 8.5::numeric, 'the average rating');

select pg_temp.sign_in('c3');
select is((select count(*)::int from public.sessions), 0, 'another tenant sees no sessions');

select * from finish();
rollback;
