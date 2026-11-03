-- @feat:support-feedback
-- pgTAP test for 0004_genesis_support_tickets.sql (after 0006_genesis_support.sql and 0003). Copy
-- into your app's `supabase/tests/database/` and run `supabase test db`. It writes only its own
-- users, tickets and agents and rolls everything back. The app's hooks
-- (private.genesis_support_default_tenant, private.genesis_viewer_people,
-- private.genesis_tenant_admin, private.genesis_support_staff,
-- private.genesis_support_report_handler) are replaced inside this transaction only.
--
-- Tenants: d (the app's own, the default), ta and tb (two businesses).
-- People: a1 is a client of ta; b2 a client of tb; c3 an agent of ta; e5 an agent of tb;
-- f6 the app's staff; d7 a client of both ta and tb; c9 the admin of ta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
create function pg_temp.record(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000005' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-tickets-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5', 'f6', 'd7', 'c9']) n;

-- The app's hooks, for this transaction.
create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
-- Person records are not logins: a login's person id here is its id with ...0005... for ...0004....
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, replace(viewer::text, '-0000000004', '-0000000005')::uuid from (values
    ('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000004c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004c9', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004e5', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004d7', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004d7', '00000000-0000-4000-8000-0000000000b0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-0000000004c9'::uuid and tenant = '00000000-0000-4000-8000-0000000000a0'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000004f6'::uuid $$;
drop function if exists private.genesis_support_report_handler(uuid, uuid);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

insert into public.ticket_agents (tenant_id, person_id, role) values
  (pg_temp.tenant('ta'), pg_temp.record('c3'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.record('e5'), 'agent');
-- Both businesses turn the help desk on (it is opt-in). An app without genesis-supabase 0004 gets
-- a stand-in table for this transaction.
create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test');
-- A row keyed by a login instead of a person record grants nothing.
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('tb'), pg_temp.person('b2'), 'agent');

-- Shape -------------------------------------------------------------------------------------
select has_table('public', 'tickets', 'tickets exists');
select has_table('public', 'ticket_attachments', 'ticket_attachments exists');
select has_table('public', 'ticket_agents', 'ticket_agents exists');
select has_view('public', 'support_reports', 'support_reports is a view for one minor');
select ok((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.support_reports'::regclass),
          'the old name runs as the caller (row security applies)');
select ok(exists (select 1 from pg_constraint where conname = 'tickets_tenant_required' and convalidated),
          'every ticket has a tenant (a validated check)');
select ok((select relrowsecurity from pg_class where oid = 'public.ticket_agents'::regclass), 'RLS is on for agents');
select ok(not has_table_privilege('authenticated', 'public.ticket_agents', 'insert,update,delete'),
          'nobody signed in writes agents directly');

-- Sending: the client names the tenant; the database checks it ------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'A1 asks', 'Where is it?', pg_temp.tenant('ta'));
reset role;
insert into ids select 'ta1', id from public.tickets where title = 'A1 asks';
select is((select tenant_id from public.tickets where id = pg_temp.id('ta1')), pg_temp.tenant('ta'),
          'a client names their business: the ticket goes there');

select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ insert into public.tickets (type, title, message, tenant_id) values ('question', 'Wrong', 'x', '00000000-0000-4000-8000-0000000000b0') $$,
                 '42501', 'support: not your tenant', 'nobody writes into a business they are not in');
insert into public.tickets (type, title, message, tenant_id) values ('bug', 'A1 to the app', 'Broken', pg_temp.tenant('d'));
reset role;
insert into ids select 'td1', id from public.tickets where title = 'A1 to the app';
select is((select tenant_id from public.tickets where id = pg_temp.id('td1')), pg_temp.tenant('d'),
          'anyone may write to the app''s own support');

select pg_temp.sign_in('d7');
set local role authenticated;
insert into public.tickets (type, title, message) values ('question', 'G7 asks', 'Which one?');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'G7 to tb', 'Hello', pg_temp.tenant('tb'));
reset role;
insert into ids select 'tg', id from public.tickets where title = 'G7 asks';
insert into ids select 'tgb', id from public.tickets where title = 'G7 to tb';
select is((select tenant_id from public.tickets where id = pg_temp.id('tg')), pg_temp.tenant('d'),
          'naming none (even a client of exactly one business): the app''s own support; nothing is guessed');
select is((select tenant_id from public.tickets where id = pg_temp.id('tgb')), pg_temp.tenant('tb'),
          '... or the business they name');

select pg_temp.sign_in('b2');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('bug', 'B2 bug', 'Crash', pg_temp.tenant('tb'));
reset role;
insert into ids select 'tb2', id from public.tickets where title = 'B2 bug';

select pg_temp.sign_in('b2');
set local role authenticated;
select ok(not public.support_is_agent(pg_temp.tenant('tb')), 'an agent row keyed by a login, not a person record, grants nothing');
reset role;

-- Reading and handling ------------------------------------------------------------------------
select pg_temp.sign_in('c3');
set local role authenticated;
select ok(exists (select 1 from public.tickets where id = pg_temp.id('ta1')), 'an agent reads their business''s tickets');
select ok(not exists (select 1 from public.tickets where id in (pg_temp.id('tb2'), pg_temp.id('tgb'))),
          '... and not another business''s');
select ok(not exists (select 1 from public.tickets where id = pg_temp.id('td1')), '... nor the app''s own');
select ok(public.support_handles(pg_temp.id('ta1')), 'an agent handles their business''s ticket');
select ok(not public.support_handles(pg_temp.id('tb2')), '... and not another''s');
select ok(not public.support_is_staff(), 'an agent of a business is not the app''s staff');
reset role;

select pg_temp.sign_in('f6');
set local role authenticated;
select ok(exists (select 1 from public.tickets where id = pg_temp.id('td1')), 'the app''s staff read the app''s own tickets');
select ok(not exists (select 1 from public.tickets where id in (pg_temp.id('ta1'), pg_temp.id('tb2'))),
          '... and no business''s');
select ok(public.support_is_staff(), 'staff means: an agent of the app''s own tenant');
reset role;

select pg_temp.sign_in('c9');
set local role authenticated;
select ok(public.support_handles(pg_temp.id('ta1')), 'a business''s admin handles its tickets');
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select ok(exists (select 1 from public.tickets where id = pg_temp.id('ta1')), 'the requester reads their ticket');
select ok(not public.support_handles(pg_temp.id('ta1')), '... but never handles it');
select throws_ok($$ select public.support_set_report_status(pg_temp.id('ta1'), 'addressed') $$, '42501', null,
                 '... nor sets its status');
select is((select count(*)::int from public.support_reports), 2, 'the old name shows only the requester''s own tickets');
select throws_ok($$ update public.tickets set tenant_id = '00000000-0000-4000-8000-0000000000b0' where id = pg_temp.id('ta1') $$,
                 '42501', null, 'nobody moves a ticket to another business');
reset role;
select throws_ok($$ update public.tickets set tenant_id = '00000000-0000-4000-8000-0000000000b0' where id = pg_temp.id('ta1') $$,
                 '42501', 'support: a ticket keeps its tenant', '... not even server code');

-- Replies and files stay inside the business --------------------------------------------------
-- a1 uploads a screenshot to their ta ticket and records it.
insert into storage.objects (bucket_id, name, owner_id)
values ('genesis-support', pg_temp.person('a1') || '/' || pg_temp.id('ta1') || '/shot.png', pg_temp.person('a1'));
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.ticket_attachments (report_id, path, content_type, byte_size, width, height)
values (pg_temp.id('ta1'), pg_temp.person('a1') || '/' || pg_temp.id('ta1') || '/shot.png', 'image/png', 1024, 390, 844);
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ insert into public.support_replies (report_id, body) values (pg_temp.id('ta1'), 'An agent replies') $$,
                'an agent of the business replies on its ticket');
select ok(public.support_can_read(pg_temp.person('a1') || '/' || pg_temp.id('ta1') || '/shot.png', now()),
          '... and opens its screenshots');
reset role;
select pg_temp.sign_in('e5');
set local role authenticated;
select is((select count(*)::int from public.support_replies where report_id = pg_temp.id('ta1')), 0,
          'an agent of another business reads none of its replies');
select throws_ok($$ insert into public.support_replies (report_id, body) values (pg_temp.id('ta1'), 'Butting in') $$,
                 '42501', null, '... and cannot reply on it');
select ok(not public.support_can_read(pg_temp.person('a1') || '/' || pg_temp.id('ta1') || '/shot.png', now()),
          '... nor open its screenshots');
reset role;
select pg_temp.sign_in('f6');
set local role authenticated;
select ok(not public.support_can_read(pg_temp.person('a1') || '/' || pg_temp.id('ta1') || '/shot.png', now()),
          'the app''s staff open no business''s screenshots');
reset role;

-- The old name still takes inserts, with the same checks.
select pg_temp.sign_in('b2');
set local role authenticated;
insert into public.support_reports (type, title, message, tenant_id) values ('idea', 'Via the old name', 'Still works', pg_temp.tenant('tb'));
reset role;
select is((select tenant_id from public.tickets where title = 'Via the old name'), pg_temp.tenant('tb'),
          'a ticket sent through the old name gets its tenant too');

-- Agents ----------------------------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ select public.support_set_agent('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000004a1', 'agent') $$,
                 '42501', null, 'a client cannot make themselves an agent');
reset role;
select pg_temp.sign_in('c9');
set local role authenticated;
select lives_ok($$ select public.support_set_agent('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000005a1', 'agent') $$,
                'a business''s admin adds an agent');
select throws_ok($$ select public.support_set_agent('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000004b2', 'agent') $$,
                 '42501', null, '... but not in another business');
reset role;
select pg_temp.sign_in('e5');
set local role authenticated;
select is((select count(*)::int from public.ticket_agents where tenant_id = pg_temp.tenant('tb')), 2, 'an agent sees their own business''s agents');
select is((select count(*)::int from public.ticket_agents where tenant_id <> pg_temp.tenant('tb')), 0, '... and no other business''s');
reset role;
-- An agent who leaves the business stops being one, whatever the agent row says.
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select null::uuid, null::uuid where false $$;
select pg_temp.sign_in('c3');
set local role authenticated;
select ok(not public.support_handles(pg_temp.id('ta1')), 'an agent removed from the business no longer handles its tickets');
reset role;

-- The app's handler hook stays inside the business -------------------------------------------
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000a0'::uuid, viewer where viewer = '00000000-0000-4000-8000-0000000004b2'::uuid $$;
create function private.genesis_support_report_handler(report uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000004b2'::uuid $$;
revoke execute on function private.genesis_support_report_handler(uuid, uuid) from public, anon, authenticated;
select pg_temp.sign_in('b2');
set local role authenticated;
select ok(not public.support_handles(pg_temp.id('ta1')), 'the app''s hook cannot hand a business''s ticket to anyone, even a member of it');
select ok(public.support_handles(pg_temp.id('td1')), '... but may for the app''s own tickets');
reset role;

-- Ideas ------------------------------------------------------------------------------------------
select pg_temp.sign_out();
insert into public.support_ideas (author_id, title, body, tenant_id) values
  (pg_temp.person('a1'), 'An idea for ta', 'Please', pg_temp.tenant('ta')),
  (pg_temp.person('a1'), 'An idea for the app', 'Please', pg_temp.tenant('d'));
select pg_temp.sign_in('e5');
set local role authenticated;
select ok(not exists (select 1 from public.support_ideas where title = 'An idea for ta'), 'another business''s idea board is closed');
select ok(exists (select 1 from public.support_ideas where title = 'An idea for the app'), 'the app''s own board is open to everyone signed in');
reset role;

-- Turning the help desk off ----------------------------------------------------------------------
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, t.login from (values
    ('00000000-0000-4000-8000-0000000004b2'::uuid, '00000000-0000-4000-8000-0000000000b0'::uuid),
    ('00000000-0000-4000-8000-0000000004a1', '00000000-0000-4000-8000-0000000000a0')
  ) as t(login, tenant_id) where t.login = viewer $$;
select pg_temp.sign_out();
update public.tenant_features set enabled = false where tenant_id = pg_temp.tenant('tb') and feature_id = 'support-helpdesk';
delete from public.tenant_features where tenant_id = pg_temp.tenant('ta') and feature_id = 'support-helpdesk';
select pg_temp.sign_in('b2');
set local role authenticated;
insert into public.tickets (type, title, message) values ('question', 'Off', 'x');
select throws_ok($$ insert into public.tickets (type, title, message, tenant_id) values ('question', 'Off 2', 'x', '00000000-0000-4000-8000-0000000000b0') $$,
                 '42501', 'support: the help desk is off here', 'a business that turned the help desk off takes no tickets');
insert into public.support_ideas (title, body) values ('An idea from b2', 'Please');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ insert into public.tickets (type, title, message, tenant_id) values ('question', 'Never on', 'x', '00000000-0000-4000-8000-0000000000a0') $$,
                 '42501', 'support: the help desk is off here', 'a business that never turned the help desk on takes no tickets (opt-in)');
select lives_ok($$ insert into public.tickets (type, title, message, tenant_id) values ('question', 'Always on', 'x', '00000000-0000-4000-8000-00000000000f') $$,
                'the app''s own support always takes tickets, with no switch row');
reset role;

select is((select tenant_id from public.tickets where title = 'Off'), pg_temp.tenant('d'),
          '... its clients'' tickets go to the app''s own support instead');
select is((select tenant_id from public.support_ideas where title = 'An idea from b2'), pg_temp.tenant('d'),
          'an idea goes to the app''s own board unless a business is named');
select is(public.support_default_tenant(), pg_temp.tenant('d'), 'clients can ask for the app''s own tenant');

select * from finish();
rollback;
