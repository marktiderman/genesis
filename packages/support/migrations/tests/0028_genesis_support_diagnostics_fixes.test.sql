-- @feat:support-feedback
-- pgTAP test for 0028_genesis_support_diagnostics_fixes.sql: a whole number stored with a decimal
-- point (`10.0`) reads as an integer, so dumps still go in and the purge still runs; a real
-- fraction is still skipped; a dump without its schema is refused. Rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000028' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.dump() returns jsonb language sql immutable as $$
  select '{"schema": "genesis.diagnostics/1", "trigger": "manual"}'::jsonb $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-settings-numeric-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

-- 1. The reader ---------------------------------------------------------------------------------

insert into public.genesis_settings (key, value) values ('diagnostics.perHour', '2.0'), ('diagnostics.retentionDays', '30.0');
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 2, '2.0 in the database reads as 2');
select is(private.genesis_support_setting_int('diagnostics.retentionDays', 90, 7, 365), 30, '30.0 reads as 30');

insert into public.genesis_app_manifest (app_id, file_settings)
values ('sample-app', '{"diagnostics.perHour": {"value": 3.0, "locked": true}}');
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 3, 'a locked 3.0 in genesis.config.json reads as 3');
delete from public.genesis_app_manifest;

update public.genesis_settings set value = '2.5' where key = 'diagnostics.perHour';
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 10, 'a real fraction is still skipped');
update public.genesis_settings set value = '2.0' where key = 'diagnostics.perHour';

select ok(not has_function_privilege('authenticated', 'private.genesis_support_setting_int(text, integer, integer, integer)', 'execute'), 'people can''t call the reader');

-- 2. Dumps go in, two an hour -------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok(
  $$insert into public.support_diagnostics (trigger, report) select 'shake', pg_temp.dump() from generate_series(1, 2)$$,
  'with diagnostics.perHour at 2.0, two dumps go in');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('shake', pg_temp.dump())$$,
  'GS429', null, 'and the third is refused by the limit, not by a failed cast');
reset role;

-- 3. A dump says its schema --------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$insert into public.support_diagnostics (user_id, trigger, report) values (pg_temp.person('c3'), 'manual', '{}')$$,
  '23514', null, 'a dump with no schema is refused');
select throws_ok(
  $$insert into public.support_diagnostics (user_id, trigger, report) values (pg_temp.person('c3'), 'manual', '{"schema": null}')$$,
  '23514', null, 'a dump with a null schema is refused');
select lives_ok(
  $$insert into public.support_diagnostics (user_id, trigger, report) values (pg_temp.person('c3'), 'manual', pg_temp.dump())$$,
  'a dump that says genesis.diagnostics/1 goes in');
delete from public.support_diagnostics where user_id = pg_temp.person('c3');

-- 4. The purge runs -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.support_diagnostics (user_id, trigger, report)
select pg_temp.person('b2'), 'manual', pg_temp.dump() from generate_series(1, 2);
update public.support_diagnostics set created_at = now() - interval '45 days' where user_id = pg_temp.person('b2');
select is(public.support_purge_diagnostics(), 2, 'with diagnostics.retentionDays at 30.0, dumps older than 30 days go');

select * from finish();
rollback;
