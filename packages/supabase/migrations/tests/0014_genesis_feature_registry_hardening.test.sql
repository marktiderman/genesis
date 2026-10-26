-- @feat:feature-mirror
-- pgTAP test for 0014_genesis_feature_registry_hardening.sql (needs 0004 and 0008).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-0000000014a1', 'authenticated', 'authenticated', 'hardening-a1@example.test', '00000000-0000-0000-0000-000000000000');
drop function if exists private.genesis_tenant_member(uuid, uuid);
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-9000-000000001401'::uuid and person = '00000000-0000-4000-8000-0000000014a1'::uuid
$$;
revoke execute on function private.genesis_tenant_member(uuid, uuid) from public, anon, authenticated;

select public.sync_feature_registry(9100, 'hard-1',
  '[{"id": "open", "name": "Open", "status": "live"},
    {"id": "secret", "name": "Secret", "status": "live", "visibility": "internal"},
    {"id": "a", "name": "A", "status": "live"}, {"id": "b", "name": "B", "status": "live"}]',
  '[{"key": "open.release", "feature": "open", "kind": "release", "default": false}]');

select ok(exists (select 1 from pg_indexes where indexname = 'feature_entitlements_feature_active'), 'entitlements are indexed by feature');

-- A session that switched to authenticated without claims is a person with no tenant, not the server.
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(public.feature_on('00000000-0000-4000-9000-000000001401', 'open'), false, 'SET ROLE authenticated with no claims gets no answer');
select throws_ok($$select public.feature_gate_state('00000000-0000-4000-9000-000000001401')$$, '42501', null, '... and no gate state');
select is(public.feature_shipped('secret'), false, 'a person can''t confirm an internal feature');
select is(public.feature_shipped('open'), true, '... but sees customer-facing ones');
-- Claims that say service_role don't make a person server code: the role decides.
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(public.feature_on('00000000-0000-4000-9000-000000001401', 'open'), false, 'claims claiming service_role are refused');
select is(public.feature_shipped('secret'), false, '... and see no internal feature');
-- A member with claims is still answered.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000014a1", "role": "authenticated"}', true);
select is(public.feature_on('00000000-0000-4000-9000-000000001401', 'open'), true, 'a member is answered');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select is(public.feature_shipped('secret'), true, 'server code sees internal features');
reset role;

-- A flag that leaves the registry loses its kill switch.
update public.feature_flags set platform_value = 'false' where key = 'open.release';
select public.sync_feature_registry(9200, 'hard-2',
  '[{"id": "open", "name": "Open", "status": "live"}, {"id": "secret", "name": "Secret", "status": "live", "visibility": "internal"},
    {"id": "a", "name": "A", "status": "live"}, {"id": "b", "name": "B", "status": "live"}]', '[]');
select is((select platform_value from public.feature_flags where key = 'open.release'), null, 'a flag leaving the registry drops its platform value');
select is((select in_registry from public.feature_flags where key = 'open.release'), false, '... and is marked gone');

select * from finish();
rollback;
