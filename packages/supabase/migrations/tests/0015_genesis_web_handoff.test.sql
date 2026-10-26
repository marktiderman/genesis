-- @feat:web-handoff
-- pgTAP test for 0015_genesis_web_handoff.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and handoffs and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000015' || n)::uuid, 'authenticated', 'authenticated', 'genesis-handoff-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000015' || n)::uuid $$;
create function pg_temp.digest(n int) returns text language sql immutable as $$ select repeat(to_hex(n % 16), 64) $$;
grant execute on function pg_temp.person(text), pg_temp.digest(int) to anon, authenticated, service_role;

-- Shape and access --------------------------------------------------------------------

select has_table('private', 'genesis_web_handoffs', 'the handoff table is in private');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.genesis_web_handoffs'::regclass),
  'row level security is on'
);
select ok(
  not has_function_privilege('authenticated', 'public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer)', 'execute'),
  'anon and authenticated cannot issue'
);
select ok(
  not has_function_privilege('authenticated', 'public.genesis_web_handoff_redeem(text)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_web_handoff_redeem(text)', 'execute'),
  'anon and authenticated cannot redeem'
);
select ok(
  not has_table_privilege('authenticated', 'private.genesis_web_handoffs', 'select'),
  'authenticated cannot read the table'
);

-- Even granted, the functions refuse any role but service_role, whatever the JWT claims.
grant execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.person('a1'), 'role', 'service_role')::text, true);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(1), '/x') $$,
  '42501', 'genesis_web_handoff_issue is for the server only',
  'authenticated is refused by the role check even with a service_role claim in its JWT'
);
reset role;
revoke execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer) from authenticated;

-- Issue and redeem -------------------------------------------------------------------

set local role service_role;
-- (Through a subquery: BETWEEN would call the function twice.)
select ok(
  (select e between now() + interval '59 seconds' and now() + interval '61 seconds'
   from (select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(1), '/clients/1/forms') as e) issued),
  'a handoff expires in 60 seconds by default'
);
select results_eq(
  $$ select user_id, path from public.genesis_web_handoff_redeem(pg_temp.digest(1)) $$,
  $$ values (pg_temp.person('a1'), '/clients/1/forms') $$,
  'redeeming returns the person and path'
);
select is_empty(
  $$ select * from public.genesis_web_handoff_redeem(pg_temp.digest(1)) $$,
  'a handoff is used once'
);
select is_empty(
  $$ select * from public.genesis_web_handoff_redeem(pg_temp.digest(9)) $$,
  'an unknown digest redeems nothing'
);
reset role;

-- Expired: issued, then aged past its expiry.
set local role service_role;
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(2), '/a', 10) $$,
  'a 10-second handoff is issued'
);
reset role;
update private.genesis_web_handoffs set created_at = now() - interval '1 minute', expires_at = now() - interval '1 second' where token_digest = pg_temp.digest(2);
set local role service_role;
select is_empty(
  $$ select * from public.genesis_web_handoff_redeem(pg_temp.digest(2)) $$,
  'an expired handoff redeems nothing'
);

-- Refusals.
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(3), '/a', 301) $$,
  '22023', null, 'a lifetime over 300 seconds is refused'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(3), '//evil.example') $$,
  '23514', null, 'a protocol-relative path is refused'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), 'not-a-digest', '/a') $$,
  '23514', null, 'something other than a SHA-256 digest is refused'
);

-- Rate limit: b2 has two in the last minute (digests 4 and 5 below; the expired one was moved
-- back a minute), so a limit of 3 a minute allows one more and refuses the next.
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(4), '/a', 60, 3, 60) $$,
  'first in the window'
);
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(5), '/a', 60, 3, 60) $$,
  'second in the window'
);
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(6), '/a', 60, 3, 60) $$,
  'third in the window, at the limit'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(7), '/a', 60, 3, 60) $$,
  'GS429', null, 'the fourth in the window is refused'
);
reset role;

-- Deleting the login deletes its handoffs.
delete from auth.users where id = pg_temp.person('b2');
select is(
  (select count(*)::int from private.genesis_web_handoffs where user_id = pg_temp.person('b2')),
  0, 'a deleted login leaves no handoffs'
);

select * from finish();
rollback;
