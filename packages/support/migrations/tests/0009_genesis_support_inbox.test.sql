-- @feat:support-helpdesk
-- pgTAP test for every way staff read a queue of tickets: 0009's functions, the tickets table and
-- its old-name view under row security, and genesis-chat's observed queue. No tenant's agents see
-- another's tickets, whichever they use. Copy into your app's `supabase/tests/database/` and run
-- `supabase test db`. Rolls everything back; the app's hooks are replaced inside this transaction.
--
-- Tenants: d (the app's own), ta and tb. People: a1 a client of ta; b2 a client of tb; c3 an agent
-- of ta; c4 another agent of ta; e5 an agent of tb; f6 the app's staff; c9 the admin of ta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function pg_temp.names(rows uuid[]) returns text[] language sql stable as $$
  select coalesce(array_agg(i.name order by i.name), '{}') from ids i where i.id = any (rows) $$;
create function pg_temp.conv(n text) returns uuid language sql stable as $$
  select c.id from genesis_chat.conversations c where c.kind = 'support' and c.subject_id = pg_temp.id(n)::text $$;
create function pg_temp.queue(v text, t uuid default null) returns text[] language sql stable as $$
  select pg_temp.names(array(select q.id from public.support_agent_tickets(t, v) q)) $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-inbox-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'c4', 'e5', 'f6', 'c9']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000004c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004c4', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004c9', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004e5', '00000000-0000-4000-8000-0000000000b0')
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
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('ta'), pg_temp.person('c4'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.person('e5'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

-- The tickets: two in ta from a1, one in ta that c3 filed, one in tb, one in the app's own.
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta1', 'First in ta', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('bug', 'ta2', 'Second in ta', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'td1', 'For the app', pg_temp.tenant('d'));
select pg_temp.sign_in('c3');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'tc3', 'An agent''s own', pg_temp.tenant('ta'));
select pg_temp.sign_in('b2');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'tb1', 'In tb', pg_temp.tenant('tb'));
reset role;
insert into ids select title, id from public.tickets where title in ('ta1', 'ta2', 'tc3', 'tb1', 'td1');
-- A known order of activity, oldest first: ta1, ta2.
update public.tickets set created_at = now() - interval '2 hours' where id = pg_temp.id('ta1');
update public.tickets set created_at = now() - interval '1 hour' where id = pg_temp.id('ta2');

-- Who may call -------------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid)', 'execute'),
          'anon cannot read a queue');
select ok(not has_function_privilege('anon', 'public.support_agent_ticket_counts(uuid)', 'execute'),
          '... nor its counts');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_inbox_tenant(uuid)', 'execute'),
          'the tenant check is private');

set local role authenticated;

select pg_temp.sign_in('a1');
select throws_ok($$ select * from public.support_agent_tickets('00000000-0000-4000-8000-0000000000a0') $$, '42501', null,
                 'a client of a business reads no queue there');
select throws_ok($$ select * from public.support_agent_ticket_counts('00000000-0000-4000-8000-0000000000a0') $$, '42501', null,
                 '... nor its counts');
select throws_ok($$ select * from public.support_agent_tickets() $$, '42501', null, '... nor the app''s own');

select pg_temp.sign_in('c3');
select throws_ok($$ select * from public.support_agent_tickets('00000000-0000-4000-8000-0000000000b0') $$, '42501', null,
                 'an agent of one business reads no other''s queue');
select throws_ok($$ select * from public.support_agent_ticket_counts('00000000-0000-4000-8000-0000000000b0') $$, '42501', null,
                 '... nor its counts');
select throws_ok($$ select * from public.support_agent_tickets() $$, '42501', null, '... nor the app''s own');
select throws_ok($$ select * from public.support_agent_tickets('00000000-0000-4000-8000-0000000000a0', 'everything') $$, '22023', null,
                 'an unknown view is refused');

select pg_temp.sign_in('f6');
select throws_ok($$ select * from public.support_agent_tickets('00000000-0000-4000-8000-0000000000a0') $$, '42501', null,
                 'the app''s staff read no business''s queue');
select is(pg_temp.queue('all'), array['td1'], 'and a null tenant is the app''s own, which they do read');

-- What each queue holds ----------------------------------------------------------------------

select pg_temp.sign_in('c3');
select is(pg_temp.queue('all', pg_temp.tenant('ta')), array['ta1', 'ta2'], 'an agent''s queue holds their tenant''s tickets, not their own');
select is((select array_agg(q.title) from public.support_agent_tickets(pg_temp.tenant('ta'), 'all') q), array['ta2', 'ta1'],
          'latest activity first');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), array['ta1', 'ta2'], 'nobody''s yet: unassigned');
select is(pg_temp.queue('mine', pg_temp.tenant('ta')), '{}'::text[], '... and none are mine');

select pg_temp.sign_in('c4');
select is(pg_temp.queue('all', pg_temp.tenant('ta')), array['ta1', 'ta2', 'tc3'], 'another agent has the ticket an agent filed');

select pg_temp.sign_in('c9');
select is(pg_temp.queue('all', pg_temp.tenant('ta')), array['ta1', 'ta2', 'tc3'], 'a tenant admin reads the queue');

select pg_temp.sign_in('e5');
select is(pg_temp.queue('all', pg_temp.tenant('tb')), array['tb1'], 'an agent of the other business has theirs');

-- Assignment, closing, counts ------------------------------------------------------------------

select pg_temp.sign_in('c3');
select lives_ok($$ select public.support_assign_report(pg_temp.id('ta1'), pg_temp.person('c3')) $$, 'an agent takes a ticket');
select is(pg_temp.queue('mine', pg_temp.tenant('ta')), array['ta1'], 'it is theirs');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), array['ta2'], 'and no longer unassigned');
select is((select q.assignee_id from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta1')), pg_temp.person('c3'),
          'the row says who has it');
select is((select q.conversation_id from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta1')), pg_temp.conv('ta1'),
          '... and its conversation');
select results_eq($$ select mine, unassigned, all_tickets from public.support_agent_ticket_counts('00000000-0000-4000-8000-0000000000a0') $$,
                  $$ values (1, 1, 2) $$, 'the counts match the views');
select pg_temp.sign_in('c4');
select results_eq($$ select mine, unassigned, all_tickets from public.support_agent_ticket_counts('00000000-0000-4000-8000-0000000000a0') $$,
                  $$ values (0, 2, 3) $$, 'another agent''s counts are their own');
select is(pg_temp.queue('mine', pg_temp.tenant('ta')), '{}'::text[], '... and so is mine');

select pg_temp.sign_in('c3');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta1'), 'addressed') $$, 'an agent closes a ticket');
select is(pg_temp.queue('mine', pg_temp.tenant('ta')), '{}'::text[], 'a closed ticket leaves mine');
select is(pg_temp.queue('all', pg_temp.tenant('ta')), array['ta1', 'ta2'], 'but stays in all');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'wont_fix') $$, 'an agent declines a ticket');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), '{}'::text[], 'a declined ticket leaves unassigned');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'open') $$, 'and reopens it');

-- Paging -----------------------------------------------------------------------------------------

select is((select array_agg(q.title) from public.support_agent_tickets(pg_temp.tenant('ta'), 'all', null, null, 1) q), array['ta2'], 'a page holds max_rows');
select is((select array_agg(p.title) from public.support_agent_tickets(pg_temp.tenant('ta'), 'all') q
             cross join lateral public.support_agent_tickets(pg_temp.tenant('ta'), 'all', q.activity_at, q.id, 1) p
            where q.title = 'ta2'), array['ta1'], 'the next page starts after the last row');

select is((select array_agg(q.title) from public.support_agent_tickets(pg_temp.tenant('ta'), 'all', null, null, 50, pg_temp.id('ta1')) q), array['ta1'],
          'only_id reads one ticket of the queue');
select is((select count(*)::int from public.support_agent_tickets(pg_temp.tenant('ta'), 'all', null, null, 50, pg_temp.id('tb1')) q), 0,
          '... never one from another tenant');
select is((select count(*)::int from public.support_agent_tickets(pg_temp.tenant('ta'), 'all', null, null, 50, pg_temp.id('tc3')) q), 0,
          '... nor their own');

-- Previews and unread ----------------------------------------------------------------------------

select is((select q.preview from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta2')), 'Second in ta',
          'with no messages, the preview is the ticket''s words');
select ok((select q.agent_unread from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta2')), 'a new ticket is unread');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta2'), gen_random_uuid(), 'A reply', '[]', null, null, null, '{}', 'everyone') $$, 'an agent replies');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta2'), gen_random_uuid(), 'A secret note', '[]', null, null, null, '{}', 'observers') $$, 'and leaves a note');
select is((select q.preview from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta2')), 'A reply',
          'the preview is the latest message the requester can see, never a note');
select ok(not (select q.agent_unread from public.support_agent_tickets(pg_temp.tenant('ta')) q where q.id = pg_temp.id('ta2')), 'an agent''s reply reads it');

-- The other ways to read a queue: each stops at the tenant too ---------------------------------

select pg_temp.sign_in('c3');
select is(pg_temp.names(array(select t.id from public.tickets t)), array['ta1', 'ta2', 'tc3'], 'row security: an agent lists their tenant''s tickets');
select is(pg_temp.names(array(select t.id from public.support_reports t)), array['ta1', 'ta2', 'tc3'], '... through the old-name view too');
select is((select array_agg(q.subject_id::uuid) from genesis_chat.observed('support') q where q.subject_id::uuid = any (array[pg_temp.id('tb1'), pg_temp.id('td1')])), null,
          'chat''s observed queue holds no other tenant''s ticket');
select pg_temp.sign_in('f6');
select is(pg_temp.names(array(select t.id from public.tickets t)), array['td1'], 'row security: the app''s staff list only the app''s own tickets');

reset role;
select * from finish();
rollback;
