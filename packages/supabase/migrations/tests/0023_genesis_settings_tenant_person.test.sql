-- @feat:settings
-- pgTAP test for 0023_genesis_settings_tenant_person.sql (after 0020 and 0021).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, manifest, settings and hooks and rolls everything back. If your app
-- already has the hooks or a manifest, they are replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(109);

-- People: a1 a platform admin; aa the admin of tenant A, ab a member of A; bb the admin of tenant B;
-- c1 and c2 signed in, in no tenant.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-scoped-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'aa', 'ab', 'bb', 'c1', 'c2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(text), pg_temp.sign_in(text), pg_temp.sign_out() to anon, authenticated, service_role;

drop function if exists private.genesis_platform_admin(uuid);
drop function if exists private.genesis_tenant_admin(uuid, uuid);
drop function if exists private.genesis_tenant_member(uuid, uuid);
delete from public.genesis_settings;
delete from public.genesis_app_manifest;
delete from public.genesis_tenant_settings;
delete from public.genesis_person_settings;

-- Realtime: record what is sent, so the broadcasts can be read back.
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$;
grant select on realtime.messages to authenticated;

insert into public.genesis_app_manifest (app_id, preset, file_settings, catalogue) values (
  'sample-app', 'max',
  '{"demo.fileLocked": {"value": true, "locked": true}}',
  '{
    "demo.theme": {"type": "string", "applies": "runtime", "scope": "app"},
    "demo.banner": {"type": "boolean", "applies": "runtime", "scope": "tenant"},
    "demo.limit": {"type": "number", "applies": "runtime", "scope": "tenant", "min": 1, "max": 10, "integer": true},
    "demo.fileLocked": {"type": "boolean", "applies": "runtime", "scope": "tenant"},
    "demo.dbLocked": {"type": "boolean", "applies": "runtime", "scope": "tenant"},
    "demo.buildKey": {"type": "boolean", "applies": "build", "scope": "tenant"},
    "demo.shake": {"type": "boolean", "applies": "runtime", "scope": "person"},
    "demo.personLocked": {"type": "boolean", "applies": "runtime", "scope": "person"}
  }'
);
insert into public.genesis_settings (key, value, locked) values ('demo.dbLocked', 'false', true), ('demo.personLocked', 'true', true);

-- Shape and privileges ------------------------------------------------------------------------
select has_table('public', 'genesis_tenant_settings', 'genesis_tenant_settings exists');
select has_table('public', 'genesis_person_settings', 'genesis_person_settings exists');
select has_table('public', 'genesis_scoped_setting_changes', 'genesis_scoped_setting_changes exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.genesis_tenant_settings'::regclass, 'public.genesis_person_settings'::regclass, 'public.genesis_scoped_setting_changes'::regclass)),
  'RLS is on for all three tables'
);
select ok(
  not has_table_privilege('anon', 'public.genesis_tenant_settings', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.genesis_person_settings', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.genesis_scoped_setting_changes', 'select,insert,update,delete,truncate'),
  'anon has no privilege on any of them'
);
select ok(
  not has_table_privilege('authenticated', 'public.genesis_tenant_settings', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_person_settings', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_scoped_setting_changes', 'insert,update,delete,truncate'),
  'authenticated can only select: every write goes through a function'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.genesis_tenant_settings'::regclass, 'public.genesis_person_settings'::regclass, 'public.genesis_scoped_setting_changes'::regclass) and a.grantee = 0
  ),
  'public has no grant on any of them'
);
select ok(
  not has_function_privilege('anon', 'public.set_genesis_tenant_setting(uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.clear_genesis_tenant_setting(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_genesis_person_setting(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.clear_genesis_person_setting(text)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_settings_layers(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_settings_can_read(uuid, uuid, boolean)', 'execute'),
  'anon can call none of the functions'
);
select ok(
  not has_function_privilege('authenticated', 'private.genesis_settings_tenant_admin(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_scoped_setting_problem(text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_settings_announce()', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_record_scoped_setting_change()', 'execute'),
  'the private helpers are for the functions only'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.set_genesis_tenant_setting(uuid, text, jsonb)'::regprocedure,
     'public.clear_genesis_tenant_setting(uuid, text)'::regprocedure,
     'public.set_genesis_person_setting(text, jsonb)'::regprocedure,
     'public.clear_genesis_person_setting(text)'::regprocedure,
     'public.genesis_settings_layers(uuid)'::regprocedure,
     'public.genesis_settings_can_read(uuid, uuid, boolean)'::regprocedure,
     'private.genesis_settings_tenant_admin(uuid)'::regprocedure,
     'private.genesis_scoped_setting_problem(text, text, jsonb)'::regprocedure,
     'private.genesis_settings_announce()'::regprocedure,
     'private.genesis_record_scoped_setting_change()'::regprocedure
   )),
  'every function is security definer with search_path = '''''
);
select is(public.genesis_settings_layers() ? 'tenant' or public.genesis_settings_layers() ? 'person', false, '0020''s genesis_settings_layers() answers as before');

-- Fails closed without the tenant-admin hook ----------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('aa');
select throws_ok(
  $$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'true') $$,
  '42501', null,
  'without private.genesis_tenant_admin, nobody can set a tenant value'
);
reset role;

-- The hooks: a1 is a platform admin; aa admins tenant A, bb tenant B; ab is a member of A.
create table private.genesis_test_platform_admins (person uuid primary key);
insert into private.genesis_test_platform_admins values (pg_temp.person('a1'));
create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_platform_admins a where a.person = $1)
$$;
create table private.genesis_test_members (tenant uuid, person uuid, admin boolean);
insert into private.genesis_test_members values
  (pg_temp.tenant('a'), pg_temp.person('aa'), true),
  (pg_temp.tenant('a'), pg_temp.person('ab'), false),
  (pg_temp.tenant('b'), pg_temp.person('bb'), true);
create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = $1 and m.person = $2 and m.admin)
$$;
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = $1 and m.person = $2)
$$;
revoke execute on function private.genesis_platform_admin(uuid), private.genesis_tenant_admin(uuid, uuid), private.genesis_tenant_member(uuid, uuid) from public, anon, authenticated;

-- Tenant writes ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('aa');
select lives_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'true') $$, 'a tenant admin sets a tenant-scope key for their tenant');
select lives_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.limit', '5') $$, '... and another');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('b'), 'demo.banner', 'true') $$, '42501', null, '... but not for another tenant');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.theme', '"dark"') $$, '22023', null, 'an app-scope key is refused in the tenant layer');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.shake', 'true') $$, '22023', null, '... and a person-scope key');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.fileLocked', 'false') $$, '22023', null, 'a key genesis.config.json locks is refused');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.dbLocked', 'true') $$, '22023', null, 'a key the database layer locks is refused');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.buildKey', 'true') $$, '22023', null, 'a build-time key is refused');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.limit', '11') $$, '22023', null, 'a value out of bounds is refused');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.limit', '2.5') $$, '22023', null, '... and a fraction for a whole number');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', '"yes"') $$, '22023', null, '... and the wrong type');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.nothing', 'true') $$, '22023', null, '... and an undeclared key');
select pg_temp.sign_in('ab');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false') $$, '42501', null, 'a member who isn''t an admin can''t set tenant values');
select pg_temp.sign_in('a1');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false') $$, '42501', null, 'a platform admin reads tenant values but doesn''t set them');
select pg_temp.sign_out();
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false') $$, '42501', null, 'nobody signed in: refused');
reset role;
set local role anon;
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false') $$, '42501', null, 'anon can''t call it');
reset role;

-- Person writes ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('c1');
select lives_ok($$ select public.set_genesis_person_setting('demo.shake', 'false') $$, 'a person sets a person-scope key for themselves');
select throws_ok($$ select public.set_genesis_person_setting('demo.banner', 'true') $$, '22023', null, 'a tenant-scope key is refused in the person layer');
select throws_ok($$ select public.set_genesis_person_setting('demo.theme', '"dark"') $$, '22023', null, '... and an app-scope key');
select throws_ok($$ select public.set_genesis_person_setting('demo.personLocked', 'false') $$, '22023', null, 'a key the database layer locks is refused');
select throws_ok($$ select public.set_genesis_person_setting('demo.shake', '1') $$, '22023', null, 'the wrong type is refused');
select pg_temp.sign_in('c2');
select lives_ok($$ select public.set_genesis_person_setting('demo.shake', 'true') $$, 'another person sets their own');
select pg_temp.sign_out();
select throws_ok($$ select public.set_genesis_person_setting('demo.shake', 'true') $$, '42501', null, 'nobody signed in: refused');
reset role;
set local role anon;
select throws_ok($$ select public.set_genesis_person_setting('demo.shake', 'true') $$, '42501', null, 'anon can''t call it');
reset role;
select is(
  (select value from public.genesis_person_settings where person_id = pg_temp.person('c1') and key = 'demo.shake'),
  'false'::jsonb,
  'the value is stored for the person who set it'
);

-- Direct writes are refused ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('aa');
select throws_ok($$ insert into public.genesis_tenant_settings (tenant_id, key, value) values (pg_temp.tenant('a'), 'demo.limit', '9') $$, '42501', null, 'a tenant admin can''t insert a row directly');
select throws_ok($$ update public.genesis_tenant_settings set value = 'false' $$, '42501', null, '... nor update one');
select pg_temp.sign_in('c1');
select throws_ok($$ insert into public.genesis_person_settings (person_id, key, value) values (pg_temp.person('c1'), 'demo.shake', 'true') $$, '42501', null, 'a person can''t insert their row directly');
select throws_ok($$ delete from public.genesis_person_settings $$, '42501', null, '... nor delete one');

-- Reads: RLS --------------------------------------------------------------------------------
select pg_temp.sign_in('ab');
select is((select count(*)::int from public.genesis_tenant_settings), 2, 'a member of A reads A''s two values');
select is((select count(*)::int from public.genesis_scoped_setting_changes), 0, '... but not A''s history: only its admins read who changed what');
select pg_temp.sign_in('aa');
select is((select count(*)::int from public.genesis_tenant_settings), 2, 'A''s admin reads them too');
select is((select count(*)::int from public.genesis_person_settings), 0, '... but no one''s person values');
select is((select count(*)::int from public.genesis_scoped_setting_changes), 2, 'A''s admin reads A''s history, and no person''s');
select pg_temp.sign_in('bb');
select is((select count(*)::int from public.genesis_tenant_settings), 0, 'B''s admin can''t read A''s values');
select is((select count(*)::int from public.genesis_scoped_setting_changes), 0, '... nor A''s history');
select pg_temp.sign_in('c1');
select is((select count(*)::int from public.genesis_tenant_settings), 0, 'a person in no tenant reads no tenant values');
select is((select count(*)::int from public.genesis_person_settings), 1, '... and only their own person value');
select is((select count(*)::int from public.genesis_scoped_setting_changes), 1, '... and only their own history');
select pg_temp.sign_in('a1');
select is((select count(*)::int from public.genesis_tenant_settings), 2, 'a platform admin reads every tenant value');
select is((select count(*)::int from public.genesis_person_settings), 2, '... every person value');
select is((select count(*)::int from public.genesis_scoped_setting_changes), 4, '... and all the history');
select pg_temp.sign_out();
select is((select count(*)::int from public.genesis_person_settings), 0, 'nobody signed in reads nothing');
reset role;

-- The layers ------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('ab');
select is(public.genesis_settings_layers(pg_temp.tenant('a')) -> 'tenant', '{"demo.banner": {"value": true}, "demo.limit": {"value": 5}}'::jsonb, 'a member gets their tenant''s layer');
select is(public.genesis_settings_layers(pg_temp.tenant('a')) -> 'person', '{}'::jsonb, '... and their own (empty) person layer');
select is(public.genesis_settings_layers(null) -> 'tenant', '{}'::jsonb, 'without a tenant, the tenant layer is empty');
select is(public.genesis_settings_layers(null) -> 'database', '{"demo.dbLocked": {"value": false, "locked": true}, "demo.personLocked": {"value": true, "locked": true}}'::jsonb, '... and the database layer is as before');
select pg_temp.sign_in('bb');
select throws_ok($$ select public.genesis_settings_layers(pg_temp.tenant('a')) $$, '42501', null, 'B''s admin can''t read A''s layer');
select pg_temp.sign_in('c1');
select throws_ok($$ select public.genesis_settings_layers(pg_temp.tenant('a')) $$, '42501', null, '... nor can a person outside A');
select is(public.genesis_settings_layers(null) -> 'person', '{"demo.shake": {"value": false}}'::jsonb, 'a person gets their own person layer');
select pg_temp.sign_in('a1');
select is((select count(*)::int from jsonb_object_keys(public.genesis_settings_layers(pg_temp.tenant('a')) -> 'tenant')), 2, 'a platform admin reads any tenant''s layer');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from jsonb_object_keys(public.genesis_settings_layers(pg_temp.tenant('a')) -> 'tenant')), 2, 'server code reads a tenant''s layer');
select is(public.genesis_settings_layers(null) -> 'person', '{}'::jsonb, '... and has no person layer');
reset role;
-- A key that moved out of the tenant scope is no longer served.
update public.genesis_app_manifest set catalogue = jsonb_set(catalogue, '{demo.limit,scope}', '"app"');
set local role authenticated;
select pg_temp.sign_in('ab');
select is(public.genesis_settings_layers(pg_temp.tenant('a')) -> 'tenant', '{"demo.banner": {"value": true}}'::jsonb, 'only keys still declared scope "tenant" are in the tenant layer');
reset role;
update public.genesis_app_manifest set catalogue = jsonb_set(catalogue, '{demo.limit,scope}', '"tenant"');

-- History ---------------------------------------------------------------------------------------
select is(
  (select row(c.layer, c.tenant_id, c.person_id, c.old_value, c.new_value, c.changed_by, c.changed_role)::text
   from public.genesis_scoped_setting_changes c where c.key = 'demo.banner'),
  row('tenant', pg_temp.tenant('a'), null::uuid, null::jsonb, 'true'::jsonb, pg_temp.person('aa'), 'authenticated')::text,
  'a tenant change is kept: layer, tenant, old and new value, who'
);
set local role authenticated;
select pg_temp.sign_in('aa');
select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'true');
reset role;
select is((select count(*)::int from public.genesis_scoped_setting_changes where key = 'demo.banner'), 1, 'saving the same value again records nothing');

-- Clearing ------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_in('bb');
select throws_ok($$ select public.clear_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner') $$, '42501', null, 'B''s admin can''t clear A''s value');
select pg_temp.sign_in('aa');
select lives_ok($$ select public.clear_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner') $$, 'A''s admin clears it');
select pg_temp.sign_in('c1');
select lives_ok($$ select public.clear_genesis_person_setting('demo.shake') $$, 'a person clears their own value');
reset role;
select is((select count(*)::int from public.genesis_tenant_settings where key = 'demo.banner'), 0, 'the tenant value is gone');
select is((select count(*)::int from public.genesis_person_settings where person_id = pg_temp.person('c1')), 0, '... and the person''s');
select is((select count(*)::int from public.genesis_person_settings where person_id = pg_temp.person('c2')), 1, '... but not another person''s');
select is(
  (select row(c.old_value, c.new_value)::text from public.genesis_scoped_setting_changes c where c.key = 'demo.banner' order by c.id desc limit 1),
  row('true'::jsonb, null::jsonb)::text,
  'clearing is kept in the history'
);

-- Realtime -----------------------------------------------------------------------------------
select ok(
  exists (select 1 from realtime.messages m where m.topic = 'genesis-settings:tenant:' || pg_temp.tenant('a') and m.payload = '{"layer": "tenant", "key": "demo.limit"}' and m.private),
  'a tenant change is broadcast on the tenant''s private channel, with the layer and key'
);
select ok(
  exists (select 1 from realtime.messages m where m.topic = 'genesis-settings:person:' || pg_temp.person('c1') and m.payload = '{"layer": "person", "key": "demo.shake"}'),
  'a person change on the person''s channel'
);
select ok(
  not exists (select 1 from realtime.messages m where m.topic like 'genesis-settings%' and m.payload ? 'value'),
  'no broadcast carries a value'
);
insert into public.genesis_settings (key, value) values ('demo.theme', '"dark"');
select ok(
  exists (select 1 from realtime.messages m where m.topic = 'genesis-settings' and m.payload = '{"layer": "database", "key": "demo.theme"}'),
  'a database-layer change on genesis-settings'
);
set local role authenticated;
select pg_temp.sign_in('ab');
select set_config('realtime.topic', 'genesis-settings:tenant:' || pg_temp.tenant('a'), true);
select ok((select count(*) from realtime.messages) > 0, 'a member of A may listen on A''s channel');
select pg_temp.sign_in('bb');
select is((select count(*)::int from realtime.messages), 0, 'B''s admin may not');
select pg_temp.sign_in('a1');
select ok((select count(*) from realtime.messages) > 0, 'a platform admin may');
select pg_temp.sign_in('c2');
select set_config('realtime.topic', 'genesis-settings:person:' || pg_temp.person('c1'), true);
select is((select count(*)::int from realtime.messages), 0, 'a person may not listen on another person''s channel');
select pg_temp.sign_in('c1');
select ok((select count(*) from realtime.messages) > 0, '... but on their own');
select set_config('realtime.topic', 'genesis-settings', true);
select ok((select count(*) from realtime.messages) > 0, 'anyone signed in may listen on genesis-settings');
select pg_temp.sign_out();
select is((select count(*)::int from realtime.messages), 0, '... nobody signed in may not');
reset role;

-- A value moved to another tenant: both tenants hear of it --------------------------------------
delete from realtime.messages;
update public.genesis_tenant_settings set tenant_id = pg_temp.tenant('b') where tenant_id = pg_temp.tenant('a') and key = 'demo.limit';
select ok(
  exists (select 1 from realtime.messages m where m.topic = 'genesis-settings:tenant:' || pg_temp.tenant('a') and m.payload = '{"layer": "tenant", "key": "demo.limit"}'),
  'a value moved off a tenant is announced to the old tenant'
);
select ok(
  exists (select 1 from realtime.messages m where m.topic = 'genesis-settings:tenant:' || pg_temp.tenant('b') and m.payload = '{"layer": "tenant", "key": "demo.limit"}'),
  '... and to the new one'
);

-- A deleted tenant, with the foreign keys the header recommends ---------------------------------
create table public.genesis_test_tenants (id uuid primary key);
insert into public.genesis_test_tenants values (pg_temp.tenant('a')), (pg_temp.tenant('b'));
alter table public.genesis_tenant_settings add foreign key (tenant_id) references public.genesis_test_tenants (id) on delete cascade;
alter table public.genesis_scoped_setting_changes add foreign key (tenant_id) references public.genesis_test_tenants (id) on delete cascade;
set local role authenticated;
select pg_temp.sign_in('aa');
select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false');
reset role;
select lives_ok($$ delete from public.genesis_test_tenants where id = pg_temp.tenant('a') $$, 'a tenant with a setting can be deleted');
select is((select count(*)::int from public.genesis_tenant_settings where tenant_id = pg_temp.tenant('a')), 0, 'its values went with it');
select is((select count(*)::int from public.genesis_scoped_setting_changes where tenant_id = pg_temp.tenant('a')), 0, '... and its history');

-- A deleted person takes their values and history with them ------------------------------------
delete from auth.users where id = pg_temp.person('c2');
select is((select count(*)::int from public.genesis_person_settings where person_id = pg_temp.person('c2')), 0, 'a deleted person''s values are gone');
select is((select count(*)::int from public.genesis_scoped_setting_changes where person_id = pg_temp.person('c2')), 0, '... and their history');

-- The server's reader: private.genesis_setting, as resolveSettings resolves ------------------------
update public.genesis_app_manifest set preset = 'standard',
  file_settings = file_settings || '{"res.count": 4, "res.pinned": {"value": 2, "locked": true}, "res.build": false}',
  catalogue = catalogue || '{
    "res.on": {"type": "boolean", "applies": "runtime", "scope": "tenant", "defaults": {"max": true, "standard": false, "min": false}},
    "res.count": {"type": "number", "applies": "runtime", "scope": "app", "integer": true, "min": 1, "max": 9, "defaults": {"max": 5, "standard": 5, "min": 5}},
    "res.pinned": {"type": "number", "applies": "runtime", "scope": "tenant", "defaults": {"max": 1, "standard": 1, "min": 1}},
    "res.build": {"type": "boolean", "applies": "build", "scope": "app", "defaults": {"max": true, "standard": true, "min": true}}
  }';
select is(private.genesis_setting('res.on'), 'false'::jsonb, 'the preset''s default, from the synced catalogue');
insert into public.genesis_tenant_settings (tenant_id, key, value)
values (pg_temp.tenant('b'), 'res.on', 'true'), (pg_temp.tenant('b'), 'res.count', '7'), (pg_temp.tenant('b'), 'res.pinned', '3');
select is(private.genesis_setting('res.on', pg_temp.tenant('b')), 'true'::jsonb, 'a tenant-scoped key takes the tenant''s value');
select is(private.genesis_setting('res.on'), 'false'::jsonb, '... only for that tenant');
select is(private.genesis_setting('res.count'), '4'::jsonb, 'the file over the default');
insert into public.genesis_settings (key, value) values ('res.count', '6'), ('res.build', 'true');
select is(private.genesis_setting('res.count', pg_temp.tenant('b')), '6'::jsonb, 'the database over the file, and an app-scoped key ignores a tenant''s value');
update public.genesis_settings set value = '2.5' where key = 'res.count';
select is(private.genesis_setting('res.count'), '4'::jsonb, 'a value that doesn''t fit (a fraction) is skipped');
select is(private.genesis_setting('res.pinned', pg_temp.tenant('b')), '2'::jsonb, 'a value the file locks holds over the tenant''s');
select is(private.genesis_setting('res.build'), 'false'::jsonb, 'a build-time key takes only the file''s value');
select ok(private.genesis_setting('res.unknown') is null, 'a key the catalogue doesn''t declare: null, for the caller''s fallback');
select is((select row(layer, locked)::text from private.genesis_setting_entry('res.pinned', pg_temp.tenant('b'))), row('file', true)::text,
  'the entry says which layer gave the value and that it is locked');
select is((select layer from private.genesis_setting_entry('res.on')), 'preset', '... and when only the preset''s default applies');
select is(private.genesis_setting_problem('res.count', '2.5'), 'res.count must be a whole number', 'writes and the resolver share one value check');

-- A malformed bound in the catalogue (a min or max that isn't a number): a problem, never a raise.
update public.genesis_app_manifest set catalogue = catalogue || '{
    "res.badmin": {"type": "number", "applies": "runtime", "scope": "app", "min": "one", "defaults": {"max": 3, "standard": 3, "min": 3}},
    "res.badmax": {"type": "list", "applies": "runtime", "scope": "app", "max": {"n": 2}, "defaults": {"max": [], "standard": [], "min": []}}
  }';
insert into public.genesis_settings (key, value) values ('res.badmin', '7'), ('res.badmax', '["a"]');
select is(private.genesis_setting_value_problem('res.badmin', (select catalogue -> 'res.badmin' from public.genesis_app_manifest), '7'),
  'the synced catalogue''s entry for res.badmin is malformed (write the manifest again: writeAppManifest)', 'a min that isn''t a number is a malformed entry, not a cast error');
select lives_ok($$ select private.genesis_setting('res.badmin') $$, 'the resolver doesn''t raise on a malformed min');
select is(private.genesis_setting('res.badmin'), '3'::jsonb, '... and skips the value it can''t check, keeping the default');
select is(private.genesis_setting('res.badmax'), '[]'::jsonb, 'a list''s max that isn''t a number: the same');

select * from finish();
rollback;
