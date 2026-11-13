-- @feat:support-feedback
-- pgTAP test for 0011_genesis_support_ticket_fixes.sql: the Data Studio's keys follow the rename,
-- and an agent's unread count. Copy into your app's `supabase/tests/database/` and run
-- `supabase test db`. Rolls everything back; the app's hooks are replaced inside this transaction.
--
-- Tenants: d (the app's own), ta and tb. People: a1 a client of ta; b2 a client of tb; c3 an agent
-- of ta; e5 an agent of tb.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-fixes-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000004c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004e5', '00000000-0000-4000-8000-0000000000b0')
  ) as t(login, tenant_id) where t.login = viewer $$;
drop function if exists private.genesis_tenant_admin(uuid, uuid);
drop function if exists private.genesis_support_report_handler(uuid, uuid);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;

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

-- 1. The Data Studio's keys ---------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'private.genesis_support_rename_studio_keys()', 'execute'), 'nobody signed in rewrites the studio''s keys');

create schema if not exists genesis_studio;
create table if not exists genesis_studio.audit_log (
  id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default clock_timestamp(),
  actor text, actor_claims jsonb, resource text not null, record_key jsonb not null, action text not null, before jsonb, after jsonb);
insert into genesis_studio.audit_log (resource, record_key, action) values
  ('public.support_reports', '"r1"', 'update'),
  ('public.support_attachments', '"a1"', 'create'),
  ('public.goals', '"g1"', 'update');

select is(private.genesis_support_rename_studio_keys(), 2, 'the old names move');
select is((select array_agg(resource order by resource) from genesis_studio.audit_log where record_key in ('"r1"', '"a1"', '"g1"')),
          array['public.goals', 'public.ticket_attachments', 'public.tickets'], '... to tickets and ticket_attachments, and nothing else moves');
select is(private.genesis_support_rename_studio_keys(), 0, 'running it again changes nothing');

-- 2. An agent's unread count --------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'fix-ta1', 'Unread in ta', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'fix-ta2', 'Read in ta', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'fix-ta3', 'Closed in ta', pg_temp.tenant('ta'));
select pg_temp.sign_in('b2');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'fix-tb1', 'Unread in tb', pg_temp.tenant('tb'));
reset role;
update public.tickets set staff_read_at = now() + interval '1 minute' where title = 'fix-ta2';
update public.tickets set status = 'addressed' where title = 'fix-ta3';

set local role authenticated;
select pg_temp.sign_in('c3');
select is(public.support_agent_unread_count(pg_temp.tenant('ta')), 1, 'an agent counts the open tickets nobody has read');
select pg_temp.sign_in('e5');
select is(public.support_agent_unread_count(pg_temp.tenant('tb')), 1, 'each tenant its own');
select throws_ok($$ select public.support_agent_unread_count('00000000-0000-4000-8000-0000000000a0') $$, '42501', null, 'an agent of another tenant can''t ask');
select pg_temp.sign_in('a1');
select throws_ok($$ select public.support_agent_unread_count('00000000-0000-4000-8000-0000000000a0') $$, '42501', null, 'nor can a requester');
reset role;

-- A requester's new message makes a read ticket unread again.
update public.tickets set last_user_reply_at = now() + interval '2 minutes' where title = 'fix-ta2';
set local role authenticated;
select pg_temp.sign_in('c3');
select is(public.support_agent_unread_count(pg_temp.tenant('ta')), 2, 'a new message from the requester is unread again');
reset role;

select ok(not has_function_privilege('anon', 'public.support_agent_unread_count(uuid)', 'execute'), 'anon can''t ask');
select ok(has_function_privilege('authenticated', 'public.support_agent_unread_count(uuid)', 'execute'), 'a signed-in agent can');

select * from finish();
rollback;
