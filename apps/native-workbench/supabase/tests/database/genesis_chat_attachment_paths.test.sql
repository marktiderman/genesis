-- @feat:chat
-- pgTAP test for 0005_genesis_chat_attachment_paths.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 and b2 talk directly and share a file; e5 and d4 talk directly, and aren't in it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c0' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'd4', 'e5']) n;

create schema if not exists private;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000f0'::uuid, viewer
$$;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c0' || n)::uuid $$;
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
create function pg_temp.file(conv text, who text, name text) returns text language sql stable as $$
  select pg_temp.v(conv) || '/' || pg_temp.person(who) || '/' || name
$$;
grant execute on function pg_temp.v(text), pg_temp.file(text, text, text) to authenticated;

create function public.genesis_chat_test_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test_may_start(uuid[], text, text, uuid)');

select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
select pg_temp.sign_in('e5');
insert into t select 'ed', genesis_chat.start_conversation('direct', array[pg_temp.person('d4')]);

reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('genesis-chat', pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text),
  ('genesis-chat', pg_temp.file('ab', 'a1', 'poster.jpg'), pg_temp.person('a1')::text);

select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'image', 'path', pg_temp.file('ab', 'a1', 'photo.jpg')))) $$,
  'a file in storage still sends');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'video', 'provider', 'mux', 'provider_id', 'up_1', 'poster_path', pg_temp.file('ab', 'a1', 'poster.jpg')))) $$,
  'a hosted video with a poster still sends');
select lives_ok($$ select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'link', 'provider', 'external', 'url', 'https://example.test/a'))) $$,
  'a link with no path still sends');

select pg_temp.sign_in('b2');
select ok(genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'a member reads a file in storage');
select ok(genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'poster.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'and a hosted video''s poster');

select pg_temp.sign_in('e5');
select ok(not genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'someone outside the conversation doesn''t');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('ed'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'file', 'provider', 'external', 'path', pg_temp.file('ab', 'a1', 'photo.jpg'), 'url', 'https://example.test/a'))) $$,
  '23514', null, 'only a file in storage has a path');
select throws_ok($$ select genesis_chat.send_message(pg_temp.v('ed'), gen_random_uuid(), '',
  jsonb_build_array(jsonb_build_object('kind', 'file', 'provider', 'none', 'path', pg_temp.file('ab', 'a1', 'photo.jpg')))) $$,
  '23514', null, 'whatever the other provider');
select ok(not genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'and being refused grants nothing');

-- A row written before this migration, with the rule out of the way for the test.
reset role;
alter table genesis_chat.attachments drop constraint if exists attachments_path_only_in_storage;
select pg_temp.sign_in('e5');
insert into t select 'older', (genesis_chat.send_message(pg_temp.v('ed'), gen_random_uuid(), 'older')).id;
reset role;
insert into genesis_chat.attachments (message_id, conversation_id, position, kind, provider, path)
values (pg_temp.v('older'), pg_temp.v('ed'), 0, 'file', 'external', pg_temp.file('ab', 'a1', 'photo.jpg'));
select pg_temp.sign_in('e5');
select ok(not genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'an older row that isn''t in storage grants nothing either');
select throws_ok($$ select * from genesis_chat.attachment_paths_cleared $$, '42501', null, 'the record of cleared paths isn''t for people');
select pg_temp.sign_in('b2');
select ok(genesis_chat.can_read_object(pg_temp.file('ab', 'a1', 'photo.jpg'), pg_temp.person('a1')::text, now() - interval '2 days'),
          'and the member''s own access is unchanged');

-- What the migration clears, on rows the check would now refuse.
reset role;
insert into genesis_chat.attachments (message_id, conversation_id, position, kind, provider, path, url, transcript)
values (pg_temp.v('older'), pg_temp.v('ed'), 1, 'voice', 'none', 'x/y/voice.m4a', null, 'words'),
       (pg_temp.v('older'), pg_temp.v('ed'), 2, 'link', 'external', 'x/y/link.jpg', 'https://example.test/keep', null);
select is(genesis_chat.clear_paths_outside_storage(), 3, 'the backfill clears every path outside storage');
select is((select count(*)::int from genesis_chat.attachments where provider <> 'storage' and path is not null), 0, 'and leaves none');
select is((select transcript from genesis_chat.attachments where message_id = pg_temp.v('older') and kind = 'voice'), null, 'a cleared voice row loses its transcript');
select is((select url from genesis_chat.attachments where message_id = pg_temp.v('older') and kind = 'link'), 'https://example.test/keep', 'a link keeps its url');
select is((select count(*)::int from genesis_chat.attachment_paths_cleared where message_id = pg_temp.v('older')), 3, 'and each is on record');
select ok(exists (select 1 from genesis_chat.attachments where provider = 'storage' and path = pg_temp.file('ab', 'a1', 'photo.jpg')), 'a file in storage keeps its path');

select * from finish();
rollback;
