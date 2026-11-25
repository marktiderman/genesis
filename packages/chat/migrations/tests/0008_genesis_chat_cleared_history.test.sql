-- @feat:chat
-- pgTAP test for 0008_genesis_chat_cleared_history.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 talks directly with b2 (read receipts, reports, writes) and with c3 (pushes); b2
-- talks with c3 (files); a1, b2 and c3 are in a group (read receipts).
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
-- What the signed-in member reads of another's read place, as a sender's status line does.
create function pg_temp.receipt(conv text, n text) returns bigint language sql stable as $$
  select last_read_seq from genesis_chat.members where conversation_id = pg_temp.v(conv) and user_id = pg_temp.person(n)
$$;
-- A member's true read place (the public one, or their private one while it's held).
create function pg_temp.read_place(conv text, n text) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(me.last_read_seq, coalesce(s.read_seq, 0)) from genesis_chat.members me
    left join genesis_chat.member_state s on s.conversation_id = me.conversation_id and s.user_id = me.user_id
   where me.conversation_id = pg_temp.v(conv) and me.user_id = pg_temp.person(n)
$$;
create function pg_temp.seq(message text) returns bigint language sql stable as $$
  select seq from genesis_chat.messages where id = pg_temp.v(message)
$$;
create function pg_temp.private_place(conv text, n text) returns bigint language sql stable security definer set search_path = '' as $$
  select read_seq from genesis_chat.member_state where conversation_id = pg_temp.v(conv) and user_id = pg_temp.person(n)
$$;
grant execute on function pg_temp.receipt(text, text), pg_temp.read_place(text, text), pg_temp.private_place(text, text), pg_temp.seq(text) to authenticated;
create function pg_temp.pushed(message text, n text) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from genesis_chat.push_targets(pg_temp.v(message)) where user_id = pg_temp.person(n)
$$;
grant execute on function pg_temp.read_at(text, text), pg_temp.pushed(text, text) to authenticated;

create function public.genesis_chat_test8_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test8_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('group', 'Group',
  p_start_check => 'public.genesis_chat_test8_may_start(uuid[], text, text, uuid)');

-- ── 1. A message deleted unread never reads as read ─────────────────────────────
select hasnt_column('genesis_chat', 'members', 'receipt_seq', 'one public read number: no second column to compare');
select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
insert into t select 'thursday', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'are you free on Thursday?')).id;
select pg_temp.sign_in('b2');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ab'));
-- b2 never read it; posting moves b2's read place past it, nobody else's message after it.
insert into t select 'over', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'starting over')).id;
select is(pg_temp.read_place('ab', 'b2'), pg_temp.seq('over'), 'b2''s own read place moved past a1''s deleted message');
select pg_temp.sign_in('a1');
select ok(pg_temp.receipt('ab', 'b2') < pg_temp.seq('thursday'), 'but the read place a1 sees is held: no "Read" on the message b2 deleted unread');
select is(pg_temp.read_at('ab', 'b2'), null, 'nor a read time');
select is((select count(*)::integer from genesis_chat.member_state where user_id = pg_temp.person('b2')), 0,
  'a1 can''t read b2''s private read place');
select pg_temp.sign_in('b2');
select is(pg_temp.private_place('ab', 'b2'), pg_temp.seq('over'), 'while held, b2''s true read place is kept privately');
select is(genesis_chat.mark_read(pg_temp.v('ab')), pg_temp.seq('over'), 'mark_read answers b2''s true read place');
select is((select i.last_read_seq from genesis_chat.inbox() i where i.conversation_id = pg_temp.v('ab')), pg_temp.seq('over'),
  'and b2''s inbox shows it');
select is((select i.unread from genesis_chat.inbox() i where i.conversation_id = pg_temp.v('ab')), 0, 'with nothing unread');
select pg_temp.sign_in('a1');
select ok(pg_temp.receipt('ab', 'b2') < pg_temp.seq('thursday'), 'still no "Read" once b2 marks the conversation read');
insert into t select 'works', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'sure, Thursday works')).id;
select pg_temp.sign_in('b2');
select is((select i.unread from genesis_chat.inbox() i where i.conversation_id = pg_temp.v('ab')), 1, 'a1''s new message is unread for b2');
select genesis_chat.mark_read(pg_temp.v('ab'));
select pg_temp.sign_in('a1');
select ok(pg_temp.receipt('ab', 'b2') >= pg_temp.seq('works'), 'a message after what b2 deleted reads as read');
select isnt(pg_temp.read_at('ab', 'b2'), null, 'with its read time');
select is(pg_temp.receipt('ab', 'b2'), pg_temp.read_place('ab', 'b2'), 'and the public read place catches up with the true one');
select is(pg_temp.private_place('ab', 'b2'), null, 'b2''s private read place is cleared once they meet');
select is(pg_temp.receipt('ab', 'a1'), pg_temp.read_place('ab', 'a1'), 'someone who deleted nothing: one read place');

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
select ok(pg_temp.read_place('g', 'b2') >= pg_temp.seq('plan'), 'in a group, b2''s own read place moved past a1''s message');
select ok(pg_temp.receipt('g', 'b2') < pg_temp.seq('plan'), 'but b2 isn''t one of its readers');
select ok(pg_temp.receipt('g', 'c3') >= pg_temp.seq('plan'), 'c3, who read it, is: "Read by 1"');
select pg_temp.sign_in('c3');
insert into t select 'reply', (genesis_chat.send_message(pg_temp.v('g'), gen_random_uuid(), 'sounds good')).id;
select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('g'));
select pg_temp.sign_in('c3');
select ok(pg_temp.receipt('g', 'b2') >= pg_temp.seq('reply'), 'a message b2 read after the deleted history counts');
-- The documented trade-off: one public read place can't say "read c3's message but not a1's",
-- so a1's earlier message now counts b2 too.
select pg_temp.sign_in('a1');
select ok(pg_temp.receipt('g', 'b2') >= pg_temp.seq('plan'), 'and so, in a group, a1''s message deleted unread now counts b2 as a reader');

-- ── 1c. The private read place is kept only while it differs ────────────────────
reset role;
select is((select count(*)::integer from genesis_chat.member_state s join genesis_chat.members me using (conversation_id, user_id)
            where s.read_seq is not null and s.read_seq <= me.last_read_seq), 0,
  'a private read place is never at or behind the public one');

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
insert into t select 'hush', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'hidden by moderation')).id;
reset role;
update genesis_chat.messages set moderation = 'hidden' where id = pg_temp.v('hush');
select pg_temp.sign_in('a1');
insert into t select 'gone', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'take it back')).id;
select genesis_chat.delete_message(pg_temp.v('gone'));
insert into t select 'rude', (genesis_chat.send_message(pg_temp.v('r'), gen_random_uuid(), 'something rude')).id;
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.report_message(pg_temp.v('old'), 'spam') $$, '42501', null,
  'b2 can''t report a message from history they deleted');
select throws_ok($$ select genesis_chat.report_message(pg_temp.v('hush'), 'spam') $$, '42501', null,
  'nor one moderation hides from them');
insert into t select 'report', genesis_chat.report_message(pg_temp.v('rude'), 'harassment');
select is((select array_agg((c ->> 'id')::uuid) from genesis_chat.reports r, jsonb_array_elements(r.snapshot -> 'context') c
            where r.id = pg_temp.v('report')),
          array[pg_temp.v('kept')], 'a report''s context holds only what b2 can still read: not the deleted history, not a deleted message, not a hidden one');
select pg_temp.sign_in('a1');
insert into t select 'report2', genesis_chat.report_message(pg_temp.v('rude'), 'harassment');
select is((select (array_agg((c ->> 'id')::uuid order by ord desc))[1:4] from genesis_chat.reports r,
             jsonb_array_elements(r.snapshot -> 'context') with ordinality e(c, ord) where r.id = pg_temp.v('report2')),
          array[pg_temp.v('hush'), pg_temp.v('kept'), pg_temp.v('mine'), pg_temp.v('old')],
          'a1, who deleted nothing, gets the history before it, with their own hidden message and without the deleted one');

-- ── 5. Writes to a message in history deleted for me ────────────────────────────
select pg_temp.sign_in('b2');
select throws_ok($$ select genesis_chat.react(pg_temp.v('old'), '👍') $$, '42501', null, 'b2 can''t react to a message they deleted');
select throws_ok($$ select genesis_chat.pin_message(pg_temp.v('old')) $$, '42501', null, 'nor pin it');
select throws_ok($$ select genesis_chat.save_message(pg_temp.v('old')) $$, '42501', null, 'nor save it');
select throws_ok($$ select genesis_chat.edit_message(pg_temp.v('mine'), 'rewritten') $$, '42501', null, 'nor edit their own message in it');
select throws_ok($$ select genesis_chat.delete_message(pg_temp.v('mine')) $$, '42501', null, 'nor delete it');
select lives_ok($$ select genesis_chat.save_message(pg_temp.v('old'), false) $$, 'forgetting a saved one still works');
select lives_ok($$ select genesis_chat.react(pg_temp.v('kept'), '👍') $$, 'a message after the deleted history takes a reaction');
select lives_ok($$ select genesis_chat.pin_message(pg_temp.v('kept')) $$, 'and a pin');
select lives_ok($$ select genesis_chat.save_message(pg_temp.v('kept')) $$, 'and a save');
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.react(pg_temp.v('old'), '👍') $$, 'a1, who deleted nothing, still reacts to it');

select * from finish();
rollback;
