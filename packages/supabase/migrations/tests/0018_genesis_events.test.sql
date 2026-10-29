-- @feat:product-events
-- pgTAP test for 0018_genesis_events.sql (needs 0016).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, hook and events and rolls everything back. If your app already has
-- the people hook, it is dropped and replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000018' || n)::uuid, 'authenticated', 'authenticated', 'genesis-events-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.login(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000018' || n)::uuid $$;
create function pg_temp.as_person(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.login(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.login(n)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on function pg_temp.login(text), pg_temp.as_person(text), pg_temp.as_owner() to authenticated, anon, service_role;

-- a1 is a person in tenant 1 only.
drop function if exists private.genesis_viewer_people(uuid);
create function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-000000000001'::text::uuid, '00000000-0000-4000-8000-000000000101'::text::uuid
  where viewer = '00000000-0000-4000-8000-0000000018a1'
$$;

-- Privileges --------------------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.genesis_events', 'select'), 'a person can''t read events');
select ok(not has_table_privilege('authenticated', 'public.genesis_events', 'insert'), '... or insert them directly');
select ok(not has_function_privilege('anon', 'public.genesis_track_events(jsonb)', 'execute'), 'anon can''t track');
select ok(has_function_privilege('authenticated', 'public.genesis_track_events(jsonb)', 'execute'), 'a signed-in person can');
select ok(not has_function_privilege('authenticated', 'public.genesis_track_server_events(jsonb)', 'execute'), 'server tracking is the service role''s');
select ok(not has_function_privilege('authenticated', 'public.genesis_feature_usage(uuid, timestamptz)', 'execute'), 'usage summaries are the service role''s');
select ok(not has_function_privilege('authenticated', 'public.genesis_prune_events(interval)', 'execute'), 'pruning is the service role''s');

-- Tracking as a person ----------------------------------------------------------------------------
select pg_temp.as_person('a1');
select is(
  public.genesis_track_events(jsonb_build_array(
    jsonb_build_object('name', 'task.completed', 'feature', 'tasks', 'tenantId', '00000000-0000-4000-8000-000000000001', 'properties', jsonb_build_object('count', 3), 'flags', jsonb_build_object('new-list', true), 'platform', 'native', 'appVersion', '1.2.0'),
    jsonb_build_object('name', 'app.opened'),
    -- a tenant a1 has no record in: dropped
    jsonb_build_object('name', 'task.completed', 'feature', 'tasks', 'tenantId', '00000000-0000-4000-8000-000000000002'),
    -- a bad name, oversized properties, a bad platform: dropped
    jsonb_build_object('name', 'Has Spaces'),
    jsonb_build_object('name', 'big', 'properties', jsonb_build_object('text', repeat('x', 5000))),
    jsonb_build_object('name', 'odd', 'platform', 'fridge'),
    '"not an object"'::jsonb
  )),
  2, 'keeps the valid events in the person''s own tenants, drops the rest');
select throws_ok($$select public.genesis_track_events('{}'::jsonb)$$, '22023', null, 'refuses a body that isn''t an array');
select throws_ok(
  $$select public.genesis_track_events((select jsonb_agg(jsonb_build_object('name', 'x')) from generate_series(1, 101)))$$,
  '22023', null, '... and more than 100 events');
select pg_temp.as_owner();

select is((select person_id from public.genesis_events where name = 'task.completed'), '00000000-0000-4000-8000-000000000101'::uuid, 'the person record comes from the tenant');
select is((select user_id from public.genesis_events where name = 'app.opened'), pg_temp.login('a1'), 'the login is the caller, whatever the client says');
select is((select tenant_id from public.genesis_events where name = 'app.opened'), null, 'an event with no tenant keeps none');
select is((select platform || ' ' || app_version || ' ' || (flags ->> 'new-list') from public.genesis_events where name = 'task.completed'), 'native 1.2.0 true', 'platform, version and flags are kept');

-- A clock far off is replaced by now().
select pg_temp.as_person('a1');
select public.genesis_track_events(jsonb_build_array(jsonb_build_object('name', 'clock.check', 'occurredAt', '2001-01-01T00:00:00Z')));
select pg_temp.as_owner();
select ok((select occurred_at > now() - interval '1 minute' from public.genesis_events where name = 'clock.check'), 'an implausible client time becomes now()');

-- Signed out --------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok($$select public.genesis_track_events('[]'::jsonb)$$, '42501', null, 'tracking needs a signed-in person');
reset role;

-- Server code -------------------------------------------------------------------------------------
set local role service_role;
select is(
  public.genesis_track_server_events(jsonb_build_array(
    jsonb_build_object('name', 'invoice.sent', 'feature', 'invoicing', 'tenantId', '00000000-0000-4000-8000-000000000002', 'personId', '00000000-0000-4000-8000-000000000109', 'userId', pg_temp.login('b2')),
    jsonb_build_object('name', 'invoice.sent', 'feature', 'invoicing', 'tenantId', 'not-a-uuid')
  )),
  1, 'server events trust tenant, person and user, and still drop a malformed one');
select is(
  (select events::int || ' ' || people::int from public.genesis_feature_usage('00000000-0000-4000-8000-000000000001', now() - interval '1 day') where feature_id = 'tasks'),
  '1 1', 'feature usage counts events and people per feature in a tenant');
reset role;

update public.genesis_events set occurred_at = now() - interval '500 days' where name = 'app.opened';
set local role service_role;
select is(public.genesis_prune_events(), 1::bigint, 'pruning deletes events past the retention window');
reset role;
select is((select count(*)::int from public.genesis_events where name = 'app.opened'), 0, '... and only those');

select * from finish();
rollback;
