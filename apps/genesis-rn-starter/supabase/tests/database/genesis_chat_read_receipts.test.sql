-- @feat:chat
-- pgTAP test for 0006_genesis_chat_read_receipts.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, kinds and conversations, and rolls everything back.
--
-- People: a1 and b2 talk directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c6' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat-6-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create schema if not exists private;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000f6'::uuid, viewer
$$;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c6' || n)::uuid $$;
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
create function pg_temp.read_at(n text) returns timestamptz language sql stable as $$
  select last_read_at from genesis_chat.members where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person(n)
$$;
grant execute on function pg_temp.v(text), pg_temp.read_at(text) to authenticated;

create function public.genesis_chat_test6_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat_test6_may_start(uuid[], text, text, uuid)');

select pg_temp.sign_in('a1');
insert into t select 'ab', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]);
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'hello');

select is(pg_temp.read_at('a1'), null, 'posting moves your read place past your own message only: no read time');
select is(pg_temp.read_at('b2'), null, 'nobody has read it yet');

select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('ab'));
select isnt(pg_temp.read_at('b2'), null, 'reading someone else''s message records when');

-- A fixed earlier time, so "unchanged" is visible within one transaction (now() doesn't move).
reset role;
update genesis_chat.members set last_read_at = '2000-01-01T00:00:00Z' where conversation_id = pg_temp.v('ab');

select pg_temp.sign_in('b2');
select genesis_chat.mark_read(pg_temp.v('ab'));
select is(pg_temp.read_at('b2'), '2000-01-01T00:00:00Z'::timestamptz, 'reading again with nothing new keeps the time');

select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'hi back');
select is(pg_temp.read_at('b2'), '2000-01-01T00:00:00Z'::timestamptz, 'replying moves the place past your own message: the time stays');

select pg_temp.sign_in('a1');
select is(pg_temp.read_at('b2'), '2000-01-01T00:00:00Z'::timestamptz, 'the other member sees the read time');
select genesis_chat.send_message(pg_temp.v('ab'), gen_random_uuid(), 'and again');
select isnt(pg_temp.read_at('a1'), '2000-01-01T00:00:00Z'::timestamptz, 'posting past a message you hadn''t read counts as reading it');

-- An observer's place moving records nothing.
reset role;
update genesis_chat.members set role = 'observer', last_read_at = null where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('b2');
update genesis_chat.members set last_read_seq = last_read_seq + 1 where conversation_id = pg_temp.v('ab') and user_id = pg_temp.person('b2');
select is(pg_temp.read_at('b2'), null, 'an observer gets no read time');

select has_column('genesis_chat', 'members', 'last_read_at', 'members carry last_read_at');

select * from finish();
rollback;
