-- @feat:chat
-- pgTAP test for 0003_genesis_chat_search_threads.sql (with 0001 and 0002 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Writes only its own users, kinds and conversations, and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c3' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat3-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c3' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text) to authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert on t to authenticated, service_role;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated, service_role;

create function public.genesis_chat3_test_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('group', 'Group', p_membership => 'admins',
  p_start_check => 'public.genesis_chat3_test_may_start(uuid[], text, text, uuid)');

select pg_temp.sign_in('a1');
insert into t select 'grp', genesis_chat.start_conversation('group', array[pg_temp.person('b2')], 'Search lab');
insert into t select 'root', (genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'a thread starter about kayaks')).id;
select genesis_chat.send_message(pg_temp.v('grp'), gen_random_uuid(), 'a reply about zebras', p_thread_root_id => pg_temp.v('root'));

select pg_temp.sign_in('b2');
select is((select thread_root_id from genesis_chat.search_messages('zebras')), pg_temp.v('root'), 'a reply in a thread comes with its thread');
select is((select thread_root_id from genesis_chat.search_messages('kayaks')), null, 'a message on the main timeline with none');
select pg_temp.sign_in('c3');
select ok(not exists (select 1 from genesis_chat.search_messages('zebras')), 'someone outside still finds nothing');
reset role;
select ok(not has_function_privilege('anon', 'genesis_chat.search_messages(text, uuid, integer)', 'execute'), 'anon can''t search');
select ok(has_function_privilege('authenticated', 'genesis_chat.search_messages(text, uuid, integer)', 'execute'), 'signed-in people can');

select * from finish();
rollback;
