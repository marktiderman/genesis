-- @feat:sessions
-- pgTAP test for 0007_genesis_work_bookings.sql (needs genesis-supabase 0009 and 0016 and
-- genesis-work 0001 and 0004 applied first). Copy into your app's `supabase/tests/database/` and run
-- `supabase test db`. It writes only its own users, tenants and hooks and rolls everything back.
-- If your app already has the hooks, they are dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- a1 runs tenant 1's gym; b2 and d4 are members (b2 has a person record, d4 only a login); p5 is a
-- member's person record with no login yet; c3 belongs to tenant 2.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-bookings-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
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

-- Shape -------------------------------------------------------------------------------------
select has_table('genesis_work', 'session_series', 'session_series exists');
select has_column('genesis_work', 'session_attendees', 'attendee_person_id', 'an attendee can be a person record');
select ok(not has_function_privilege('authenticated', 'genesis_work.settle_session_bookings(uuid)', 'execute'), 'only server code settles bookings');

-- A class with one place, starting in half an hour, cancel cut-off three hours.
select pg_temp.as_server();
insert into genesis_work.session_types (id, tenant_id, organization_id, kind, name, cancel_cutoff_minutes)
values ('00000000-0000-4000-b000-000000000001', pg_temp.tenant(1), pg_temp.tenant(1), 'class', 'Morning class', 180);
insert into genesis_work.sessions (id, tenant_id, organization_id, session_type_id, title, scheduled_at, capacity)
values (pg_temp.session(1), pg_temp.tenant(1), pg_temp.tenant(1), '00000000-0000-4000-b000-000000000001', '6am class', now() + interval '30 minutes', 1);

-- Booking -------------------------------------------------------------------------------------
select pg_temp.sign_in('b2');
select is(genesis_work.book_session(pg_temp.session(1)), 'booked', 'a member books the last place');
select is((select attendee_person_id from genesis_work.session_attendees where session_id = pg_temp.session(1)), pg_temp.record('b2'),
  'as their person record in that tenant');
select is(genesis_work.book_session(pg_temp.session(1)), 'booked', 'booking again changes nothing');
select pg_temp.sign_in('d4');
select is(genesis_work.book_session(pg_temp.session(1)), 'waitlisted', 'the next member goes on the waitlist');
select is((select count(*)::int from genesis_work.session_attendees), 2, 'members see who''s booked');
select is((select booked || '/' || waitlisted || '/' || places_left from genesis_work.session_places(pg_temp.session(1))), '1/1/0',
  'but sees how full the class is');
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_work.session_attendees a
            where private.genesis_sessions_is_me(a.user_id, a.tenant_id, a.attendee_person_id)), 1,
  'a person attendee is "me" through their record');
select throws_ok($$ update genesis_work.session_attendees set booking_status = 'cancelled' where session_id = pg_temp.session(1) $$,
  '42501', null, 'a member doesn''t change a place directly');
select lives_ok($$ update genesis_work.session_attendees set rsvp = 'going' where session_id = pg_temp.session(1) $$,
  'but answers their invitation');
select pg_temp.sign_in('d4');
select throws_ok($$ update genesis_work.session_attendees set booked_at = now() - interval '1 day' where user_id = pg_temp.person('d4') $$,
  '42501', null, 'a waitlisted member can''t jump the queue');
select pg_temp.sign_in('c3');
select throws_ok($$ select genesis_work.book_session(pg_temp.session(1)) $$, '42501', null, 'another tenant can''t book');

-- Cancelling and the waitlist -----------------------------------------------------------------
select pg_temp.sign_in('b2');
select is(genesis_work.cancel_booking(pg_temp.session(1)), 'late_cancelled', 'cancelling inside the cut-off is late');
select pg_temp.as_server();
select is((select booking_status from genesis_work.session_attendees where user_id = pg_temp.person('d4')), 'booked',
  'and the first on the waitlist takes the place');
select pg_temp.sign_in('a1');
select is(genesis_work.book_session(pg_temp.session(1), pg_temp.record('e5')), 'waitlisted', 'staff book a member who has no login yet');
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_work.book_session(pg_temp.session(1), pg_temp.record('e5')) $$, '42501', null,
  'a member books only themselves');

-- The app's booking hook ----------------------------------------------------------------------
select pg_temp.as_server();
create function private.genesis_booking_allowed(session uuid, attendee uuid) returns text language sql stable set search_path = '' as $$
  select 'No active membership' from genesis_work.session_attendees a
   where a.id = attendee and (a.attendee_person_id = '00000000-0000-4000-d000-0000000000e5' or a.user_id = '00000000-0000-4000-8000-0000000000d4')
$$;
insert into genesis_work.sessions (id, tenant_id, organization_id, title, scheduled_at, capacity)
values (pg_temp.session(2), pg_temp.tenant(1), pg_temp.tenant(1), '7am class', now() + interval '1 day', 5);
select pg_temp.sign_in('d4');
select throws_ok($$ select genesis_work.book_session(pg_temp.session(2)) $$, 'P0001', 'No active membership',
  'the app''s hook refuses a booking with its reason');
select pg_temp.sign_in('a1');
update genesis_work.sessions set capacity = 2 where id = pg_temp.session(1);
select is((select booking_status from genesis_work.session_attendees where attendee_person_id = pg_temp.record('e5')), 'waitlisted',
  'a promotion skips someone the hook refuses');
select pg_temp.as_server();
drop function private.genesis_booking_allowed(uuid, uuid);
select pg_temp.sign_in('a1');
update genesis_work.sessions set capacity = 3 where id = pg_temp.session(1);
select is((select booking_status from genesis_work.session_attendees where attendee_person_id = pg_temp.record('e5')), 'booked',
  'raising the capacity fills the place from the waitlist');
select pg_temp.as_server();
update genesis_work.sessions set rsvp_closes_at = now() - interval '1 minute' where id = pg_temp.session(1);
select pg_temp.sign_in('b2');
select throws_ok($$ update genesis_work.session_attendees set rsvp = 'maybe' where attendee_person_id = pg_temp.record('b2') $$,
  '22023', null, 'RSVPs close when the session says');

-- Check-in and settling -----------------------------------------------------------------------
select pg_temp.sign_in('d4');
select lives_ok($$ select genesis_work.check_in(pg_temp.session(1), 'qr') $$, 'a booked member checks in');
select pg_temp.as_server();
select is((select present::text || ' ' || check_in_source from genesis_work.session_attendees where user_id = pg_temp.person('d4')),
  'true qr', 'and is marked present');
select throws_ok($$ insert into genesis_work.session_attendees (session_id) values (pg_temp.session(1)) $$,
  '23514', null, 'an attendee is a login or a person record');
update genesis_work.session_attendees set booking_status = 'booked' where attendee_person_id = pg_temp.record('e5');
update genesis_work.sessions set status = 'ended' where id = pg_temp.session(1);
select is(genesis_work.settle_session_bookings(pg_temp.session(1)), 1, 'settling marks a booked absentee a no-show');

-- Series --------------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
insert into genesis_work.session_series (id, tenant_id, organization_id, kind, title, weekdays, time_of_day, time_zone, starts_on, capacity)
values ('00000000-0000-4000-e000-000000000001', pg_temp.tenant(1), pg_temp.tenant(1), 'class', 'Noon class',
        '{1,2,3,4,5,6,7}', '12:00', 'America/New_York', current_date, 12);
select cmp_ok(genesis_work.extend_series('00000000-0000-4000-e000-000000000001', 7), '>=', 6, 'a series makes a week of classes');
select is(genesis_work.extend_series('00000000-0000-4000-e000-000000000001', 7), 0, 'and running it again makes none twice');
update genesis_work.sessions set title = 'Noon class (moved)'
 where id = (select id from genesis_work.sessions where series_id = '00000000-0000-4000-e000-000000000001' order by scheduled_at limit 1);
update genesis_work.session_series set title = 'Lunch class' where id = '00000000-0000-4000-e000-000000000001';
select is((select count(*)::int from genesis_work.sessions where series_id = '00000000-0000-4000-e000-000000000001' and title = 'Noon class (moved)' and detached),
  1, 'a class edited by hand leaves the series');
select is((select count(*)::int from genesis_work.sessions where series_id = '00000000-0000-4000-e000-000000000001' and title = 'Lunch class'),
  (select count(*)::int - 1 from genesis_work.sessions where series_id = '00000000-0000-4000-e000-000000000001'),
  'editing the series renames the rest');
update genesis_work.session_series set weekdays = '{6}' where id = '00000000-0000-4000-e000-000000000001';
select is((select count(*)::int from genesis_work.sessions where series_id = '00000000-0000-4000-e000-000000000001' and not detached), 0,
  'a new schedule removes the future classes nobody joined');
select throws_ok($$ insert into genesis_work.session_series (tenant_id, organization_id, title, weekdays, time_of_day, time_zone, starts_on)
                    values (pg_temp.tenant(1), pg_temp.tenant(1), 'Bad', '{1}', '09:00', 'Mars/Olympus', current_date) $$,
  '22023', null, 'a series needs a real time zone');

select * from finish();
rollback;
