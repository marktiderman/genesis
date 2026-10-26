-- @feat:support-chat
-- pgTAP test for 0001_genesis_support_chat.sql (after 0006_genesis_support.sql and genesis-chat's
-- 0001 and 0002). Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, reports and conversations and rolls everything back. If your
-- app already has the staff hook (`private.genesis_support_staff`), it is replaced inside this
-- transaction only.
--
-- People: a1 reports, b2 is someone else, c3 and d4 are staff, e5 is not staff.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
       'genesis-support-chat-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create table pg_temp.ids (name text primary key, id uuid);
create function pg_temp.remember(name text, q text) returns void language plpgsql as $$
declare v uuid;
begin
  execute q into v;
  insert into pg_temp.ids values (name, v);
end $$;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from pg_temp.ids where name = n $$;
create function pg_temp.conv(n text) returns uuid language sql stable security definer as $$
  select c.id from genesis_chat.conversations c where c.kind = 'support' and c.subject_id = (select id from pg_temp.ids where name = n)::text
$$;
create function pg_temp.send(conv uuid, body text, visibility text default 'everyone') returns uuid language sql as $$
  select (genesis_chat.send_message(conv, gen_random_uuid(), body, '[]', null, null, null, '{}', visibility)).id
$$;
grant select, insert on pg_temp.ids to anon, authenticated;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.remember(text, text), pg_temp.id(text),
  pg_temp.conv(text), pg_temp.send(uuid, text, text) to anon, authenticated, service_role;

drop function if exists private.genesis_support_staff(uuid);
create function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select person in ('00000000-0000-4000-8000-0000000000c3'::uuid, '00000000-0000-4000-8000-0000000000d4'::uuid)
$$;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

-- The kind ----------------------------------------------------------------------------
select is(
  (select row(max_members, membership, threads, observers_post, who_posts, observer_check::text)::text
     from genesis_chat.kinds where kind = 'support'),
  row(2, 'app', false, true, 'members', 'private.genesis_support_chat_observer(uuid,uuid)')::text,
  'support: two at most (the person), the app adds members, no threads, staff observe and post'
);
select ok(
  not has_function_privilege('authenticated', 'private.genesis_support_chat_observer(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.genesis_support_chat_backfill()', 'execute')
  and not has_function_privilege('anon', 'public.support_chat_conversation(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.support_assign_report(uuid, uuid)', 'execute'),
  'the private functions are the database''s, and anon calls nothing'
);
select ok(
  not has_column_privilege('authenticated', 'public.support_replies', 'chat_message_id', 'select'),
  'which message a reply mirrors is not readable'
);

-- The copy: a report and replies from before this block -----------------------------------
alter table public.support_reports disable trigger genesis_support_chat_report_added;
alter table public.support_replies disable trigger genesis_support_chat_reply_added;
alter table genesis_chat.messages disable trigger genesis_support_chat_message_posted;

select pg_temp.sign_in('a1');
set local role authenticated;
select pg_temp.remember('r0', $$ insert into public.support_reports (type, title, message) values ('bug', 'Old report', 'It broke before chat') returning id $$);
insert into public.support_replies (report_id, body) values (pg_temp.id('r0'), 'first');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r0'), 'second');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r0'), 'third');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r0'), 'fourth');
reset role;

alter table public.support_reports enable trigger genesis_support_chat_report_added;
alter table public.support_replies enable trigger genesis_support_chat_reply_added;
alter table genesis_chat.messages enable trigger genesis_support_chat_message_posted;

select is(pg_temp.conv('r0'), null, 'before the copy the old report has no conversation');
create table pg_temp.effects_before as select count(*) as n from genesis_chat.effects;
select lives_ok($$ select private.genesis_support_chat_backfill() $$, 'the copy runs');
select isnt(pg_temp.conv('r0'), null, 'the old report has its conversation');
select is(
  (select array_agg(user_id::text || ':' || role) from genesis_chat.members where conversation_id = pg_temp.conv('r0')),
  array[pg_temp.person('a1')::text || ':member'],
  'its person is its only member'
);
select is(
  (select array_agg(body order by seq) from genesis_chat.messages where conversation_id = pg_temp.conv('r0')),
  array['first', 'second', 'third', 'fourth'],
  'the replies are copied in order'
);
select is(
  (select array_agg(sender_role order by seq) from genesis_chat.messages where conversation_id = pg_temp.conv('r0')),
  array['member', 'observer', 'member', 'observer'],
  'the person''s as the member, staff''s as an observer'
);
select ok(
  (select bool_and(m.created_at = p.created_at and m.sender_id = p.author_id and p.chat_message_id = m.id)
     from public.support_replies p join genesis_chat.messages m on m.client_id = p.id
    where p.report_id = pg_temp.id('r0')),
  'each keeps its time and writer, and the reply knows its message'
);
select is((select count(*) from genesis_chat.effects), (select n from pg_temp.effects_before), 'the copy queued no push, preview or other effect');
select is(
  (select last_read_seq from genesis_chat.members where conversation_id = pg_temp.conv('r0') and user_id = pg_temp.person('a1')),
  3::bigint,
  'the person has read up to their own last reply'
);
select is((select status from genesis_chat.conversations where id = pg_temp.conv('r0')), 'open', 'the conversation is open, like the report');
select lives_ok($$ select private.genesis_support_chat_backfill() $$, 'the copy runs again');
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.conv('r0')), 4, '... and copies nothing twice');
select is((select count(*) from genesis_chat.effects), (select n from pg_temp.effects_before), '... nor queues anything');

-- A new report ------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select pg_temp.remember('r1', $$ insert into public.support_reports (type, message) values ('question', E'How do I export?\nI looked everywhere.') returning id $$);
select is(public.support_chat_conversation(pg_temp.id('r1')), pg_temp.conv('r1'), 'a new report has its conversation, and its person finds it');
select is((select title from genesis_chat.conversations where id = pg_temp.conv('r1')), 'How do I export?', 'titled with the first line of its message');
select is(genesis_chat.my_role(pg_temp.conv('r1')), 'member', 'its person is its member');
select throws_ok($$ select genesis_chat.start_conversation('support', array['00000000-0000-4000-8000-0000000000c3'::uuid]) $$,
  '42501', null, 'nobody starts a support conversation by hand');
select lives_ok($$ select pg_temp.send(pg_temp.conv('r1'), 'Any news?') $$, 'the person writes in it');
select throws_ok($$ select pg_temp.send(pg_temp.conv('r1'), 'note to self', 'observers') $$,
  '42501', null, 'the person cannot write an internal note');
reset role;
select ok(
  (select last_user_reply_at is not null and user_read_at is not null from public.support_reports where id = pg_temp.id('r1')),
  'the person''s message moves the report on and marks it read for them'
);
select is(
  (select array_agg(body || ':' || from_staff::text) from public.support_replies where report_id = pg_temp.id('r1')),
  array['Any news?:false'],
  'older clients see it in support_replies, as the person''s'
);

-- Staff ------------------------------------------------------------------------------------
select pg_temp.sign_in('c3');
set local role authenticated;
select is(public.support_chat_conversation(pg_temp.id('r1')), pg_temp.conv('r1'), 'staff find the conversation');
select is(genesis_chat.my_role(pg_temp.conv('r1')), 'observer', 'staff observe it without being in it');
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.conv('r1')), 1, 'staff read it');
select pg_temp.remember('m_staff', $$ select pg_temp.send(pg_temp.conv('r1'), 'Settings, then Export.') $$);
select pg_temp.remember('m_note', $$ select pg_temp.send(pg_temp.conv('r1'), 'Customer on the old plan', 'observers') $$);
select is(
  (select array_agg(sender_role || ':' || visibility order by seq) from genesis_chat.messages where conversation_id = pg_temp.conv('r1')),
  array['member:everyone', 'observer:everyone', 'observer:observers'],
  'staff reply and write internal notes, as observers'
);
reset role;
select ok(
  (select last_staff_reply_at is not null and staff_read_at is not null from public.support_reports where id = pg_temp.id('r1')),
  'a staff reply moves the report on for the person'
);
select is(
  (select array_agg(body || ':' || from_staff::text order by created_at) from public.support_replies where report_id = pg_temp.id('r1')),
  array['Any news?:false', 'Settings, then Export.:true'],
  'older clients see the staff reply, and never the internal note'
);

select pg_temp.sign_in('a1');
set local role authenticated;
select is(
  (select array_agg(body order by seq) from genesis_chat.messages where conversation_id = pg_temp.conv('r1')),
  array['Any news?', 'Settings, then Export.'],
  'the person reads the reply and never the internal note'
);
select ok(
  (select last_staff_reply_at > user_read_at from public.support_reports where id = pg_temp.id('r1')),
  'the person has an unread staff reply'
);
select lives_ok($$ select genesis_chat.mark_read(pg_temp.conv('r1')) $$, 'the person reads the conversation');
select ok(
  (select user_read_at >= last_staff_reply_at from public.support_reports where id = pg_temp.id('r1')),
  '... and the report is read for them'
);
select throws_ok($$ select genesis_chat.edit_message(pg_temp.id('m_staff'), 'mine now') $$,
  '42501', null, 'the person cannot edit a staff reply');
reset role;

-- Someone else, and nobody ------------------------------------------------------------------
select pg_temp.sign_in('b2');
set local role authenticated;
select is(public.support_chat_conversation(pg_temp.id('r1')), null, 'someone else finds no conversation');
select is((select count(*)::int from genesis_chat.conversations where kind = 'support'), 0, '... reads none');
select is((select count(*)::int from genesis_chat.messages), 0, '... nor any message');
select throws_ok($$ select pg_temp.send(pg_temp.conv('r1'), 'hello') $$, '42501', null, '... nor writes in one');
reset role;
set local role anon;
select throws_ok($$ select count(*) from genesis_chat.messages $$, '42501', null, 'anon reads nothing');
select throws_ok($$ select public.support_chat_conversation('00000000-0000-4000-8000-000000000000') $$, '42501', null, '... and calls nothing');
reset role;

-- Older clients write through support_replies ---------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'Found it, thanks');
reset role;
select is(
  (select sender_role || ':' || body from genesis_chat.messages where conversation_id = pg_temp.conv('r1') order by seq desc limit 1),
  'member:Found it, thanks',
  'a reply from an older client becomes the person''s message'
);
select pg_temp.sign_in('c3');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'Glad to help');
reset role;
select is(
  (select sender_role || ':' || body from genesis_chat.messages where conversation_id = pg_temp.conv('r1') order by seq desc limit 1),
  'observer:Glad to help',
  '... and a staff reply from one becomes a staff message'
);
select is((select count(*)::int from public.support_replies where report_id = pg_temp.id('r1')), 4, '... each once (no echo back)');
select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$ select public.support_mark_read(pg_temp.id('r1')) $$, 'an older client marks the report read');
reset role;
select ok(
  (select m.last_read_seq = c.last_seq from genesis_chat.members m join genesis_chat.conversations c on c.id = m.conversation_id
    where m.conversation_id = pg_temp.conv('r1') and m.user_id = pg_temp.person('a1')),
  '... and the person''s place in the conversation follows'
);

-- Edits and deletes reach older clients ------------------------------------------------------
select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ select genesis_chat.edit_message(pg_temp.id('m_staff'), 'Settings, then Export data.') $$, 'staff edit their reply');
reset role;
select is((select body from public.support_replies where chat_message_id = pg_temp.id('m_staff')), 'Settings, then Export data.', '... and support_replies has the edit');
select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ select genesis_chat.delete_message(pg_temp.id('m_staff')) $$, 'staff delete it');
reset role;
select is((select count(*)::int from public.support_replies where body like 'Settings%'), 0, '... and it leaves support_replies');

-- Status and assignee ------------------------------------------------------------------------
select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ select public.support_set_report_status(pg_temp.id('r1'), 'in_progress') $$, 'staff set the report in progress');
select is((select status from genesis_chat.conversations where id = pg_temp.conv('r1')), 'pending', '... and the conversation is pending');
select lives_ok($$ select genesis_chat.set_status(pg_temp.conv('r1'), 'solved', '00000000-0000-4000-8000-0000000000d4') $$,
  'a staff tool solves the conversation and gives it to d4');
select is((select status from public.support_reports where id = pg_temp.id('r1')), 'addressed', '... and the report is addressed');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('r1'), 'submitted') $$, 'staff set it submitted');
select lives_ok($$ select genesis_chat.set_status(pg_temp.conv('r1'), 'open', null) $$, 'the conversation, open, is set open again');
select is((select status from public.support_reports where id = pg_temp.id('r1')), 'submitted', '... which keeps the report submitted');
select lives_ok($$ select public.support_assign_report(pg_temp.id('r1'), '00000000-0000-4000-8000-0000000000d4') $$, 'staff assign the report to d4');
select is((select assignee_id from genesis_chat.conversations where id = pg_temp.conv('r1')), pg_temp.person('d4'), '... who has it');
select throws_ok($$ select public.support_assign_report(pg_temp.id('r1'), '00000000-0000-4000-8000-0000000000e5') $$,
  '42501', null, 'only staff are assigned');
select throws_ok($$ select genesis_chat.set_status(pg_temp.conv('r1'), 'pending', '00000000-0000-4000-8000-0000000000e5') $$,
  '42501', null, '... through chat too');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ select public.support_assign_report(pg_temp.id('r1'), null) $$, '42501', null, 'the person assigns nobody');
select throws_ok($$ select genesis_chat.set_status(pg_temp.conv('r1'), 'closed', null) $$, '42501', null, '... nor sets the status in chat');

-- Deleting ------------------------------------------------------------------------------
create table pg_temp.gone as select pg_temp.conv('r1') as conv;
grant select on pg_temp.gone to authenticated;
delete from public.support_reports where id = pg_temp.id('r1');
reset role;
select is((select count(*)::int from genesis_chat.conversations where id = (select conv from pg_temp.gone)), 0, 'deleting a report deletes its conversation');
select is((select count(*)::int from genesis_chat.messages where conversation_id = (select conv from pg_temp.gone)), 0, '... and its messages');
create table pg_temp.gone0 as select pg_temp.conv('r0') as conv;
delete from auth.users where id = pg_temp.person('a1');
select is((select count(*)::int from genesis_chat.conversations where id = (select conv from pg_temp.gone0)), 0, 'deleting the account deletes its reports'' conversations');

select * from finish();
rollback;
