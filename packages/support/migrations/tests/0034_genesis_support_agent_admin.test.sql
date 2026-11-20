-- @feat:support-chat
-- pgTAP test for 0034_genesis_support_agent_admin.sql: who manages a desk's agents (and so who
-- searches its people) is one rule; the agent list says each one's role and whether the caller can
-- remove them; the report's "open by requester" list comes from the set-based hook alone. Rolls
-- everything back; the app's hooks are replaced inside this transaction.
--
-- Tenants: d (the app's own) and ta. People: a1 a client of ta; c3 and c4 agents of ta; c5 an admin
-- agent of ta; b8 ta's tenant admin; e6 the app's staff; a7 an anonymous login in ta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                else '00000000-0000-4000-8000-0000000000a0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000034' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.conv(t uuid) returns uuid language sql stable as $$
  select c.id from genesis_chat.conversations c where c.kind = 'support' and c.subject_id = t::text $$;
create function pg_temp.report() returns jsonb language sql as $$
  select public.support_agent_report('00000000-0000-4000-8000-0000000000a0', now() - interval '1 day', now() + interval '1 minute') $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-labels-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'c3', 'c4']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000034a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000034c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000034c4', '00000000-0000-4000-8000-0000000000a0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
drop function if exists private.genesis_support_report_handler(uuid, uuid);
drop function if exists private.genesis_support_agent_mentioned(uuid, uuid, uuid, uuid);
drop function if exists private.genesis_support_requester_label(uuid);
drop function if exists private.genesis_support_requester_labels(uuid[]);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

insert into public.ticket_agents (tenant_id, person_id, role) values
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('ta'), pg_temp.person('c4'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

-- Three open tickets of ta.
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'b1', 'One', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'b2', 'Two', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'b3', 'Three', pg_temp.tenant('ta'));
reset role;

-- Only the one-ticket hook: not asked any more.
create or replace function private.genesis_support_requester_label(report uuid) returns text
language sql stable security definer set search_path = '' as $$ select 'Acme' $$;
revoke execute on function private.genesis_support_requester_label(uuid) from public, anon, authenticated;

select pg_temp.sign_in('c3');
set local role authenticated;
select is(pg_temp.report() -> 'by_requester', '[]'::jsonb, 'the one-ticket hook alone labels nothing');
reset role;

-- The set-based hook labels them.
create or replace function private.genesis_support_requester_labels(reports uuid[])
returns table (report_id uuid, label text)
language sql stable security definer set search_path = '' as $$
  select r, 'Acme' from unnest(reports) r $$;
revoke execute on function private.genesis_support_requester_labels(uuid[]) from public, anon, authenticated;

select pg_temp.sign_in('c3');
set local role authenticated;
select is(pg_temp.report() -> 'by_requester', '[{"label": "Acme", "open": 3}]'::jsonb, 'the set-based hook labels every open ticket');
select ok(not pg_temp.report() ? 'by_requester_capped', 'every open ticket is labelled: no cap to report');
reset role;

-- The agent list reads support.agentListScan through the one resolver.
insert into public.genesis_app_manifest (app_id, catalogue) values ('labels-test',
  '{"support.agentListScan": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": false, "standard": false, "min": false}}}');
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_agents_list(pg_temp.tenant('ta'))), 2, 'the tenant''s agents, without a scan');
reset role;
insert into public.genesis_settings (key, value) values ('support.agentListScan', '"yes"');
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_agents_list(pg_temp.tenant('ta'))), 2, 'a value of the wrong type is skipped, as resolveSettings skips it');
reset role;

-- Who manages agents: one rule ---------------------------------------------------------------------

-- c9 is a login whose person record in ta is another id (p9 = ...0034f9): the app's records.
insert into auth.users (id, aud, role, email, instance_id, is_anonymous)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-labels-' || n || '@example.test', '00000000-0000-0000-0000-000000000000', n = 'a7'
from unnest(array['c5', 'b8', 'e6', 'a7', 'c9']) n;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000a0'::uuid,
         case when viewer = '00000000-0000-4000-8000-0000000034c9'::uuid then '00000000-0000-4000-8000-0000000034f9'::uuid else viewer end
   where viewer in (select ('00000000-0000-4000-8000-0000000034' || n)::uuid from unnest(array['a1', 'c3', 'c4', 'c5', 'b8', 'a7', 'c9']) n) $$;
create or replace function private.genesis_person_login(person uuid) returns uuid
language sql stable set search_path = '' as $$
  select case when person = '00000000-0000-4000-8000-0000000034f9'::uuid then '00000000-0000-4000-8000-0000000034c9'::uuid else person end $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-8000-0000000000a0'::uuid and person = '00000000-0000-4000-8000-0000000034b8'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000034e6'::uuid $$;
revoke execute on function private.genesis_person_login(uuid) from public, anon, authenticated;
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('ta'), pg_temp.person('c5'), 'admin');
-- An anonymous login and c9 wrote to ta.
insert into public.tickets (type, title, message, tenant_id, user_id) values
  ('question', 'anon', 'Hi', pg_temp.tenant('ta'), pg_temp.person('a7')),
  ('question', 'c9', 'Hi', pg_temp.tenant('ta'), pg_temp.person('c9'));

create function pg_temp.manages(n text, tenant uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.sign_in(n);
  set local role authenticated;
  r := public.support_can_manage_agents(tenant);
  reset role;
  return r;
end $$;
select is(pg_temp.manages('c3', pg_temp.tenant('ta')), false, 'an agent doesn''t manage agents');
select is(pg_temp.manages('c5', pg_temp.tenant('ta')), true, 'an admin agent does');
select is(pg_temp.manages('b8', pg_temp.tenant('ta')), true, '... and the tenant''s admin');
select is(pg_temp.manages('e6', null), true, 'the app''s staff manage the app''s own desk (null)');
select is(pg_temp.manages('e6', pg_temp.tenant('ta')), false, '... not a tenant''s');

select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok($$select public.support_set_agent(pg_temp.tenant('ta'), pg_temp.person('a1'), 'agent')$$, '42501', null, 'and support_set_agent agrees: an agent is refused');
reset role;
select pg_temp.sign_in('e6');
set local role authenticated;
select lives_ok($$select public.support_set_agent(null, pg_temp.person('e6'), 'admin')$$, '... and null is the app''s own desk there too, for its staff');
reset role;
select is((select role from public.ticket_agents where tenant_id = pg_temp.tenant('d') and person_id = pg_temp.person('e6')), 'admin', 'the row is at the app''s own desk');

-- A person record that isn't the login ------------------------------------------------------------

select pg_temp.sign_in('c5');
set local role authenticated;
select is((select row(person_id, user_id)::text from public.support_people_search(pg_temp.tenant('ta'), 'labels-c9')),
  row('00000000-0000-4000-8000-0000000034f9'::uuid, pg_temp.person('c9'))::text, 'people search gives the tenant''s person record and the login');
select lives_ok($$select public.support_set_agent(pg_temp.tenant('ta'), '00000000-0000-4000-8000-0000000034f9', 'agent')$$, 'which support_set_agent takes');
select is((select row(user_id, person_id, role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('c9')),
  row(pg_temp.person('c9'), '00000000-0000-4000-8000-0000000034f9'::uuid, 'agent', true)::text, 'the agent list shows the login with its record, removable');
select lives_ok($$select public.support_set_agent(pg_temp.tenant('ta'), (select person_id from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('c9')), null)$$,
  'removing by the listed person record');
reset role;
select is((select count(*)::int from public.ticket_agents where person_id = '00000000-0000-4000-8000-0000000034f9'), 0, '... really removes the row');

-- The agent list's role and removable -------------------------------------------------------------

select pg_temp.sign_in('b8');
set local role authenticated;
select is((select row(role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('c3')),
  row('agent', true)::text, 'an agent row: agent, and the tenant''s admin can remove it');
select is((select row(role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('c5')),
  row('admin', true)::text, 'an admin agent row: admin, removable');
select is((select row(role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('b8')),
  row('admin', false)::text, 'the tenant''s admin (no row): admin, and not removable');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_agents_list(pg_temp.tenant('ta')) where removable), 0, 'an agent can remove nobody');
reset role;
-- The tenant's admin by the app's hook, with an agent row too: admin wins, and the row isn't removable.
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('ta'), pg_temp.person('b8'), 'agent');
select pg_temp.sign_in('c5');
set local role authenticated;
select is((select row(role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where user_id = pg_temp.person('b8')),
  row('admin', false)::text, 'a tenant admin with an agent row: admin, and not removable');
reset role;

-- People search ----------------------------------------------------------------------------------

-- Many logins that aren't the desk's: the search doesn't look at them.
insert into auth.users (id, aud, role, email, instance_id)
select gen_random_uuid(), 'authenticated', 'authenticated', 'genesis-labels-bulk-' || g || '@example.test', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 20000) g;
create temp table timing (started timestamptz, finished timestamptz);
grant all on timing to authenticated;

select pg_temp.sign_in('c5');
set local role authenticated;
insert into timing (started) values (clock_timestamp());
select is((select array_agg(email order by email) from public.support_people_search(pg_temp.tenant('ta'), 'genesis-labels')),
  array['genesis-labels-a1@example.test', 'genesis-labels-b8@example.test', 'genesis-labels-c3@example.test', 'genesis-labels-c4@example.test', 'genesis-labels-c5@example.test', 'genesis-labels-c9@example.test'],
  'an admin agent finds the desk''s people (agents and requesters): no anonymous login, none of the other logins');
update timing set finished = clock_timestamp();
select ok((select finished - started from timing) < interval '250 milliseconds', 'with 20,000 other logins the search still reads only the desk''s people');
select throws_ok($$select * from public.support_people_search(null, 'genesis')$$, '42501', null, 'and can''t search another desk''s');
select throws_ok($$select * from public.support_people_search(pg_temp.tenant('ta'), 'g')$$, '22023', null, 'a search is at least 2 characters');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_people_search(pg_temp.tenant('ta'), 'labels-a1')), 1,
  'an agent who doesn''t manage agents searches too: whoever may link an email ticket finds the person');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$select * from public.support_people_search(pg_temp.tenant('ta'), 'genesis')$$, '42501', null, 'someone who isn''t the desk''s agent can''t search');
reset role;

-- The app's own desk: its agents search too (the same rule as linking), among the people that desk
-- handles, never every login. c4 is an agent there through a record the app gives it.
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000a0'::uuid,
         case when viewer = '00000000-0000-4000-8000-0000000034c9'::uuid then '00000000-0000-4000-8000-0000000034f9'::uuid else viewer end
   where viewer in (select ('00000000-0000-4000-8000-0000000034' || n)::uuid from unnest(array['a1', 'c3', 'c4', 'c5', 'b8', 'a7', 'c9']) n)
  union all
  select '00000000-0000-4000-8000-00000000000f'::uuid, viewer where viewer = '00000000-0000-4000-8000-0000000034c4'::uuid $$;
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('d'), pg_temp.person('c4'), 'agent');
select pg_temp.sign_in('c4');
set local role authenticated;
select is((select array_agg(email order by email) from public.support_people_search(null, 'genesis-labels')),
  array['genesis-labels-c4@example.test', 'genesis-labels-e6@example.test'],
  'an agent of the app''s own desk finds the people that desk handles (its agents), none of the other logins');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok($$select * from public.support_people_search(null, 'genesis')$$, '42501', null, 'someone who doesn''t handle the app''s own desk can''t search it');
reset role;

-- The app's own search: its matches, still checked against the tenant.
create function private.genesis_people_search(tenant uuid, q text, lim integer)
returns table (person_id uuid, login uuid) language sql stable set search_path = '' as $$
  select null::uuid, u.id from auth.users u
   where u.id in ('00000000-0000-4000-8000-0000000034b8'::uuid, '00000000-0000-4000-8000-0000000034e6'::uuid) $$;
revoke execute on function private.genesis_people_search(uuid, text, integer) from public, anon, authenticated;
select pg_temp.sign_in('c5');
set local role authenticated;
select is((select array_agg(email) from public.support_people_search(pg_temp.tenant('ta'), 'genesis-labels')),
  array['genesis-labels-b8@example.test'], 'with the app''s search hook: its matches, only those who are the tenant''s people');
reset role;

-- Zero config at the app's own desk: no genesis_viewer_people, so a login is its own person ------
-- d1 and d2 are logins that aren't the app's staff; d3 wrote to the app's own desk; d4 is added by d2.
drop function private.genesis_viewer_people(uuid);
drop function private.genesis_person_login(uuid);
drop function private.genesis_people_search(uuid, text, integer);
insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-labels-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['d1', 'd2', 'd3', 'd4']) n;
insert into public.tickets (type, title, message, tenant_id, user_id) values
  ('question', 'own desk', 'Hi', pg_temp.tenant('d'), pg_temp.person('d3'));

select pg_temp.sign_in('e6');
set local role authenticated;
select lives_ok($$select public.support_set_agent(null, pg_temp.person('d1'), 'agent')$$, 'zero config: the app''s staff add a login at the app''s own desk');
select is((select row(person_id, role, removable)::text from public.support_agents_list(null) where user_id = pg_temp.person('d1')),
  row(pg_temp.person('d1'), 'agent', true)::text, '... who shows in the desk''s list, as their own person, removable');
reset role;
select ok(private.genesis_support_agent(pg_temp.tenant('d'), pg_temp.person('d1')), '... and is an agent there');
select pg_temp.sign_in('d1');
set local role authenticated;
select ok(public.support_is_agent(pg_temp.tenant('d')), '... as they see it too');
select is((select count(*)::int from public.tickets where tenant_id = pg_temp.tenant('d') and title = 'own desk'), 1, '... and they see the desk''s tickets');
select ok(exists (select 1 from public.support_agents_list(null) where user_id = pg_temp.person('d1')), '... and read the desk''s agents');
select is(public.support_can_manage_agents(null), false, 'an agent row doesn''t manage agents');
reset role;

-- An admin row there manages the desk's agents.
select pg_temp.sign_in('e6');
set local role authenticated;
select lives_ok($$select public.support_set_agent(null, pg_temp.person('d2'), 'admin')$$, 'zero config: the app''s staff add an admin at the app''s own desk');
reset role;
select is(pg_temp.manages('d2', null), true, '... who manages the desk''s agents');
select pg_temp.sign_in('d2');
set local role authenticated;
select lives_ok($$select public.support_set_agent(null, pg_temp.person('d4'), 'agent')$$, '... and adds one');
select is((select row(role, removable)::text from public.support_agents_list(null) where user_id = pg_temp.person('d2')),
  row('admin', true)::text, 'the admin row: admin, removable');
select is((select row(role, removable)::text from public.support_agents_list(null) where user_id = pg_temp.person('d4')),
  row('agent', true)::text, 'the agent the admin added: listed, removable by them');
select lives_ok($$select public.support_set_agent(null, pg_temp.person('d4'), null)$$, '... and removes them');
reset role;
select is(private.genesis_support_agent(pg_temp.tenant('d'), pg_temp.person('d4')), false, '... who is no longer an agent');

-- An agent row whose person has no login: listed with a null login, and removable ---------------
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('ta'), pg_temp.person('ee'), 'agent');
select pg_temp.sign_in('b8');
set local role authenticated;
select is((select row(user_id, role, removable)::text from public.support_agents_list(pg_temp.tenant('ta')) where person_id = pg_temp.person('ee')),
  row(null::uuid, 'agent', true)::text, 'an agent row with no login is listed, with a null login, removable');
select lives_ok($$select public.support_set_agent(pg_temp.tenant('ta'), pg_temp.person('ee'), null)$$, '... and removed by its person record');
reset role;
select is((select count(*)::int from public.ticket_agents where person_id = pg_temp.person('ee')), 0, '... which really removes the row');

select * from finish();
rollback;
