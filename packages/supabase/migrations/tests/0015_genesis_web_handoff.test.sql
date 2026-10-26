-- @feat:web-handoff
-- pgTAP test for 0015_genesis_web_handoff.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, sessions and handoffs and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000015' || n)::uuid, 'authenticated', 'authenticated', 'genesis-handoff-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000015' || n)::uuid $$;
create function pg_temp.session(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-0000000150' || lpad(n::text, 2, '0'))::uuid $$;
create function pg_temp.digest(n int) returns text language sql immutable as $$ select repeat(to_hex(n % 16), 64) $$;
create function pg_temp.nonce(n int) returns text language sql immutable as $$ select repeat(chr(96 + n), 64) $$;
grant execute on function pg_temp.person(text), pg_temp.session(int), pg_temp.digest(int), pg_temp.nonce(int) to anon, authenticated, service_role;

-- a1's app session (1), the web session a handoff makes (2), and a1's other device (3).
insert into auth.sessions (id, user_id, created_at, updated_at)
values (pg_temp.session(1), pg_temp.person('a1'), now(), now()),
       (pg_temp.session(2), pg_temp.person('a1'), now(), now()),
       (pg_temp.session(3), pg_temp.person('a1'), now(), now());

-- Shape and access --------------------------------------------------------------------

select has_table('private', 'genesis_web_handoffs', 'the handoff table is in private');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.genesis_web_handoffs'::regclass),
  'row level security is on'
);
select ok(
  not has_table_privilege('authenticated', 'private.genesis_web_handoffs', 'select')
  and not has_table_privilege('anon', 'private.genesis_web_handoffs', 'select'),
  'anon and authenticated cannot read the table'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer, uuid)',
      'public.genesis_web_handoff_claim(text, text, integer)',
      'public.genesis_web_handoff_continue(text)',
      'public.genesis_web_handoff_discard(text)',
      'public.genesis_web_handoff_bind_session(text, uuid, uuid)',
      'public.genesis_web_handoff_revoke_sessions(uuid, uuid)'
    ]) f
    cross join unnest(array['anon', 'authenticated']) r
    where has_function_privilege(r, f, 'execute')
  ),
  'anon and authenticated can execute none of the functions'
);
select ok(
  has_function_privilege('service_role', 'public.genesis_web_handoff_continue(text)', 'execute'),
  'service_role can'
);

-- Even granted, the functions refuse any role but service_role, whatever the JWT claims.
grant execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer, uuid) to authenticated;
grant execute on function public.genesis_web_handoff_revoke_sessions(uuid, uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.person('a1'), 'role', 'service_role')::text, true);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(1), '/x') $$,
  '42501', 'genesis_web_handoff_issue is for the server only',
  'issue: authenticated is refused even with a service_role claim in its JWT'
);
select throws_ok(
  $$ select public.genesis_web_handoff_revoke_sessions(pg_temp.person('a1'), pg_temp.session(1)) $$,
  '42501', 'genesis_web_handoff_revoke_sessions is for the server only',
  'revoke: the same'
);
reset role;
revoke execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer, uuid) from authenticated;
revoke execute on function public.genesis_web_handoff_revoke_sessions(uuid, uuid) from authenticated;

-- Issue, claim, continue ---------------------------------------------------------------

set local role service_role;
-- (Through a subquery: BETWEEN would call the function twice.)
select ok(
  (select e between now() + interval '59 seconds' and now() + interval '61 seconds'
   from (select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(1), '/clients/1/forms', 60, 10, 60, pg_temp.session(1)) as e) issued),
  'a handoff expires in 60 seconds by default'
);
select results_eq(
  $$ select user_id, path from public.genesis_web_handoff_claim(pg_temp.digest(1), pg_temp.nonce(1)) $$,
  $$ values (pg_temp.person('a1'), '/clients/1/forms') $$,
  'claiming returns the person and path'
);
select is_empty(
  $$ select * from public.genesis_web_handoff_claim(pg_temp.digest(1), pg_temp.nonce(2)) $$,
  'a link is claimed once'
);
select is_empty(
  $$ select * from public.genesis_web_handoff_claim(pg_temp.digest(9), pg_temp.nonce(3)) $$,
  'an unknown link claims nothing'
);
select results_eq(
  $$ select user_id, path from public.genesis_web_handoff_continue(pg_temp.nonce(1)) $$,
  $$ values (pg_temp.person('a1'), '/clients/1/forms') $$,
  'Continue with the nonce returns the person and path'
);
select is_empty(
  $$ select * from public.genesis_web_handoff_continue(pg_temp.nonce(1)) $$,
  'a nonce continues once'
);
select ok(
  not public.genesis_web_handoff_discard(pg_temp.nonce(1)),
  'a continued handoff cannot be discarded'
);

-- Bind and revoke.
select ok(
  not public.genesis_web_handoff_bind_session(pg_temp.nonce(1), pg_temp.person('b2'), pg_temp.session(2)),
  'bind refuses another person'
);
select ok(
  not public.genesis_web_handoff_bind_session(pg_temp.nonce(1), pg_temp.person('a1'), pg_temp.session(1)),
  'bind refuses the app session itself'
);
select ok(
  public.genesis_web_handoff_bind_session(pg_temp.nonce(1), pg_temp.person('a1'), pg_temp.session(2)),
  'bind keeps the web session'
);
select ok(
  not public.genesis_web_handoff_bind_session(pg_temp.nonce(1), pg_temp.person('a1'), pg_temp.session(3)),
  'bind happens once'
);
select is(public.genesis_web_handoff_revoke_sessions(pg_temp.person('b2'), pg_temp.session(1)), 0, 'another person ends nothing');
select is(public.genesis_web_handoff_revoke_sessions(pg_temp.person('a1'), pg_temp.session(3)), 0, 'another app session ends nothing');
select is(public.genesis_web_handoff_revoke_sessions(pg_temp.person('a1'), pg_temp.session(1)), 1, 'the app session that handed off ends one web session');
reset role;
select is(
  (select array_agg(id order by id) from auth.sessions where user_id = pg_temp.person('a1')),
  array[pg_temp.session(1), pg_temp.session(3)],
  'only the handed-off web session is gone; the app and the other device stay'
);
set local role service_role;
select is(public.genesis_web_handoff_revoke_sessions(pg_temp.person('a1'), pg_temp.session(1)), 0, 'ending again ends nothing');

-- Cancel, and the nonce's life.
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(2), '/a') $$,
  'a second handoff'
);
select lives_ok($$ select * from public.genesis_web_handoff_claim(pg_temp.digest(2), pg_temp.nonce(4)) $$, 'claimed');
select ok(public.genesis_web_handoff_discard(pg_temp.nonce(4)), 'Cancel discards it');
select is_empty($$ select * from public.genesis_web_handoff_continue(pg_temp.nonce(4)) $$, 'Continue after Cancel is refused');

select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('a1'), pg_temp.digest(3), '/a') $$,
  'a third handoff'
);
select lives_ok($$ select * from public.genesis_web_handoff_claim(pg_temp.digest(3), pg_temp.nonce(5), 5) $$, 'claimed with a 5-second nonce');
reset role;
update private.genesis_web_handoffs set nonce_expires_at = now() - interval '1 second' where nonce_digest = pg_temp.nonce(5);
set local role service_role;
select is_empty($$ select * from public.genesis_web_handoff_continue(pg_temp.nonce(5)) $$, 'Continue after the nonce expired is refused');

-- Expired links, refusals and the rate limit (b2).
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(4), '/a', 10) $$,
  'a 10-second handoff is issued'
);
reset role;
update private.genesis_web_handoffs set created_at = now() - interval '1 minute', expires_at = now() - interval '1 second' where token_digest = pg_temp.digest(4);
set local role service_role;
select is_empty(
  $$ select * from public.genesis_web_handoff_claim(pg_temp.digest(4), pg_temp.nonce(6)) $$,
  'an expired link claims nothing'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(5), '/a', 301) $$,
  '22023', null, 'a lifetime over 300 seconds is refused'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(5), '//evil.example') $$,
  '23514', null, 'a protocol-relative path is refused'
);
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(6), '/a', 60, 2, 60) $$,
  'first in the window'
);
select lives_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(7), '/a', 60, 2, 60) $$,
  'second in the window, at the limit'
);
select throws_ok(
  $$ select public.genesis_web_handoff_issue(pg_temp.person('b2'), pg_temp.digest(8), '/a', 60, 2, 60) $$,
  'GS429', null, 'the third in the window is refused'
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
