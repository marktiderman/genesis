-- @feat:app-updates
-- pgTAP test for 0002_genesis_app_release_policy.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own `genesis-test-*` rows and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Shape -------------------------------------------------------------------------
select has_table('public', 'app_release_policy', 'app_release_policy exists');
select col_is_pk('public', 'app_release_policy', 'app_id', 'one row per app');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_release_policy'::regclass),
  'row level security is on'
);
select is(
  (select array_agg(polname::text order by polname) from pg_policy where polrelid = 'public.app_release_policy'::regclass),
  array['app_release_policy_read'],
  'the only policy is the read policy'
);
select is(
  (select polcmd::text from pg_policy where polrelid = 'public.app_release_policy'::regclass),
  'r',
  '... and it is for select'
);

-- Privileges ------------------------------------------------------------------------
select ok(has_table_privilege('anon', 'public.app_release_policy', 'select'), 'anon can read');
select ok(has_table_privilege('authenticated', 'public.app_release_policy', 'select'), 'authenticated can read');
select ok(
  not has_table_privilege('anon', 'public.app_release_policy', 'insert')
  and not has_table_privilege('anon', 'public.app_release_policy', 'update')
  and not has_table_privilege('anon', 'public.app_release_policy', 'delete')
  and not has_table_privilege('anon', 'public.app_release_policy', 'truncate'),
  'anon cannot write'
);
select ok(
  not has_table_privilege('authenticated', 'public.app_release_policy', 'insert')
  and not has_table_privilege('authenticated', 'public.app_release_policy', 'update')
  and not has_table_privilege('authenticated', 'public.app_release_policy', 'delete')
  and not has_table_privilege('authenticated', 'public.app_release_policy', 'truncate'),
  'authenticated cannot write'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.app_release_policy'::regclass and a.grantee = 0
  ),
  'public has no grant'
);
select ok(
  has_table_privilege('service_role', 'public.app_release_policy', 'insert')
  and has_table_privilege('service_role', 'public.app_release_policy', 'update')
  and has_table_privilege('service_role', 'public.app_release_policy', 'delete'),
  'the service role can write'
);

-- Writing and reading as each role ----------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ insert into public.app_release_policy (app_id, min_version_ios, min_version_android, store_url_ios, maintenance, maintenance_message, notes)
     values ('genesis-test-a', '1.4.0', '1.4', 'https://apps.apple.com/app/id1', true, 'Back soon',
             '[{"version": "1.4.0", "title": "Faster", "body": "Everything loads quicker."}]') $$,
  'the service role writes a policy'
);
reset role;

set local role anon;
select is(
  (select min_version_ios from public.app_release_policy where app_id = 'genesis-test-a'),
  '1.4.0',
  'anon reads it'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id) values ('genesis-test-b') $$,
  '42501', null, 'anon cannot insert'
);
select throws_ok(
  $$ update public.app_release_policy set maintenance = false where app_id = 'genesis-test-a' $$,
  '42501', null, 'anon cannot update'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select maintenance from public.app_release_policy where app_id = 'genesis-test-a'),
  true,
  'authenticated reads it'
);
select throws_ok(
  $$ delete from public.app_release_policy where app_id = 'genesis-test-a' $$,
  '42501', null, 'authenticated cannot delete'
);
select throws_ok(
  $$ update public.app_release_policy set min_version_ios = '0' where app_id = 'genesis-test-a' $$,
  '42501', null, 'authenticated cannot update'
);
reset role;

-- Checks keep malformed values out (the client fails open on them anyway) -------------------
select throws_ok(
  $$ insert into public.app_release_policy (app_id, min_version_ios) values ('genesis-test-c', '1.4-beta') $$,
  '23514', null, 'a minimum version must be plain dotted numbers'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id, min_version_android) values ('genesis-test-c', '1.2.3.4.5') $$,
  '23514', null, '... of at most four parts'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id, store_url_ios) values ('genesis-test-c', 'javascript:alert(1)') $$,
  '23514', null, 'a store link must be https or the store''s scheme'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id, notes) values ('genesis-test-c', '{"version": "1.0"}') $$,
  '23514', null, 'notes must be an array'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id, notes) values ('genesis-test-c', '[{"version": 1, "body": "x"}]') $$,
  '23514', null, 'each note needs a string version and body'
);
select throws_ok(
  $$ insert into public.app_release_policy (app_id, notes) values ('genesis-test-c', '[{"version": "1.0"}]') $$,
  '23514', null, '... a note without a body is refused'
);
select lives_ok(
  $$ insert into public.app_release_policy (app_id) values ('genesis-test-d') $$,
  'a row with nothing set is valid: no minimum, no maintenance, no notes'
);

select * from finish();
rollback;
