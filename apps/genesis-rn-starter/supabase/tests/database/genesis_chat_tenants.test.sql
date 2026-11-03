-- @feat:chat
-- pgTAP test for 0004_genesis_chat_tenants.sql (with 0001–0003 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Writes only its own users, tenants, kinds and conversations, and rolls everything back. It
-- stands in its own private.genesis_viewer_people for the length of the test (yours comes back
-- with the rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c4' || n)::uuid, 'authenticated', 'authenticated', 'genesis-chat4-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c4' || n)::uuid $$;
create function pg_temp.tenant(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(text), pg_temp.sign_in(text) to authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert on t to authenticated, service_role;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated, service_role;

-- Tenancy: a1 and b2 share t1 and t2; c3 is only in t3; d4 is staff in t1; e5 is staff in t2.
create table public.genesis_chat4_test_people (user_id uuid, tenant_id uuid, staff boolean default false);
insert into public.genesis_chat4_test_people values
  (pg_temp.person('a1'), pg_temp.tenant('01'), false), (pg_temp.person('a1'), pg_temp.tenant('02'), false),
  (pg_temp.person('b2'), pg_temp.tenant('01'), false), (pg_temp.person('b2'), pg_temp.tenant('02'), false),
  (pg_temp.person('c3'), pg_temp.tenant('03'), false),
  (pg_temp.person('d4'), pg_temp.tenant('01'), true),
  (pg_temp.person('e5'), pg_temp.tenant('02'), true);
create schema if not exists private;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select p.tenant_id, p.user_id from public.genesis_chat4_test_people p where p.user_id = viewer
$$;

create function public.genesis_chat4_test_may_start(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select true $$;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.genesis_chat4_test_may_start(uuid[], text, text, uuid)');
select genesis_chat.register_kind('group', 'Group', p_membership => 'admins',
  p_start_check => 'public.genesis_chat4_test_may_start(uuid[], text, text, uuid)');

-- A help desk kind: staff observe and post; a ticket's tenant comes from its resolver.
create table public.genesis_chat4_test_tickets (id text primary key, tenant_id uuid);
insert into public.genesis_chat4_test_tickets values ('T-1', pg_temp.tenant('01')), ('T-2', pg_temp.tenant('01'));
create function public.genesis_chat4_test_ticket_tenant(subject_id text) returns uuid language sql stable set search_path = '' as $$
  select k.tenant_id from public.genesis_chat4_test_tickets k where k.id = subject_id $$;
create function public.genesis_chat4_test_staff(conversation_id uuid, user_id uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.genesis_chat4_test_people p where p.user_id = genesis_chat4_test_staff.user_id and p.staff) $$;
select genesis_chat.register_kind('desk', 'Help desk', p_max_members => 2,
  p_observer_check => 'public.genesis_chat4_test_staff(uuid, uuid)', p_observers_post => true);

-- ── The column ────────────────────────────────────────────────────────────────

select ok((select attnotnull from pg_attribute where attrelid = 'genesis_chat.conversations'::regclass and attname = 'tenant_id'),
          'every conversation has a tenant');

-- ── Tenants of people ─────────────────────────────────────────────────────────

select is((select array_agg(x order by x) from genesis_chat.tenants_of(pg_temp.person('a1')) x),
          array[pg_temp.tenant('01'), pg_temp.tenant('02')], 'a person''s tenants come from the app''s hook');
select is((select array_agg(x order by x) from genesis_chat.shared_tenants(array[pg_temp.person('a1'), pg_temp.person('d4')]) x),
          array[pg_temp.tenant('01')], 'the tenants people share');
select is((select count(*)::integer from genesis_chat.shared_tenants(array[pg_temp.person('a1'), pg_temp.person('c3')])), 0,
          'and none when they share none');

-- ── Starting conversations ────────────────────────────────────────────────────

select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]) $$, '22023', null,
  'people who share several tenants choose which one');
insert into t select 'dm1', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')], p_tenant_id => pg_temp.tenant('01'));
insert into t select 'dm2', genesis_chat.start_conversation('direct', array[pg_temp.person('b2')], p_tenant_id => pg_temp.tenant('02'));
select isnt(pg_temp.v('dm1'), pg_temp.v('dm2'), 'a direct conversation is one per pair per tenant');
select is(genesis_chat.start_conversation('direct', array[pg_temp.person('b2')], p_tenant_id => pg_temp.tenant('01')), pg_temp.v('dm1'),
          'and found again in its tenant');
select pg_temp.sign_in('b2');
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('dm2')), pg_temp.tenant('02'), 'in the tenant chosen');
select pg_temp.sign_in('a1');
insert into t select 'dm3', genesis_chat.start_conversation('direct', array[pg_temp.person('d4')]);
select pg_temp.sign_in('d4');
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('dm3')), pg_temp.tenant('01'),
          'people who share one tenant start there without choosing');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('c3')]) $$, '42501', null,
  'people with no tenant in common can''t start one');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('d4')], p_tenant_id => pg_temp.tenant('02')) $$, '42501', null,
  'nor in a tenant one of them isn''t in');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('b2')], p_tenant_id => pg_temp.tenant('03')) $$, '42501', null,
  'nor in a tenant neither of them is in');

-- ── Adding people ─────────────────────────────────────────────────────────────

insert into t select 'grp', genesis_chat.start_conversation('group', array[pg_temp.person('b2')], 'Crew', p_tenant_id => pg_temp.tenant('02'));
select throws_ok($$ select genesis_chat.add_members(pg_temp.v('grp'), array[pg_temp.person('d4')]) $$, '42501', null,
  'only people of the conversation''s tenant are added');
select lives_ok($$ select genesis_chat.add_members(pg_temp.v('grp'), array[pg_temp.person('e5')]) $$,
  'people of its tenant are');

-- ── Kinds that cross tenants ──────────────────────────────────────────────────

reset role;
select throws_ok($$ select genesis_chat.register_kind('pen_pal', 'Pen pal', p_cross_tenant => true,
                      p_observer_check => 'public.genesis_chat4_test_staff(uuid, uuid)') $$, '22023', null,
  'a kind that crosses tenants has no observers');
select genesis_chat.register_kind('pen_pal', 'Pen pal', p_membership => 'admins', p_cross_tenant => true,
  p_start_check => 'public.genesis_chat4_test_may_start(uuid[], text, text, uuid)');
select pg_temp.sign_in('c3');
insert into t select 'pp', genesis_chat.start_conversation('pen_pal', array[pg_temp.person('a1')], 'Letters');
select pg_temp.sign_in('a1');
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('pp')), pg_temp.tenant('03'),
          'people with no tenant in common start one in the starter''s tenant, where the kind allows it');
select throws_ok($$ select genesis_chat.start_conversation('pen_pal', array[pg_temp.person('c3')]) $$, '22023', null,
  'a starter in several tenants chooses one of theirs');
select lives_ok($$ select genesis_chat.start_conversation('pen_pal', array[pg_temp.person('c3')], p_tenant_id => pg_temp.tenant('02')) $$,
  'and may choose any of their own');
select throws_ok($$ select genesis_chat.start_conversation('pen_pal', array[pg_temp.person('c3')], p_tenant_id => pg_temp.tenant('03')) $$, '42501', null,
  'but not one only the others are in');
select pg_temp.sign_in('c3');
select lives_ok($$ select genesis_chat.add_members(pg_temp.v('pp'), array[pg_temp.person('e5')]) $$,
  'and people from anywhere are added');

-- ── Subjects ──────────────────────────────────────────────────────────────────

reset role;
select throws_ok($$ select genesis_chat.register_subject('desk', 'ticket', 'public.genesis_chat4_test_staff(uuid, uuid)') $$, '22023', null,
  'a resolver takes (subject_id text) and returns the tenant');
-- A conversation made before the type was renamed: it's found under its old name.
insert into genesis_chat.conversations (kind, tenant_id, subject_type, subject_id) values ('desk', pg_temp.tenant('01'), 'support_report', 'T-2');
select lives_ok($$ select genesis_chat.register_subject('desk', 'ticket', 'public.genesis_chat4_test_ticket_tenant(text)', array['support_report']) $$,
  'a subject type registers with its resolver and older names');
select throws_ok($$ select genesis_chat.register_subject('desk', 'case', 'public.genesis_chat4_test_ticket_tenant(text)', array['ticket']) $$, '23505', null,
  'one name is one type within a kind');

insert into t select 'tk1', genesis_chat.ensure_conversation('desk', 'support_report', 'T-1', 'Printer');
select is((select subject_type from genesis_chat.conversations where id = pg_temp.v('tk1')), 'ticket',
          'a conversation made under an older name is stored under the type''s own');
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('tk1')), pg_temp.tenant('01'),
          'in the tenant its resolver names');
select is(genesis_chat.ensure_conversation('desk', 'ticket', 'T-1'), pg_temp.v('tk1'), 'and found again under either name');
select is(genesis_chat.ensure_conversation('desk', 'ticket', 'T-2'),
          (select id from genesis_chat.conversations where kind = 'desk' and subject_id = 'T-2'),
          'one made before the rename is found, not made twice');
select throws_ok($$ select genesis_chat.ensure_conversation('desk', 'ticket', 'T-404') $$, '22023', null,
  'a record the resolver doesn''t know has no conversation');
select throws_ok($$ select genesis_chat.ensure_conversation('desk', 'ticket', 'T-1', p_tenant_id => pg_temp.tenant('02')) $$, '22023', null,
  'a tenant that isn''t the record''s is refused');
select throws_ok($$ select genesis_chat.ensure_conversation('desk', 'invoice', 'I-1') $$, '22023', null,
  'an unregistered type needs its tenant');
select lives_ok($$ select genesis_chat.ensure_conversation('desk', 'invoice', 'I-1', p_tenant_id => pg_temp.tenant('03')) $$,
  'and takes it');
create function private.genesis_chat_resolve_order(subject_id text) returns uuid language sql stable set search_path = '' as $$
  select case when subject_id = 'O-1' then '00000000-0000-4000-8000-000000000402'::uuid end $$;
insert into t select 'ord', genesis_chat.ensure_conversation('desk', 'order', 'O-1');
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('ord')),
          pg_temp.tenant('02'), 'or a resolver named for the type names it');
select throws_ok($$ select genesis_chat.ensure_conversation('desk', 'order', 'O-404') $$, '22023', null,
  'and a record that resolver doesn''t know has no conversation');
select throws_ok($$ select genesis_chat.ensure_conversation('desk', 'Bad Type!', 'x', p_tenant_id => pg_temp.tenant('01')) $$, '22023', null,
  'an unregistered subject type must still be a type name');

-- start_conversation uses the same resolver for an unregistered type, and checks first.
create function public.genesis_chat4_test_never(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable set search_path = '' as $$ select false $$;
select genesis_chat.register_kind('closed', 'Closed', p_start_check => 'public.genesis_chat4_test_never(uuid[], text, text, uuid)');
select pg_temp.sign_in('a1');
insert into t select 'og', genesis_chat.start_conversation('group', array[pg_temp.person('b2')], 'Order chat', 'order', 'O-1');
reset role;
select is((select tenant_id from genesis_chat.conversations where id = pg_temp.v('og')), pg_temp.tenant('02'),
          'starting one about an unregistered type takes its resolver''s tenant');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.start_conversation('group', array[pg_temp.person('b2')], null, 'order', 'O-404') $$, '22023', null,
  'and refuses a record that resolver doesn''t know');
select throws_ok($$ select genesis_chat.start_conversation('closed', array[pg_temp.person('b2')], null, 'order', 'O-404') $$, '42501', null,
  'a start check that says no is answered first, saying nothing about the record');
reset role;

-- ── Observers ─────────────────────────────────────────────────────────────────

-- d4 (staff in t1) reported T-1 themselves; a1 is its member too, so it's both of theirs.
select genesis_chat.sync_members(pg_temp.v('tk1'), array[pg_temp.person('d4')], 'member');
insert into t select 'tk3', genesis_chat.ensure_conversation('desk', 'invoice', 'I-9', p_tenant_id => pg_temp.tenant('01'));
select genesis_chat.sync_members(pg_temp.v('tk3'), array[pg_temp.person('a1')], 'member');

select ok(genesis_chat.observes(pg_temp.v('tk3'), pg_temp.person('d4')), 'staff of the conversation''s tenant observe it');
select ok(not genesis_chat.observes(pg_temp.v('tk3'), pg_temp.person('e5')), 'staff of another tenant don''t');
select ok(not genesis_chat.observes(pg_temp.v('tk1'), pg_temp.person('d4')), 'a member is never also an observer, staff or not');
select genesis_chat.sync_members(pg_temp.v('tk1'), array[]::uuid[], 'member');
select ok(not genesis_chat.observes(pg_temp.v('tk1'), pg_temp.person('d4')), 'nor once they''ve left');

-- An internal note in a conversation a staff member opened themselves stays out of their reach.
select pg_temp.sign_in('d4');
select genesis_chat.send_message(pg_temp.v('tk3'), gen_random_uuid(), 'Check the toner', p_visibility => 'observers');
select genesis_chat.send_message(pg_temp.v('tk3'), gen_random_uuid(), 'On it');
select pg_temp.sign_in('a1');
select is((select count(*)::integer from genesis_chat.messages where conversation_id = pg_temp.v('tk3')), 1,
          'the member reads the reply, not the internal note');

-- A kind whose own check decides by the record's tenant turns chat's tenant gate off: staff the
-- tenancy hook doesn't list for this tenant still observe, and a member still never does.
reset role;
select genesis_chat.register_kind('desk_app', 'App help desk', p_max_members => 2,
  p_observer_check => 'public.genesis_chat4_test_staff(uuid, uuid)', p_observers_post => true,
  p_observer_tenant_gate => false);
insert into t select 'app1', genesis_chat.ensure_conversation('desk_app', 'invoice', 'I-50', p_tenant_id => pg_temp.tenant('01'));
select genesis_chat.sync_members(pg_temp.v('app1'), array[pg_temp.person('e5')], 'member');
insert into t select 'app2', genesis_chat.ensure_conversation('desk_app', 'invoice', 'I-51', p_tenant_id => pg_temp.tenant('01'));
select ok(genesis_chat.observes(pg_temp.v('app2'), pg_temp.person('e5')),
          'with the gate off, the kind''s check decides: staff of another tenant observe');
select ok(not genesis_chat.observes(pg_temp.v('app1'), pg_temp.person('e5')),
          'but a member is still never an observer');
select ok(not genesis_chat.observes(pg_temp.v('app2'), pg_temp.person('a1')),
          'and the kind''s check still says no to non-staff');

-- Registering it again without the argument keeps the gate it has.
select genesis_chat.register_kind('desk_app', 'App help desk', p_max_members => 2,
  p_observer_check => 'public.genesis_chat4_test_staff(uuid, uuid)', p_observers_post => true);
select is((select observer_tenant_gate from genesis_chat.kinds where kind = 'desk_app'), false,
          'registering a kind again without the gate argument keeps its gate');

-- A block that registered its kind before this migration turns the gate off by convention.
create function private.genesis_chat_ungated_desk_conv() returns boolean language sql as $$ select true $$;
select genesis_chat.register_kind('desk_conv', 'Convention desk', p_max_members => 2,
  p_observer_check => 'public.genesis_chat4_test_staff(uuid, uuid)');
select is((select observer_tenant_gate from genesis_chat.kinds where kind = 'desk_conv'), false,
          'private.genesis_chat_ungated_<kind>() returning true turns the gate off');
select is((select observer_tenant_gate from genesis_chat.kinds where kind = 'desk'), true,
          'and a kind without one keeps the gate on');

-- ── Without the hook ──────────────────────────────────────────────────────────

reset role;
drop function private.genesis_viewer_people(uuid);
select is((select count(*)::integer from genesis_chat.tenants_of(pg_temp.person('a1'))), 0, 'without the hook nobody belongs to a tenant');
select ok(not genesis_chat.observes(pg_temp.v('tk3'), pg_temp.person('d4')), 'so nobody observes');
select pg_temp.sign_in('a1');
select throws_ok($$ select genesis_chat.start_conversation('direct', array[pg_temp.person('b2')]) $$, '42501', null,
  'and nobody starts one');

-- ── Privileges ────────────────────────────────────────────────────────────────

reset role;
select ok(not has_function_privilege('authenticated', 'genesis_chat.register_subject(text, text, regprocedure, text[])', 'execute')
          and not has_function_privilege('anon', 'genesis_chat.register_subject(text, text, regprocedure, text[])', 'execute'),
          'only the server registers subjects');
select ok(not has_function_privilege('authenticated', 'genesis_chat.tenants_of(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'genesis_chat.ensure_conversation(text, text, text, text, jsonb, uuid)', 'execute'),
          'nobody signed in asks about anyone''s tenants or ensures a conversation');

select * from finish();
rollback;
