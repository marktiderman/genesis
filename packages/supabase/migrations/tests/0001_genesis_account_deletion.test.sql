-- pgTAP test for 0001_genesis_account_deletion.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It reads only its own two users and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, aud, role, email, instance_id)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'genesis-delete-a@example.test', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'genesis-delete-b@example.test', '00000000-0000-0000-0000-000000000000');

select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account is security definer'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account pins an empty search_path'
);
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'anon cannot execute it');
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.delete_my_account()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'public has no execute grant'
);
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), 'authenticated can execute it');

-- Signed in as A. Both settings: auth.uid() reads request.jwt.claims, and
-- the legacy request.jwt.claim.sub on older images.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select lives_ok($$ select public.delete_my_account() $$, 'a signed-in person deletes their account');
reset role;

select is(
  (select array_agg(email order by email) from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')),
  array['genesis-delete-b@example.test']::varchar[],
  'only the caller''s login is gone'
);

-- No signed-in person.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'a call with no signed-in person is refused');
reset role;

select * from finish();
rollback;
