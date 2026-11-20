-- @feat:support-feedback
-- pgTAP test for 0026_genesis_support_diagnostics_access.sql: a dump sent with a business's ticket is
-- read by that business's agents, not by the app's platform-admin staff; a dump with no ticket is
-- staff's. Rolls back.
--
-- People: a1 belongs to tenant t1 (help desk on) and files there; d2 is t1's agent; c3 is staff
-- (the staff hook); e4 is nobody.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000026' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.dump() returns jsonb language sql immutable as $$
  select '{"schema": "genesis.diagnostics/1", "trigger": "manual"}'::jsonb $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-dumps-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'd2', 'c3', 'e4']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000026b0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000026a1'::uuid, '00000000-0000-4000-8000-0000000026d2'::uuid) $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000026c3'::uuid $$;
create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason)
values ('00000000-0000-4000-8000-0000000026b0', 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = excluded.enabled;
insert into public.ticket_agents (tenant_id, person_id, role) values ('00000000-0000-4000-8000-0000000026b0', pg_temp.person('d2'), 'agent');

-- a1 files in t1, with a dump; a1 also sends a dump with no ticket.
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, message, tenant_id) values ('bug', 'to t1', '00000000-0000-4000-8000-0000000026b0');
insert into public.support_diagnostics (id, feedback_id, trigger, report)
select '26000000-0000-4000-8000-000000000001', t.id, 'feedback', pg_temp.dump() from public.tickets t where t.message = 'to t1';
insert into public.support_diagnostics (id, trigger, report) values ('26000000-0000-4000-8000-000000000002', 'shake', pg_temp.dump());
select is((select count(*)::int from public.support_diagnostics), 2, 'the sender reads both their dumps');
reset role;

select pg_temp.sign_in('d2');
set local role authenticated;
select is((select array_agg(id) from public.support_diagnostics), array['26000000-0000-4000-8000-000000000001'::uuid], 't1''s agent reads t1''s dump, and not the one with no ticket');
select is((select count(*)::int from public.support_diagnostics_by_short_id('26000000')), 1, 'and finds it by short id');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select is((select array_agg(id) from public.support_diagnostics), array['26000000-0000-4000-8000-000000000002'::uuid], 'staff read the dump with no ticket, not t1''s');
select is((select array_agg(feedback_id) from public.support_diagnostics_by_short_id('26000000')), array[null::uuid], 'and the short-id lookup hides t1''s too');
reset role;

-- With 0023's default, platform admins are staff: the same holds for them.
drop function private.genesis_support_staff(uuid);
create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000026e4'::uuid $$;
select pg_temp.sign_in('e4');
set local role authenticated;
select is(public.support_is_staff(), true, 'a platform admin is staff with no staff hook');
select ok(not exists (select 1 from public.support_diagnostics where id = '26000000-0000-4000-8000-000000000001'), 'a platform admin doesn''t read t1''s dump');
select ok(exists (select 1 from public.support_diagnostics where id = '26000000-0000-4000-8000-000000000002'), 'but reads the one with no ticket');
reset role;

select ok(not has_function_privilege('anon', 'public.support_dump_readable(uuid)', 'execute'), 'anon can''t ask');

select * from finish();
rollback;
