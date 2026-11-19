-- @feat:settings-core
-- pgTAP test for 0020_genesis_settings.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, manifest, settings and hook and rolls everything back. If your app
-- already has the hook (`private.genesis_platform_admin`) or a manifest, they are replaced inside
-- this transaction only.
--
-- Signing in: auth.uid() reads request.jwt.claims (and the legacy request.jwt.claim.sub on older
-- images), so pg_temp.sign_in sets both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- People: a1 a platform admin, b2 signed in but not an admin.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-settings-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.sign_out() to anon, authenticated, service_role;

drop function if exists private.genesis_platform_admin(uuid);
delete from public.genesis_settings;
delete from public.genesis_app_manifest;

-- Shape ---------------------------------------------------------------------------------
select has_table('public', 'genesis_settings', 'genesis_settings exists');
select col_is_pk('public', 'genesis_settings', array['key'], 'one row per key');
select has_table('public', 'genesis_setting_changes', 'genesis_setting_changes exists');
select has_table('public', 'genesis_app_manifest', 'genesis_app_manifest exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.genesis_settings'::regclass, 'public.genesis_setting_changes'::regclass, 'public.genesis_app_manifest'::regclass)),
  'RLS is on for all three tables'
);
select is(
  (select count(*)::int from pg_policy where polrelid in ('public.genesis_settings'::regclass, 'public.genesis_setting_changes'::regclass, 'public.genesis_app_manifest'::regclass)),
  0,
  'no policies: the tables are reached only through the functions'
);

-- Privileges ---------------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.genesis_settings', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_settings', 'select,insert,update,delete,truncate'),
  'anon and authenticated have no privilege on the settings'
);
select ok(
  not has_table_privilege('anon', 'public.genesis_setting_changes', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_setting_changes', 'select,insert,update,delete,truncate'),
  '... nor on the history'
);
select ok(
  not has_table_privilege('anon', 'public.genesis_app_manifest', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_app_manifest', 'select,insert,update,delete,truncate'),
  '... nor on the manifest'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.genesis_settings'::regclass, 'public.genesis_setting_changes'::regclass, 'public.genesis_app_manifest'::regclass) and a.grantee = 0
  ),
  'public has no grant on any of them'
);
select ok(
  has_table_privilege('service_role', 'public.genesis_settings', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.genesis_app_manifest', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'public.genesis_settings', 'truncate'),
  'the service role writes the settings and the manifest, but cannot truncate the settings (which would skip the history)'
);
select ok(
  not has_table_privilege('service_role', 'public.genesis_setting_changes', 'insert')
  and not has_table_privilege('service_role', 'public.genesis_setting_changes', 'update')
  and has_table_privilege('service_role', 'public.genesis_setting_changes', 'delete'),
  'the service role can purge the history but never write it'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'] and proowner::regrole::text = 'postgres') from pg_proc
   where oid in (
     'public.set_genesis_setting(text, jsonb, boolean)'::regprocedure,
     'public.clear_genesis_setting(text)'::regprocedure,
     'public.genesis_settings_resolved()'::regprocedure,
     'public.genesis_setting_history(integer)'::regprocedure,
     'private.genesis_is_platform_admin()'::regprocedure,
     'private.genesis_setting_problem(text, jsonb)'::regprocedure,
     'private.genesis_record_setting_change()'::regprocedure
   )),
  'every function is security definer, owned by postgres, with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.set_genesis_setting(text, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.clear_genesis_setting(text)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_settings_resolved()', 'execute')
  and not has_function_privilege('anon', 'public.genesis_setting_history(integer)', 'execute'),
  'anon executes none of the public functions'
);
select ok(
  has_function_privilege('authenticated', 'public.set_genesis_setting(text, jsonb, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.clear_genesis_setting(text)', 'execute')
  and has_function_privilege('authenticated', 'public.genesis_settings_resolved()', 'execute')
  and has_function_privilege('authenticated', 'public.genesis_setting_history(integer)', 'execute'),
  'authenticated executes them (each checks who is asking)'
);
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in (
      'public.set_genesis_setting(text, jsonb, boolean)'::regprocedure,
      'public.clear_genesis_setting(text)'::regprocedure,
      'public.genesis_settings_resolved()'::regprocedure,
      'public.genesis_setting_history(integer)'::regprocedure,
      'private.genesis_is_platform_admin()'::regprocedure,
      'private.genesis_setting_problem(text, jsonb)'::regprocedure,
      'private.genesis_record_setting_change()'::regprocedure
    ) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'public executes none of them'
);
select ok(
  not has_function_privilege('authenticated', 'private.genesis_is_platform_admin()', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_setting_problem(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_record_setting_change()', 'execute'),
  'the hook check, the validator and the trigger are not executable by authenticated'
);
select ok(
  not has_sequence_privilege('anon', 'public.genesis_setting_changes_id_seq', 'usage,select,update')
  and not has_sequence_privilege('authenticated', 'public.genesis_setting_changes_id_seq', 'usage,select,update'),
  'the history''s id sequence is not anon''s or authenticated''s'
);

-- The manifest is one row -----------------------------------------------------------------
insert into public.genesis_app_manifest (app_id, name, packages, preset, file_settings, catalogue) values (
  'sample-app', 'Sample app',
  '{"@marktiderman/genesis-config": "0.10.1"}',
  'standard',
  '{"support.dumpRetentionDays": 30, "support.diagnostics": {"value": true, "locked": true}, "support.sentryDsn": "https://dsn.example"}',
  '{
    "support.inbox": {"type": "boolean", "applies": "runtime", "scope": "app"},
    "support.diagnostics": {"type": "boolean", "applies": "runtime", "scope": "app"},
    "support.dumpRetentionDays": {"type": "number", "applies": "runtime", "scope": "app", "min": 7, "max": 365},
    "support.channel": {"type": "string", "applies": "runtime", "scope": "app", "options": ["chat", "email"]},
    "support.languages": {"type": "list", "applies": "runtime", "scope": "app", "options": ["en", "nl"], "min": 1, "max": 2},
    "support.shake": {"type": "object", "applies": "runtime", "scope": "app"},
    "support.githubRepo": {"type": "string", "applies": "runtime", "scope": "app"},
    "support.sentryDsn": {"type": "string", "applies": "build", "scope": "app"}
  }'
);
select throws_ok(
  $$ insert into public.genesis_app_manifest (app_id) values ('other-app') $$,
  '23505', null, 'a second manifest row is refused'
);
select throws_ok(
  $$ update public.genesis_app_manifest set preset = 'huge' $$,
  '23514', null, 'the preset is max, standard or min'
);

-- Without the hook, nobody may change anything ------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok(
  $$ select public.set_genesis_setting('support.inbox', 'false') $$,
  '42501', 'set_genesis_setting: nobody may change settings yet',
  'without private.genesis_platform_admin, set_genesis_setting refuses (fails closed)'
);
select throws_ok(
  $$ select public.clear_genesis_setting('support.inbox') $$,
  '42501', null, '... and clear_genesis_setting too'
);
select throws_ok(
  $$ select * from public.genesis_setting_history() $$,
  '42501', null, '... and nobody may read the history'
);
select is(
  public.genesis_settings_resolved() ->> 'preset',
  'standard',
  'a signed-in person still reads the resolved inputs without the hook'
);
reset role;

-- The app's hook, reading a table of the test's own -------------------------------------------
create table private.genesis_test_platform_admins (person uuid primary key);
insert into private.genesis_test_platform_admins values (pg_temp.person('a1'));
create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_platform_admins a where a.person = $1)
$$;
revoke execute on function private.genesis_platform_admin(uuid) from public, anon, authenticated;

-- Who may change a setting --------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.set_genesis_setting('support.inbox', 'false') $$, '42501', null, 'anon cannot call set_genesis_setting');
select throws_ok($$ select public.genesis_settings_resolved() $$, '42501', null, '... nor read the settings');
reset role;

select pg_temp.sign_out();
set local role authenticated;
select throws_ok($$ select public.set_genesis_setting('support.inbox', 'false') $$, '42501', 'set_genesis_setting: not signed in', 'a call with nobody signed in is refused');
select throws_ok($$ select public.genesis_settings_resolved() $$, '42501', 'genesis_settings_resolved: not signed in', '... and so is a read');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok(
  $$ select public.set_genesis_setting('support.inbox', 'false') $$,
  '42501', 'set_genesis_setting: only platform admins can change settings', 'a signed-in person who isn''t a platform admin is refused'
);
select throws_ok($$ select public.clear_genesis_setting('support.inbox') $$, '42501', null, '... for clearing too');
select throws_ok($$ select * from public.genesis_setting_history() $$, '42501', null, '... and for the history');
reset role;

-- What a platform admin may store: the catalogue decides ---------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ select public.set_genesis_setting('support.nope', 'true') $$, '22023', 'set_genesis_setting: support.nope isn''t a setting any installed package declares', 'an unknown key is refused');
select throws_ok($$ select public.set_genesis_setting('support.sentryDsn', '"https://x"') $$, '22023', 'set_genesis_setting: support.sentryDsn applies at build time: change it in genesis.config.json', 'a build-time key is refused');
select throws_ok($$ select public.set_genesis_setting('support.inbox', '"yes"') $$, '22023', 'set_genesis_setting: support.inbox must be a boolean', 'a value of the wrong type is refused');
select throws_ok($$ select public.set_genesis_setting('support.dumpRetentionDays', '400') $$, '22023', 'set_genesis_setting: support.dumpRetentionDays must be at most 365', 'a number above its max is refused');
select throws_ok($$ select public.set_genesis_setting('support.dumpRetentionDays', '3') $$, '22023', 'set_genesis_setting: support.dumpRetentionDays must be at least 7', '... and below its min');
select throws_ok($$ select public.set_genesis_setting('support.channel', '"sms"') $$, '22023', null, 'a string outside its options is refused');
select throws_ok($$ select public.set_genesis_setting('support.languages', '["en", "fr"]') $$, '22023', null, 'a list item outside its options is refused');
select throws_ok($$ select public.set_genesis_setting('support.languages', '["en", "nl", "en"]') $$, '22023', 'set_genesis_setting: support.languages must be at most 2 items', 'a list longer than its max is refused');
select throws_ok($$ select public.set_genesis_setting('support.shake', '[1]') $$, '22023', null, 'an object key refuses an array');
select throws_ok($$ select public.set_genesis_setting('support.inbox', null) $$, '22004', null, 'a SQL null value is refused (JSON null is "not set")');
select throws_ok($$ select * from public.genesis_settings $$, '42501', null, 'authenticated cannot read the table directly');
select throws_ok($$ insert into public.genesis_settings (key, value) values ('support.inbox', 'false') $$, '42501', null, '... nor write it');
select throws_ok($$ select private.genesis_is_platform_admin() $$, '42501', null, '... nor call the hook check itself');

select lives_ok($$ select public.set_genesis_setting('support.dumpRetentionDays', '60') $$, 'the platform admin sets a number in bounds');
select lives_ok($$ select public.set_genesis_setting('support.inbox', 'false', true) $$, '... and locks a boolean');
select lives_ok($$ select public.set_genesis_setting('support.githubRepo', 'null') $$, '... and sets a string to JSON null (not set)');
select lives_ok($$ select public.set_genesis_setting('support.dumpRetentionDays', '60') $$, '... and saves the same value again');
reset role;

select is(
  (select array_agg(key || '=' || value::text || ':' || locked order by key) from public.genesis_settings),
  array['support.dumpRetentionDays=60:false', 'support.githubRepo=null:false', 'support.inbox=false:true'],
  'the values and the lock are stored'
);
select is(
  (select updated_by from public.genesis_settings where key = 'support.inbox'),
  pg_temp.person('a1'),
  '... with who set them'
);
select is(
  (select count(*)::int from public.genesis_setting_changes where key = 'support.dumpRetentionDays'),
  1,
  'saving the same value again records nothing'
);
select is(
  (select source || ':' || changed_role || ':' || coalesce(old_value::text, '-') || '>' || new_value::text from public.genesis_setting_changes where key = 'support.inbox'),
  'admin:authenticated:->false',
  'the history records the source, the role and the old and new value'
);

-- What a signed-in person reads --------------------------------------------------------------
select pg_temp.sign_in('b2');
set local role authenticated;
select is(
  public.genesis_settings_resolved() - 'reportedAt',
  '{
    "preset": "standard",
    "file": {"support.dumpRetentionDays": 30, "support.diagnostics": {"value": true, "locked": true}},
    "database": {
      "support.inbox": {"value": false, "locked": true},
      "support.githubRepo": {"value": null, "locked": false},
      "support.dumpRetentionDays": {"value": 60, "locked": false}
    }
  }'::jsonb,
  'any signed-in person reads the preset, the file and the database layer, runtime keys only'
);
reset role;

-- The service role, and keys the catalogue drops ---------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.genesis_settings (key, value) values ('legacy.removed', '1');
select set_config('genesis.setting_source', 'cli', true);
update public.genesis_settings set value = '90' where key = 'support.dumpRetentionDays';
select set_config('genesis.setting_source', '', true);
reset role;
select is(
  (select source || ':' || changed_role from public.genesis_setting_changes where key = 'legacy.removed'),
  'server:service_role',
  'a service-role write is recorded as from the server, with no person'
);
select is(
  (select source from public.genesis_setting_changes where key = 'support.dumpRetentionDays' order by id desc limit 1),
  'cli',
  '... or from the source it names'
);
select pg_temp.sign_in('b2');
set local role authenticated;
select ok(
  not (public.genesis_settings_resolved() -> 'database' ? 'legacy.removed'),
  'a stored key the catalogue no longer declares isn''t returned'
);
reset role;

-- Clearing, and the history ------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$ select public.clear_genesis_setting('support.inbox') $$, 'the platform admin clears a setting');
select is(
  (select array_agg(key order by key) from public.genesis_setting_history(1000) where new_value is null),
  array['support.inbox'],
  '... which the history records with no new value'
);
select is(
  (select count(*)::int from public.genesis_setting_history(2)),
  2,
  'the history takes a row limit'
);
reset role;
select ok(
  not exists (select 1 from public.genesis_settings where key = 'support.inbox'),
  'the row is gone, so the layers below apply again'
);

-- Without a synced catalogue, nothing is accepted ----------------------------------------------
update public.genesis_app_manifest set catalogue = '{}';
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok(
  $$ select public.set_genesis_setting('support.inbox', 'true') $$,
  '22023', null, 'with no catalogue, set_genesis_setting refuses every write'
);
reset role;

-- Deleting a person never fails on these tables ------------------------------------------------
delete from auth.users where id = pg_temp.person('a1');
select is(
  (select count(*)::int from public.genesis_settings where updated_by is not null),
  0,
  'deleting a person clears who set a setting'
);
select is(
  (select count(*)::int from public.genesis_setting_changes where changed_by = pg_temp.person('a1')),
  0,
  '... and who changed it, keeping the history'
);
select ok(
  (select count(*) from public.genesis_setting_changes) > 0,
  '... whose rows stay'
);

select * from finish();
rollback;
