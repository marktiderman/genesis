-- @feat:collaboration
-- pgTAP test for 0001_genesis_collab.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, audiences and spaces, and rolls everything back.
--
-- People: 01 starts the space (its owner); a2, b3, c4 and d5 are in the test's group, which
-- takes part; f6 is a facilitator; 07 views; 08 is in nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-00000000c1' || n)::uuid, 'authenticated', 'authenticated', 'genesis-collab-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['01', 'a2', 'b3', 'c4', 'd5', 'f6', '07', '08']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000c1' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server() to anon, authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert, update on t to authenticated, service_role;
create function pg_temp.v(k_ text) returns uuid language sql stable as $$ select v from t where k = k_ $$;
grant execute on function pg_temp.v(text) to authenticated, service_role;

-- The app's side: a group table, its members function, and who may start a space (01).
create table public.genesis_collab_test_group_members (group_id uuid, user_id uuid);
insert into public.genesis_collab_test_group_members
select '00000000-0000-4000-8000-0000000000aa', pg_temp.person(n) from unnest(array['a2', 'b3', 'c4', 'd5']) n;
create function public.genesis_collab_test_members(audience uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.genesis_collab_test_group_members m where m.group_id = audience
$$;
create function public.genesis_collab_test_may_start(tenant uuid, subject_type text, subject_id text, person uuid)
returns boolean language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-00000000c101'::uuid
$$;
create function public.genesis_collab_test_bad(audience uuid) returns uuid language sql as $$ select audience $$;

select throws_ok($$ select genesis_collab.register_audience('group', 'Group', 'public.genesis_collab_test_bad(uuid)') $$,
  '22023', null, 'an audience''s members function must return setof uuid');
select lives_ok($$ select genesis_collab.register_audience('group', 'Group', 'public.genesis_collab_test_members(uuid)') $$,
  'an app registers its audience kind');
select throws_ok($$ select genesis_collab.register_subject('worksheet', 'Worksheet', 'public.genesis_collab_test_members(uuid)') $$,
  '22023', null, 'a create check must be (uuid, text, text, uuid) returns boolean');
select lives_ok($$ select genesis_collab.register_subject('worksheet', 'Worksheet', 'public.genesis_collab_test_may_start(uuid, text, text, uuid)') $$,
  'an app registers a subject type with its create check');

-- ── Starting a space ──────────────────────────────────────────────────────────

select pg_temp.sign_in('a2');
select throws_ok($$ select genesis_collab.create_space('00000000-0000-4000-8000-0000000000ee', 'worksheet', 'w1') $$,
  '42501', null, 'the create check refuses someone it doesn''t allow');
select throws_ok($$ select genesis_collab.create_space('00000000-0000-4000-8000-0000000000ee', 'lesson', 'l1') $$,
  '22023', null, 'an unknown subject type is refused');

select pg_temp.sign_in('01');
insert into t select 'space', genesis_collab.create_space('00000000-0000-4000-8000-0000000000ee', 'worksheet', 'w1', 'Weekly check-in');
select is(genesis_collab.role_of(pg_temp.v('space')), 'owner', 'whoever starts a space owns it');
select lives_ok($$ select genesis_collab.add_member(pg_temp.v('space'), 'group', '00000000-0000-4000-8000-0000000000aa', 'participant') $$,
  'the owner adds a group as participants');
select lives_ok($$ select genesis_collab.add_member(pg_temp.v('space'), 'person', pg_temp.person('f6'), 'facilitator') $$,
  'and a facilitator');
select lives_ok($$ select genesis_collab.add_member(pg_temp.v('space'), 'person', pg_temp.person('07'), 'viewer') $$,
  'and a viewer');
select throws_ok($$ select genesis_collab.add_member(pg_temp.v('space'), 'team', '00000000-0000-4000-8000-0000000000aa') $$,
  '22023', null, 'an unknown audience kind is refused');

select pg_temp.sign_in('a2');
select is(genesis_collab.role_of(pg_temp.v('space')), 'participant', 'a group member takes part through the group');
select throws_ok($$ select genesis_collab.add_member(pg_temp.v('space'), 'person', pg_temp.person('08')) $$,
  '42501', null, 'a participant can''t add people');
select throws_ok($$ select genesis_collab.set_policy(pg_temp.v('space'), p_visibility => 'hidden') $$,
  '42501', null, 'or change how it''s shared');
select throws_ok($$ select genesis_collab.role_of(pg_temp.v('space'), '00000000-0000-4000-8000-00000000c1b3') $$,
  '42501', null, 'a person can''t ask about someone else''s access');
select pg_temp.sign_in('08');
select is(genesis_collab.role_of(pg_temp.v('space')), null, 'someone in nothing has no role');
select is(genesis_collab.gate(pg_temp.v('space')), 'none', 'and no way in');
select is((select count(*)::int from genesis_collab.space(pg_temp.v('space'))), 0, 'nor sees the space');

-- A direct role stronger than the group's wins.
select pg_temp.sign_in('01');
select genesis_collab.add_member(pg_temp.v('space'), 'person', pg_temp.person('d5'), 'facilitator');
select pg_temp.sign_in('d5');
select is(genesis_collab.role_of(pg_temp.v('space')), 'facilitator', 'the stronger of a person''s roles counts');
select pg_temp.sign_in('01');
select genesis_collab.remove_member(pg_temp.v('space'), 'person', pg_temp.person('d5'));

-- ── Default: full answers, once you've sent yours ─────────────────────────────

select pg_temp.sign_in('a2');
insert into t select 'a', genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-a', '2026-W44', p_sent => true);
select pg_temp.sign_in('b3');
insert into t select 'b', genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-b', '2026-W44');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'contribute_first', 'a draft doesn''t open the group''s answers');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'so b3 can''t read a2''s');
select ok(genesis_collab.can_see(pg_temp.v('b')), 'but reads their own draft');
select throws_ok($$ select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-a', '2026-W44') $$,
  '42501', null, 'nobody can claim someone else''s answer');
select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-b', '2026-W44', p_sent => true);
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'open', 'sending theirs opens it');
select ok(genesis_collab.can_see(pg_temp.v('a')), 'and b3 reads a2''s answer');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W45'), 'contribute_first', 'each period has its own gate');

select pg_temp.sign_in('c4');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'c4 hasn''t sent, so can''t read it');
select pg_temp.sign_in('07');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'open', 'a viewer doesn''t have to answer first');
select throws_ok($$ select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-v', '2026-W44') $$,
  '42501', null, 'and can''t answer');
select pg_temp.sign_in('08');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'someone outside the space reads nothing');
select throws_ok($$ select genesis_collab.can_see(pg_temp.v('a'), '00000000-0000-4000-8000-00000000c1b3') $$,
  '42501', null, 'nor asks whether someone else can');

select pg_temp.sign_in('b3');
select is((select count(*)::int from genesis_collab.contributions(pg_temp.v('space'), '2026-W44')), 2, 'b3 lists both answers');
select is((select count(*)::int from genesis_collab.roster(pg_temp.v('space'), '2026-W44') where sent > 0), 2, 'and sees who''s done');
select is((select expected from genesis_collab.space(pg_temp.v('space'), '2026-W44')), 4, 'four are expected');
select is((select sent from genesis_collab.space(pg_temp.v('space'), '2026-W44')), 2, 'two have sent');

-- ── Private ───────────────────────────────────────────────────────────────────

select pg_temp.sign_in('a2');
select genesis_collab.set_private(pg_temp.v('a'), true);
select ok(genesis_collab.can_see(pg_temp.v('a')), 'a private answer stays its author''s');
select pg_temp.sign_in('b3');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'and no one else''s');
select pg_temp.sign_in('f6');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'not even the facilitator''s');
select ok(genesis_collab.can_see(pg_temp.v('b')), 'who reads every shared answer');
select pg_temp.sign_in('b3');
select throws_ok($$ select genesis_collab.set_private(pg_temp.v('a'), false) $$,
  '42501', null, 'only its author can share it again');
select pg_temp.sign_in('a2');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'share_first', 'at Full, keeping yours private closes the group''s');
select ok(not genesis_collab.can_see(pg_temp.v('b')), 'so a2 can''t read b3''s');
select genesis_collab.set_private(pg_temp.v('a'), false);
select ok(genesis_collab.can_see(pg_temp.v('b')), 'until they share theirs');

-- ── Totals and anonymous need a minimum group ─────────────────────────────────

select pg_temp.sign_in('01');
select genesis_collab.set_policy(pg_temp.v('space'), p_visibility => 'totals', p_min_group => 1);
select is((select min_group from genesis_collab.space(pg_temp.v('space'))), 3, 'the minimum group never goes below 3');
select pg_temp.sign_in('b3');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'too_few', 'one other answer is too few for combined results');
select ok(not genesis_collab.may_aggregate(pg_temp.v('space'), '2026-W44'), 'so b3 gets none');
select pg_temp.sign_in('c4');
select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-c', '2026-W44', p_sent => true);
select pg_temp.sign_in('d5');
select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-d', '2026-W44', p_sent => true);
select pg_temp.sign_in('b3');
select ok(genesis_collab.may_aggregate(pg_temp.v('space'), '2026-W44'), 'three others make a group');
select ok(not genesis_collab.can_see(pg_temp.v('a')), 'at Totals nobody reads another''s answer');
select is((select count(*)::int from genesis_collab.roster(pg_temp.v('space'), '2026-W44')), 0, 'nor sees names');

select pg_temp.sign_in('01');
select genesis_collab.set_policy(pg_temp.v('space'), p_visibility => 'full', p_anonymous => true);
select pg_temp.sign_in('b3');
select ok(genesis_collab.can_see(pg_temp.v('a')), 'anonymous Full shows the answers');
select is((select count(*)::int from genesis_collab.contributions(pg_temp.v('space'), '2026-W44') where (author_id is not null or author_visible) and not mine), 0,
  'without their authors, and says so');
select pg_temp.sign_in('f6');
select is((select count(*)::int from genesis_collab.contributions(pg_temp.v('space'), '2026-W44') where author_id is not null), 4,
  'which the facilitator still sees');

-- ── After everyone, on reveal, hidden ─────────────────────────────────────────

select pg_temp.sign_in('01');
select genesis_collab.set_policy(pg_temp.v('space'), p_anonymous => false, p_reveal => 'after_all');
select pg_temp.sign_in('b3');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W45'), 'waiting_for_others', 'after everyone waits for all four');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'open', 'and opens once they''re in');

select pg_temp.sign_in('01');
select genesis_collab.set_policy(pg_temp.v('space'), p_reveal => 'on_reveal');
select pg_temp.sign_in('b3');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'waiting_for_reveal', 'a live session waits for the reveal');
select throws_ok($$ select genesis_collab.reveal(pg_temp.v('space')) $$, '42501', null, 'which participants can''t do');
select pg_temp.sign_in('f6');
select genesis_collab.reveal(pg_temp.v('space'));
select pg_temp.sign_in('b3');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'open', 'the facilitator reveals it');

select pg_temp.sign_in('01');
select genesis_collab.set_policy(pg_temp.v('space'), p_visibility => 'hidden');
select pg_temp.sign_in('b3');
select is(genesis_collab.gate(pg_temp.v('space'), '2026-W44'), 'hidden', 'Hidden shows nothing of each other');
select is((select sent from genesis_collab.space(pg_temp.v('space'), '2026-W44')), null, 'not even how many have answered');

-- ── Locking, ownership, access ────────────────────────────────────────────────

select pg_temp.sign_in('f6');
select genesis_collab.lock(pg_temp.v('space'));
select pg_temp.sign_in('b3');
select throws_ok($$ select genesis_collab.contribute(pg_temp.v('space'), 'answer', 'ans-b2', '2026-W45') $$,
  '55000', null, 'a locked space takes no answers');
select pg_temp.sign_in('01');
select throws_ok($$ select genesis_collab.remove_member(pg_temp.v('space'), 'person', '00000000-0000-4000-8000-00000000c101') $$,
  '23514', null, 'a space keeps its last owner');

select throws_ok($$ select * from genesis_collab.spaces $$, '42501', null, 'tables are reached only through the functions');
select pg_temp.as_anon();
select throws_ok($$ select genesis_collab.gate('00000000-0000-4000-8000-000000000000') $$, '42501', null, 'anon reaches nothing');

-- ── Account deletion ──────────────────────────────────────────────────────────

reset role;
delete from auth.users where id = pg_temp.person('07');
select is((select count(*)::int from genesis_collab.members where member_id = pg_temp.person('07')), 0,
  'a deleted login''s memberships go with it');
delete from auth.users where id = pg_temp.person('c4');
select is((select count(*)::int from genesis_collab.contributions where author_id = pg_temp.person('c4')), 0,
  'and so do its contributions');

select * from finish();
rollback;
