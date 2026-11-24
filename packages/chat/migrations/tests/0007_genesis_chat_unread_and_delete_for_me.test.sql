-- @feat:chat
-- pgTAP test for 0007_genesis_chat_unread_and_delete_for_me.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 and b2 talk directly; c3 is someone else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c7' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat-7-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create schema if not exists private;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000f7'::uuid, viewer
$$;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c7' || n)::uuid $$;
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
create function pg_temp.unread() returns integer language sql stable as $$
  select unread from genesis_chat.inbox() where conversation_id = pg_temp.v('ab')
$$;
create function pg_temp.listed() returns integer language sql stable as $$
  select count(*)::integer from genesis_chat.inbox() where conversation_id = pg_temp.v('ab')
$$;
create function pg_temp.visible() returns integer language sql stable as $$
  select count(*)::integer from genesis_chat.messages where conversation_id = pg_temp.v('ab') and thread_root_id is null
$$;
grant execute on function pg_temp.v(text), pg_temp.unread(), pg_temp.listed(), pg_temp.visible() to authenticated;

-- Capture the hints genesis_chat.broadcast sends (the stub realtime.send drops them).
create table realtime.test7_sent (topic text, event text, payload jsonb);
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$ insert into realtime.test7_sent values (topic, event, payload) $$;
create function pg_temp.hinted(n text) returns integer language sql stable security definer as $$
  select count(*)::integer from realtime.test7_sent
   where topic = 'genesis-chat:user:' || pg_temp.person(n) and event = 'inbox' and payload->>'conversation_id' = pg_temp.v('ab')::text
$$;
grant execute on function pg_temp.hinted(text) to authenticated;

create function public.genesis_chat_test7_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test7_may_start(uuid[], text, text, uuid)');

select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'hello');
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'how was the week?');

-- ── Mark as Unread ──────────────────────────────────────────────────────────────
select is(pg_temp.unread(), 0, 'a1''s own messages are not unread for a1');
select lives_ok($$ select genesis_chat.set_my_settings(pg_temp.v('ab'), p_marked_unread => true) $$, 'a1 marks it unread');
select is(pg_temp.unread(), 1, 'it counts as one unread, though the last message is a1''s own');
select is((select count(*)::int from genesis_chat.member_state where user_id = pg_temp.person('a1') and marked_unread), 1, 'a1 reads their own mark');
select is(genesis_chat.unread_total(), 1, 'and in the badge');
select pg_temp.sign_in('b2');
select is(pg_temp.unread(), 2, 'b2''s unread is untouched by a1''s mark (b2 hasn''t read a1''s two)');
select is((select count(*)::int from genesis_chat.member_state where user_id = pg_temp.person('a1')), 0, 'b2 can''t see that a1 marked it unread');
select hasnt_column('genesis_chat', 'members', 'marked_unread', 'members, which everyone in it reads, doesn''t hold the mark');
select hasnt_column('genesis_chat', 'members', 'cleared_seq', 'or what a member deleted');
select ok(pg_temp.hinted('a1') > 0, 'marking it unread sends a1''s own devices an inbox hint');
select pg_temp.sign_in('a1');
select is((select last_read_seq from genesis_chat.members where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('a1')),
          (select last_seq from genesis_chat.conversations where id = pg_temp.v('ab')), 'the read place doesn''t move back');

select genesis_chat.mark_read(pg_temp.v('ab'));
select is(pg_temp.unread(), 0, 'reading it clears the mark');
select genesis_chat.set_my_settings(pg_temp.v('ab'), p_marked_unread => true);
select genesis_chat.set_my_settings(pg_temp.v('ab'), p_marked_unread => false);
select is(pg_temp.unread(), 0, 'and so does unmarking it');

-- ── Delete for me ───────────────────────────────────────────────────────────────
-- A photo and a link in the history too: their file and preview go with it.
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('genesis-chat', pg_temp.v('ab') || '/' || pg_temp.person('a1') || '/photo.jpg', pg_temp.person('a1')::text);
select genesis_chat.save_link_preview('https://example.com/page', 'ok', 'Example page');
select pg_temp.sign_in('a1');
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'image', 'path', pg_temp.v('ab') || '/' || pg_temp.person('a1') || '/photo.jpg')));
insert into t select 'linked', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'look at https://example.com/page')).id;

select genesis_chat.pin_message(pg_temp.v('linked'));
reset role;
update genesis_chat.members set archived = true where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('b2');
select pg_temp.sign_in('b2');
select is(pg_temp.visible(), 4, 'b2 reads all four messages');
select is((select count(*)::int from genesis_chat.pins where conversation_id = pg_temp.v('ab')), 1, 'and the pin');
select ok(genesis_chat.can_read_object(pg_temp.v('ab') || '/' || pg_temp.person('a1') || '/photo.jpg', pg_temp.person('a1')::text, now() - interval '2 days'), 'and the photo');
select is((select count(*)::int from genesis_chat.link_previews_for(pg_temp.v('linked'))), 1, 'and the link''s preview');
select lives_ok($$ select genesis_chat.delete_conversation_for_me(pg_temp.v('ab')) $$, 'b2 deletes the conversation for themselves');
select is(pg_temp.listed(), 0, 'it leaves b2''s inbox');
select ok(pg_temp.hinted('b2') > 0, 'and sends b2''s own devices an inbox hint');
select is((select count(*)::int from genesis_chat.pins where conversation_id = pg_temp.v('ab')), 0, 'its pins leave b2''s pinned bar');
select is((select archived from genesis_chat.members where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('b2')), false, 'and it''s no longer archived, so a new message brings it to the inbox');
select is(pg_temp.visible(), 0, 'and its history leaves b2''s thread');
select ok(not genesis_chat.can_read_object(pg_temp.v('ab') || '/' || pg_temp.person('a1') || '/photo.jpg', pg_temp.person('a1')::text, now() - interval '2 days'), 'its files can''t be fetched by b2');
select is((select count(*)::int from genesis_chat.link_previews_for(pg_temp.v('linked'))), 0, 'nor its link previews');
select is((select count(*)::int from genesis_chat.search_messages('week')), 0, 'search doesn''t find what b2 deleted');
select is(genesis_chat.unread_total(), 0, 'nor does the badge count it');

select pg_temp.sign_in('a1');
select is(pg_temp.visible(), 4, 'a1 still reads everything');
select ok(genesis_chat.can_read_object(pg_temp.v('ab') || '/' || pg_temp.person('a1') || '/photo.jpg', pg_temp.person('a1')::text, now() - interval '2 days'), 'and still fetches the photo');
select is(pg_temp.listed(), 1, 'and still has it in the inbox');
select is((select count(*)::int from genesis_chat.pins where conversation_id = pg_temp.v('ab')), 1, 'and the pin');

-- What b2 can't read on the main timeline doesn't bring it back: a thread reply, an observers-only
-- note, or a message moderation hid.
insert into t select 'reply', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'a reply in the old thread', p_thread_root_id => pg_temp.v('linked'))).id;
insert into t select 'hidden', (genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'something rude')).id;
reset role;
update genesis_chat.messages set moderation = 'hidden' where id = pg_temp.v('hidden');
insert into genesis_chat.messages (conversation_id, seq, sender_id, sender_role, body, visibility)
select pg_temp.v('ab'), c.last_seq + 1, pg_temp.person('a1'), 'member', 'a note only observers read', 'observers'
  from genesis_chat.conversations c where c.id = pg_temp.v('ab');
update genesis_chat.conversations set last_seq = last_seq + 1 where id = pg_temp.v('ab');
select pg_temp.sign_in('b2');
select is(pg_temp.listed(), 0, 'a thread reply, an observers-only note or a hidden message doesn''t bring it back to b2');
select is(genesis_chat.unread_total(), 0, 'nor into b2''s badge');
reset role;
select is((select count(*)::int from genesis_chat.push_targets(pg_temp.v('reply')) where user_id = pg_temp.person('b2')), 0,
  'nor is b2 notified of the reply in the thread they deleted');
select pg_temp.sign_in('a1');
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'are you there?');

select pg_temp.sign_in('b2');
select is(pg_temp.listed(), 1, 'a new message brings it back to b2''s inbox');
select is(pg_temp.visible(), 1, 'with only what came after');
select is(pg_temp.unread(), 1, 'and only that unread');
reset role;
select is((select count(*)::int from genesis_chat.push_targets((select id from genesis_chat.messages where conversation_id = pg_temp.v('ab') and body = 'are you there?'))
            where user_id = pg_temp.person('b2')), 1, 'and the message that brings it back notifies b2');

select pg_temp.sign_in('c3');
select throws_ok($$ select genesis_chat.delete_conversation_for_me(pg_temp.v('ab')) $$, '42501', null, 'someone not in it can''t delete it for anyone');
select throws_ok($$ select genesis_chat.set_my_settings(pg_temp.v('ab'), p_marked_unread => true) $$, '42501', null, 'or mark it unread');

reset role;
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.v('ab')), 8, 'Delete for me deleted nothing: every message is still stored');
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.v('ab') and deleted_at is not null), 0, 'and none is marked deleted');
select is((select cleared_seq from genesis_chat.member_state where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('a1')), null, 'a1''s own view was never cleared');

-- A conversation with no messages yet still shows in the inbox (nothing deleted: cleared_seq is null).
select pg_temp.sign_in('a1');
insert into t select 'ac', genesis_chat.start_conversation('direct', array[pg_temp.person('c3')]);
select is((select count(*)::int from genesis_chat.inbox() where conversation_id = pg_temp.v('ac')), 1, 'a new, empty conversation is listed');

-- Delete up to what you saw: a message that came in after it isn't deleted unseen.
insert into t select 'seen', (genesis_chat.send_message(pg_temp.v('ac'), gen_random_uuid(), 'first')).id;
select genesis_chat.send_message(pg_temp.v('ac'), gen_random_uuid(), 'second, after c3 looked');
select pg_temp.sign_in('c3');
select lives_ok($$ select genesis_chat.delete_conversation_for_me(pg_temp.v('ac'), (select seq from genesis_chat.messages where id = pg_temp.v('seen'))) $$,
  'c3 deletes up to the message they saw');
select is((select count(*)::int from genesis_chat.inbox() where conversation_id = pg_temp.v('ac')), 1, 'the message after it keeps the conversation in c3''s inbox');
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.v('ac')), 1, 'and only it is left in c3''s thread');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ac'), 1);
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.v('ac')), 1, 'deleting again with an older place never brings history back');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ac'), 1000000);
select is((select cleared_seq from genesis_chat.member_state where conversation_id = pg_temp.v('ac') and user_id = pg_temp.person('c3')),
          (select last_seq from genesis_chat.conversations where id = pg_temp.v('ac')), 'a place past the latest message stops at it');

select * from finish();
rollback;
