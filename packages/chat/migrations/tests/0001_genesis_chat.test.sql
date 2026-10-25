-- @feat:chat
-- pgTAP test for 0001_genesis_chat.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 and b2 talk directly; c3 is in nobody's conversation; d4 is staff of the
-- test's "ticket" kind (an observer who may post); e5 leaves a group.
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c0' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c0' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server() to anon, authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert, update on t to authenticated, service_role;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated, service_role;

-- The app's rules: anyone may message a1, b2 or x5 (not c3); staff (d4) observe tickets.
create function public.genesis_chat_test_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select not (('00000000-0000-4000-8000-00000000c0c3')::uuid = any (member_ids))
$$;
create function public.genesis_chat_test_staff(conversation_id uuid, user_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select user_id = '00000000-0000-4000-8000-00000000c0d4'::uuid
$$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('group', 'Group', p_membership => 'admins',
  p_start_check => 'public.genesis_chat_test_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('ticket', 'Support ticket', p_threads => false,
  p_observer_check => 'public.genesis_chat_test_staff(uuid, uuid)', p_observers_post => true);

select throws_ok($$ select genesis_chat.register_kind('bad', 'Bad', p_observer_check => 'public.genesis_chat_test_may_start(uuid[], text, text, uuid)') $$,
  '22023', null, 'an observer check must take (uuid, uuid)');

-- Direct conversations -----------------------------------------------------------------

select pg_temp.sign_in('a1');
insert into t select 'dm', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
select is(genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]), pg_temp.v('dm'), 'a direct conversation is found again, not made twice');
select pg_temp.sign_in('b2');
select is(genesis_chat.start_conversation('direct', array[pg_temp.person('a1')]), pg_temp.v('dm'), 'from either side');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('c3')]) $$, '42501', null,
  'the start check decides who you may message');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('b2'), pg_temp.person('e5')]) $$, '22023', null,
  'a direct conversation has two people');
select throws_ok($$ select genesis_chat.start_conversation('ticket', array[pg_temp.person('b2')]) $$, '42501', null,
  'a kind without a start check is started by the server only');

-- Sending ---------------------------------------------------------------------------------

insert into t values ('c1', gen_random_uuid());
select is((genesis_chat.send_message(pg_temp.v('dm'), pg_temp.v('c1'), 'Hi **b2**')).seq, 1::bigint, 'the first message is number 1');
insert into t select 'm1', id from genesis_chat.messages where client_id = pg_temp.v('c1');
select is((genesis_chat.send_message(pg_temp.v('dm'), pg_temp.v('c1'), 'Hi **b2**')).id, pg_temp.v('m1'), 'sending the same client_id again returns the first message');
select is((select count(*)::integer from genesis_chat.messages where conversation_id = pg_temp.v('dm')), 1, 'and posts nothing new');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('dm'), gen_random_uuid(), '   ') $$, '22023', null,
  'a message needs text or an attachment');
select is((genesis_chat.send_message(pg_temp.v('dm'), gen_random_uuid(), 'Second', p_reply_to_id => pg_temp.v('m1'),
           p_mentions => array[pg_temp.person('b2'), pg_temp.person('c3')])).mentions,
          array[pg_temp.person('b2')], 'mentions keep only members');
select is((select last_read_seq from genesis_chat.members where conversation_id = pg_temp.v('dm') and user_id = pg_temp.person('a1')),
          2::bigint, 'the sender has read their own messages');
select ok(exists (select 1 from genesis_chat.inbox() i where i.conversation_id = pg_temp.v('dm') and i.unread = 0
                    and i.other_user_id = pg_temp.person('b2')), 'the sender''s inbox shows nothing unread and the other person');

select pg_temp.sign_in('b2');
select is((select unread from genesis_chat.inbox() where conversation_id = pg_temp.v('dm')), 2, 'the other person has two unread');
select ok((select mentioned from genesis_chat.inbox() where conversation_id = pg_temp.v('dm')), 'and was mentioned');
select is(genesis_chat.mark_read(pg_temp.v('dm'), 1), 1::bigint, 'reading up to the first');
select is(genesis_chat.mark_read(pg_temp.v('dm'), 0), 1::bigint, 'read state never moves back');
select is(genesis_chat.mark_read(pg_temp.v('dm'), 99), 2::bigint, 'nor past the latest');
select is(genesis_chat.unread_total(), 0, 'nothing waits for them');

-- Who reads what -------------------------------------------------------------------------

select pg_temp.sign_in('c3');
select is((select count(*)::integer from genesis_chat.messages where conversation_id = pg_temp.v('dm')), 0, 'someone outside reads no messages');
select is((select count(*)::integer from genesis_chat.conversations where id = pg_temp.v('dm')), 0, 'nor the conversation');
select is((select count(*)::integer from genesis_chat.members where conversation_id = pg_temp.v('dm')), 0, 'nor who is in it');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('dm'), gen_random_uuid(), 'Let me in') $$, '42501', null, 'and can''t post');
select throws_ok($$ select genesis_chat.mark_read(pg_temp.v('dm')) $$, '42501', null, 'or mark it read');
select throws_ok($$ select genesis_chat.react(pg_temp.v('m1'), '👍') $$, '42501', null, 'or react');
select ok(not genesis_chat.can_join_topic('genesis-chat:conv:' || pg_temp.v('dm')), 'or join its live topic');
select ok(not genesis_chat.can_join_topic('genesis-chat:user:' || pg_temp.person('a1')), 'or anyone else''s inbox topic');
select ok(genesis_chat.can_join_topic('genesis-chat:user:' || pg_temp.person('c3')), 'but joins their own');
select ok(not genesis_chat.can_join_topic('genesis-chat:user:' || pg_temp.person('c3'), true), 'without writing to it');
select pg_temp.sign_in('a1');
select ok(genesis_chat.can_join_topic('genesis-chat:conv:' || pg_temp.v('dm'), true), 'a member signals typing on the conversation''s topic');

select pg_temp.as_anon();
select throws_ok($$ select count(*) from genesis_chat.messages $$, '42501', null, 'anon reaches nothing');
select lives_ok($$ select count(*) from storage.objects where bucket_id <> 'genesis-chat' $$, 'anon still reads other buckets: chat''s storage policies don''t apply to it');

-- Someone outside never passes a role check (my_role is null for them).
reset role;
insert into t select 'm2', id from genesis_chat.messages where conversation_id = pg_temp.v('dm') and seq = 2;
select pg_temp.sign_in('c3');
select throws_ok($$ select genesis_chat.update_conversation(pg_temp.v('dm'), 'Mine now') $$, '42501', null, 'someone outside can''t rename a conversation');
select throws_ok($$ select genesis_chat.set_status(pg_temp.v('dm'), 'solved') $$, '42501', null, 'or set its status');
select throws_ok($$ select genesis_chat.delete_message(pg_temp.v('m2')) $$,
  '42501', null, 'or delete its messages');
select throws_ok($$ select genesis_chat.pin_message(pg_temp.v('m2')) $$,
  '42501', null, 'or pin them');
reset role;
select is((select title from genesis_chat.conversations where id = pg_temp.v('dm')), null, 'and nothing changed');

-- Edits, reactions, deletes -----------------------------------------------------------------

select pg_temp.sign_in('a1');
select is((genesis_chat.edit_message(pg_temp.v('m1'), 'Hi again')).body, 'Hi again', 'the sender edits their message');
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.edit_message(pg_temp.v('m1'), 'Not mine') $$, '42501', null, 'nobody else does');
select lives_ok($$ select genesis_chat.react(pg_temp.v('m1'), '🔥') $$, 'a member reacts');
select is((select count(*)::integer from genesis_chat.reactions where message_id = pg_temp.v('m1')), 1, 'and both see it');
select throws_ok($$ select genesis_chat.delete_message(pg_temp.v('m1')) $$, '42501', null, 'in a direct conversation, only the sender deletes');
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.delete_message(pg_temp.v('m1')) $$, 'the sender deletes it');
select ok((select deleted_at is not null and body = '' from genesis_chat.messages where id = pg_temp.v('m1')),
          'a placeholder stays, without its text');
select is((select count(*)::integer from genesis_chat.reactions where message_id = pg_temp.v('m1')), 0, 'and its reactions go');

-- Files ------------------------------------------------------------------------------------

select ok(genesis_chat.can_upload(pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/photo-1.jpg'), 'a member uploads into their folder');
select ok(not genesis_chat.can_upload(pg_temp.v('dm') || '/' || pg_temp.person('b2') || '/photo-1.jpg'), 'not someone else''s');
select ok(not genesis_chat.can_upload(pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/page.svg'), 'and never an SVG');
select pg_temp.sign_in('c3');
select ok(not genesis_chat.can_upload(pg_temp.v('dm') || '/' || pg_temp.person('c3') || '/photo-1.jpg'), 'someone outside uploads nothing');
reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('genesis-chat', pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/voice-1.m4a', pg_temp.person('a1')::text),
  ('genesis-chat', pg_temp.v('dm') || '/' || pg_temp.person('b2') || '/theirs.jpg', pg_temp.person('b2')::text);

select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('dm'), gen_random_uuid(), '',
                     jsonb_build_array(jsonb_build_object('kind', 'image', 'path', pg_temp.v('dm') || '/' || pg_temp.person('b2') || '/theirs.jpg'))) $$,
                 '22023', null, 'a message carries only files its sender uploaded');
insert into t select 'voice', (genesis_chat.send_message(pg_temp.v('dm'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'voice', 'path', pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/voice-1.m4a',
                                       'mime', 'audio/mp4', 'duration_ms', 4200, 'waveform', jsonb_build_array(10, 80, 200, -5))))).id;
select is((select waveform from genesis_chat.attachments where message_id = pg_temp.v('voice')), array[10, 80, 100, 0]::smallint[],
          'a voice note keeps its waveform, clamped to 0–100');
select is((select transcript_status from genesis_chat.attachments where message_id = pg_temp.v('voice')), 'pending', 'and waits for a transcript');
select pg_temp.sign_in('b2');
select ok(genesis_chat.can_read_object(pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/voice-1.m4a', pg_temp.person('a1')::text, now()),
          'the other member reads the file once it is sent');
select pg_temp.sign_in('c3');
select ok(not genesis_chat.can_read_object(pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/voice-1.m4a', pg_temp.person('a1')::text, now()),
          'someone outside never does');

-- Groups -------------------------------------------------------------------------------------

select pg_temp.sign_in('a1');
insert into t select 'grp', genesis_chat.start_conversation('group', array[pg_temp.person('b2'), pg_temp.person('e5')], 'Cohort');
select is(genesis_chat.my_role(pg_temp.v('grp')), 'owner', 'whoever starts a group owns it');
select genesis_chat.update_conversation(pg_temp.v('grp'), p_settings => '{"who_posts": "admins"}');
select pg_temp.sign_in('b2');
select ok(not genesis_chat.can_post(pg_temp.v('grp')), 'a one-way group: members read but don''t post');
select pg_temp.sign_in('e5');
select lives_ok($$ select genesis_chat.remove_member(pg_temp.v('grp')) $$, 'a member leaves a group');
select ok(not genesis_chat.can_view(pg_temp.v('grp')), 'and no longer reads it');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.add_members(pg_temp.v('grp'), array[pg_temp.person('c3')]) $$, '42501', null,
  'the start check also decides who may be added');

-- Tickets: observers and internal notes ----------------------------------------------------

select pg_temp.as_server();
insert into t select 'tkt', genesis_chat.ensure_conversation('ticket', 'report', 'r-1', 'Login trouble');
select is(genesis_chat.ensure_conversation('ticket', 'report', 'r-1'), pg_temp.v('tkt'), 'the server finds a record''s conversation again');
select is(genesis_chat.sync_members(pg_temp.v('tkt'), array[pg_temp.person('b2')]), 1, 'and sets its members');
select pg_temp.sign_in('b2');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('tkt'), gen_random_uuid(), 'I can''t sign in') $$, 'the person writes in');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('tkt'), gen_random_uuid(), 'note', p_visibility => 'observers') $$, '42501', null,
  'only observers write internal notes');
select pg_temp.sign_in('d4');
select is(genesis_chat.my_role(pg_temp.v('tkt')), 'observer', 'staff observe the ticket without being in it');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('tkt'), gen_random_uuid(), 'Looking now') $$, 'and reply');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('tkt'), gen_random_uuid(), 'Their session expired', p_visibility => 'observers') $$,
  'and leave an internal note');
select is((select count(*)::integer from genesis_chat.observed('ticket')), 1, 'the ticket is in staff''s queue');
select pg_temp.sign_in('b2');
select is((select count(*)::integer from genesis_chat.messages where conversation_id = pg_temp.v('tkt')), 2, 'the person never sees the note');
select is((select unread from genesis_chat.inbox() where conversation_id = pg_temp.v('tkt')), 1, 'nor counts it as unread');
select pg_temp.sign_in('d4');
select ok(not genesis_chat.can_view(pg_temp.v('dm')), 'observing one kind opens nothing else');

-- The runner ------------------------------------------------------------------------------------

select pg_temp.as_server();
select ok(exists (select 1 from genesis_chat.push_targets(
          (select id from genesis_chat.messages where conversation_id = pg_temp.v('dm') and seq = 2)) p
          where p.user_id = pg_temp.person('b2') and p.mentioned), 'push goes to the other member, marked as mentioned');
select ok(exists (select 1 from genesis_chat.effects where key = 'transcribe:' ||
          (select id from genesis_chat.attachments where message_id = pg_temp.v('voice'))), 'a voice note queues its transcript');
select pg_temp.sign_in('a1');
select genesis_chat.delete_message(pg_temp.v('voice'));
select pg_temp.as_server();
select ok(exists (select 1 from genesis_chat.effects where kind = 'storage.remove'
          and payload ->> 'path' = pg_temp.v('dm') || '/' || pg_temp.person('a1') || '/voice-1.m4a'), 'a deleted file is queued for removal');
select pg_temp.sign_in('a1');
select throws_ok($$ select * from genesis_chat.claim_effects() $$, '42501', null, 'only the server works the outbox');

select * from finish();
rollback;
