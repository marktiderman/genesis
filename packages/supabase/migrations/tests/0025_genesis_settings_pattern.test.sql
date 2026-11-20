-- pgTAP test for 0025_genesis_settings_pattern.sql: a string the catalogue gives a pattern refuses a
-- value of another shape in the database, tenant and person writes alike, and takes null when it may
-- be unset; other strings are untouched; a pattern that isn't a string, or doesn't compile, refuses
-- every value. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

delete from public.genesis_app_manifest;
insert into public.genesis_app_manifest (app_id, catalogue) values ('sample-app', '{
  "observability.sentryDsn": {"type": "string", "applies": "runtime", "scope": "app", "nullable": true, "defaults": {"max": null, "standard": null, "min": null}, "pattern": "^https?://[0-9a-f]{16,64}@[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*/[0-9]+$"},
  "acme.code": {"type": "string", "applies": "runtime", "scope": "tenant", "pattern": "^[A-Z]{3}$", "defaults": {"max": "ABC", "standard": "ABC", "min": "ABC"}},
  "acme.free": {"type": "string", "applies": "runtime", "scope": "app"},
  "acme.notString": {"type": "string", "applies": "runtime", "scope": "app", "pattern": 3},
  "acme.broken": {"type": "string", "applies": "runtime", "scope": "app", "pattern": "^([a-z]$"}
}');

select is(private.genesis_setting_problem('observability.sentryDsn', '"https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/42"'), null, 'a DSN of the right shape is fine');
select is(private.genesis_setting_problem('observability.sentryDsn', '"https://sentry.example.test/42"'),
  'observability.sentryDsn must match ^https?://[0-9a-f]{16,64}@[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*/[0-9]+$',
  'a DSN without its key is refused, naming the pattern');
select is(private.genesis_setting_problem('observability.sentryDsn', 'null'), null, 'null ("not set") is still fine for a key that may be unset');
select is(private.genesis_setting_problem('observability.sentryDsn', '42'), 'observability.sentryDsn must be a string', 'the type is checked first');
select is(private.genesis_scoped_setting_problem('tenant', 'acme.code', '"abc"'), 'acme.code must match ^[A-Z]{3}$', 'a tenant write is checked the same way');
select is(private.genesis_scoped_setting_problem('tenant', 'acme.code', '"ABC"'), null, '... and takes a value that matches');
select is(private.genesis_setting_problem('acme.free', '"anything at all"'), null, 'a string without a pattern takes anything');
select ok(private.genesis_setting_problem('acme.notString', '"x"') like '%malformed%', 'a pattern that is not a string refuses every value');
select ok(private.genesis_setting_problem('acme.broken', '"x"') like '%malformed%', 'a pattern Postgres cannot compile refuses every value');

select * from finish();
rollback;
