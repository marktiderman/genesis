-- @feat:settings-host
-- pgTAP test for 0024_genesis_settings_host.sql (after 0020–0023).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, manifest, settings, proposals, Vault secret and hooks, and rolls
-- everything back. If your app already has the hooks or a manifest, they are replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(93);

-- People: a1 a platform admin; aa the admin of tenant A, ab a member of A; bb the admin of tenant B;
-- c1 and c2 signed in, in no tenant.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-host-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
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
-- The error a statement raises, or null.
create function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(text), pg_temp.sign_in(text), pg_temp.sign_out(), pg_temp.error_of(text) to anon, authenticated, service_role;

drop function if exists private.genesis_platform_admin(uuid);
drop function if exists private.genesis_tenant_admin(uuid, uuid);
drop function if exists private.genesis_tenant_member(uuid, uuid);
delete from public.genesis_settings;
delete from public.genesis_app_manifest;
delete from public.genesis_tenant_settings;
delete from public.genesis_person_settings;
delete from vault.secrets where name in ('GENESIS_TEST_WEBHOOK', 'GENESIS_TEST_UNSET');

insert into public.genesis_app_manifest (app_id, preset, packages, catalogue) values (
  'sample-app', 'max', '{"@marktiderman/genesis-supabase": "0.17.0"}',
  '{
    "demo.theme": {"type": "string", "applies": "runtime", "scope": "app", "default": "light", "options": ["light", "dark"]},
    "demo.region": {"type": "string", "applies": "build", "scope": "app", "default": "us"},
    "demo.banner": {"type": "boolean", "applies": "runtime", "scope": "tenant", "default": true},
    "demo.shake": {"type": "boolean", "applies": "runtime", "scope": "person", "default": true},
    "demo.webhook": {"type": "string", "applies": "runtime", "scope": "app", "default": null, "nullable": true, "secret": {"name": "GENESIS_TEST_WEBHOOK", "store": "vault"}},
    "demo.unset": {"type": "string", "applies": "runtime", "scope": "app", "default": null, "nullable": true, "secret": {"name": "GENESIS_TEST_UNSET", "store": "vault"}},
    "demo.github": {"type": "string", "applies": "runtime", "scope": "app", "default": null, "nullable": true, "secret": {"name": "GENESIS_TEST_EDGE", "store": "edge"}},
    "demo.base": {"type": "boolean", "applies": "runtime", "scope": "app", "default": true},
    "demo.featureOn": {"type": "boolean", "applies": "runtime", "scope": "app", "default": true, "requires": ["demo.base"]},
    "demo.promo": {"type": "boolean", "applies": "runtime", "scope": "tenant", "default": false, "requires": ["demo.featureOn"]},
    "demo.dbLocked": {"type": "boolean", "applies": "runtime", "scope": "tenant", "default": false}
  }'
);
insert into public.genesis_settings (key, value, locked) values ('demo.dbLocked', 'false', true);

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

-- Shape and privileges ------------------------------------------------------------------------
select has_table('public', 'genesis_setting_proposals', 'genesis_setting_proposals exists');
select has_table('public', 'genesis_secret_rotations', 'genesis_secret_rotations exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.genesis_setting_proposals'::regclass, 'public.genesis_secret_rotations'::regclass)),
  'RLS is on for both tables'
);
select ok(
  not has_table_privilege('anon', 'public.genesis_setting_proposals', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_setting_proposals', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.genesis_secret_rotations', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.genesis_secret_rotations', 'select,insert,update,delete,truncate'),
  'anon and authenticated reach neither table except through the functions'
);
select is(
  (select array_agg(attname::text order by attname) from pg_attribute where attrelid = 'public.genesis_secret_rotations'::regclass and attnum > 0 and not attisdropped),
  array['created', 'id', 'name', 'rotated_at', 'rotated_by'],
  'genesis_secret_rotations has no column that could hold a value'
);
select ok(
  not has_function_privilege('anon', 'public.genesis_settings_viewer(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.propose_genesis_setting(text, jsonb, boolean, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.decide_genesis_setting_proposal(bigint, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'public.clear_genesis_setting_if(text, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_setting_proposals(integer)', 'execute')
  and not has_function_privilege('anon', 'public.set_genesis_vault_secret(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_vault_secret_status()', 'execute')
  and not has_function_privilege('anon', 'public.genesis_settings_audit(uuid, timestamptz, text, integer)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_settings_vault_names()', 'execute'),
  'anon can call none of the functions, and the private helper is for them only'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.genesis_settings_viewer(uuid)'::regprocedure,
     'public.propose_genesis_setting(text, jsonb, boolean, text, uuid)'::regprocedure,
     'public.decide_genesis_setting_proposal(bigint, boolean, text)'::regprocedure,
     'public.clear_genesis_setting_if(text, jsonb, boolean)'::regprocedure,
     'public.genesis_setting_proposals(integer)'::regprocedure,
     'public.set_genesis_vault_secret(text, text)'::regprocedure,
     'public.genesis_vault_secret_status()'::regprocedure,
     'public.genesis_settings_audit(uuid, timestamptz, text, integer)'::regprocedure,
     'private.genesis_settings_vault_names()'::regprocedure
   )),
  'every function is security definer with search_path = '''''
);
select ok(
  (select prosrc !~* '\mexecute\M' and prosrc !~* '\mformat\s*\(' from pg_proc where oid = 'public.set_genesis_vault_secret(text, text)'::regprocedure),
  'set_genesis_vault_secret builds no SQL text: the value stays a parameter'
);

-- Who is looking ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.sign_out();
select throws_ok($$ select public.genesis_settings_viewer(null) $$, '42501', null, 'nobody signed in: refused');
select pg_temp.sign_in('a1');
select ok((public.genesis_settings_viewer(null) ->> 'platformAdmin')::boolean, 'a platform admin is told so');
select is((select count(*)::int from jsonb_object_keys(public.genesis_settings_viewer(null) -> 'catalogue')), 11, '... and sees every key');
select is(public.genesis_settings_viewer(null) -> 'packages', '{"@marktiderman/genesis-supabase": "0.17.0"}'::jsonb, '... and the packages');
select pg_temp.sign_in('aa');
select ok((public.genesis_settings_viewer(pg_temp.tenant('a')) ->> 'tenantAdmin')::boolean and not (public.genesis_settings_viewer(pg_temp.tenant('a')) ->> 'platformAdmin')::boolean, 'a tenant admin is told so, for their tenant');
select is((select array_agg(k order by k) from jsonb_object_keys(public.genesis_settings_viewer(pg_temp.tenant('a')) -> 'catalogue') k), array['demo.banner', 'demo.base', 'demo.dbLocked', 'demo.featureOn', 'demo.promo'], '... and sees the tenant-scope keys, with the keys they require at any depth');
select is(public.genesis_settings_viewer(pg_temp.tenant('a')) -> 'packages', '{}'::jsonb, '... and no packages');
select ok(not (public.genesis_settings_viewer(pg_temp.tenant('b')) ->> 'tenantAdmin')::boolean, 'for another tenant they are no admin');
select is((select array_agg(k order by k) from jsonb_object_keys(public.genesis_settings_viewer(pg_temp.tenant('b')) -> 'catalogue') k), array['demo.shake'], '... and see only the person-scope keys');
select pg_temp.sign_in('ab');
select is((select array_agg(k order by k) from jsonb_object_keys(public.genesis_settings_viewer(pg_temp.tenant('a')) -> 'catalogue') k), array['demo.shake'], 'a member who isn''t an admin sees the person-scope keys');

-- A non-admin is refused the platform scope ------------------------------------------------------
select pg_temp.sign_in('c1');
select throws_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', 'not-an-admin-value') $$, '42501', null, 'a non-admin can''t set a Vault secret');
select throws_ok($$ select * from public.genesis_vault_secret_status() $$, '42501', null, '... or read secret status');
select throws_ok($$ select public.decide_genesis_setting_proposal(1, true) $$, '42501', null, '... or decide a proposal');
select throws_ok($$ select * from public.genesis_settings_audit(pg_temp.tenant('a')) $$, '42501', null, '... or read a tenant''s history');
select pg_temp.sign_in('aa');
select throws_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', 'tenant-admin-value') $$, '42501', null, 'a tenant admin can''t set a Vault secret either');

-- A tenant admin works in their tenant only ------------------------------------------------------
select lives_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('a'), 'demo.banner', 'false') $$, 'a tenant admin sets their tenant''s value');
select pg_temp.sign_in('bb');
select lives_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('b'), 'demo.banner', 'true') $$, 'another tenant''s admin sets theirs');
select pg_temp.sign_in('c1');
select lives_ok($$ select public.set_genesis_person_setting('demo.shake', 'false') $$, 'a person sets their own value');
select pg_temp.sign_in('aa');
select throws_ok($$ select public.set_genesis_tenant_setting(pg_temp.tenant('b'), 'demo.banner', 'false') $$, '42501', null, 'a tenant admin can''t set another tenant''s value');
select is(
  (select array_agg(distinct layer || ':' || subject) from public.genesis_settings_audit(pg_temp.tenant('a'))),
  array['tenant:demo.banner'],
  'a tenant admin''s history of their tenant holds that tenant''s changes only'
);
select is(
  (select count(*)::int from public.genesis_settings_audit(pg_temp.tenant('a')) where actor_email is not null),
  0, '... without anyone''s email'
);
select throws_ok($$ select * from public.genesis_settings_audit(pg_temp.tenant('b')) $$, '42501', null, '... and they can''t read another tenant''s');
select is((select count(*)::int from public.genesis_settings_audit(null)), 0, 'without a tenant, their own person history: none');
select pg_temp.sign_in('c1');
select is((select array_agg(layer) from public.genesis_settings_audit(null)), array['person'], 'a person reads their own history');

-- Vault secrets ------------------------------------------------------------------------------
-- On Supabase the database owner isn't a superuser: Vault lets it read and delete vault.secrets and
-- call Vault's functions, never insert or update the table. The local stand-in (genesis_db_owner,
-- scripts/pgtap-local) is that owner; on a real Supabase database the functions already run as it.
reset role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'genesis_db_owner') then
    alter function public.set_genesis_vault_secret(text, text) owner to genesis_db_owner;
    alter function public.genesis_vault_secret_status() owner to genesis_db_owner;
    grant usage on schema auth, private to genesis_db_owner;
    grant execute on function private.genesis_is_platform_admin(), private.genesis_settings_vault_names() to genesis_db_owner;
    -- On Supabase the database owner owns the migration's tables too.
    alter table public.genesis_secret_rotations owner to genesis_db_owner;
  end if;
end $$;
select ok(
  not exists (select 1 from pg_roles r join pg_proc p on p.proowner = r.oid where p.oid = 'public.set_genesis_vault_secret(text, text)'::regprocedure and r.rolsuper)
  and not has_table_privilege((select proowner::regrole::text from pg_proc where oid = 'public.set_genesis_vault_secret(text, text)'::regprocedure), 'vault.secrets', 'update'),
  'set_genesis_vault_secret runs as an owner that may not update vault.secrets, as on Supabase'
);
set local role authenticated;
select pg_temp.sign_in('a1');
select throws_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_EDGE', 'an-edge-value') $$, '22023', null, 'a secret kept in another store is refused');
select ok(
  pg_temp.error_of($$ select public.set_genesis_vault_secret('NOT_DECLARED', 'leaky-value-42') $$) !~ 'leaky-value-42',
  'an undeclared name is refused without the value in the error'
);
select ok(
  pg_temp.error_of($$ select public.set_genesis_vault_secret('bad name', 'leaky-value-43') $$) !~ 'leaky-value-43',
  '... and a malformed name'
);
select throws_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', '   ') $$, '22023', null, 'a value of spaces is refused');
select throws_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', repeat('x', 8193)) $$, '22023', null, '... and one too long');
select lives_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', 'first-plain-value-9f3') $$, 'a platform admin sets a declared Vault secret');
reset role;
select is((select count(*)::int from vault.secrets where name = 'GENESIS_TEST_WEBHOOK'), 1, 'it is in Vault');
select ok((select secret !~ 'first-plain-value-9f3' from vault.secrets where name = 'GENESIS_TEST_WEBHOOK'), '... stored encrypted, not in plain text');
select is((select decrypted_secret from vault.decrypted_secrets where name = 'GENESIS_TEST_WEBHOOK'), 'first-plain-value-9f3', '... through Vault, so it decrypts to the value');
select is((select created from public.genesis_secret_rotations where name = 'GENESIS_TEST_WEBHOOK'), true, 'the set is recorded, as created');
set local role authenticated;
select pg_temp.sign_in('a1');
select lives_ok($$ select public.set_genesis_vault_secret('GENESIS_TEST_WEBHOOK', 'second-plain-value-7c1') $$, 'setting it again rotates it');
reset role;
select is((select count(*)::int from vault.secrets where name = 'GENESIS_TEST_WEBHOOK'), 1, 'still one Vault secret');
select is((select decrypted_secret from vault.decrypted_secrets where name = 'GENESIS_TEST_WEBHOOK'), 'second-plain-value-7c1', '... with the new value');
select is((select array_agg(created order by id) from public.genesis_secret_rotations where name = 'GENESIS_TEST_WEBHOOK'), array[true, false], 'the rotation is recorded too');
-- No Genesis table, in any schema but Vault's, holds either value.
create function pg_temp.value_anywhere(needle text) returns boolean language plpgsql as $$
declare
  t record;
  hit boolean;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where c.relkind = 'r' and n.nspname in ('public', 'private', 'auth') loop
    execute format('select exists (select 1 from %I.%I x where to_jsonb(x)::text like %L)', t.nspname, t.relname, '%' || needle || '%') into hit;
    if hit then
      return true;
    end if;
  end loop;
  return false;
end $$;
select ok(not pg_temp.value_anywhere('first-plain-value-9f3') and not pg_temp.value_anywhere('second-plain-value-7c1'), 'neither value is in any table outside Vault');
set local role authenticated;
select pg_temp.sign_in('a1');
select is(
  (select array_agg(name || ':' || is_set order by name) from public.genesis_vault_secret_status()),
  array['GENESIS_TEST_UNSET:false', 'GENESIS_TEST_WEBHOOK:true'],
  'the status lists each declared Vault secret: set or not'
);
select ok((select last_rotated is not null from public.genesis_vault_secret_status() where name = 'GENESIS_TEST_WEBHOOK'), '... with when it was last set');
select is(
  (select count(*)::int from public.genesis_settings_audit(null) where kind = 'secret' and subject = 'GENESIS_TEST_WEBHOOK' and old_value is null and new_value is null),
  2, 'the history shows both sets, by name only'
);

-- Proposals --------------------------------------------------------------------------------------
select pg_temp.sign_in('c1');
select throws_ok($$ select public.propose_genesis_setting('demo.theme', '"purple"', false, 'brand') $$, '22023', null, 'a proposal is checked against the catalogue');
select throws_ok($$ select public.propose_genesis_setting('demo.region', '"eu"', false, null) $$, '22023', null, '... and can''t be for a build-time key');
select throws_ok($$ select public.propose_genesis_setting('demo.theme', '"dark"', false, repeat('x', 1001)) $$, '22023', null, '... and its reason is bounded');
select lives_ok($$ select public.propose_genesis_setting('demo.theme', '"light"', false, 'first thought') $$, 'anyone signed in proposes a value');
select lives_ok($$ select public.propose_genesis_setting('demo.theme', '"dark"', false, 'our customers asked for it') $$, '... and proposing the same key again replaces it');
select is((select count(*)::int from public.genesis_setting_proposals(100) where status = 'pending'), 1, 'one pending proposal, theirs');
select is((select value from public.genesis_setting_proposals(100)), '"dark"'::jsonb, '... with the newer value');
select is((select proposed_by_email from public.genesis_setting_proposals(100)), null, '... and no email for a non-admin');
select pg_temp.sign_in('c2');
select is((select count(*)::int from public.genesis_setting_proposals(100)), 0, 'another person doesn''t see it');
select pg_temp.sign_in('a1');
select is(
  (select key || '=' || value::text || ' by ' || proposed_by_email || ': ' || reason from public.genesis_setting_proposals(100) where status = 'pending'),
  'demo.theme="dark" by genesis-host-c1@example.test: our customers asked for it',
  'a platform admin sees who proposed what and why'
);
select lives_ok($$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where status = 'pending'), true) $$, 'a platform admin approves it');
reset role;
select is((select value from public.genesis_settings where key = 'demo.theme'), '"dark"'::jsonb, 'approving writes the value to the database layer');
select is((select source || ':' || changed_by from public.genesis_setting_changes where key = 'demo.theme'), 'admin:' || pg_temp.person('a1'), '... recorded as the admin''s change');
select is((select status || ':' || decided_by from public.genesis_setting_proposals where key = 'demo.theme'), 'approved:' || pg_temp.person('a1'), '... and the proposal is approved by them');
select set_config('genesis_test.approved', (select id::text from public.genesis_setting_proposals where key = 'demo.theme'), true);
set local role authenticated;
select pg_temp.sign_in('a1');
select throws_ok($$ select public.decide_genesis_setting_proposal(current_setting('genesis_test.approved')::bigint, false) $$, '22023', null, 'a decided proposal can''t be decided again');
select throws_ok($$ select public.decide_genesis_setting_proposal(-1, true) $$, 'P0002', null, 'an unknown proposal is reported');
select pg_temp.sign_in('c1');
select lives_ok($$ select public.propose_genesis_setting('demo.theme', '"light"', false, 'changed my mind') $$, 'a second proposal');
select pg_temp.sign_in('a1');
select lives_ok($$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where status = 'pending'), false) $$, 'a platform admin declines it');
reset role;
select is((select value from public.genesis_settings where key = 'demo.theme'), '"dark"'::jsonb, 'declining leaves the value alone');
set local role authenticated;
select pg_temp.sign_in('c1');
select is((select array_agg(status order by id) from public.genesis_setting_proposals(100)), array['approved', 'declined'], 'the proposer sees how each was decided');
select ok((select bool_and(tenant_id is null) from public.genesis_setting_proposals(100)), '... made for themselves, with no tenant');

-- A tenant admin proposes for their tenant; a platform admin may approve for that tenant alone ----
select throws_ok($$ select public.propose_genesis_setting('demo.banner', 'true', false, 'not mine', pg_temp.tenant('a')) $$, '42501', null, 'only the tenant''s admins propose for a tenant');
select pg_temp.sign_in('aa');
select lives_ok($$ select public.propose_genesis_setting('demo.banner', 'true', false, 'promotion week', pg_temp.tenant('a')) $$, 'a tenant admin proposes for their tenant');
select lives_ok($$ select public.propose_genesis_setting('demo.dbLocked', 'true', false, 'we need it', pg_temp.tenant('a')) $$, '... also a key the database layer locks');
select pg_temp.sign_in('a1');
select is(
  (select array_agg(key || ':' || tenant_id || ':' || tenant_layer_ok order by key) from public.genesis_setting_proposals(100) where status = 'pending'),
  array['demo.banner:' || pg_temp.tenant('a') || ':true', 'demo.dbLocked:' || pg_temp.tenant('a') || ':false'],
  'a platform admin sees which tenant asked, and where approving for it alone is allowed'
);
select throws_ok(
  $$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where key = 'demo.dbLocked'), true, 'tenant') $$,
  '22023', null, 'a key the database layer locks can''t be approved for one tenant'
);
select throws_ok($$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where key = 'demo.banner'), true, 'everywhere') $$, '22004', null, 'the layer is database or tenant');
select lives_ok($$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where key = 'demo.banner'), true, 'tenant') $$, 'a platform admin approves it for that tenant only');
reset role;
select is((select value from public.genesis_tenant_settings where tenant_id = pg_temp.tenant('a') and key = 'demo.banner'), 'true'::jsonb, 'the value is in that tenant''s layer');
select ok(not exists (select 1 from public.genesis_settings where key = 'demo.banner'), '... not the app''s');
select is((select status || ':' || approved_layer from public.genesis_setting_proposals where key = 'demo.banner'), 'approved:tenant', '... and the proposal says where it was approved');
select is((select changed_by from public.genesis_scoped_setting_changes where tenant_id = pg_temp.tenant('a') and key = 'demo.banner' order by id desc limit 1), pg_temp.person('a1'), '... recorded as the platform admin''s change');
set local role authenticated;
select pg_temp.sign_in('c1');
select lives_ok($$ select public.propose_genesis_setting('demo.theme', '"light"', false, 'for me') $$, 'a person proposes again');
select pg_temp.sign_in('a1');
select throws_ok(
  $$ select public.decide_genesis_setting_proposal((select id from public.genesis_setting_proposals(100) where key = 'demo.theme'), true, 'tenant') $$,
  '22023', null, 'a proposal no tenant made can''t be approved for a tenant'
);

-- A planned clear removes only the value it was planned for -------------------------------------
select is(public.clear_genesis_setting_if('demo.theme', '"light"', false), false, 'a value that changed since the plan is left alone');
reset role;
select is((select value from public.genesis_settings where key = 'demo.theme'), '"dark"'::jsonb, '... still there');
set local role authenticated;
select pg_temp.sign_in('c1');
select throws_ok($$ select public.clear_genesis_setting_if('demo.theme', '"dark"', false) $$, '42501', null, 'only platform admins clear');
select pg_temp.sign_in('a1');
select is(public.clear_genesis_setting_if('demo.theme', '"dark"', false), true, 'the planned value is removed');
reset role;
select ok(not exists (select 1 from public.genesis_settings where key = 'demo.theme'), '... and gone');
set local role authenticated;

-- The history, a page at a time ------------------------------------------------------------------
select pg_temp.sign_in('a1');
create temp table page_one as select * from public.genesis_settings_audit(null, null, null, 3);
select is((select count(*)::int from page_one), 3, 'a page holds at most max_rows');
select is(
  (select count(*)::int from public.genesis_settings_audit(null, (select at from page_one order by at, seq limit 1), (select seq from page_one order by at, seq limit 1), 100) a where a.seq in (select seq from page_one)),
  0, 'the next page starts after the last row of the one before'
);
select is(
  (select count(*)::int from public.genesis_settings_audit(null, null, null, 200)),
  (select count(*)::int from page_one) + (select count(*)::int from public.genesis_settings_audit(null, (select at from page_one order by at, seq limit 1), (select seq from page_one order by at, seq limit 1), 200)),
  '... and together the pages hold every row'
);
reset role;

select * from finish();
rollback;
