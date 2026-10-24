-- pgTAP test for 0001_genesis_account_deletion.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It reads only its own users and tables and rolls everything back. If your
-- app already has `private.genesis_before_account_delete`, the hook cases
-- replace it inside this transaction only.
--
-- Signing in: auth.uid() reads request.jwt.claims (and the legacy
-- request.jwt.claim.sub on older images), so each case sets both, then
-- switches to the authenticated role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-delete-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5', 'f6', '07']) n;

create function pg_temp.exists_user(n text) returns boolean language sql as $$
  select exists (select 1 from auth.users where id = ('00000000-0000-4000-8000-0000000000' || n)::uuid)
$$;

-- Shape and privileges -------------------------------------------------------
select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account is security definer'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account pins an empty search_path'
);
select is(
  (select proowner::regrole::text from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'postgres',
  'delete_my_account is owned by postgres, as hosted migrations run'
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
select ok(
  not has_function_privilege('authenticated', 'private.genesis_require_recent_sign_in(interval)', 'execute'),
  'authenticated cannot call the recent-sign-in helper directly'
);

-- Deletes only the caller ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'a signed-in person deletes their account');
reset role;
select ok(not pg_temp.exists_user('a1') and pg_temp.exists_user('b2'), 'only the caller''s login is gone');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'a call with no signed-in person is refused');
reset role;

-- Foreign keys -------------------------------------------------------------------
create table public.genesis_test_kept (person uuid references auth.users (id));
create table public.genesis_test_cascaded (person uuid references auth.users (id) on delete cascade);
insert into public.genesis_test_kept values ('00000000-0000-4000-8000-0000000000c3');
insert into public.genesis_test_cascaded values ('00000000-0000-4000-8000-0000000000d4');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, '23503', null, 'a row without on delete cascade refuses the delete');
reset role;
select ok(pg_temp.exists_user('c3'), '... and the login is kept');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d4', true);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'a person with cascading rows deletes their account');
reset role;
select is((select count(*) from public.genesis_test_cascaded)::int, 0, '... and their cascading rows go with it');

-- MFA step-up -------------------------------------------------------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000e5', 'genesis-test', 'totp', 'verified', now(), now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated","aal":"aal1"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'an aal1 session cannot delete an account with a verified factor');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'an aal2 session can');
reset role;

-- The app hook -------------------------------------------------------------------
create or replace function private.genesis_before_account_delete(person uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if person = '00000000-0000-4000-8000-0000000000f6' then
    raise exception 'sole owner';
  end if;
  if person = '00000000-0000-4000-8000-000000000007' then
    perform private.genesis_require_recent_sign_in(interval '10 minutes');
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f6', true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, 'GA001', 'sole owner', 'a hook that raises refuses the delete, as GA001');
reset role;
select ok(pg_temp.exists_user('f6'), '... and the login is kept');

-- Recent sign-in, turned on from the hook: an hour-old sign-in is refused, a fresh one isn't.
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-000000000007', 'role', 'authenticated',
  'iat', extract(epoch from now())::bigint,
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint))
)::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account() $$, 'GA002', null, 'a refreshed token from an old sign-in is refused when the app requires a recent one');
reset role;

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-4000-8000-000000000007', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint))
)::text, true);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'a recent sign-in passes');
reset role;

select * from finish();
rollback;
