-- @feat:chat
-- pgTAP test for 0002_genesis_chat_coaching.sql (with 0001 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 owns a group with b2 and e5 in it; c3 is outside; d4 is staff (an observer).
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

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

-- A failure that may pass (here a deadlock) is tried again on the next run, not recorded for good.
select pg_temp.sign_in('b2');
insert into t select 'sch3', genesis_chat.schedule_message(pg_temp.v('grp'), gen_random_uuid(), now() + interval '1 hour', 'Flaky one');
reset role;
update genesis_chat.scheduled set send_at = now() - interval '1 minute' where id = pg_temp.v('sch3');
create function public.genesis_chat2_test_flaky() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body = 'Flaky one' then raise exception 'deadlock detected' using errcode = '40P01'; end if;
  return new;
end $$;
create trigger zz_genesis_chat2_test_flaky before insert on genesis_chat.messages
  for each row execute function public.genesis_chat2_test_flaky();
select pg_temp.as_server();
select is(genesis_chat.post_scheduled(pg_temp.v('sch3')), null, 'a deadlock posts nothing yet');
select ok((select error is null and attempts = 1 from genesis_chat.scheduled where id = pg_temp.v('sch3')),
          'but keeps the message due, counting the try');
reset role;
drop trigger zz_genesis_chat2_test_flaky on genesis_chat.messages;
select pg_temp.as_server();
select ok(genesis_chat.post_scheduled(pg_temp.v('sch3')) is not null, 'and the next run posts it');
select pg_temp.sign_in('a1');

-- Availability ------------------------------------------------------------------------------------

select genesis_chat.set_availability('Back Monday', null, 'America/New_York', '{"mon": [["09:00","17:00"]]}');
select pg_temp.sign_in('b2');
select is((select away_message from genesis_chat.availability_for(pg_temp.v('grp')) where user_id = pg_temp.person('a1')),
          'Back Monday', 'people in a conversation see each other''s away message');
select pg_temp.sign_in('c3');
select is((select count(*)::integer from genesis_chat.availability_for(pg_temp.v('grp'))), 0, 'someone outside sees nobody''s');
select throws_ok($$ select genesis_chat.set_availability(null, null, 'Mars/Olympus', null) $$, '22023', null, 'a time zone must be real');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"mon": [[9, 17]]}') $$, '22023', null, 'hours are strings');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"tue": 5}') $$, '22023', null, 'a day is a list of ranges');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"funday": [["09:00","17:00"]]}') $$, '22023', null, 'days are mon..sun');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"mon": [["9am","5pm"]]}') $$, '22023', null, 'times are HH:MM');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"mon": [["09:00"]]}') $$, '22023', null, 'a range is a pair');
select throws_ok($$ select genesis_chat.set_availability(null, null, null, '{"mon": [["01:00","02:00"],["03:00","04:00"],["05:00","06:00"],["07:00","08:00"],["09:00","10:00"]]}') $$,
                 '22023', null, 'at most four ranges a day');
select lives_ok($$ select genesis_chat.set_availability('Back Monday', null, 'America/New_York', '{"mon": [["9:00","17:00"]], "fri": [["22:00","24:00"],["00:00","02:00"]]}') $$,
                'well-formed hours are kept');
select pg_temp.as_server();
select throws_ok($$ update genesis_chat.availability set hours = '{"mon": [[9, 17]]}' where user_id = pg_temp.person('a1') $$, '23514', null,
                 'the table refuses malformed hours from the server too');

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
select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'the word quilt beside a «fake» highlight');
select ok((select snippet like '%«quilt»%' and snippet not like '%«fake»%' from genesis_chat.search_messages('quilt')),
          'a message''s own « and » can''t fake a highlight');
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
insert into genesis_chat.attachments (message_id, conversation_id, kind, provider, transcript)
values (pg_temp.v('bad'), pg_temp.v('grp'), 'voice', 'none', 'the walrus transcript of a hidden note');
select pg_temp.sign_in('a1');
select ok(not exists (select 1 from genesis_chat.search_messages('walrus')), 'search never shows members a hidden message''s transcript');
select pg_temp.sign_in('d4');
select ok(exists (select 1 from genesis_chat.search_messages('walrus', pg_temp.v('grp'))), 'observers still find it');

-- Pushes wait for moderation; a hidden message is never pushed, counted or previewed.
select pg_temp.as_server();
select ok((select done_at is not null from genesis_chat.effects where key = 'push:' || pg_temp.v('bad')),
          'a hidden message''s push is settled unsent');
select is((select count(*)::integer from genesis_chat.push_targets(pg_temp.v('bad'))), 0, 'and push_targets has nobody for it');
select is(genesis_chat.unread_count(pg_temp.v('grp'), pg_temp.person('a1'),
            (select seq - 1 from genesis_chat.messages where id = pg_temp.v('bad'))), 0, 'it counts toward nobody''s badge');
select pg_temp.sign_in('a1');
select ok((select last_message ->> 'id' from genesis_chat.inbox() where conversation_id = pg_temp.v('grp')) is distinct from pg_temp.v('bad')::text,
          'nor shows in members'' inbox');
select pg_temp.sign_in('b2');
insert into t select 'ok1', (genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'All good here')).id;
select pg_temp.as_server();
select is((select run_after from genesis_chat.effects where key = 'push:' || pg_temp.v('ok1')), 'infinity'::timestamptz,
          'a push in a kind that moderates waits for the verdict');
select genesis_chat.moderate_message(pg_temp.v('ok1'), 'clean');
select ok((select run_after <= now() and done_at is null from genesis_chat.effects where key = 'push:' || pg_temp.v('ok1')),
          'and goes once the message is clean');

-- A retried or repeated verdict never un-hides a message, nor files the same report twice.
select genesis_chat.moderate_message(pg_temp.v('bad'), 'hidden', 'again');
select genesis_chat.moderate_message(pg_temp.v('bad'), 'flagged', 'moderation unavailable');
select is((select moderation from genesis_chat.messages where id = pg_temp.v('bad')), 'hidden', 'a later verdict never un-hides a message');
select is((select count(*)::integer from genesis_chat.reports where message_id = pg_temp.v('bad') and snapshot ->> 'automatic' = 'true'), 2,
          'one report per verdict');

-- An edit is moderated again.
select pg_temp.sign_in('b2');
select genesis_chat.edit_message(pg_temp.v('ok1'), 'Edited into something else');
select pg_temp.as_server();
select ok(exists (select 1 from genesis_chat.effects where kind = 'moderate' and key like 'moderate:' || pg_temp.v('ok1') || ':%'),
          'an edited message is judged again');

-- Link previews are read through a message you can read, never as a table.
select genesis_chat.save_link_preview('https://example.com/page', 'ok', 'Example page');
select pg_temp.sign_in('b2');
select throws_ok($$ select count(*) from genesis_chat.link_previews $$, '42501', null, 'people don''t read the preview cache directly');
insert into t select 'linked', (genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'look at https://example.com/page')).id;
select is((select title from genesis_chat.link_previews_for(pg_temp.v('linked'))), 'Example page',
          'a member reads the previews of a message they can read');
select pg_temp.sign_in('a1');
select is((select count(*)::integer from genesis_chat.link_previews_for(pg_temp.v('bad'))), 0, 'not those of a hidden message');
select pg_temp.sign_in('c3');
select is((select count(*)::integer from genesis_chat.link_previews_for(pg_temp.v('linked'))), 0, 'and someone outside reads none');
select pg_temp.sign_in('b2');
select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'reset it at https://example.com/reset?token=abc123');
select pg_temp.as_server();
select ok(not exists (select 1 from genesis_chat.effects where kind = 'unfurl' and payload ->> 'url' like '%token=%'),
          'a link carrying a credential is never fetched');

reset role;
update genesis_chat.messages set created_at = now() - interval '60 days' where conversation_id = pg_temp.v('grp');
update genesis_chat.conversations set legal_hold = true where id = pg_temp.v('grp');
select pg_temp.as_server();
select is(genesis_chat.purge_expired(), 0, 'legal hold keeps everything');
select genesis_chat.set_legal_hold(pg_temp.v('grp'), false);
select ok(genesis_chat.purge_expired() > 0, 'without it, messages past the kind''s retention go');

-- Inbox kinds ------------------------------------------------------------------------------------------

select pg_temp.sign_in('b2');
select ok(exists (select 1 from genesis_chat.inbox(p_kinds => array['direct'])) and
          not exists (select 1 from genesis_chat.inbox(p_kinds => array['direct']) where kind <> 'direct'),
          'the inbox narrows to the kinds asked for');
select ok(not exists (select 1 from genesis_chat.inbox(p_exclude_kinds => array['cohort']) where kind = 'cohort'),
          'and leaves out the kinds asked to');
select ok(genesis_chat.unread_total(p_exclude_kinds => array['cohort', 'direct']) = 0, 'so does the badge');

select pg_temp.as_server();
select ok((select coalesce(bool_and(unread_total = 0), true) from genesis_chat.push_targets(pg_temp.v('bad'), array['cohort', 'direct'])),
          'the push badge leaves out the kinds the app leaves out of its own');

select * from finish();
rollback;
