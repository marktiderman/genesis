-- @feat:support-chat
-- pgTAP test for 0013: a pending ticket, what each queue holds and counts, how long a requester has
-- waited, and a requester's earlier conversations, which stop at the tenant. Copy into your app's
-- `supabase/tests/database/` and run `supabase test db`. Rolls everything back; the app's hooks are
-- replaced inside this transaction.
--
-- Tenants: d (the app's own), ta and tb. People: a1 a client of ta; b2 a client of tb; c3 an agent
-- of ta; e5 an agent of tb; f6 the app's staff.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000013' || n)::uuid $$;
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
create function pg_temp.status(n text) returns text language sql stable as $$
  select t.status from public.tickets t where t.id = pg_temp.id(n) $$;
create function pg_temp.waiting(n text) returns timestamptz language sql stable as $$
  select q.waiting_since from public.support_agent_tickets('00000000-0000-4000-8000-0000000000a0') q where q.id = pg_temp.id(n) $$;
create function pg_temp.earlier(n text) returns text[] language sql stable as $$
  select pg_temp.names(array(select e.id from public.support_agent_requester_tickets(pg_temp.id(n)) e)) $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-queues-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5', 'f6']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000013a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000013c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000013b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000013e5', '00000000-0000-4000-8000-0000000000b0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000013f6'::uuid $$;
drop function if exists private.genesis_support_report_handler(uuid, uuid);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

insert into public.ticket_agents (tenant_id, person_id, role) values
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.person('e5'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

-- The tickets: three in ta from a1, one in ta that c3 filed, one in tb.
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta1', 'First', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta2', 'Second', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta3', 'Third', pg_temp.tenant('ta'));
select pg_temp.sign_in('c3');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'tc3', 'An agent''s own', pg_temp.tenant('ta'));
select pg_temp.sign_in('b2');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'tb1', 'In tb', pg_temp.tenant('tb'));
reset role;
insert into ids select title, id from public.tickets where title in ('ta1', 'ta2', 'ta3', 'tc3', 'tb1');
update public.tickets set created_at = now() - interval '3 hours' where id = pg_temp.id('ta1');
update public.tickets set created_at = now() - interval '2 hours' where id = pg_temp.id('ta2');
update public.tickets set created_at = now() - interval '1 hour' where id = pg_temp.id('ta3');

-- Who may call -------------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.support_agent_requester_tickets(uuid, integer)', 'execute'),
          'anon cannot read earlier conversations');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_pending_answered()', 'execute'),
          'the pending trigger is private');
select ok(has_function_privilege('authenticated', 'public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid)', 'execute'),
          'the queue, made again, is still granted to the signed-in');
select ok(not has_function_privilege('anon', 'public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid)', 'execute'),
          '... and not to anon');

set local role authenticated;

-- Pending ------------------------------------------------------------------------------------

select pg_temp.sign_in('c3');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), array['ta1', 'ta2', 'ta3'], 'three active tickets, nobody''s');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta1'), 'pending') $$, 'an agent sets a ticket pending');
select is(pg_temp.status('ta1'), 'pending', 'it is pending');
select is((select c.status from genesis_chat.conversations c where c.id = pg_temp.conv('ta1')), 'pending', '... and so is its conversation');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), array['ta2', 'ta3'], 'a pending ticket leaves unassigned');
select is(pg_temp.queue('pending', pg_temp.tenant('ta')), array['ta1'], '... and is in pending');
select is(pg_temp.queue('all', pg_temp.tenant('ta')), array['ta1', 'ta2', 'ta3'], 'all still lists every ticket');
select results_eq($$ select inbox_view, tickets from public.support_agent_ticket_counts('00000000-0000-4000-8000-0000000000a0') order by 1 $$,
                  $$ values ('all', 2), ('mine', 0), ('unassigned', 2) $$, 'the counts are of active tickets');
select is(pg_temp.waiting('ta1'), null::timestamptz, 'nobody waits on a pending ticket');

select lives_ok($$ select public.support_assign_report(pg_temp.id('ta2'), pg_temp.person('c3')) $$, 'an agent takes a ticket');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'pending') $$, '... and sets it pending');
select is(pg_temp.queue('mine', pg_temp.tenant('ta')), '{}'::text[], 'a pending ticket leaves mine');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta2'), gen_random_uuid(), 'Any news?', '[]', null, null, null, '{}', 'everyone') $$,
                'the agent writes on it');
select is(pg_temp.status('ta2'), 'pending', 'an agent''s message leaves it pending');

select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta1'), gen_random_uuid(), 'Here it is', '[]', null, null, null, '{}', 'everyone') $$,
                'the requester answers');
select is(pg_temp.status('ta1'), 'open', 'a pending ticket is open again when the requester writes');
select is((select c.status from genesis_chat.conversations c where c.id = pg_temp.conv('ta1')), 'open', '... and so is its conversation');

select pg_temp.sign_in('c3');
select is(pg_temp.queue('unassigned', pg_temp.tenant('ta')), array['ta1', 'ta3'], 'back in its queue');

-- Closing, reopening, the closed view --------------------------------------------------------

select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'addressed') $$, 'an agent closes a pending ticket');
select is(pg_temp.queue('closed', pg_temp.tenant('ta')), array['ta2'], 'it is in closed');
select is(pg_temp.queue('pending', pg_temp.tenant('ta')), '{}'::text[], '... and no longer pending');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'pending') $$, 'and sets it pending again');
reset role;
select is((select t.resolved_at from public.tickets t where t.id = pg_temp.id('ta2')), null::timestamptz, 'which clears when it was resolved');
set local role authenticated;
select pg_temp.sign_in('c3');

-- How long the requester has waited --------------------------------------------------------------

select is(pg_temp.waiting('ta3'), (select t.created_at from public.tickets t where t.id = pg_temp.id('ta3')),
          'unanswered: since the ticket came in');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta3'), gen_random_uuid(), 'On it', '[]', null, null, null, '{}', 'everyone') $$,
                'an agent answers');
select is(pg_temp.waiting('ta3'), null::timestamptz, 'answered: nobody waits');
reset role;
update genesis_chat.messages set created_at = now() - interval '30 minutes' where conversation_id = pg_temp.conv('ta3');
update public.tickets set last_staff_reply_at = now() - interval '30 minutes' where id = pg_temp.id('ta3');
set local role authenticated;
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta3'), gen_random_uuid(), 'Still stuck', '[]', null, null, null, '{}', 'everyone') $$,
                'the requester writes again');
select pg_temp.sign_in('c3');
select is(pg_temp.waiting('ta3'), now(), 'since their first message after the answer');

-- Earlier conversations ----------------------------------------------------------------------------

select is(pg_temp.earlier('ta1'), array['ta2', 'ta3'], 'an agent sees the requester''s other tickets in the tenant');
select is((select array_agg(e.title) from public.support_agent_requester_tickets(pg_temp.id('ta1')) e), array['ta3', 'ta2'], 'newest first');
select throws_ok($$ select * from public.support_agent_requester_tickets(pg_temp.id('tc3')) $$, '42501', null, 'never about their own ticket');
select pg_temp.sign_in('a1');
select throws_ok($$ select * from public.support_agent_requester_tickets(pg_temp.id('ta1')) $$, '42501', null, 'the requester can''t ask');
select pg_temp.sign_in('e5');
select throws_ok($$ select * from public.support_agent_requester_tickets(pg_temp.id('ta1')) $$, '42501', null, 'nor an agent of another tenant');
select pg_temp.sign_in('f6');
select throws_ok($$ select * from public.support_agent_requester_tickets(pg_temp.id('ta1')) $$, '42501', null, 'nor the app''s staff, for a business''s ticket');

-- An email ticket, with no login, matches on its address. The columns are the support-email block's.
reset role;
alter table public.tickets add column if not exists channel text, add column if not exists requester_email text, add column if not exists requester_name text;
alter table public.tickets alter column user_id drop not null;
update public.tickets set user_id = null, channel = 'email', requester_email = 'ada@example.test' where id in (pg_temp.id('ta2'), pg_temp.id('ta3'));
set local role authenticated;
select pg_temp.sign_in('c3');
select is(pg_temp.earlier('ta2'), array['ta3'], 'an email ticket finds the same address''s');

reset role;
select * from finish();
rollback;
