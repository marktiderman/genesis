-- @feat:support-feedback
-- pgTAP test for 0020_genesis_support_settings.sql: the dump's hourly limit and retention follow
-- the diagnostics.perHour and diagnostics.retentionDays settings (genesis-supabase 0020's tables,
-- read through 0023's private.genesis_setting since support 0033),
-- a value genesis.config.json locks wins over the database's, a value out of range is ignored,
-- and an explicit age still wins. Rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000020' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.dump() returns jsonb language sql immutable as $$
  select '{"schema": "genesis.diagnostics/1", "trigger": "manual"}'::jsonb $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-settings-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

-- 1. Reading a setting ---------------------------------------------------------------------------

select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 10, 'no manifest: the int reader falls back');

insert into public.genesis_app_manifest (app_id, file_settings, catalogue)
values ('sample-app', '{"diagnostics.perHour": 4, "diagnostics.retentionDays": {"value": 30, "locked": true}}', '{"diagnostics.perHour": {"type": "number", "applies": "runtime", "scope": "app", "integer": true, "min": 1, "max": 100, "defaults": {"max": 10, "standard": 10, "min": 10}}, "diagnostics.retentionDays": {"type": "number", "applies": "runtime", "scope": "app", "integer": true, "min": 7, "max": 365, "defaults": {"max": 90, "standard": 90, "min": 90}}, "diagnostics.enabled": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": true, "standard": true, "min": true}}}');
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 4, 'genesis.config.json''s value');

insert into public.genesis_settings (key, value) values ('diagnostics.perHour', '2'), ('diagnostics.retentionDays', '60');
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 2, 'the database layer wins over the file');
select is(private.genesis_support_setting_int('diagnostics.retentionDays', 90, 7, 365), 30, 'a value the file locks wins over the database');

update public.genesis_settings set value = '2.5' where key = 'diagnostics.perHour';
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 4, 'a fraction in the database is skipped for the file''s value, as resolveSettings does');
update public.genesis_settings set value = '500' where key = 'diagnostics.perHour';
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 4, 'out of range in the database is skipped for the file''s value, as resolveSettings does');
update public.genesis_settings set value = '"three"' where key = 'diagnostics.perHour';
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 4, 'not a number in the database is skipped for the file''s value, as resolveSettings does');
update public.genesis_settings set value = '2' where key = 'diagnostics.perHour';

select ok(not has_function_privilege('authenticated', 'private.genesis_support_setting_int(text, integer, integer, integer)', 'execute'), 'people can''t call the reader');

-- 2. The hourly limit --------------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok(
  $$insert into public.support_diagnostics (trigger, report) select 'shake', pg_temp.dump() from generate_series(1, 2)$$,
  'two dumps an hour, as diagnostics.perHour says');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('shake', pg_temp.dump())$$,
  'GS429', null, 'the third is refused');
reset role;

insert into public.genesis_settings (key, value) values ('diagnostics.enabled', 'false');
select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('manual', pg_temp.dump())$$,
  '42501', null, 'with diagnostics.enabled off, no dump is stored');
reset role;
delete from public.genesis_settings where key = 'diagnostics.enabled';

-- 3. Retention ----------------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.support_diagnostics (user_id, trigger, report)
select pg_temp.person('b2'), 'manual', pg_temp.dump() from generate_series(1, 2);
update public.support_diagnostics set created_at = now() - interval '45 days' where user_id = pg_temp.person('b2');
update public.support_diagnostics set created_at = now() - interval '10 days' where user_id = pg_temp.person('a1');
select is(public.support_purge_diagnostics(interval '50 days'), 0, 'an age passed in still wins');
select is(public.support_purge_diagnostics(), 2, 'by default, dumps older than the setting (30 days, locked) go');
select is((select count(*)::int from public.support_diagnostics), 2, 'newer ones stay');

select * from finish();
rollback;
