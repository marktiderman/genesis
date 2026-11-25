-- @feat:chat
-- pgTAP test for 0008_genesis_chat_cleared_history.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 talks directly with b2 (read receipts, reports, writes) and with c3 (pushes); b2
-- talks with c3 (files); a1, b2 and c3 are in a group (read receipts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c8' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat-8-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create schema if not exists private;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000f8'::uuid, viewer
$$;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c8' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text) to authenticated;

create temp table t (k text primary key, v uuid);
grant select, insert, update on t to authenticated;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated;
create function pg_temp.read_at(conv text, n text) returns timestamptz language sql stable security definer set search_path = '' as $$
  select last_read_at from genesis_chat.members where conversation_id = pg_temp.v(conv) and user_id = pg_temp.person(n)
$$;
-- A member's read place as the signed-in member reads it: what a sender's status line reads.
create function pg_temp.read_place(conv text, n text) returns bigint language sql stable as $$
  select last_read_seq from genesis_chat.members where conversation_id = pg_temp.v(conv) and user_id = pg_temp.person(n)
$$;
create function pg_temp.seq(message text) returns bigint language sql stable as $$
  select seq from genesis_chat.messages where id = pg_temp.v(message)
$$;
-- The signed-in member's own private row, and what they count as unread.
create function pg_temp.own_read_seq(conv text) returns bigint language sql stable as $$
  select read_seq from genesis_chat.member_state where conversation_id = pg_temp.v(conv) and user_id = auth.uid()
$$;
create function pg_temp.inbox_row(conv text) returns table (unread integer, last_read_seq bigint, mentioned boolean) language sql stable as $$
  select i.unread, i.last_read_seq, i.mentioned from genesis_chat.inbox() i where i.conversation_id = pg_temp.v(conv)
$$;
create function pg_temp.last_seq(conv text) returns bigint language sql stable security definer set search_path = '' as $$
  select last_seq from genesis_chat.conversations where id = pg_temp.v(conv)
$$;
grant execute on function pg_temp.read_place(text, text), pg_temp.seq(text), pg_temp.own_read_seq(text),
  pg_temp.inbox_row(text), pg_temp.last_seq(text) to authenticated;
create function pg_temp.pushed(message text, n text) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from genesis_chat.push_targets(pg_temp.v(message)) where user_id = pg_temp.person(n)
$$;
create function pg_temp.badge(message text, n text) returns integer language sql stable security definer set search_path = '' as $$
  select unread_total from genesis_chat.push_targets(pg_temp.v(message)) where user_id = pg_temp.person(n)
$$;
grant execute on function pg_temp.badge(text, text) to authenticated;
grant execute on function pg_temp.read_at(text, text), pg_temp.pushed(text, text) to authenticated;

create function public.genesis_chat_test8_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test8_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('group', 'Group',
  p_start_check => 'public.genesis_chat_test8_may_start(uuid[], text, text, uuid)');

-- ── 1. A message deleted unread never reads as read ─────────────────────────────
select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
insert into t select 'thursday', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'are you free on Thursday?')).id;
select pg_temp.sign_in('b2');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ab'));
-- b2 never read it; posting would move b2's read place past it.
insert into t select 'over', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'starting over')).id;
select pg_temp.sign_in('a1');
select ok(pg_temp.read_place('ab', 'b2') < pg_temp.seq('thursday'), 'a1 sees b2''s read place held before the message b2 deleted unread: no "Read"');
select is(pg_temp.read_at('ab', 'b2'), null, 'nor a read time');
select is((select count(*)::integer from genesis_chat.member_state where conversation_id = pg_temp.v('ab')), 0,
          'a1 reads none of b2''s private state');
select is((select count(*)::integer from information_schema.columns
            where table_schema = 'genesis_chat' and table_name = 'members' and column_name like '%seq%'), 1,
          'and members holds one read place each (last_read_seq), with nothing beside it to compare');
select pg_temp.sign_in('b2');
select is(pg_temp.own_read_seq('ab'), pg_temp.seq('over'), 'b2''s own read place is kept privately');
select is((select last_read_seq from pg_temp.inbox_row('ab')), pg_temp.seq('over'), 'b2''s inbox gives their own read place');
select is((select unread from pg_temp.inbox_row('ab')), 0, 'and nothing unread');
-- A system message after what b2 deleted: b2 reads it, and nobody else's message moves the hold.
reset role;
select genesis_chat.post_system_message(pg_temp.v('ab'), 'b2 changed the chat colour');
select pg_temp.sign_in('b2');
select is(genesis_chat.mark_read(pg_temp.v('ab')), pg_temp.last_seq('ab'), 'mark_read returns b2''s own read place');
select is(genesis_chat.my_read_seq(pg_temp.v('ab')), pg_temp.last_seq('ab'), 'and so does my_read_seq');
select is((select unread from pg_temp.inbox_row('ab')), 0, 'the system message b2 read isn''t unread');
select is(genesis_chat.unread_total(), 0, 'nor in b2''s badge');
select pg_temp.sign_in('a1');
select ok(pg_temp.read_place('ab', 'b2') < pg_temp.seq('thursday'), 'and a1 still sees no "Read"');
insert into t select 'works', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'sure, Thursday works @b2', p_mentions => array[pg_temp.person('b2')])).id;
reset role;
select is(pg_temp.badge('works', 'b2'), 1, 'a push''s badge counts only the new message for b2');
select pg_temp.sign_in('b2');
select is((select unread from pg_temp.inbox_row('ab')), 1, 'b2''s inbox counts it');
select ok((select mentioned from pg_temp.inbox_row('ab')), 'and the mention in it');
select genesis_chat.mark_read(pg_temp.v('ab'));
select is(pg_temp.own_read_seq('ab'), null, 'once b2 reads a1''s later message, nothing is held');
select ok(not (select mentioned from pg_temp.inbox_row('ab')), 'and the mention is read');
select pg_temp.sign_in('a1');
select ok(pg_temp.read_place('ab', 'b2') >= pg_temp.seq('works'), 'a1 sees "Read" on the message after what b2 deleted');
select isnt(pg_temp.read_at('ab', 'b2'), null, 'with its read time');

-- ── 1b. The same in a group ─────────────────────────────────────────────────────
select pg_temp.sign_in('a1');
insert into t select 'g', genesis_chat.start_conversation('group', array[pg_temp.person('b2'), pg_temp.person('c3')], 'Crew');
insert into t select 'plan', (genesis_chat.send_message(pg_temp.v('g'), gen_random_uuid(), 'the plan')).id;
select pg_temp.sign_in('c3');
select genesis_chat.mark_read(pg_temp.v('g'));
select pg_temp.sign_in('b2');
select genesis_chat.delete_conversation_for_me(pg_temp.v('g'));
select genesis_chat.send_message(pg_temp.v('g'), gen_random_uuid(), 'hi all');
select pg_temp.sign_in('a1');
select ok(pg_temp.read_place('g', 'b2') < pg_temp.seq('plan'), 'in a group, b2 isn''t one of the readers of a1''s message');
select ok(pg_temp.read_place('g', 'c3') >= pg_temp.seq('plan'), 'c3, who read it, is: "Read by 1"');
select pg_temp.sign_in('c3');
insert into t select 'reply', (genesis_chat.send_message(pg_temp.v('g'), gen_random_uuid(), 'sounds good')).id;
select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('g'));
select pg_temp.sign_in('c3');
select ok(pg_temp.read_place('g', 'b2') >= pg_temp.seq('reply'), 'a message b2 read after the deleted history counts');
-- The documented trade-off: one public read place can't say "read c3's message but not a1's"
-- without publishing b2's private cleared range, so a1's earlier message now counts b2 too.
select pg_temp.sign_in('a1');
select ok(pg_temp.read_place('g', 'b2') >= pg_temp.seq('plan'), 'and so, in a group, a1''s message deleted unread now counts b2 as a reader');

-- ── 1c. History read before Delete for me, and the private place's invariant ─────
select pg_temp.sign_in('a1');
insert into t select 'pre', genesis_chat.start_conversation('group', array[pg_temp.person('b2')], 'Read, then deleted');
insert into t select 'seen', (genesis_chat.send_message(pg_temp.v('pre'), gen_random_uuid(), 'seen, then deleted')).id;
select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('pre'));
select genesis_chat.delete_conversation_for_me(pg_temp.v('pre'));
-- The first move after it passes nobody else's message: b2's own.
insert into t select 'own', (genesis_chat.send_message(pg_temp.v('pre'), gen_random_uuid(), 'after deleting')).id;
select pg_temp.sign_in('a1');
select is(pg_temp.read_place('pre', 'b2'), pg_temp.seq('own'), 'what b2 read before deleting holds nothing back: the read place moves on');
select ok(pg_temp.read_place('pre', 'b2') >= pg_temp.seq('seen'), 'so a1''s message still shows "Read"');
reset role;
select is((select count(*)::integer from genesis_chat.member_state s join genesis_chat.members m using (conversation_id, user_id)
            where s.conversation_id in (pg_temp.v('ab'), pg_temp.v('g'), pg_temp.v('pre'))
              and s.read_seq is not null and not (s.read_seq > m.last_read_seq)), 0,
          'a private read place is kept only while it''s ahead of the public one');

-- ── 2. No push for a message in history deleted for me ──────────────────────────
select pg_temp.sign_in('a1');
insert into t select 'ac', genesis_chat.start_conversation('direct', array[pg_temp.person('c3')]);
insert into t select 'early', (genesis_chat.send_message(pg_temp.v('ac'), gen_random_uuid(), 'the early one')).id;
select pg_temp.sign_in('c3');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ac'));
select pg_temp.sign_in('a1');
insert into t select 'later', (genesis_chat.send_message(pg_temp.v('ac'), gen_random_uuid(), 'the later one')).id;
reset role;
select is(pg_temp.pushed('early', 'c3'), 0, 'c3 isn''t told of a message they deleted, though a later one brought the conversation back');
select is(pg_temp.pushed('later', 'c3'), 1, 'and is told of the later one');
select is(pg_temp.pushed('early', 'a1'), 0, 'its sender is never told of it');

-- ── 3. Your own file in history you deleted for yourself ────────────────────────
select pg_temp.sign_in('b2');
insert into t select 'bc', genesis_chat.start_conversation('direct', array[pg_temp.person('c3')]);
reset role;
insert into storage.objects (bucket_id, name, owner_id)
select 'genesis-chat', pg_temp.v('bc') || '/' || pg_temp.person('b2') || '/' || f, pg_temp.person('b2')::text
  from unnest(array['sent.jpg', 'pending.jpg']) f;
create function pg_temp.file(f text) returns text language sql stable as $$ select pg_temp.v('bc') || '/' || pg_temp.person('b2') || '/' || f $$;
grant execute on function pg_temp.file(text) to authenticated;
select pg_temp.sign_in('b2');
select ok(genesis_chat.can_read_object(pg_temp.file('pending.jpg'), pg_temp.person('b2')::text, now()), 'b2 reads their own upload before it''s sent');
select genesis_chat.send_message(pg_temp.v('bc'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'image', 'path', pg_temp.file('sent.jpg'))));
select ok(genesis_chat.can_read_object(pg_temp.file('sent.jpg'), pg_temp.person('b2')::text, now()), 'and the photo they sent, through its message');
select genesis_chat.delete_conversation_for_me(pg_temp.v('bc'));
select ok(not genesis_chat.can_read_object(pg_temp.file('sent.jpg'), pg_temp.person('b2')::text, now()),
  'b2 can''t fetch their own recent photo from history they deleted');
select ok(genesis_chat.can_read_object(pg_temp.file('pending.jpg'), pg_temp.person('b2')::text, now()), 'but still reads an upload not yet in a message');
select pg_temp.sign_in('c3');
select ok(genesis_chat.can_read_object(pg_temp.file('sent.jpg'), pg_temp.person('b2')::text, now()), 'c3 still reads the photo b2 sent');
select ok(not genesis_chat.can_read_object(pg_temp.file('pending.jpg'), pg_temp.person('b2')::text, now()), 'and never b2''s unsent upload');
-- Someone deletes the message: its attachment row goes and the file's removal is queued.
reset role;
delete from genesis_chat.attachments where path = pg_temp.file('sent.jpg');
select pg_temp.sign_in('b2');
select ok(not genesis_chat.can_read_object(pg_temp.file('sent.jpg'), pg_temp.person('b2')::text, now()),
  'b2 can''t fetch it once its attachment is deleted and its removal queued: it isn''t an unsent upload again');

-- ── 4. Reports: nothing from history deleted for me, nor deleted messages ──────
select pg_temp.sign_in('a1');
-- The same direct conversation as section 1 (a direct kind has one per pair).
insert into t select 'r', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
insert into t select 'old', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'the old secret')).id;
select pg_temp.sign_in('b2');
insert into t select 'mine', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'my old reply')).id;
select genesis_chat.delete_conversation_for_me(pg_temp.v('r'));
select pg_temp.sign_in('a1');
insert into t select 'kept', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'still here')).id;
insert into t select 'gone', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'take it back')).id;
select genesis_chat.delete_message(pg_temp.v('gone'));
insert into t select 'hidden', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'hidden by moderation')).id;
insert into t select 'rude', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'something rude')).id;
reset role;
update genesis_chat.messages set moderation = 'hidden' where id = pg_temp.v('hidden');
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.report_message(pg_temp.v('old'), 'spam') $$, '42501', null,
  'b2 can''t report a message from history they deleted');
select throws_ok($$ select genesis_chat.report_message(pg_temp.v('hidden'), 'spam') $$, '42501', null,
  'nor one hidden by moderation, which they never saw');
insert into t select 'report', genesis_chat.report_message(pg_temp.v('rude'), 'harassment');
select is((select array_agg((c ->> 'id')::uuid) from genesis_chat.reports r, jsonb_array_elements(r.snapshot -> 'context') c
            where r.id = pg_temp.v('report')),
          array[pg_temp.v('kept')], 'a report''s context holds only what b2 can still read: not the deleted history, a deleted message or a hidden one');
select pg_temp.sign_in('a1');
insert into t select 'report2', genesis_chat.report_message(pg_temp.v('rude'), 'harassment');
select is((select (array_agg((c ->> 'id')::uuid order by ord desc))[1:4] from genesis_chat.reports r,
             jsonb_array_elements(r.snapshot -> 'context') with ordinality e(c, ord) where r.id = pg_temp.v('report2')),
          array[pg_temp.v('hidden'), pg_temp.v('kept'), pg_temp.v('mine'), pg_temp.v('old')],
          'a1, who deleted nothing, gets the history before it, with their own hidden message, without the deleted one');

-- ── 5. Writes to a message in history deleted for me ────────────────────────────
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.react(pg_temp.v('old'), '👍') $$, '42501', null, 'b2 can''t react to a message they deleted');
select throws_ok($$ select genesis_chat.pin_message(pg_temp.v('old')) $$, '42501', null, 'nor pin it');
select throws_ok($$ select genesis_chat.save_message(pg_temp.v('old')) $$, '42501', null, 'nor save it');
select throws_ok($$ select genesis_chat.edit_message(pg_temp.v('mine'), 'rewritten') $$, '42501', null, 'nor edit their own message in it');
select throws_ok($$ select genesis_chat.delete_message(pg_temp.v('mine')) $$, '42501', null, 'nor delete it');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'replying', p_reply_to_id => pg_temp.v('old')) $$,
  '22023', null, 'nor reply to it');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'in its thread', p_thread_root_id => pg_temp.v('old')) $$,
  '22023', null, 'nor post in its thread');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'replying', p_reply_to_id => pg_temp.v('kept')) $$,
  'a reply to a message after the deleted history still posts');
select lives_ok($$ select genesis_chat.save_message(pg_temp.v('old'), false) $$, 'forgetting a saved one still works');
select lives_ok($$ select genesis_chat.react(pg_temp.v('kept'), '👍') $$, 'a message after the deleted history takes a reaction');
select lives_ok($$ select genesis_chat.pin_message(pg_temp.v('kept')) $$, 'and a pin');
select lives_ok($$ select genesis_chat.save_message(pg_temp.v('kept')) $$, 'and a save');
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.react(pg_temp.v('old'), '👍') $$, 'a1, who deleted nothing, still reacts to it');

select * from finish();
rollback;
