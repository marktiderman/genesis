-- @feat:content-packs
-- pgTAP test for 0006_genesis_work_packs.sql (needs genesis-supabase 0009 and genesis-work 0001 to
-- 0005 applied first). It writes only its own users, tenants and hooks and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-packs-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
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
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.sign_in(text), pg_temp.as_server() to anon, authenticated, service_role;

-- a1 leads tenant 1, b2 is a member, c3 belongs to tenant 2.
create table public.genesis_test_members (tenant_id uuid, person uuid, lead boolean default false);
insert into public.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.person('a1'), true), (pg_temp.tenant(1), pg_temp.person('b2'), false), (pg_temp.tenant(2), pg_temp.person('c3'), true);

drop function if exists private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text);
drop function if exists private.genesis_readable_owners(uuid);
create function private.genesis_readable_owners(viewer uuid)
returns table (tenant_id uuid, owner_id uuid) language sql stable set search_path = '' as $$
  select m.tenant_id, m.tenant_id from public.genesis_test_members m where m.person = viewer
$$;
create function private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid, organization_id uuid, action text)
returns boolean language sql stable set search_path = '' as $$
  select organization_id is not null and exists (select 1 from public.genesis_test_members m
    where m.tenant_id = tenant and m.person = viewer and (action = 'read' or m.lead))
$$;
revoke execute on function private.genesis_readable_owners(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_owner_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create function pg_temp.pack(ver text, minutes int) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', 'team-rhythm', 'version', ver, 'requires', '["sessions", "metrics"]'::jsonb,
    'labels', jsonb_build_object('pursuit.quarter', 'Priorities'),
    'sessionTypes', jsonb_build_array(jsonb_build_object('key', 'weekly', 'kind', 'meeting', 'name', 'Weekly team meeting',
      'defaultMinutes', minutes, 'agenda', '[{"key": "checkin", "title": "Check-in", "minutes": 5}]'::jsonb)),
    'metricTemplates', jsonb_build_array(jsonb_build_object('key', 'new_leads', 'name', 'New leads', 'cadence', 'weekly', 'goalValue', 50)),
    'fieldDefinitions', jsonb_build_array(jsonb_build_object('key', 'level', 'target', 'pursuits', 'label', 'Level', 'field', '{"type": "single-choice"}'::jsonb)))
$$;
grant execute on function pg_temp.pack(text, int) to service_role, authenticated;

-- Shape and privileges ----------------------------------------------------------------------
select has_table('genesis_work', 'installed_packs', 'installed_packs exists');
select has_table('genesis_work', 'metric_templates', 'metric_templates exists');
select has_table('genesis_work', 'labels', 'labels exists');
select ok(not has_function_privilege('authenticated', 'genesis_work.install_content_pack(uuid,jsonb,uuid)', 'execute'), 'only server code installs packs');
select ok(not has_table_privilege('authenticated', 'genesis_work.installed_packs', 'insert,update,delete'), 'nobody signed in writes installed_packs');

-- Installing --------------------------------------------------------------------------------
select pg_temp.as_server();
select is(genesis_work.install_content_pack(pg_temp.tenant(1), pg_temp.pack('1.0.0', 90), pg_temp.person('a1')) -> 'added',
  '["sessionTypes.weekly", "metricTemplates.new_leads", "fieldDefinitions.level", "labels.pursuit.quarter"]'::jsonb,
  'installing adds every item');
select is((select organization_id from genesis_work.session_types where source_key = 'weekly'), pg_temp.tenant(1), 'a pack''s session type belongs to the tenant');
select is((select namespace from genesis_work.field_definitions where key = 'level'), 'team-rhythm', 'a pack''s fields use the pack''s namespace');
select is((select version from genesis_work.installed_packs where tenant_id = pg_temp.tenant(1)), '1.0.0', 'the install is recorded');
select is(genesis_work.install_content_pack(pg_temp.tenant(1), pg_temp.pack('1.0.0', 90)) -> 'added', '[]'::jsonb, 'installing again adds nothing');
select is((select count(*)::int from genesis_work.session_types where tenant_id = pg_temp.tenant(1)), 1, 'and duplicates nothing');

-- Reading and editing -----------------------------------------------------------------------
select pg_temp.sign_in('b2');
select is((select text from genesis_work.labels where label_key = 'pursuit.quarter'), 'Priorities', 'a member reads the tenant''s labels');
select is((select count(*)::int from genesis_work.installed_packs), 1, 'and what''s installed');
select is_empty($$ update genesis_work.labels set text = 'Big goals' returning label_key $$, 'a member who can''t write the tenant''s rows doesn''t edit labels');
select pg_temp.sign_in('a1');
select isnt_empty($$ update genesis_work.session_types set default_minutes = 60 where source_key = 'weekly' returning id $$, 'the lead customizes the pack''s session type');
select pg_temp.sign_in('c3');
select is((select count(*)::int from genesis_work.metric_templates), 0, 'another tenant sees none of it');

-- Updating ----------------------------------------------------------------------------------
select pg_temp.as_server();
select is(genesis_work.install_content_pack(pg_temp.tenant(1), pg_temp.pack('1.1.0', 75)) -> 'kept', '["sessionTypes.weekly"]'::jsonb,
  'a newer version keeps what the tenant customized');
select is((select default_minutes from genesis_work.session_types where source_key = 'weekly'), 60, 'the tenant''s change stands');
select is((select version from genesis_work.installed_packs where tenant_id = pg_temp.tenant(1)), '1.1.0', 'the install moves to the new version');
update genesis_work.metric_templates set goal_value = 50 where template_key = 'new_leads';
select is(genesis_work.install_content_pack(pg_temp.tenant(1),
    jsonb_set(pg_temp.pack('1.2.0', 75), '{metricTemplates,0,goalValue}', '60')) -> 'updated',
  '["metricTemplates.new_leads"]'::jsonb, 'a newer version updates what nobody changed');

-- Uninstalling ------------------------------------------------------------------------------
insert into genesis_work.pursuits (tenant_id, organization_id, title, custom)
values (pg_temp.tenant(1), pg_temp.tenant(1), 'Company goal', '{"team-rhythm.level": "company"}');
select is(genesis_work.uninstall_content_pack(pg_temp.tenant(1), 'team-rhythm') -> 'kept',
  '["sessionTypes.weekly", "fieldDefinitions.level"]'::jsonb, 'uninstalling keeps customized and used items');
select is((select count(*)::int from genesis_work.metric_templates where tenant_id = pg_temp.tenant(1)), 0, 'and removes the rest');
select is((select count(*)::int from genesis_work.installed_packs where tenant_id = pg_temp.tenant(1)), 0, 'and forgets the install');

select * from finish();
rollback;
