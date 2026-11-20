-- @feat:support-helpdesk
-- pgTAP test for 0029_genesis_support_desks.sql: a tenant's admin turns its desk on, a question
-- with no tenant goes to the sender's one desk that is on, a ticket goes up to the app's own desk
-- and back, each move logged, and the support.desks setting off is 0004 exactly. Rolls back.
--
-- People: a1 belongs to tenant b0; b2 is staff (the staff hook); d3 is b0's tenant admin; e4
-- belongs to b0 and c0; f5 is nobody; f6 is c0's tenant admin. Runs with genesis-config's real
-- settings tables (0020) and support 0020's readers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000024' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-desks-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000', jsonb_build_object('full_name', 'Person ' || n)
from unnest(array['a1', 'b2', 'd3', 'e4', 'f5', 'f6']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000b0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000024a1'::uuid, '00000000-0000-4000-8000-0000000024d3'::uuid,
                    '00000000-0000-4000-8000-0000000024e4'::uuid)
  union all
  select '00000000-0000-4000-8000-0000000000c0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000024e4'::uuid, '00000000-0000-4000-8000-0000000024f6'::uuid) $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000024b2'::uuid $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select (tenant = '00000000-0000-4000-8000-0000000000b0'::uuid and person = '00000000-0000-4000-8000-0000000024d3'::uuid)
      or (tenant = '00000000-0000-4000-8000-0000000000c0'::uuid and person = '00000000-0000-4000-8000-0000000024f6'::uuid) $$;
create or replace function private.genesis_tenant_label(tenant uuid) returns text
language sql stable set search_path = '' as $$
  select case tenant when '00000000-0000-4000-8000-0000000000b0'::uuid then 'Acme'
                     when '00000000-0000-4000-8000-0000000000c0'::uuid then 'Northside' end $$;

create function pg_temp.tenant_of(ticket uuid) returns uuid language sql as $$
  select tenant_id from public.tickets where id = ticket $$;
create function pg_temp.ask(n text, kind text default 'question') returns uuid language plpgsql as $$
declare _id uuid;
begin
  perform pg_temp.sign_in(n);
  set local role authenticated;
  insert into public.tickets (type, message) values (kind, 'help please') returning tickets.id into _id;
  reset role;
  return _id;
end $$;

-- 1. The switch ---------------------------------------------------------------------------------

select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000b0'), false, 'a tenant''s desk starts off');
select is(pg_temp.tenant_of(pg_temp.ask('a1')), '00000000-0000-4000-8000-00000000000f'::uuid, 'so a question goes to the app''s own desk');

select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', true)$$, '42501', null, 'only the tenant''s admins switch it');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', true)$$, '42501', null, 'not the app''s staff');
reset role;

select pg_temp.sign_in('d3');
set local role authenticated;
select lives_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', true, 'we answer our own')$$, 'its admin turns it on');
select lives_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', true)$$, 'again is nothing new');
select throws_ok($$select public.support_set_desk('00000000-0000-4000-8000-00000000000f', false)$$, '42501', null, 'never the app''s own desk');
select throws_ok($$select count(*) from public.support_desk_log$$, '42501', null, 'the log isn''t readable directly');
select is(
  (select row(label, is_default, enabled, manage)::text from public.support_my_desks() where tenant_id = '00000000-0000-4000-8000-0000000000b0'),
  row('Acme'::text, false, true, true)::text,
  'its admin works the desk, and manages it');
select is((select count(*)::int from public.support_my_desks() where is_default), 0, 'but not the app''s own');
reset role;

select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000b0'), true, 'on');
select is((select array_agg(action || ':' || coalesce(reason, '')) from public.support_desk_log), array['turned_on:we answer our own'], 'switched once, logged with why');

-- 2. Routing ------------------------------------------------------------------------------------

create temp table t (name text primary key, id uuid);
grant all on t to authenticated;
insert into t values ('a1', pg_temp.ask('a1'));
select is(pg_temp.tenant_of((select id from t where name = 'a1')), '00000000-0000-4000-8000-0000000000b0'::uuid, 'a question with no tenant goes to the sender''s desk');
select is(pg_temp.tenant_of(pg_temp.ask('a1', 'bug')), '00000000-0000-4000-8000-00000000000f'::uuid, 'a bug still goes to the app');
select is(pg_temp.tenant_of(pg_temp.ask('d3')), '00000000-0000-4000-8000-00000000000f'::uuid, 'someone who handles a desk writes to the app');

insert into public.tenant_features (tenant_id, feature_id, enabled, reason)
values ('00000000-0000-4000-8000-0000000000c0', 'support-helpdesk', true, 'test');
select is(pg_temp.tenant_of(pg_temp.ask('e4')), '00000000-0000-4000-8000-00000000000f'::uuid, 'two desks on: nothing is guessed');

create function private.genesis_support_desk_for(person uuid, ticket_type text) returns uuid
language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000c0'::uuid where person = '00000000-0000-4000-8000-0000000024e4'::uuid $$;
insert into t values ('e4', pg_temp.ask('e4'));
select is(pg_temp.tenant_of((select id from t where name = 'e4')), '00000000-0000-4000-8000-0000000000c0'::uuid, 'the app''s hook decides when it answers');
drop function private.genesis_support_desk_for(uuid, text);

-- 3. Escalate and return -----------------------------------------------------------------------

update public.tickets set status = 'pending' where id = (select id from t where name = 'a1');

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok($$select public.support_escalate_ticket((select id from t where name = 'a1'))$$, '42501', null, 'the app''s staff can''t take a desk''s ticket');
reset role;

select pg_temp.sign_in('d3');
set local role authenticated;
select is(
  (select row(label, is_default, can_escalate, can_return)::text from public.support_ticket_desk((select id from t where name = 'a1'))),
  row('Acme'::text, false, true, false)::text,
  'the desk sees where it is, and that it can go up');
select throws_ok($$update public.tickets set tenant_id = '00000000-0000-4000-8000-00000000000f' where id = (select id from t where name = 'a1')$$,
  '42501', null, 'a ticket still keeps its tenant when written directly');
select lives_ok($$select public.support_escalate_ticket((select id from t where name = 'a1'), 'needs a refund')$$, 'its admin sends it up');
select is((select count(*)::int from public.support_ticket_desk((select id from t where name = 'a1'))), 0, 'and no longer handles it');
select throws_ok($$select public.support_escalate_ticket((select id from t where name = 'a1'))$$, '42501', null, 'nor sends it again');
reset role;

select is(
  (select row(tenant_id, status, staff_read_at)::text from public.tickets where id = (select id from t where name = 'a1')),
  row('00000000-0000-4000-8000-00000000000f'::uuid, 'open'::text, null::timestamptz)::text,
  'at the app''s desk, open again and unread');

select pg_temp.sign_in('b2');
set local role authenticated;
select is(
  (select row(is_default, can_escalate, can_return, returns_to_label, last_action, last_by_name, last_reason)::text
     from public.support_ticket_desk((select id from t where name = 'a1'))),
  row(true, false, true, 'Acme'::text, 'escalated'::text, 'Person d3'::text, 'needs a refund'::text)::text,
  'staff see it came up from Acme, and can hand it back');
select is((select array_agg(label) from public.support_desk_move_targets((select id from t where name = 'a1'))), array['Acme'], 'the person''s desk that is on is where it can go');
select is((select array_agg(label || ':' || role) from public.support_requester_tenants(pg_temp.person('a1'))), array['Acme:member'], 'staff see the requester''s tenants with their role');
select throws_ok($$select public.support_move_ticket((select id from t where name = 'a1'), '00000000-0000-4000-8000-0000000000c0')$$, '55000', null, 'never to a desk the person isn''t in');
select lives_ok($$select public.support_return_ticket((select id from t where name = 'a1'), 'refunded')$$, 'staff hand it back');
select throws_ok($$select public.support_return_ticket((select id from t where name = 'a1'))$$, '42501', null, 'and then it is the desk''s');
reset role;

select is(pg_temp.tenant_of((select id from t where name = 'a1')), '00000000-0000-4000-8000-0000000000b0'::uuid, 'back at Acme');
select is(
  (select array_agg(action || '>' || to_tenant::text order by id) from public.support_desk_log where ticket_id = (select id from t where name = 'a1')),
  array['escalated>00000000-0000-4000-8000-00000000000f', 'returned>00000000-0000-4000-8000-0000000000b0'],
  'each move logged');

create function private.genesis_tenant_role(tenant uuid, person uuid) returns text
language sql stable set search_path = '' as $$ select 'Client' $$;
select pg_temp.sign_in('d3');
set local role authenticated;
select is((select array_agg(label || ':' || role) from public.support_requester_tenants(pg_temp.person('a1'))), array['Acme:Client'], 'the app''s role hook names it');
select is((select count(*)::int from public.support_desk_history('00000000-0000-4000-8000-0000000000b0')), 3, 'the desk''s admin reads its history');
reset role;
select pg_temp.sign_in('f5');
set local role authenticated;
select throws_ok($$select * from public.support_desk_history('00000000-0000-4000-8000-0000000000b0')$$, '42501', null, 'nobody else does');
reset role;

-- 4. Between two tenants' desks --------------------------------------------------------------------

-- e4 writes to Acme; Northside's desk is on (tenant_features, from section 2).
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
with x as (insert into public.tickets (user_id, type, message, tenant_id)
           values (pg_temp.person('e4'), 'question', 'private to Acme', '00000000-0000-4000-8000-0000000000b0') returning id)
insert into t select 'e4b', id from x;

select pg_temp.sign_in('d3');
set local role authenticated;
select is((select array_agg(coalesce(label, 'app') order by is_default desc) from public.support_desk_move_targets((select id from t where name = 'e4b'))), array['app'],
  'Acme''s admin is offered the app''s desk, never Northside, which they aren''t in');
select throws_ok($$select public.support_move_ticket((select id from t where name = 'e4b'), '00000000-0000-4000-8000-0000000000c0', 'internal: a difficult one')$$,
  '42501', null, 'nor can move it there');
select lives_ok($$select public.support_escalate_ticket((select id from t where name = 'e4b'), 'please take it')$$, 'escalating to the app''s own desk stays allowed');
reset role;

select is((select c.tenant_id from genesis_chat.conversations c where c.id = private.genesis_support_chat_conversation_of((select id from t where name = 'e4b'))),
  '00000000-0000-4000-8000-00000000000f'::uuid, 'the conversation moves with the ticket');
select lives_ok($$select private.genesis_support_chat_ensure(x) from public.tickets x where x.id = (select id from t where name = 'e4b')$$,
  'so ensuring it again still works');

-- A move between the two desks (staff may), with words for Acme only.
select pg_temp.sign_in('b2');
set local role authenticated;
select lives_ok($$select public.support_move_ticket((select id from t where name = 'e4b'), '00000000-0000-4000-8000-0000000000c0', 'internal: the app''s note')$$,
  'the app''s staff move it to Northside');
reset role;
insert into public.support_desk_log (tenant_id, ticket_id, to_tenant, action, reason, actor)
values ('00000000-0000-4000-8000-0000000000b0', (select id from t where name = 'e4b'), '00000000-0000-4000-8000-0000000000c0', 'moved', 'internal: Acme only', pg_temp.person('d3'));
select pg_temp.sign_in('f6');
set local role authenticated;
select is((select row(reason, actor, actor_name)::text from public.support_desk_history('00000000-0000-4000-8000-0000000000c0') where action = 'moved' and tenant_id = '00000000-0000-4000-8000-0000000000b0'),
  row(null::text, null::uuid, null::text)::text, 'Northside never reads Acme''s words or who moved it');
select is((select last_reason from public.support_ticket_desk((select id from t where name = 'e4b'))), null, 'nor in the ticket''s desk card');
reset role;
select pg_temp.sign_in('d3');
set local role authenticated;
select is((select reason from public.support_desk_history('00000000-0000-4000-8000-0000000000b0') where action = 'moved' limit 1), 'internal: Acme only', 'Acme still does');
reset role;

-- 4b. The log's own order (one transaction: every `at` the same) -------------------------------------

insert into public.support_desk_log (tenant_id, ticket_id, to_tenant, action, actor)
values ('00000000-0000-4000-8000-0000000000c0', (select id from t where name = 'e4b'), '00000000-0000-4000-8000-00000000000f', 'escalated', null),
       ('00000000-0000-4000-8000-0000000000b0', (select id from t where name = 'e4b'), '00000000-0000-4000-8000-00000000000f', 'escalated', null);
select is(private.genesis_support_returns_to((select id from t where name = 'e4b')), '00000000-0000-4000-8000-0000000000b0'::uuid,
  'the desk that sent it up last, by the log''s order');

-- 5. The settings, through genesis-supabase's resolver (private.genesis_setting, 0023) ----------------

-- The synced catalogue (writeAppManifest): the keys and their defaults by preset.
insert into public.genesis_app_manifest (app_id, catalogue) values ('desks-test', '{"support.agentDesk": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": true, "standard": true, "min": false}}, "support.helpCenter": {"type": "boolean", "applies": "runtime", "scope": "tenant", "defaults": {"max": true, "standard": true, "min": false}}, "support.desks": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": true, "standard": false, "min": false}}}');
insert into public.genesis_settings (key, value) values ('support.agentDesk', 'false');
select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok($$select * from public.support_agent_tickets()$$, '42501', null, 'support.agentDesk off: no agent reads a queue');
select is((select count(*)::int from public.support_my_desks()), 0, 'nor works a desk');
select is((select count(*)::int from public.support_ticket_desk((select id from t where name = 'a1'))), 0, 'nor reads a ticket''s desk');
reset role;
select is(private.genesis_support_desks_on(), false, 'and desks need the agent desk');
delete from public.genesis_settings where key = 'support.agentDesk';

insert into public.genesis_settings (key, value) values ('support.helpCenter', 'false');
select pg_temp.sign_in('a1');
set local role authenticated;
select is(public.support_help_readable('00000000-0000-4000-8000-00000000000f'), false, 'support.helpCenter off: nobody reads help');
reset role;
delete from public.genesis_settings where key = 'support.helpCenter';

-- support.helpCenter is tenant-scoped: a tenant's own value turns its help center off, and only its.
insert into public.genesis_tenant_settings (tenant_id, key, value) values ('00000000-0000-4000-8000-00000000000f', 'support.helpCenter', 'false');
select pg_temp.sign_in('a1');
set local role authenticated;
select is(public.support_help_readable('00000000-0000-4000-8000-00000000000f'), false, 'a tenant''s own support.helpCenter false closes its help center on the server');
reset role;
select is(private.genesis_support_help_center_on('00000000-0000-4000-8000-0000000000b0'), true, 'another tenant''s stays on');
insert into public.genesis_settings (key, value, locked) values ('support.helpCenter', 'true', true);
select is(private.genesis_support_help_center_on('00000000-0000-4000-8000-00000000000f'), true, 'a lock in the database layer holds over the tenant''s value');
delete from public.genesis_settings where key = 'support.helpCenter';
delete from public.genesis_tenant_settings where key = 'support.helpCenter';

-- support.aiAnswers is tenant-scoped too: a tenant's own false turns its AI answers off.
create schema if not exists genesis_ai;
create table if not exists genesis_ai.budgets (scope text primary key, monthly_usd numeric);
insert into genesis_ai.budgets (scope, monthly_usd) values ('default', 50) on conflict (scope) do update set monthly_usd = 50;
insert into public.tenant_features (tenant_id, feature_id, enabled, reason)
values ('00000000-0000-4000-8000-0000000000c0', 'support-helpdesk-ai', true, 'test');
update public.genesis_app_manifest set catalogue = catalogue || '{"support.aiAnswers": {"type": "boolean", "applies": "runtime", "scope": "tenant", "defaults": {"max": true, "standard": false, "min": false}}}';
select is(private.genesis_support_ai_on('00000000-0000-4000-8000-0000000000c0'), true, 'a tenant that opted in, with a budget, has AI answers');
insert into public.genesis_tenant_settings (tenant_id, key, value) values ('00000000-0000-4000-8000-0000000000c0', 'support.aiAnswers', 'false');
select is(private.genesis_support_ai_on('00000000-0000-4000-8000-0000000000c0'), false, 'its own support.aiAnswers false turns them off on the server');
delete from public.genesis_tenant_settings where key = 'support.aiAnswers';

insert into public.genesis_settings (key, value) values ('support.desks', 'false');
select is(private.genesis_support_desks_on(), false, 'support.desks false in genesis_settings turns desks off');
select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000b0'), false, 'desks off: a desk row counts for nothing');
select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000c0'), true, 'and tenant_features decides, as in 0004');
create function private.genesis_support_desk_for(person uuid, ticket_type text) returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-0000000000c0'::uuid $$;
select is(pg_temp.tenant_of(pg_temp.ask('e4')), '00000000-0000-4000-8000-00000000000f'::uuid, 'and nothing is routed, the app''s hook included');
drop function private.genesis_support_desk_for(uuid, text);
select pg_temp.sign_in('d3');
set local role authenticated;
select throws_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', false)$$, '55000', null, 'nobody switches a desk');
reset role;
delete from public.genesis_settings where key = 'support.desks';
update public.genesis_app_manifest set preset = 'standard';
select is(private.genesis_support_desks_on(), false, 'the standard preset has desks off (its default in the synced catalogue)');

-- 6. The requester's desks ---------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
select ok((select bool_and(t.user_id = pg_temp.person('a1')) from public.support_my_ticket_desks() m join public.tickets t on t.id = m.ticket_id),
  'a requester sees only their own tickets'' desks');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select is((select label from public.support_my_ticket_desks() where ticket_id = (select id from t where name = 'a1')), 'Acme',
  'named through the app''s tenant label hook');
select is((select count(*)::int from public.support_my_ticket_desks() where tenant_id = '00000000-0000-4000-8000-00000000000f' and label is not null), 0,
  'the app''s own desk has no name');
reset role;

select ok(not has_function_privilege('anon', 'public.support_set_desk(uuid, boolean, text)', 'execute'), 'anon can''t switch a desk');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_move(uuid, uuid, text, text)', 'execute'), 'nor move a ticket by the back door');

select * from finish();
rollback;
