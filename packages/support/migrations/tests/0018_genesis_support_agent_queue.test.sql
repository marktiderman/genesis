-- @feat:support-chat
-- pgTAP test for 0018_genesis_support_agent_queue.sql: the queue as a list a provider pages and
-- counts, past 50 tickets, for a tenant's agents only. Copy into your app's
-- `supabase/tests/database/` and run `supabase test db`. Rolls everything back.
--
-- Tenants: d (the app's own), ta and tb. People: a1 a client of ta; b2 a client of tb; c3 and c4
-- agents of ta; e5 an agent of tb; f6 the app's staff; c9 the admin of ta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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


-- 60 tickets in ta from a1, every tenth one solved and every one ending in 5 pending (0013's
-- status: waiting on the requester); one in tb.
-- A person files at most 20 an hour (0006's limit), so the test files them in three hours.
select pg_temp.sign_in('a1');
do $$
begin
  for batch in 0..2 loop
    set local role authenticated;
    insert into public.tickets (type, title, message, tenant_id)
    select 'question', 'queue ' || n, 'Ticket ' || n, '00000000-0000-4000-8000-0000000000a0'::uuid from generate_series(batch * 20 + 1, batch * 20 + 20) as n;
    reset role;
    update private.support_rate_events set at = at - interval '2 hours';
  end loop;
end $$;
set local role authenticated;
select pg_temp.sign_in('b2');
insert into public.tickets (type, title, message, tenant_id) values ('question', 'queue tb', 'In tb', pg_temp.tenant('tb'));
reset role;
update public.tickets set status = 'addressed' where title ~ '^queue [0-9]*0$';
update public.tickets set status = 'pending' where title ~ '^queue [0-9]*5$';

select ok(not has_function_privilege('anon', 'public.support_agent_queue(uuid, text)', 'execute'), 'anon cannot read the queue');
select ok(has_function_privilege('authenticated', 'public.support_agent_queue(uuid, text)', 'execute'), 'a signed-in agent can');

set local role authenticated;
select pg_temp.sign_in('c3');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'all') q where q.title like 'queue %'), 60, 'every ticket, past 50: no limit of its own');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'unassigned') q where q.title like 'queue %'), 48, 'unassigned holds the active ones: not pending, not closed');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'pending') q where q.title like 'queue %'), 6, 'pending holds the tickets waiting on the requester');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'closed') q where q.title like 'queue %'), 6, 'closed holds the addressed ones');
select is(
  (select array_agg(v || ':' || array_to_string(array(select q.id::text from public.support_agent_queue(pg_temp.tenant('ta'), v) q order by q.id), ',') order by v)
     from unnest(array['all', 'closed', 'mine', 'pending', 'unassigned']) v),
  (select array_agg(v || ':' || array_to_string(array(select q.id::text from public.support_agent_tickets(pg_temp.tenant('ta'), v, null, null, 200) q order by q.id), ',') order by v)
     from unnest(array['all', 'closed', 'mine', 'pending', 'unassigned']) v),
  'each view holds exactly the tickets 0013''s support_agent_tickets puts in it');
select is(
  (select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'all') q
     join public.support_agent_tickets(pg_temp.tenant('ta'), 'all', null, null, 200) t using (id)
    where q.waiting_since is not distinct from t.waiting_since),
  60,
  'waiting_since is support_agent_tickets'' for every ticket (null for pending and closed ones)');
select is(public.support_agent_unread_count(pg_temp.tenant('ta')), 48, 'the unread badge counts active tickets only: a pending one waits on the requester');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'all') q where q.title like 'queue %' and q.status = 'addressed'), 6, 'a status filter over it sees the old tickets too');
select is((select count(*)::int from (select * from public.support_agent_queue(pg_temp.tenant('ta'), 'all') q where q.title like 'queue %' offset 50 limit 25) p), 10, 'a page past row 50 holds the rest');
select is(
  (select array_agg(n order by n) from (select (regexp_replace(q.title, '\D', '', 'g'))::int as n from public.support_agent_queue(pg_temp.tenant('ta'), 'all') q where q.title like 'queue %') x),
  (select array_agg(n order by n) from generate_series(1, 60) n),
  'every ticket once');
select is((select count(*)::int from public.support_agent_queue(pg_temp.tenant('ta'), 'mine') q where q.title like 'queue %'), 0, 'mine: nothing assigned to me yet');
select ok((select bool_and(q.agent_unread) from public.support_agent_queue(pg_temp.tenant('ta'), 'unassigned') q where q.title like 'queue %'), 'each new ticket is unread for agents');
select throws_ok($$ select * from public.support_agent_queue('00000000-0000-4000-8000-0000000000b0', 'all') $$, '42501', null, 'an agent of another tenant is refused');
select pg_temp.sign_in('a1');
select throws_ok($$ select * from public.support_agent_queue('00000000-0000-4000-8000-0000000000a0', 'all') $$, '42501', null, 'a requester is refused');
select pg_temp.sign_in('c3');
select throws_ok($$ select * from public.support_agent_queue('00000000-0000-4000-8000-0000000000a0', 'nope') $$, '22023', null, 'an unknown view is refused');
reset role;

select * from finish();
rollback;
