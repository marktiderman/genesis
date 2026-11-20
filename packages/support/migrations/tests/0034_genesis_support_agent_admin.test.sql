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
select plan(20);

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

insert into auth.users (id, aud, role, email, instance_id, is_anonymous)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-labels-' || n || '@example.test', '00000000-0000-0000-0000-000000000000', n = 'a7'
from unnest(array['c5', 'b8', 'e6', 'a7']) n;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000a0'::uuid, viewer
   where viewer in (select ('00000000-0000-4000-8000-0000000034' || n)::uuid from unnest(array['a1', 'c3', 'c4', 'c5', 'b8', 'a7']) n) $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-8000-0000000000a0'::uuid and person = '00000000-0000-4000-8000-0000000034b8'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000034e6'::uuid $$;
insert into public.ticket_agents (tenant_id, person_id, role) values (pg_temp.tenant('ta'), pg_temp.person('c5'), 'admin');

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
select lives_ok($$select public.support_set_agent(pg_temp.tenant('d'), pg_temp.person('e6'), 'admin')$$, '... the app''s staff are accepted for the app''s own desk');
reset role;

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

-- People search ----------------------------------------------------------------------------------

select pg_temp.sign_in('c5');
set local role authenticated;
select is((select array_agg(email order by email) from public.support_people_search(pg_temp.tenant('ta'), 'genesis-labels')),
  array['genesis-labels-a1@example.test', 'genesis-labels-b8@example.test', 'genesis-labels-c3@example.test', 'genesis-labels-c4@example.test', 'genesis-labels-c5@example.test'],
  'an admin agent finds the tenant''s people: no anonymous login, nobody from outside it');
select throws_ok($$select * from public.support_people_search(pg_temp.tenant('d'), 'genesis')$$, '42501', null, 'and can''t search another desk''s');
select throws_ok($$select * from public.support_people_search(pg_temp.tenant('ta'), 'g')$$, '22023', null, 'a search is at least 2 characters');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$select * from public.support_people_search(pg_temp.tenant('ta'), 'genesis')$$, '42501', null, 'a member who doesn''t manage agents can''t search');
reset role;

select * from finish();
rollback;
