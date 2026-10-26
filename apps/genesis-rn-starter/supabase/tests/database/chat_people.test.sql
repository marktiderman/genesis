-- @feat:chat
-- pgTAP test for 20261026000000_chat_people.sql: names and avatars only, only for people who
-- share a conversation with the caller. Writes only its own users and conversation; rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000c9a01', 'authenticated', 'authenticated', 'chat-people-a@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "Avery Stone", "avatar_url": "https://example.test/a.png", "phone_secret": "x"}'),
  ('00000000-0000-4000-8000-0000000c9a02', 'authenticated', 'authenticated', 'chat-people-b@example.test', '00000000-0000-0000-0000-000000000000',
    '{"full_name": "Blair Quinn", "picture": "https://example.test/b.png"}'),
  ('00000000-0000-4000-8000-0000000c9a03', 'authenticated', 'authenticated', 'chat-people-c@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "Casey Stranger"}'),
  ('00000000-0000-4000-8000-0000000c9a04', 'authenticated', 'authenticated', 'chat-people-d@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "  "}'),
  ('00000000-0000-4000-8000-0000000c9a05', 'authenticated', 'authenticated', 'chat-people-e@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "Emery Left"}'),
  ('00000000-0000-4000-8000-0000000c9a06', 'authenticated', 'authenticated', 'chat-people-f@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "Finley Observer"}'),
  ('00000000-0000-4000-8000-0000000c9a07', 'authenticated', 'authenticated', 'chat-people-g@example.test', '00000000-0000-0000-0000-000000000000',
    '{"name": "Gray Quiet"}');

create function pg_temp.sign_in(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', id::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.sign_in(uuid) to authenticated;

-- a, b and d in one group; e and g left it (e after posting, g without); f has an observer row;
-- c is in nothing with them.
insert into genesis_chat.conversations (id, kind) values ('00000000-0000-4000-8000-0000000c9ac1', 'group');
insert into genesis_chat.members (conversation_id, user_id, role, left_at) values
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a01', 'owner', null),
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a02', 'member', null),
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a04', 'member', null),
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a05', 'member', now()),
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a06', 'observer', null),
  ('00000000-0000-4000-8000-0000000c9ac1', '00000000-0000-4000-8000-0000000c9a07', 'member', now());
insert into genesis_chat.messages (conversation_id, seq, sender_id, sender_role, body) values
  ('00000000-0000-4000-8000-0000000c9ac1', 1, '00000000-0000-4000-8000-0000000c9a05', 'member', 'before I go');

create temp table people_ids (id uuid);
insert into people_ids values
  ('00000000-0000-4000-8000-0000000c9a01'), ('00000000-0000-4000-8000-0000000c9a02'), ('00000000-0000-4000-8000-0000000c9a03'),
  ('00000000-0000-4000-8000-0000000c9a04'), ('00000000-0000-4000-8000-0000000c9a05'), ('00000000-0000-4000-8000-0000000c9a06'),
  ('00000000-0000-4000-8000-0000000c9a07');
grant select on people_ids to authenticated, anon;

select pg_temp.sign_in('00000000-0000-4000-8000-0000000c9a01');

select results_eq(
  $$ select user_id, name, avatar_url from public.chat_people((select array_agg(id) from people_ids)) order by user_id $$,
  $$ values
    ('00000000-0000-4000-8000-0000000c9a01'::uuid, 'Avery Stone'::text, 'https://example.test/a.png'::text),
    ('00000000-0000-4000-8000-0000000c9a02'::uuid, 'Blair Quinn', 'https://example.test/b.png'),
    ('00000000-0000-4000-8000-0000000c9a04'::uuid, null, null),
    ('00000000-0000-4000-8000-0000000c9a05'::uuid, 'Emery Left', null) $$,
  'a member sees the names and avatars of the people in their conversations, their own, and an author who left'
);
select is((select count(*) from public.chat_people(array['00000000-0000-4000-8000-0000000c9a06'::uuid])), 0::bigint,
  'not an observer row (the members policy hides it; it grants nothing)');
select is((select count(*) from public.chat_people(array['00000000-0000-4000-8000-0000000c9a07'::uuid])), 0::bigint,
  'not someone who left without posting');
select is((select count(*) from public.chat_people(array['00000000-0000-4000-8000-0000000c9a03'::uuid])), 0::bigint,
  'no row for someone the caller shares no conversation with');
select is((select name from public.chat_people(array['00000000-0000-4000-8000-0000000c9a02'::uuid])), 'Blair Quinn',
  'full_name when there is no name (Sign in with Apple)');
select is((select name from public.chat_people(array['00000000-0000-4000-8000-0000000c9a04'::uuid])), null,
  'a blank name is no name');
select is(
  (select array_agg(p.parameter_name::text order by p.ordinal_position) from information_schema.parameters p
   join information_schema.routines r on r.specific_name = p.specific_name
   where r.routine_schema = 'public' and r.routine_name = 'chat_people' and p.parameter_mode = 'OUT'),
  array['user_id', 'name', 'avatar_url'],
  'returns only the id, name and avatar: never the email or the rest of the metadata'
);

select pg_temp.sign_in('00000000-0000-4000-8000-0000000c9a03');
select results_eq(
  $$ select user_id from public.chat_people((select array_agg(id) from people_ids)) $$,
  $$ values ('00000000-0000-4000-8000-0000000c9a03'::uuid) $$,
  'someone in no conversation with them sees only themself'
);

-- Someone who left still sees nobody they no longer share a conversation with.
select pg_temp.sign_in('00000000-0000-4000-8000-0000000c9a05');
select results_eq(
  $$ select user_id from public.chat_people((select array_agg(id) from people_ids)) $$,
  $$ values ('00000000-0000-4000-8000-0000000c9a05'::uuid) $$,
  'a member who left reads no one from the conversation they left'
);

select pg_temp.sign_in('00000000-0000-4000-8000-0000000c9a01');
select is((select count(*) from public.chat_people(array_cat(array_fill('00000000-0000-4000-8000-0000000c9a03'::uuid, array[200]), array['00000000-0000-4000-8000-0000000c9a02'::uuid]))), 0::bigint,
  'only the first 200 ids are read');

-- A signed-in role with no user (a NULL auth.uid()) reads no one.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.chat_people((select array_agg(id) from people_ids))), 0::bigint,
  'no user (NULL auth.uid()): no rows');

reset role;
select ok(not has_function_privilege('anon', 'public.chat_people(uuid[])', 'execute'), 'anon may not call it');
select ok(has_function_privilege('authenticated', 'public.chat_people(uuid[])', 'execute'), 'a signed-in person may');

select * from finish();
rollback;
