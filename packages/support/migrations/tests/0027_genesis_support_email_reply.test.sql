-- @feat:support-email
-- pgTAP test for 0027_genesis_support_email_reply.sql: the person and a handler answer by email,
-- as themselves, once per Message-ID; anyone else, another From and a loop are refused. Rolls back.
--
-- People: a1 wrote the ticket; b2 is staff (a handler); c3 is nobody.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000026' || n)::uuid $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-reply-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000026b2'::uuid $$;

insert into public.tickets (id, user_id, type, message, tenant_id)
values ('00000000-0000-4000-8000-0000000026f0', pg_temp.person('a1'), 'bug', 'Export is broken', '00000000-0000-4000-8000-00000000000f');

create function pg_temp.reply(n text, from_ text, mid text, body text default 'Thanks') returns uuid language sql as $$
  select public.support_email_reply('00000000-0000-4000-8000-0000000026f0', pg_temp.person(n), from_, mid, body) $$;

select ok(not has_function_privilege('authenticated', 'public.support_email_reply(uuid, uuid, text, text, text)', 'execute'), 'only the service role posts an email reply');

set local role service_role;
select isnt(pg_temp.reply('a1', 'Genesis-Reply-a1@example.test', '<m1@mail.test>', 'Still broken'), null, 'the person answers by email');
reset role;
select is((select row(sender_id, body)::text from genesis_chat.messages where body = 'Still broken'),
  row(pg_temp.person('a1'), 'Still broken'::text)::text, 'as themselves, in the ticket''s thread');

set local role service_role;
select is(pg_temp.reply('a1', 'genesis-reply-a1@example.test', '<m1@mail.test>', 'Still broken'),
  (select id from genesis_chat.messages where body = 'Still broken'), 'the same email again is the same message');
reset role;
select is((select count(*)::int from genesis_chat.messages where body = 'Still broken'), 1, 'posted once');

set local role service_role;
select lives_ok($$select pg_temp.reply('b2', 'genesis-reply-b2@example.test', '<m2@mail.test>', 'Fixed now')$$, 'staff answer by email');
reset role;
select is((select sender_role from genesis_chat.messages where body = 'Fixed now'), 'observer', 'as support');

set local role service_role;
select throws_ok($$select pg_temp.reply('c3', 'genesis-reply-c3@example.test', '<m3@mail.test>')$$, '42501', null, 'nobody else');
select throws_ok($$select pg_temp.reply('a1', 'someone@else.test', '<m4@mail.test>')$$, '42501', null, 'never from another address');
select throws_ok($$select pg_temp.reply('a1', 'genesis-reply-a1@example.test', '<m5@mail.test>', '   ')$$, '22023', null, 'never empty');
select throws_ok($$select pg_temp.reply('a1', 'genesis-reply-a1@example.test', '')$$, '22023', null, 'never without a Message-ID');
reset role;

-- An old email again, after other replies: still posted once (kept 60 days).
update private.genesis_support_email_posts set at = now() - interval '2 days' where email_id = md5('support-email:<m1@mail.test>');
set local role service_role;
select lives_ok($$select pg_temp.reply('a1', 'genesis-reply-a1@example.test', '<m7@mail.test>', 'Another thing')$$, 'another reply later');
select is(pg_temp.reply('a1', 'genesis-reply-a1@example.test', '<m1@mail.test>', 'Still broken'),
  (select id from genesis_chat.messages where body = 'Still broken'), 'and the first email, delivered again days on, is the same message');
reset role;

select ok((select relrowsecurity from pg_class where oid = 'private.genesis_support_email_posts'::regclass), 'the posts table has row level security');
-- One email answering two tickets is a message in each (the chat client id names the ticket).
insert into public.tickets (id, user_id, type, message, tenant_id)
values ('00000000-0000-4000-8000-0000000026f1', pg_temp.person('a1'), 'bug', 'Another', '00000000-0000-4000-8000-00000000000f');
set local role service_role;
select lives_ok($$select public.support_email_reply('00000000-0000-4000-8000-0000000026f1', pg_temp.person('a1'), 'genesis-reply-a1@example.test', '<m1@mail.test>', 'Still broken')$$,
  'the same Message-ID on another ticket');
reset role;
select is((select count(*)::int from genesis_chat.messages where body = 'Still broken'), 2, 'posts there too');

insert into private.genesis_support_email_posts (ticket_id, email_id, posted_id)
select '00000000-0000-4000-8000-0000000026f0', 'loop' || g, gen_random_uuid() from generate_series(1, 20) g;
set local role service_role;
select throws_ok($$select pg_temp.reply('a1', 'genesis-reply-a1@example.test', '<m6@mail.test>')$$, 'GS429', null, 'a mail loop stops at 20 an hour');
reset role;

select * from finish();
rollback;
