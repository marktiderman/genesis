-- @feat:chat
-- pgTAP test for 0002_genesis_chat_coaching.sql (with 0001 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 owns a group with b2 and e5 in it; c3 is outside; d4 is staff (an observer).
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c2' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat2-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c2' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert, update on t to authenticated, service_role;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated, service_role;

create function public.genesis_chat2_test_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
create function public.genesis_chat2_test_staff(conversation_id uuid, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select user_id = '00000000-0000-4000-8000-00000000c2d4'::uuid $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat2_test_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('cohort', 'Cohort', p_membership => 'admins',
  p_start_check => 'public.genesis_chat2_test_may_start(uuid[], text, text, uuid)',
  p_observer_check => 'public.genesis_chat2_test_staff(uuid, uuid)', p_observers_post => true);

select pg_temp.sign_in('a1');
insert into t select 'grp', genesis_chat.start_conversation('cohort', array[pg_temp.person('b2'), pg_temp.person('e5')], 'Cohort 3');

-- Topics ------------------------------------------------------------------------------------

select lives_ok($$ select genesis_chat.set_topic(pg_temp.v('grp'), 'lesson-1', 'Lesson 1: Foundations') $$, 'an owner adds a topic');
select is((select title from genesis_chat.topics where conversation_id = pg_temp.v('grp') and topic = 'lesson-1'),
          'Lesson 1: Foundations', 'with its title');
select pg_temp.sign_in('b2');
select ok(exists (select 1 from genesis_chat.topics where conversation_id = pg_temp.v('grp')), 'members read the topics');
select throws_ok($$ select genesis_chat.set_topic(pg_temp.v('grp'), 'lesson-2', 'Mine') $$, '42501', null, 'a member doesn''t add topics');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'Question on lesson 1', p_topic => 'lesson-1') $$,
  'a member posts in an open topic');
select pg_temp.sign_in('a1');
select genesis_chat.set_topic(pg_temp.v('grp'), 'lesson-1', p_closed => true);
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'Late', p_topic => 'lesson-1') $$, '42501', null,
  'not in a closed one');
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'Wrapping up', p_topic => 'lesson-1') $$,
  'its owner still can');
select pg_temp.sign_in('c3');
select is((select count(*)::integer from genesis_chat.topics where conversation_id = pg_temp.v('grp')), 0, 'someone outside sees no topics');

-- Scheduled send --------------------------------------------------------------------------------

select pg_temp.sign_in('b2');
insert into t select 'sch', genesis_chat.schedule_message(pg_temp.v('grp'), gen_random_uuid(), now() + interval '1 hour', 'Reminder: check-in due');
select throws_ok($$ select genesis_chat.schedule_message(pg_temp.v('grp'), gen_random_uuid(), now(), 'Now') $$, '22023', null,
  'a schedule is at least a minute ahead');
select pg_temp.sign_in('c3');
select throws_ok($$ select genesis_chat.schedule_message(pg_temp.v('grp'), gen_random_uuid(), now() + interval '1 hour', 'Hi') $$, '42501', null,
  'only someone who may post schedules');
select is((select count(*)::integer from genesis_chat.scheduled), 0, 'and nobody else sees a scheduled message');
reset role;
update genesis_chat.scheduled set send_at = now() - interval '1 minute' where id = pg_temp.v('sch');
select pg_temp.as_server();
select is((select array_agg(x) from genesis_chat.due_scheduled() x), array[pg_temp.v('sch')], 'it comes due');
insert into t select 'posted', genesis_chat.post_scheduled(pg_temp.v('sch'));
select is((select sender_id from genesis_chat.messages where id = pg_temp.v('posted')), pg_temp.person('b2'), 'and is posted as its sender');
select is(genesis_chat.post_scheduled(pg_temp.v('sch')), pg_temp.v('posted'), 'once');
select pg_temp.sign_in('e5');
insert into t select 'sch2', genesis_chat.schedule_message(pg_temp.v('grp'), gen_random_uuid(), now() + interval '1 hour', 'Bye later');
select genesis_chat.remove_member(pg_temp.v('grp'));
reset role;
update genesis_chat.scheduled set send_at = now() - interval '1 minute' where id = pg_temp.v('sch2');
select pg_temp.as_server();
select is(genesis_chat.post_scheduled(pg_temp.v('sch2')), null, 'a scheduled message from someone who has since left isn''t posted');
select ok((select error is not null from genesis_chat.scheduled where id = pg_temp.v('sch2')), 'and says why');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.post_scheduled(pg_temp.v('sch2')) $$, '42501', null, 'only the server posts scheduled messages');

-- Availability ------------------------------------------------------------------------------------

select genesis_chat.set_availability('Back Monday', null, 'America/New_York', '{"mon": [["09:00","17:00"]]}');
select pg_temp.sign_in('b2');
select is((select away_message from genesis_chat.availability_for(pg_temp.v('grp')) where user_id = pg_temp.person('a1')),
          'Back Monday', 'people in a conversation see each other''s away message');
select pg_temp.sign_in('c3');
select is((select count(*)::integer from genesis_chat.availability_for(pg_temp.v('grp'))), 0, 'someone outside sees nobody''s');
select throws_ok($$ select genesis_chat.set_availability(null, null, 'Mars/Olympus', null) $$, '22023', null, 'a time zone must be real');

-- Broadcast ---------------------------------------------------------------------------------------

select pg_temp.sign_in('a1');
insert into t select 'dm1', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
insert into t select 'dm2', genesis_chat.start_conversation('direct', array[pg_temp.person('e5')]);
insert into t values ('bc', gen_random_uuid());
select is(cardinality(genesis_chat.broadcast_message(array[pg_temp.v('dm1'), pg_temp.v('dm2')], pg_temp.v('bc'), 'Week 2 is live')), 2,
          'a broadcast goes into each conversation');
select is(cardinality(genesis_chat.broadcast_message(array[pg_temp.v('dm1'), pg_temp.v('dm2')], pg_temp.v('bc'), 'Week 2 is live')), 2,
          'and sending it again posts nothing new');
select is((select count(*)::integer from genesis_chat.messages where body = 'Week 2 is live'), 2, 'once per conversation');
select pg_temp.sign_in('b2');
select is((select count(*)::integer from genesis_chat.messages where body = 'Week 2 is live'), 1, 'each person sees only their own copy');

-- Search ----------------------------------------------------------------------------------------------

select pg_temp.sign_in('d4');
select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'Internal: lesson pacing is off', p_visibility => 'observers');
select pg_temp.sign_in('b2');
select ok(exists (select 1 from genesis_chat.search_messages('lesson')), 'a member finds messages they can read');
select ok(not exists (select 1 from genesis_chat.search_messages('pacing')), 'never an internal note');
select pg_temp.sign_in('c3');
select ok(not exists (select 1 from genesis_chat.search_messages('lesson')), 'someone outside finds nothing');

-- Moderation, link previews, retention ----------------------------------------------------------------

select pg_temp.as_server();
select genesis_chat.set_kind_options('cohort', true, interval '30 days');
select pg_temp.sign_in('b2');
insert into t select 'bad', (genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'see https://example.com/page')).id;
select pg_temp.as_server();
select ok(exists (select 1 from genesis_chat.effects where key = 'moderate:' || pg_temp.v('bad')), 'a kind that moderates queues moderation');
select ok(exists (select 1 from genesis_chat.effects where kind = 'unfurl' and payload ->> 'url' = 'https://example.com/page'),
          'a link queues its preview');
select genesis_chat.moderate_message(pg_temp.v('bad'), 'hidden', 'test');
select pg_temp.sign_in('a1');
select is((select count(*)::integer from genesis_chat.messages where id = pg_temp.v('bad')), 0, 'a hidden message leaves members'' view');
select pg_temp.sign_in('d4');
select is((select count(*)::integer from genesis_chat.messages where id = pg_temp.v('bad')), 1, 'observers still see it, with a report');

reset role;
update genesis_chat.messages set created_at = now() - interval '60 days' where conversation_id = pg_temp.v('grp');
update genesis_chat.conversations set legal_hold = true where id = pg_temp.v('grp');
select pg_temp.as_server();
select is(genesis_chat.purge_expired(), 0, 'legal hold keeps everything');
select genesis_chat.set_legal_hold(pg_temp.v('grp'), false);
select ok(genesis_chat.purge_expired() > 0, 'without it, messages past the kind''s retention go');

select * from finish();
rollback;
