-- @feat:support-desks
-- pgTAP test for 0024_genesis_support_desks.sql: a tenant's admin turns its desk on, a question
-- with no tenant goes to the sender's one desk that is on, a ticket goes up to the app's own desk
-- and back, each move logged, and the support.desks setting off is 0004 exactly. Rolls back.
--
-- People: a1 belongs to tenant b0; b2 is staff (the staff hook); d3 is b0's tenant admin; e4
-- belongs to b0 and c0; f5 is nobody.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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
from unnest(array['a1', 'b2', 'd3', 'e4', 'f5']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000b0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000024a1'::uuid, '00000000-0000-4000-8000-0000000024d3'::uuid,
                    '00000000-0000-4000-8000-0000000024e4'::uuid)
  union all
  select '00000000-0000-4000-8000-0000000000c0'::uuid, viewer
   where viewer = '00000000-0000-4000-8000-0000000024e4'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000024b2'::uuid $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-8000-0000000000b0'::uuid and person = '00000000-0000-4000-8000-0000000024d3'::uuid $$;
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

-- 4. support.desks off ---------------------------------------------------------------------------

create or replace function private.genesis_support_setting(setting_key text) returns jsonb
language sql stable set search_path = '' as $$ select case when setting_key = 'support.desks' then 'false'::jsonb end $$;
select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000b0'), false, 'desks off: a desk row counts for nothing');
select is(private.genesis_support_helpdesk_on('00000000-0000-4000-8000-0000000000c0'), true, 'and tenant_features decides, as in 0004');
select pg_temp.sign_in('d3');
set local role authenticated;
select throws_ok($$select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', false)$$, '55000', null, 'nobody switches a desk');
reset role;

select ok(not has_function_privilege('anon', 'public.support_set_desk(uuid, boolean, text)', 'execute'), 'anon can''t switch a desk');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_move(uuid, uuid, text, text)', 'execute'), 'nor move a ticket by the back door');

select * from finish();
rollback;
