-- @feat:chat
-- pgTAP test for 0008_genesis_chat_cleared_history.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 talks directly with b2 (read receipts) and with c3 (pushes); b2 talks with c3 (files).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
create function pg_temp.pushed(message text, n text) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from genesis_chat.push_targets(pg_temp.v(message)) where user_id = pg_temp.person(n)
$$;
grant execute on function pg_temp.read_at(text, text), pg_temp.pushed(text, text) to authenticated;

create function public.genesis_chat_test8_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test8_may_start(uuid[], text, text, uuid)');

-- ── 1. A message deleted unread never reads as read ─────────────────────────────
select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'are you free on Thursday?');
select pg_temp.sign_in('b2');
select genesis_chat.delete_conversation_for_me(pg_temp.v('ab'));
-- b2 never read it; posting moves b2's read place past it.
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'starting over');
select is((select last_read_seq from genesis_chat.members where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('b2')),
          (select last_seq from genesis_chat.conversations where id = pg_temp.v('ab')), 'b2''s read place moved past a1''s deleted message');
select is(pg_temp.read_at('ab', 'b2'), null, 'but a1 doesn''t see "Read" on the message b2 deleted unread');
select pg_temp.sign_in('a1');
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'sure, Thursday works');
select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('ab'));
select isnt(pg_temp.read_at('ab', 'b2'), null, 'a message after what b2 deleted still reads as read');

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

select * from finish();
rollback;
