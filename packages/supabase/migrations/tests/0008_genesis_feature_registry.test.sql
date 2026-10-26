-- @feat:feature-mirror
-- pgTAP test for 0008_genesis_feature_registry.sql (needs 0004_genesis_tenant_features.sql).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants, hooks and registry rows and rolls everything back.
-- If your app already has the hooks, they are replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- People: a1 admin of tenant 1, b2 member of tenant 1, c3 admin of tenant 2.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-registry-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.sign_in(text), pg_temp.as_service(), pg_temp.as_owner()
  to anon, authenticated, service_role;

drop function if exists private.genesis_tenant_admin(uuid, uuid);
drop function if exists private.genesis_tenant_member(uuid, uuid);
create table private.genesis_test_members (tenant uuid, person uuid, admin boolean);
insert into private.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(2), pg_temp.person('c3'), true);
create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = genesis_tenant_admin.tenant and m.person = genesis_tenant_admin.person and m.admin)
$$;
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = genesis_tenant_member.tenant and m.person = genesis_tenant_member.person)
$$;
revoke execute on function private.genesis_tenant_admin(uuid, uuid), private.genesis_tenant_member(uuid, uuid) from public, anon, authenticated;

-- The registry: live, paid, beta behind a flag, planned. The same shapes as features.json.
create table pg_temp.registry (features jsonb, flags jsonb);
insert into pg_temp.registry values (
  '[{"id": "forms", "name": "Forms", "status": "live", "apps": ["web"]},
    {"id": "webhooks", "name": "Webhooks", "status": "live", "apps": ["web"], "access": {"plan": "pro"}},
    {"id": "sms", "name": "Text a link", "status": "beta", "apps": ["web"], "platforms": {"web": "beta"}},
    {"id": "courses", "name": "Courses", "status": "planned", "apps": ["web"]}]',
  '[{"key": "sms.release", "feature": "sms", "kind": "release", "default": false, "scopes": ["platform", "tenant"], "expires": "2027-01-31"}]');
grant select on pg_temp.registry to service_role, authenticated;

-- Shape and access ------------------------------------------------------------------------------
select has_table('public', 'features', 'features exists');
select has_table('public', 'feature_flags', 'feature_flags exists');
select has_table('public', 'feature_entitlements', 'feature_entitlements exists');
select has_table('public', 'tenant_flag_values', 'tenant_flag_values exists');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.features'::regclass, 'public.feature_flags'::regclass,
    'public.feature_entitlements'::regclass, 'public.tenant_flag_values'::regclass, 'private.feature_registry_state'::regclass)),
  'RLS is on for every table');
select ok(not has_table_privilege('authenticated', 'public.feature_flags', 'select'), 'signed-in people can''t read flag rows');
select ok(not has_table_privilege('authenticated', 'public.feature_entitlements', 'select,insert,update,delete'), '... nor entitlements');
select ok(not has_table_privilege('authenticated', 'public.tenant_flag_values', 'select,insert,update,delete'), '... nor flag values');
select ok(not has_table_privilege('authenticated', 'public.features', 'insert,update,delete'), 'nobody signed in writes features');
select ok(not has_function_privilege('authenticated', 'public.sync_feature_registry(bigint, text, jsonb, jsonb)', 'execute'), 'only the service role syncs');
select ok(not has_function_privilege('anon', 'public.feature_on(uuid, text)', 'execute'), 'anon can''t ask the gate');
select ok(not has_function_privilege('anon', 'public.feature_gate_state(uuid)', 'execute'), '... nor read gate state');

-- Syncing ---------------------------------------------------------------------------------------
select pg_temp.as_service();
select is(public.sync_feature_registry(100, 'h1', (select features from pg_temp.registry), (select flags from pg_temp.registry)), true, 'the service role syncs');
select is(public.sync_feature_registry(100, 'h1', (select features from pg_temp.registry), (select flags from pg_temp.registry)), false, 'the same hash is a no-op');
select is(public.sync_feature_registry(50, 'old', (select features from pg_temp.registry), '[]'), false, 'an older version is refused');
select is((select count(*)::int from public.feature_flags), 1, '... and leaves the newer flags');
select is((select access_plan from public.features where id = 'webhooks'), 'pro', 'a paid feature keeps its plan');
select is((select platforms ->> 'web' from public.features where id = 'sms'), 'beta', 'platform statuses are kept');
select throws_ok($$select public.sync_feature_registry(null, 'x', '[]', '[]')$$, '22023', null, 'a sync needs a version');

-- The gate in SQL --------------------------------------------------------------------------------
select is(public.feature_on(pg_temp.tenant(1), 'forms'), true, 'a live feature is on');
select is(public.feature_on(pg_temp.tenant(1), 'webhooks'), false, 'a paid feature is off without an entitlement');
insert into public.feature_entitlements (tenant_id, feature_id, source, active) values (pg_temp.tenant(1), 'webhooks', 'manual', true);
select is(public.feature_on(pg_temp.tenant(1), 'webhooks'), true, '... and on with one');
insert into public.feature_entitlements (tenant_id, feature_id, source, active, ends_at) values (pg_temp.tenant(2), 'webhooks', 'trial', true, now() - interval '1 day');
select is(public.feature_on(pg_temp.tenant(2), 'webhooks'), false, 'an ended entitlement doesn''t count');
select is(public.feature_on(pg_temp.tenant(1), 'courses') or public.feature_on(pg_temp.tenant(1), 'nope'), false, 'planned and unknown features are off');
select is(public.feature_on(pg_temp.tenant(1), 'sms'), true, 'flags are not the database''s business');

-- Runtime state for the snapshot -------------------------------------------------------------------
insert into public.tenant_flag_values (tenant_id, flag_key, value) values (pg_temp.tenant(1), 'sms.release', 'true');
select pg_temp.as_owner();
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values (pg_temp.tenant(1), 'forms', false, 'Not yet');
select is(public.feature_on(pg_temp.tenant(1), 'forms'), true, 'a tenant switch hides, it doesn''t block rows');

select pg_temp.sign_in('b2');
select is(public.feature_gate_state(pg_temp.tenant(1)),
  '{"off": ["forms"], "entitled": ["webhooks"], "flags": {"sms.release": true}}'::jsonb,
  'a member reads the tenant''s switches, entitlements and flag values');
select is(public.feature_on(pg_temp.tenant(1), 'webhooks'), true, 'a member asks the gate for their tenant');
select is(public.feature_on(pg_temp.tenant(2), 'forms'), false, 'and gets false for another tenant');
select throws_ok($$select public.feature_gate_state(pg_temp.tenant(2))$$, '42501', null, 'another tenant''s state is refused');
select is((select count(*)::int from public.features), 4, 'signed-in people read the registry');
select throws_ok($$select * from public.feature_entitlements$$, '42501', null, 'but not the entitlements table');

select pg_temp.sign_in('c3');
select is(public.feature_gate_state(pg_temp.tenant(2)), '{"off": [], "entitled": [], "flags": {}}'::jsonb, 'a tenant with nothing set gets empty state');

-- A registry without courses and without the flag --------------------------------------------------
select pg_temp.as_service();
select is(public.sync_feature_registry(200, 'h2',
  (select jsonb_agg(f) from pg_temp.registry, jsonb_array_elements(features) f where f ->> 'id' <> 'courses'), '[]'), true, 'a changed registry syncs');
select is((select in_registry from public.features where id = 'courses'), false, 'a feature gone from the registry stays, marked gone');
select is((select count(*)::int from public.feature_flags), 0, 'a flag gone from the registry is removed');
select is((select count(*)::int from public.tenant_flag_values), 0, '... with its tenant values');
select is((select version from public.feature_registry_synced()), 200::bigint, 'the last sync is recorded');

-- Retired: off even with an entitlement.
select is(public.sync_feature_registry(300, 'h3',
  '[{"id": "webhooks", "name": "Webhooks", "status": "retired", "apps": ["web"], "access": {"plan": "pro"}}]', '[]'), true, 'webhooks retires');
select is(public.feature_on(pg_temp.tenant(1), 'webhooks'), false, 'a retired feature is off whatever the entitlement');
select is(public.feature_on(pg_temp.tenant(1), 'forms'), false, 'a feature missing from the registry is off');

select * from finish();
rollback;
