-- pgTAP test for 0021_genesis_settings_integer.sql: a number the catalogue declares whole refuses a
-- fraction; other numbers still take one; a malformed `integer` refuses every value. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

delete from public.genesis_app_manifest;
insert into public.genesis_app_manifest (app_id, catalogue) values ('sample-app', '{
  "diagnostics.perHour": {"type": "number", "applies": "runtime", "scope": "app", "min": 1, "max": 100, "integer": true},
  "acme.ratio": {"type": "number", "applies": "runtime", "scope": "app"},
  "acme.bad": {"type": "number", "applies": "runtime", "scope": "app", "integer": "yes"}
}');

select is(private.genesis_setting_problem('diagnostics.perHour', '2.5'), 'diagnostics.perHour must be a whole number', 'a fraction is refused for a whole number');
select is(private.genesis_setting_problem('diagnostics.perHour', '2'), null, 'a whole number is fine');
select is(private.genesis_setting_problem('diagnostics.perHour', '500'), 'diagnostics.perHour must be at most 100', 'bounds still hold');
select is(private.genesis_setting_problem('acme.ratio', '2.5'), null, 'other numbers still take a fraction');
select ok(private.genesis_setting_problem('acme.bad', '2') like '%malformed%', 'a malformed integer flag refuses every value');

select * from finish();
rollback;
