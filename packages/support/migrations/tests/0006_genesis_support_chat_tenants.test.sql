-- @feat:support-chat
-- pgTAP test for 0006_genesis_support_chat_tenants.sql (after 0004 and 0001). Copy into your
-- app's `supabase/tests/database/` and run `supabase test db`. Rolls everything back; the app's
-- hooks are replaced inside this transaction only.
--
-- Tenants and people as in 0004's test: c3 an agent of ta, e5 an agent of tb, f6 the app's staff.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
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
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
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
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.person('e5'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

-- A ticket in ta and one in the app's own tenant, each with its conversation.
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'Chat in ta', 'Hello', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'Chat in d', 'Hello', pg_temp.tenant('d'));
reset role;
insert into ids select 'ta1', id from public.tickets where title = 'Chat in ta';
insert into ids select 'td1', id from public.tickets where title = 'Chat in d';
create function pg_temp.conv(n text) returns uuid language sql stable as $$
  select c.id from genesis_chat.conversations c where c.kind = 'support' and c.subject_id = pg_temp.id(n)::text $$;

select isnt(pg_temp.conv('ta1'), null, 'a ticket gets its conversation');
select ok(private.genesis_support_chat_observer(pg_temp.conv('ta1'), pg_temp.person('c3')),
          'an agent of the ticket''s business observes it (reads internal notes, may post)');
select ok(not private.genesis_support_chat_observer(pg_temp.conv('ta1'), pg_temp.person('e5')),
          'an agent of another business does not');
select ok(not private.genesis_support_chat_observer(pg_temp.conv('ta1'), pg_temp.person('f6')),
          'nor the app''s staff');
select ok(private.genesis_support_chat_observer(pg_temp.conv('td1'), pg_temp.person('f6')),
          'the app''s staff observe the app''s own tickets');

select throws_ok($$ update genesis_chat.conversations set assignee_id = pg_temp.person('e5') where id = pg_temp.conv('ta1') $$,
                 '42501', null, 'a ticket is assigned only to an agent of its business');
select lives_ok($$ update genesis_chat.conversations set assignee_id = pg_temp.person('c3') where id = pg_temp.conv('ta1') $$,
                'an agent of its business may have it');

-- Messages, notes and message reports stay inside the business ---------------------------------
select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta1'), gen_random_uuid(), 'An internal note', '[]', null, null, null, '{}', 'observers') $$,
                'an agent of the business writes an internal note on its ticket');
select ok(exists (select 1 from genesis_chat.messages where conversation_id = pg_temp.conv('ta1') and body = 'An internal note'),
          '... and reads it');
reset role;
insert into ids select 'note', id from genesis_chat.messages where body = 'An internal note';

select pg_temp.sign_in('e5');
set local role authenticated;
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.conv('ta1')), 0,
          'an agent of another business reads none of its messages');
select throws_ok($$ select genesis_chat.send_message(pg_temp.conv('ta1'), gen_random_uuid(), 'Butting in', '[]', null, null, null, '{}', 'everyone') $$,
                 null, null, '... and cannot post in it');
select throws_ok($$ select genesis_chat.report_message(pg_temp.id('note'), 'spam') $$, '42501', null,
                 '... nor report its messages');
select is(public.support_chat_conversation(pg_temp.id('ta1')), null, '... nor find its conversation');
reset role;

select pg_temp.sign_in('f6');
set local role authenticated;
select is((select count(*)::int from genesis_chat.messages where conversation_id = pg_temp.conv('ta1')), 0,
          'the app''s staff read none of a business''s messages');
reset role;
select ok(private.genesis_support_chat_is_staff(pg_temp.person('f6')) and not private.genesis_support_chat_is_staff(pg_temp.person('c3')),
          'the old chat staff check now means an agent of the app''s own tenant only');

select is(private.genesis_chat_resolve_support_report(pg_temp.id('ta1')::text), pg_temp.tenant('ta'),
          'chat can resolve a ticket conversation''s tenant');
select is(private.genesis_chat_resolve_support_report('not-a-ticket'), null, '... and nothing for anything else');

-- In any app, after every migration (whatever order they ran in): no support conversation sits
-- outside its ticket's tenant.
select is((select count(*)::int from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text
            where c.kind = 'support' and c.subject_type = 'support_report'
              and to_jsonb(c) ? 'tenant_id' and (to_jsonb(c)->>'tenant_id')::uuid is distinct from t.tenant_id), 0,
          'every support conversation is in its ticket''s tenant');

select * from finish();
rollback;
