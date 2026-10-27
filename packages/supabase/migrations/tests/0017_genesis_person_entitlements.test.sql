-- @feat:feature-mirror
-- pgTAP test for 0017_genesis_person_entitlements.sql (needs 0004, 0008, 0014 and 0016).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`. Rolls back. If your
-- app already has the membership or viewer-people hooks, they are replaced inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Two logins, both members of tenant T. a1 is person P1 in T; b2 is person P2 in T.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000017' || n)::uuid, 'authenticated', 'authenticated', 'person-ent-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.t() returns uuid language sql immutable as $$ select '00000000-0000-4000-9000-0000000017c1'::uuid $$;
create function pg_temp.p(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-00000000170' || n)::uuid $$;
create function pg_temp.as_login(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000017' || n, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000017' || n, true);
end $$;

drop function if exists private.genesis_tenant_member(uuid, uuid);
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-9000-0000000017c1'::uuid
    and person in ('00000000-0000-4000-8000-0000000017a1'::uuid, '00000000-0000-4000-8000-0000000017b2'::uuid)
$$;
revoke execute on function private.genesis_tenant_member(uuid, uuid) from public, anon, authenticated;

drop function if exists private.genesis_viewer_people(uuid);
create function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-9000-0000000017c1'::uuid,
    case viewer when '00000000-0000-4000-8000-0000000017a1'::uuid then '00000000-0000-4000-a000-000000001701'::uuid
                when '00000000-0000-4000-8000-0000000017b2'::uuid then '00000000-0000-4000-a000-000000001702'::uuid end
$$;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;

select public.sync_feature_registry(9300, 'person-1',
  '[{"id": "classes", "name": "Classes", "status": "live", "access": {"plan": "member"}},
    {"id": "coaching", "name": "Coaching", "status": "live", "access": {"plan": "coaching"}},
    {"id": "free", "name": "Free", "status": "live"}]', '[]');

-- Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.grant_person_entitlement(uuid,uuid,text,text,text,timestamptz,timestamptz)', 'execute'), 'a signed-in person can''t grant');
select ok(not has_function_privilege('authenticated', 'public.revoke_person_entitlement(uuid,uuid,text,text,text)', 'execute'), '... nor revoke');
select ok(not has_function_privilege('authenticated', 'public.feature_gate_state(uuid,uuid)', 'execute'), '... nor name a person for gate state');
select ok(not has_table_privilege('authenticated', 'public.feature_person_entitlements', 'insert'), '... nor write the table');
select ok(not has_function_privilege('anon', 'public.feature_gate_state(uuid)', 'execute'), 'anon still reads no gate state');

-- Granting -----------------------------------------------------------------------------------
set local role service_role;
select lives_ok($$select public.grant_person_entitlement(pg_temp.t(), pg_temp.p(1), 'classes', 'stripe', 'si_1')$$, 'server code grants P1 classes');
select lives_ok($$select public.grant_person_entitlement(pg_temp.t(), pg_temp.p(1), 'classes', 'stripe', 'si_1')$$, '... and a replayed webhook is fine');
select is((select count(*)::int from public.feature_person_entitlements where person_id = pg_temp.p(1)), 1, '... with one row');
select public.grant_person_entitlement(pg_temp.t(), pg_temp.p(1), 'coaching', 'stripe', 'pi_1', now() + interval '1 day', null);
select public.grant_person_entitlement(pg_temp.t(), pg_temp.p(2), 'coaching', 'manual', '', null, now() - interval '1 day');
select is(public.feature_gate_state(pg_temp.t(), pg_temp.p(1)) -> 'entitled', '["classes"]'::jsonb, 'server code reads a named person''s state; a grant not started yet doesn''t count');
select is(public.feature_gate_state(pg_temp.t(), pg_temp.p(2)) -> 'entitled', '[]'::jsonb, '... nor one that ended');
select is(public.feature_gate_state(pg_temp.t(), null) -> 'entitled', '[]'::jsonb, '... and no person means the tenant''s alone');
select is(public.feature_on(pg_temp.t(), 'classes'), false, 'server code''s feature_on stays the tenant''s answer');
reset role;

-- Reading, as each person ----------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_login('a1');
select is(public.feature_on(pg_temp.t(), 'classes'), true, 'P1 may use classes');
select is(public.feature_on(pg_temp.t(), 'coaching'), false, '... but not coaching before it starts');
select is(public.feature_gate_state(pg_temp.t()) -> 'entitled', '["classes"]'::jsonb, 'P1''s gate state holds their own grant');
select ok(pg_temp.t() in (select public.feature_entitled_tenants('classes')), 'feature_entitled_tenants includes the tenant where P1 holds it');
select is((select count(*)::int from public.feature_person_entitlements), 2, 'P1 reads their own rows');
select throws_ok($$select public.feature_gate_state(pg_temp.t(), pg_temp.p(2))$$, '42501', null, 'P1 can''t name another person');

select pg_temp.as_login('b2');
select is(public.feature_on(pg_temp.t(), 'classes'), false, 'P2, in the same tenant, may not use P1''s classes');
select is((select count(*)::int from public.feature_person_entitlements), 1, 'P2 reads only their own row');
select is(public.feature_on(pg_temp.t(), 'free'), true, 'a free feature is on for everyone');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- Revoking, and the tenant's own grants ---------------------------------------------------------
set local role service_role;
select is(public.revoke_person_entitlement(pg_temp.t(), pg_temp.p(1), 'classes', 'stripe', 'si_1'), true, 'revoking a grant');
select is(public.revoke_person_entitlement(pg_temp.t(), pg_temp.p(1), 'classes', 'stripe', 'si_nope'), false, '... and one that doesn''t exist is false');
insert into public.feature_entitlements (tenant_id, feature_id, source, active) values (pg_temp.t(), 'coaching', 'manual', true);
reset role;

set local role authenticated;
select pg_temp.as_login('a1');
select is(public.feature_on(pg_temp.t(), 'classes'), false, 'a revoked grant no longer counts');
select is(public.feature_on(pg_temp.t(), 'coaching'), true, 'a tenant grant still counts for every member');
reset role;

select * from finish();
rollback;
