-- @feat:custom-fields
-- pgTAP test for 0005_genesis_work_fields.sql (needs genesis-supabase 0009 and genesis-work 0001 to
-- 0004 applied first). It writes only its own users, tenants, teams and hooks and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- People: a1 (tenant 1's lead) and b2 on tenant 1's team t1; c3 in tenant 2.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-fields-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.team(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000000' || n)::uuid $$;
create function pg_temp.pursuit(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-b000-00000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.team(int), pg_temp.pursuit(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

create table public.genesis_test_members (tenant_id uuid, team_id uuid, person uuid, lead boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.team(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(2), null, pg_temp.person('c3'), true);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select m.tenant_id, m.team_id from public.genesis_test_members m where m.person = viewer and m.team_id is not null
  union all
  select m.tenant_id, m.tenant_id from public.genesis_test_members m where m.person = viewer
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when team_id is not null then exists (select 1 from public.genesis_test_members m
      where m.tenant_id = tenant and m.team_id = genesis_owner_can.team_id and m.person = viewer)
    when organization_id is not null then exists (select 1 from public.genesis_test_members m
      where m.tenant_id = tenant and m.person = viewer and (action = 'read' or m.lead))
    else false
  end
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

insert into genesis_work.pursuits (id, tenant_id, team_id, title) values (pg_temp.pursuit(1), pg_temp.tenant(1), pg_temp.team(1), 'Open a second site');

-- Shape -------------------------------------------------------------------------------------
select has_table('genesis_work', 'field_definitions', 'field_definitions exists');
select has_column('genesis_work', 'pursuits', 'custom', 'pursuits have custom values');
select has_column('genesis_work', 'session_details', 'custom', 'sessions have custom values, with their details');
select ok(not has_table_privilege('anon', 'genesis_work.field_definitions', 'select,insert'), 'anon has no privilege');

-- Defining fields ---------------------------------------------------------------------------
select pg_temp.sign_in('a1');
select lives_ok(
  $$ insert into genesis_work.field_definitions (tenant_id, target, key, label, field)
     values (pg_temp.tenant(1), 'pursuits', 'region', 'Region', '{"type": "single-choice", "props": {"options": ["North", "South"]}}') $$,
  'the tenant''s lead adds a field');
select is((select field_type from genesis_work.field_definitions where key = 'region'), 'single-choice', 'the field type comes from the field');
select pg_temp.sign_in('b2');
select throws_ok(
  $$ insert into genesis_work.field_definitions (tenant_id, target, key, label, field)
     values (pg_temp.tenant(1), 'pursuits', 'budget', 'Budget', '{"type": "number"}') $$,
  '42501', null, 'someone who can''t write the tenant''s rows doesn''t add fields');
select is((select count(*)::int from genesis_work.field_definitions), 1, 'a team member reads the tenant''s fields');
select pg_temp.sign_in('a1');
select throws_ok(
  $$ insert into genesis_work.field_definitions (tenant_id, target, namespace, key, label, field)
     values (pg_temp.tenant(1), 'pursuits', 'my-app', 'level', 'Level', '{"type": "short-text"}') $$,
  '42501', null, 'only server code adds an app''s fields');
select throws_ok(
  $$ insert into genesis_work.field_definitions (tenant_id, target, key, label, field)
     values (pg_temp.tenant(1), 'pursuits', 'mood', 'Mood', '{"type": "slider"}') $$,
  '23514', null, 'a field type is one genesis-forms knows');
select pg_temp.as_server();
insert into genesis_work.field_definitions (tenant_id, target, namespace, key, label, field, source_pack, source_version, source_key)
values (pg_temp.tenant(1), 'pursuits', 'my-app', 'level', 'Level', '{"type": "short-text"}', 'team-rhythm', '1.0.0', 'level');

-- Values ------------------------------------------------------------------------------------
select pg_temp.sign_in('b2');
select lives_ok(
  $$ update genesis_work.pursuits set custom = '{"tenant.region": "North"}' where id = pg_temp.pursuit(1) $$,
  'a team member sets a custom value');
select is((select custom ->> 'tenant.region' from genesis_work.pursuits where id = pg_temp.pursuit(1)), 'North', 'the value is stored');
select throws_ok(
  $$ update genesis_work.pursuits set custom = custom || '{"tenant.region": 7}' where id = pg_temp.pursuit(1) $$,
  '22023', null, 'a value has its field''s shape');
select throws_ok(
  $$ update genesis_work.pursuits set custom = custom || '{"tenant.color": "red"}' where id = pg_temp.pursuit(1) $$,
  '22023', null, 'a key with no field is refused');
select throws_ok(
  $$ update genesis_work.pursuits set custom = custom || '{"my-app.level": "company"}' where id = pg_temp.pursuit(1) $$,
  '42501', null, 'a signed-in person doesn''t write an app''s field');
select pg_temp.as_server();
select lives_ok(
  $$ update genesis_work.pursuits set custom = custom || '{"my-app.level": "company"}' where id = pg_temp.pursuit(1) $$,
  'server code writes an app''s field');
select pg_temp.sign_in('b2');
select throws_ok(
  $$ update genesis_work.pursuits set custom = '{"tenant.region": "South"}' where id = pg_temp.pursuit(1) $$,
  '42501', null, 'a signed-in person doesn''t remove an app''s value');
select lives_ok(
  $$ update genesis_work.pursuits set custom = custom || '{"tenant.region": "South"}' where id = pg_temp.pursuit(1) $$,
  'changing the tenant''s own value keeps the app''s');

-- Retiring and changing fields ---------------------------------------------------------------
select pg_temp.sign_in('a1');
select throws_ok(
  $$ update genesis_work.field_definitions set field = '{"type": "number"}' where key = 'region' $$,
  '22023', null, 'a field''s type is fixed once rows hold values for it');
select throws_ok($$ delete from genesis_work.field_definitions where key = 'region' $$,
  '22023', null, 'a field rows hold values for is retired, not deleted');
select lives_ok($$ update genesis_work.field_definitions set active = false where key = 'region' $$, 'retiring a field');
select lives_ok(
  $$ update genesis_work.pursuits set title = 'Open two sites' where id = pg_temp.pursuit(1) $$,
  'rows holding a retired field''s value can still be edited');

select lives_ok(
  $$ insert into genesis_work.field_definitions (tenant_id, target, key, label, field, source_pack, source_version)
     values (pg_temp.tenant(1), 'work_items', 'tags', 'Tags', '{"type": "list"}', 'spoofed', '9.9.9') $$,
  'the lead adds a list field');
select is((select source_pack from genesis_work.field_definitions where key = 'tags'), null, 'a person can''t claim a field came from a pack');

select pg_temp.sign_in('c3');
select is((select count(*)::int from genesis_work.field_definitions), 0, 'another tenant sees no fields');

select * from finish();
rollback;
