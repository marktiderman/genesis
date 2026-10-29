-- @feat:support-email
-- pgTAP test for 0002_genesis_support_email.sql (after 0006_genesis_support.sql).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, staff hook and tickets, and rolls everything back. If your app
-- already has the staff hook, it is dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000020' || n)::uuid, 'authenticated', 'authenticated', 'genesis-email-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b1']) n;

create function pg_temp.login(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000020' || n)::uuid $$;
create function pg_temp.as_login(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.login(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.login(n)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.login(text), pg_temp.as_login(text), pg_temp.as_owner() to authenticated, anon, service_role;

-- s1 is staff.
drop function if exists private.genesis_support_staff(uuid);
create function private.genesis_support_staff(person uuid) returns boolean language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-0000000020b1'::text::uuid
$$;

-- Privileges --------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.support_receive_email(jsonb)', 'execute'), 'a person can''t file an email');
select ok(not has_function_privilege('anon', 'public.support_receive_email(jsonb)', 'execute'), '... nor anon');
select ok(not has_function_privilege('authenticated', 'public.support_claim_outbound_emails(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.support_settle_outbound_email(uuid, text, text, text)', 'execute'), 'sending is the service role''s');
select ok(not has_table_privilege('anon', 'public.support_email_messages', 'select'), 'anon reads no email');

-- A new email opens a ticket with no login ---------------------------------------------------------
set local role service_role;
select lives_ok($$select public.support_receive_email('{"messageId": "<m1@mail.example.test>", "from": {"email": "Pat@Example.TEST", "name": "Pat"}, "to": ["support@acme.test"], "subject": "Can''t sign in", "text": "It says my code expired.", "providerId": "re_in_1", "authentication": {"spf": "pass", "dkim": "pass", "dmarc": "pass"}}'::jsonb)$$, 'a new email is filed');
reset role;
select is((select count(*)::int from public.support_reports where channel = 'email'), 1, '... as one email ticket');
select is((select coalesce(user_id::text, 'none') || ' ' || requester_email || ' ' || requester_name || ' ' || status || ' ' || title from public.support_reports where channel = 'email'),
  'none pat@example.test Pat open Can''t sign in', '... with no login, the requester and the subject');
select is((select message_id || ' ' || (authentication ->> 'dmarc') from public.support_email_messages where direction = 'in'), 'm1@mail.example.test pass', 'the Message-ID and authentication are kept');

-- The same email again is filed once.
set local role service_role;
select is(public.support_receive_email('{"messageId": "m1@mail.example.test", "from": {"email": "pat@example.test"}, "text": "dup"}'::jsonb),
  (select id from public.support_reports where channel = 'email'), 'the same Message-ID returns the same ticket');
reset role;
select is((select count(*)::int from public.support_email_messages), 1, '... and adds nothing');

-- People: the requester's login (if any) doesn't see it; staff do ---------------------------------
select pg_temp.as_login('a1');
select is((select count(*)::int from public.support_reports where channel = 'email'), 0, 'a person sees no ticket without their login');
select is((select count(*)::int from public.support_email_messages), 0, '... and no email');
select pg_temp.as_owner();

-- Staff answer: the reply queues an email ---------------------------------------------------------
select pg_temp.as_login('b1');
select lives_ok($$insert into public.support_replies (report_id, body) select id, 'A new code is on its way.' from public.support_reports where channel = 'email'$$, 'staff reply on a ticket with no login');
select is((select count(*)::int from public.support_email_messages), 2, 'staff read the ticket''s emails (the one in, the reply queued)');
select pg_temp.as_owner();
select is((select from_staff::text || ' ' || coalesce(author_id::text, '') from public.support_replies), 'true ' || pg_temp.login('b1')::text, 'the reply is staff''s, from the session');
select is((select status || ' ' || in_reply_to || ' ' || subject || ' ' || to_addresses[1] from public.support_email_messages where direction = 'out'),
  'queued m1@mail.example.test Re: Can''t sign in pat@example.test', 'an outbound email is queued, threaded, to the requester');

-- Sending ------------------------------------------------------------------------------------------
set local role service_role;
select is((select count(*)::int from public.support_claim_outbound_emails(10)), 1, 'the sender claims the queued reply');
select is((select count(*)::int from public.support_claim_outbound_emails(10)), 0, '... once, while its lease holds');
select public.support_settle_outbound_email((select id from public.support_email_messages where direction = 'out'), 're_out_1', null, '<r1@acme.test>');
reset role;
select is((select status || ' ' || provider_id || ' ' || message_id from public.support_email_messages where direction = 'out'), 'sent re_out_1 r1@acme.test', 'settled as sent, with the Message-ID it went out with');

-- The requester replies: by the reply address, and by In-Reply-To --------------------------------
update public.support_reports set status = 'addressed' where channel = 'email';
set local role service_role;
select is(
  public.support_receive_email(jsonb_build_object('messageId', 'm2@mail.example.test', 'from', jsonb_build_object('email', 'pat@example.test'),
    'to', jsonb_build_array('support+' || (select email_token from public.support_reports where channel = 'email') || '@reply.acme.test'), 'subject', 'Re: Can''t sign in', 'text', 'Got it, thanks!')),
  (select id from public.support_reports where channel = 'email'), 'a reply to the ticket''s address joins it');
select is(
  public.support_receive_email('{"messageId": "m3@mail.example.test", "inReplyTo": "<r1@acme.test>", "from": {"email": "pat@example.test"}, "to": ["support@acme.test"], "text": "One more thing."}'::jsonb),
  (select id from public.support_reports where channel = 'email'), 'a reply that answers a sent email joins it');
select is(public.support_receive_email('{"messageId": "m9@x.test", "inReplyTo": "<unknown@x.test>", "from": {"email": "x@x.test"}, "text": "Hi", "onlyExisting": true}'::jsonb), null, 'with onlyExisting, mail answering no ticket is left alone');
reset role;
select is((select status from public.support_reports where channel = 'email'), 'open', 'a reply reopens an answered ticket');
select is((select count(*)::int from public.support_replies where not from_staff), 2, 'the requester''s replies are in the thread');

-- An app ticket can't be reached by email, and server code can't reply on one.
insert into public.support_reports (user_id, message) values (pg_temp.login('a1'), 'From the app.');
set local role service_role;
select throws_ok($$insert into public.support_replies (report_id, body) select id, 'x' from public.support_reports where channel = 'app'$$, '42501', null, 'server code can''t write on an app ticket');
reset role;

select * from finish();
rollback;
