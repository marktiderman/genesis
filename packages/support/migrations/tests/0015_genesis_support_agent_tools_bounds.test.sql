-- @feat:support-chat
-- pgTAP test for 0015: the report labels open tickets in one call (the set-based hook) or at most
-- 1,000 calls (the one-ticket hook), and says when it stopped short; a mention is read only while
-- the mentioned agent still handles its ticket. Copy into your app's `supabase/tests/database/` and
-- run `supabase test db`. Rolls everything back; the app's hooks are replaced inside this transaction.
--
-- Tenants: d (the app's own) and ta. People: a1 a client of ta; c3 and c4 agents of ta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                else '00000000-0000-4000-8000-0000000000a0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000015' || n)::uuid $$;
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
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-bounds-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'c3', 'c4']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000015a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000015c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000015c4', '00000000-0000-4000-8000-0000000000a0')
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

-- Who the hooks were asked about, and how often.
create temp table asked (hook text, n integer);
grant select, insert on asked to public;

-- Without a hook ---------------------------------------------------------------------------

select pg_temp.sign_in('c3');
set local role authenticated;
select is(pg_temp.report() -> 'by_requester', '[]'::jsonb, 'no hook, no list');
select is(pg_temp.report() -> 'by_requester_capped', 'false'::jsonb, '... and nothing cut short');
reset role;

-- The set-based hook: one call for every open ticket ---------------------------------------

create or replace function private.genesis_support_requester_labels(reports uuid[])
returns table (report_id uuid, label text)
language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.asked values ('labels', cardinality(reports));
  return query
    select t.id, case t.title when 'b1' then 'Acme' when 'b2' then ' Acme ' else null end
      from public.tickets t where t.id = any (reports);
end $$;
revoke execute on function private.genesis_support_requester_labels(uuid[]) from public, anon, authenticated;
-- The one-ticket hook too: the set-based one wins.
create or replace function private.genesis_support_requester_label(report uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.asked values ('label', 1);
  return 'Other';
end $$;
revoke execute on function private.genesis_support_requester_label(uuid) from public, anon, authenticated;

set local role authenticated;
select is(pg_temp.report() -> 'by_requester',
          jsonb_build_array(jsonb_build_object('label', 'Acme', 'open', 2), jsonb_build_object('label', null, 'open', 1)),
          'the set-based hook labels the open tickets, trimmed, and an unlabelled one counts under none');
reset role;
select is((select count(*)::int from pg_temp.asked where hook = 'labels'), 1, 'in one call');
select is((select n from pg_temp.asked where hook = 'labels'), 3, '... with every open ticket');
select is((select count(*)::int from pg_temp.asked where hook = 'label'), 0, '... and the one-ticket hook is never called');
set local role authenticated;
select is(pg_temp.report() -> 'by_requester_capped', 'false'::jsonb, '... nothing cut short');
reset role;

-- The one-ticket hook alone: at most 1,000 calls ------------------------------------------

drop function private.genesis_support_requester_labels(uuid[]);
delete from pg_temp.asked;
-- 998 more, past the per-person report limit and the triggers that would open their conversations.
set local session_replication_role = replica;
insert into public.tickets (type, title, message, tenant_id, user_id, status)
select 'question', 'bulk' || g, 'Many', pg_temp.tenant('ta'), pg_temp.person('a1'), 'open' from generate_series(1, 998) g;
set local session_replication_role = origin;
set local role authenticated;
select is(pg_temp.report() -> 'by_requester', jsonb_build_array(jsonb_build_object('label', 'Other', 'open', 1000)),
          'with 1,001 open tickets, the one-ticket hook labels 1,000');
reset role;
select is((select count(*)::int from pg_temp.asked where hook = 'label'), 1000, '... calling it 1,000 times');
set local role authenticated;
select is(pg_temp.report() -> 'by_requester_capped', 'true'::jsonb, '... and says it stopped short');
select is((pg_temp.report() ->> 'open_now')::int, 1001, '... while open now counts them all');
reset role;

-- Mentions ----------------------------------------------------------------------------------

select pg_temp.sign_in('c3');
set local role authenticated;
select genesis_chat.send_message(pg_temp.conv((select id from public.tickets where title = 'b1')), gen_random_uuid(),
       'Can you look, @[c4](user:' || pg_temp.person('c4') || ')?', '[]', null, null, null, '{}', 'observers');
select pg_temp.sign_in('c4');
select is((select count(*)::int from public.ticket_mentions), 1, 'the mentioned agent reads their mention');
reset role;
delete from public.ticket_agents where tenant_id = pg_temp.tenant('ta') and person_id = pg_temp.person('c4');
set local role authenticated;
select is((select count(*)::int from public.ticket_mentions), 0, '... and no longer once they leave the tenant');

reset role;
select * from finish();
rollback;
