-- pgTAP test for 0003_genesis_apple_token_revocation.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It reads only its own users and rows and rolls everything back. (The claim
-- cases push any other queued row out of reach first, inside this transaction.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000003' || n)::uuid, 'authenticated', 'authenticated', 'genesis-apple-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.u(n text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-0000000003' || n)::uuid $$;
create function pg_temp.queued(n text) returns bigint language sql as $$
  select count(*) from private.genesis_apple_revocations where user_id = pg_temp.u(n)
$$;

-- The tables: private, row level security on, nothing granted -----------------
select ok((select relrowsecurity from pg_class where oid = 'private.genesis_apple_tokens'::regclass), 'genesis_apple_tokens has row level security on');
select ok((select relrowsecurity from pg_class where oid = 'private.genesis_apple_revocations'::regclass), 'genesis_apple_revocations has row level security on');
select ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) r(role),
         unnest(array['private.genesis_apple_tokens', 'private.genesis_apple_revocations']) t(tbl),
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p(priv)
    where has_table_privilege(r.role, t.tbl, p.priv)
  ),
  'anon and authenticated have no privilege on either table'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('private.genesis_apple_tokens'::regclass, 'private.genesis_apple_revocations'::regclass) and a.grantee = 0
  ),
  'public has no grant on either table'
);
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use the private schema');

-- The functions: security definer, empty search_path, service_role only ---------
create temp table genesis_fns (sig regprocedure, public_api boolean);
insert into genesis_fns values
  ('private.genesis_apple_queue_revocation()'::regprocedure, false),
  ('public.genesis_apple_token_save(uuid, text, text)'::regprocedure, true),
  ('public.genesis_apple_revocations_claim(integer)'::regprocedure, true),
  ('public.genesis_apple_revocation_done(bigint)'::regprocedure, true),
  ('public.genesis_apple_revocation_failed(bigint, text)'::regprocedure, true);

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from genesis_fns f join pg_proc p on p.oid = f.sig),
  'every function is security definer with an empty search_path'
);
select ok(
  (select bool_and(p.proowner::regrole::text = 'postgres') from genesis_fns f join pg_proc p on p.oid = f.sig),
  'every function is owned by postgres, as hosted migrations run'
);
select ok(
  not exists (select 1 from genesis_fns f where has_function_privilege('anon', f.sig, 'execute')),
  'anon can execute none of them'
);
select ok(
  not exists (select 1 from genesis_fns f where has_function_privilege('authenticated', f.sig, 'execute')),
  'authenticated can execute none of them'
);
select ok(
  not exists (
    select 1 from genesis_fns f join pg_proc p on p.oid = f.sig, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'public has no execute grant on any of them'
);
select ok(
  (select bool_and(has_function_privilege('service_role', f.sig, 'execute')) from genesis_fns f where f.public_api),
  'service_role can execute the four public functions'
);
select ok(
  not has_function_privilege('service_role', 'private.genesis_apple_queue_revocation()', 'execute'),
  'service_role cannot call the trigger function directly'
);
select is(
  (select count(*)::int from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'genesis_apple_queue_revocation' and not tgisinternal and tgenabled <> 'D'),
  1,
  'the delete trigger is on auth.users'
);

-- A signed-in person can't reach a token, theirs or anyone's -----------------------
insert into private.genesis_apple_tokens (user_id, client_id, refresh_token) values (pg_temp.u('a1'), 'com.example.app', 'rt-a1-old');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000003a1', true);
set local role authenticated;
select throws_ok($$ select refresh_token from private.genesis_apple_tokens $$, '42501', null, 'authenticated cannot read the tokens table');
select throws_ok($$ select refresh_token from private.genesis_apple_revocations $$, '42501', null, 'authenticated cannot read the queue');
select throws_ok(
  $$ select public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003b2', 'com.example.app', 'planted') $$,
  '42501', null, 'authenticated cannot save a token'
);
select throws_ok($$ select * from public.genesis_apple_revocations_claim(100) $$, '42501', null, 'authenticated cannot claim the queue');
select throws_ok($$ select public.genesis_apple_revocation_done(1) $$, '42501', null, 'authenticated cannot drop a queued token');
reset role;

set local role anon;
select throws_ok($$ select * from public.genesis_apple_revocations_claim(100) $$, '42501', null, 'anon cannot claim the queue');
reset role;

-- Saving (service_role, as the Edge Function) ------------------------------------
set local role service_role;
select is(public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003a1', 'com.example.app', 'rt-a1-new'), 'stored', 'a sign-in''s token is stored');
reset role;
select is(
  (select array_agg(refresh_token) from private.genesis_apple_tokens where user_id = pg_temp.u('a1')),
  array['rt-a1-new'],
  '... replacing the earlier one for that client id'
);
set local role service_role;
select is(public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003a1', 'com.example.app.dev', 'rt-a1-dev'), 'stored', 'another client id keeps its own token');
select is(
  public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003ff', 'com.example.app', 'rt-gone'),
  'queued',
  'a token for a login that is already gone goes to the queue'
);
select throws_ok(
  $$ select public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003b2', 'not a bundle id!', 'rt') $$,
  '23514', null, 'a malformed client id is refused'
);
reset role;
create function pg_temp.save_error_text() returns text language plpgsql as $f$
declare msg text; det text;
begin
  perform public.genesis_apple_token_save('00000000-0000-4000-8000-0000000003b2', 'com.example.app', repeat('secret-token-', 400));
  return 'no error';
exception when others then
  get stacked diagnostics msg = message_text, det = pg_exception_detail;
  return coalesce(msg, '') || '|' || coalesce(det, '');
end $f$;
select ok(pg_temp.save_error_text() !~ 'secret-token', '... and a refused token never appears in the error');
select is(pg_temp.queued('ff'), 1::bigint, '... and is queued once');

-- Deleting the login queues its tokens -------------------------------------------
delete from auth.users where id = pg_temp.u('a1');
select is((select count(*) from private.genesis_apple_tokens where user_id = pg_temp.u('a1')), 0::bigint, 'deleting the login removes its stored tokens');
select is(
  (select array_agg(refresh_token order by client_id) from private.genesis_apple_revocations where user_id = pg_temp.u('a1')),
  array['rt-a1-new', 'rt-a1-dev'],
  '... after queueing every one of them for revocation'
);

-- A refused delete queues nothing ---------------------------------------------------
insert into private.genesis_apple_tokens (user_id, client_id, refresh_token) values (pg_temp.u('b2'), 'com.example.app', 'rt-b2');
create table public.genesis_test_apple_kept (person uuid references auth.users (id));
insert into public.genesis_test_apple_kept values (pg_temp.u('b2'));
select throws_ok($$ delete from auth.users where id = '00000000-0000-4000-8000-0000000003b2' $$, '23503', null, 'a delete refused by a foreign key fails');
select is(pg_temp.queued('b2'), 0::bigint, '... and queues nothing');
select is((select count(*) from private.genesis_apple_tokens where user_id = pg_temp.u('b2')), 1::bigint, '... and keeps the stored token');

-- Claiming, retrying and finishing ------------------------------------------------
update private.genesis_apple_revocations set next_attempt_at = 'infinity' where user_id not in (pg_temp.u('a1'), pg_temp.u('ff'));

create temp table claimed (id bigint, client_id text, refresh_token text, attempts integer);
grant insert on claimed to service_role;
set local role service_role;
insert into claimed select * from public.genesis_apple_revocations_claim(100);
reset role;
select is(
  (select array_agg(c.refresh_token order by c.refresh_token) from claimed c),
  array['rt-a1-dev', 'rt-a1-new', 'rt-gone'],
  'a claim hands out every due revocation'
);
select ok((select bool_and(c.attempts = 1) from claimed c), '... counting the attempt');
select ok(
  (select bool_and(r.next_attempt_at > now()) from private.genesis_apple_revocations r join claimed c using (id)),
  '... and leasing each row until its next retry'
);
create temp table ids as select (select id from claimed where refresh_token = 'rt-a1-dev') as failing, (select id from claimed where refresh_token = 'rt-a1-new') as revoked;
set local role service_role;
select is((select count(*) from public.genesis_apple_revocations_claim(100)), 0::bigint, 'a second claim takes none of the leased rows');
reset role;
select set_config('genesis.failing', (select failing::text from ids), true);
select set_config('genesis.revoked', (select revoked::text from ids), true);
set local role service_role;
select is(public.genesis_apple_revocation_failed(current_setting('genesis.failing')::bigint, repeat('x', 300)), 'retry', 'a failure is kept for a retry');
select public.genesis_apple_revocation_done(current_setting('genesis.revoked')::bigint);
reset role;
select is(
  (select length(last_error) from private.genesis_apple_revocations where refresh_token = 'rt-a1-dev'),
  200,
  '... with its reason cut to 200 characters'
);
select is(
  (select count(*) from private.genesis_apple_revocations where refresh_token = 'rt-a1-new'),
  0::bigint,
  'a revoked token is forgotten'
);

-- Backoff: one minute, doubling, at most a day.
update private.genesis_apple_revocations set next_attempt_at = now() - interval '1 second', attempts = 30 where refresh_token = 'rt-a1-dev';
set local role service_role;
select is((select count(*) from public.genesis_apple_revocations_claim(100)), 1::bigint, 'a due retry is claimed again');
reset role;
select ok(
  (select next_attempt_at between now() + interval '23 hours 59 minutes' and now() + interval '1 day' from private.genesis_apple_revocations where refresh_token = 'rt-a1-dev'),
  'retries are at most a day apart'
);

-- Giving up: after the 30th attempt the token goes and the row stays as the record.
set local role service_role;
select is(public.genesis_apple_revocation_failed(current_setting('genesis.failing')::bigint, 'check: invalid_client (HTTP 400)'), 'gave_up', 'the 30th failed attempt gives up');
select public.genesis_apple_revocation_done(current_setting('genesis.failing')::bigint);
reset role;
select ok(
  (select refresh_token is null and last_error like 'gave_up after 31 attempts: check: invalid_client%' from private.genesis_apple_revocations where id = current_setting('genesis.failing')::bigint),
  '... dropping the token and keeping the row, which done() leaves alone'
);

-- An Apple login with no stored token leaves a record -------------------------------
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('apple-sub-c3', pg_temp.u('c3'), '{"sub": "apple-sub-c3"}', 'apple');
delete from auth.users where id = pg_temp.u('c3');
select ok(
  (select count(*) = 1 and bool_and(refresh_token is null and client_id is null and last_error like 'no_token:%') from private.genesis_apple_revocations where user_id = pg_temp.u('c3')),
  'deleting an Apple login with no stored token records that nothing was revoked'
);
update private.genesis_apple_revocations set next_attempt_at = now() - interval '1 second' where user_id = pg_temp.u('c3');
set local role service_role;
select is((select count(*) from public.genesis_apple_revocations_claim(100)), 0::bigint, '... and a claim never hands out a row without a token');
reset role;

select * from finish();
rollback;
