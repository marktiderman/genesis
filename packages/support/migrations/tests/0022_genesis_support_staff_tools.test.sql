-- @feat:support-chat
-- pgTAP test for 0022_genesis_support_staff_tools.sql: an agent names the tenant's agents, the
-- people who wrote tickets they handle and those people's tenants, and nobody else does. Rolls back.
--
-- People: a1 writes to the app and belongs to tenant tb; c2 is staff (the staff hook); d3 is an
-- agent of tb; e4 is nobody. The app's own hooks are set aside here, so it passes in an app that
-- defines them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000022' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-staff-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000', jsonb_build_object('full_name', 'Person ' || n)
from unnest(array['a1', 'c2', 'd3', 'e4']) n;

-- The app's own hooks are set aside inside this transaction (it rolls back), so this test runs the
-- same in an app that defines them: each case below defines what it needs.
drop function if exists private.genesis_support_default_tenant() cascade;
drop function if exists private.genesis_viewer_people(uuid) cascade;
drop function if exists private.genesis_support_staff(uuid) cascade;
drop function if exists private.genesis_platform_admin(uuid) cascade;
drop function if exists private.genesis_tenant_admin(uuid, uuid) cascade;
drop function if exists private.genesis_tenant_member(uuid, uuid) cascade;
drop function if exists private.genesis_tenant_admin_list(uuid) cascade;
drop function if exists private.genesis_tenant_label(uuid) cascade;
drop function if exists private.genesis_tenant_role(uuid, uuid) cascade;
drop function if exists private.genesis_person_name(uuid) cascade;
drop function if exists private.genesis_person_login(uuid) cascade;
drop function if exists private.genesis_support_staff_list() cascade;
drop function if exists private.genesis_support_report_handler(uuid, uuid) cascade;
drop function if exists private.genesis_support_staff_to_notify(uuid) cascade;
drop function if exists private.genesis_support_desk_for(uuid, text) cascade;
drop function if exists private.genesis_support_agent_mentioned(uuid, uuid, uuid, uuid) cascade;
drop function if exists private.genesis_support_requester_labels(uuid[]) cascade;
drop function if exists private.genesis_support_requester_label(uuid) cascade;
drop function if exists private.genesis_people_search(uuid, text, integer) cascade;
-- And genesis-supabase 0022's platform-admin list, where the app keeps one.
do $$ begin
  if to_regclass('public.genesis_platform_admins') is not null then
    execute 'delete from public.genesis_platform_admins';
  end if;
end $$;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000b0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000022a1'::uuid, '00000000-0000-4000-8000-0000000022d3'::uuid) $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000022c2'::uuid $$;
create or replace function private.genesis_tenant_label(tenant uuid) returns text
language sql stable set search_path = '' as $$ select case when tenant = '00000000-0000-4000-8000-0000000000b0'::uuid then 'Acme' end $$;
insert into public.ticket_agents (tenant_id, person_id, role) values ('00000000-0000-4000-8000-0000000000b0', pg_temp.person('d3'), 'agent');

insert into public.tickets (user_id, type, message, tenant_id) values (pg_temp.person('a1'), 'bug', 'to the app', '00000000-0000-4000-8000-00000000000f');

-- The app's staff list names e4 too, who handles nothing: only real agents are listed.
create function private.genesis_support_staff_list() returns setof uuid
language sql stable set search_path = '' as $$ select unnest(array['00000000-0000-4000-8000-0000000022c2'::uuid, '00000000-0000-4000-8000-0000000022e4'::uuid]) $$;
-- The app's report hook names e4 a handler of a1's report.
create function private.genesis_support_report_handler(report uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000022e4'::uuid $$;

-- Staff ---------------------------------------------------------------------------------------
select pg_temp.sign_in('c2');
set local role authenticated;
select is((select array_agg(full_name) from public.support_agents_list()), array['Person c2'], 'staff list the app''s own agents, by name');
select is((select email from public.support_ticket_requesters(array[pg_temp.person('a1'), pg_temp.person('e4')])), 'genesis-staff-a1@example.test', 'staff name who wrote');
select is((select count(*)::int from public.support_ticket_requesters(array[pg_temp.person('e4')])), 0, 'never someone who wrote nothing they handle');
select is((select array_agg(label) from public.support_requester_tenants(pg_temp.person('a1'))), array['Acme'], 'staff see the requester''s tenants, labelled');
select throws_ok($$select * from public.support_agents_list('00000000-0000-4000-8000-0000000000b0')$$, '42501', null, 'staff aren''t a tenant''s agents');
reset role;

-- A tenant's agent ------------------------------------------------------------------------------
select pg_temp.sign_in('d3');
set local role authenticated;
select is((select array_agg(user_id) from public.support_agents_list('00000000-0000-4000-8000-0000000000b0')), array[pg_temp.person('d3')], 'a tenant''s agent lists its agents');
select is((select count(*)::int from public.support_ticket_requesters(array[pg_temp.person('a1')])), 0, 'but not who wrote to the app');
select is((select count(*)::int from public.support_requester_tenants(pg_temp.person('a1'))), 0, 'nor their tenants');
reset role;

-- Nobody ----------------------------------------------------------------------------------------
select pg_temp.sign_in('e4');
set local role authenticated;
select throws_ok($$select * from public.support_agents_list()$$, '42501', null, 'a hook-named handler lists no agents');
select is((select full_name from public.support_ticket_requesters(array[pg_temp.person('a1')])), 'Person a1', 'but names the requester of a report they handle');
reset role;
drop function private.genesis_support_report_handler(uuid, uuid);
select pg_temp.sign_in('e4');
set local role authenticated;
select is((select count(*)::int from public.support_ticket_requesters(array[pg_temp.person('a1')])), 0, 'without that, someone else names nobody');
select is((select count(*)::int from public.support_requester_tenants(pg_temp.person('a1'))), 0, 'nor their tenants');
reset role;

select ok(not has_function_privilege('anon', 'public.support_ticket_requesters(uuid[])', 'execute'), 'anon can''t ask');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_person_name(uuid)', 'execute'), 'nor call the name reader');

select * from finish();
rollback;
