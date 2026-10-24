-- @feat:tenant-features
-- pgTAP test for 0004_genesis_tenant_features.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, tenants and hooks and rolls everything back.
-- If your app already has the hooks (`private.genesis_tenant_admin`,
-- `private.genesis_tenant_member`), they are dropped and replaced inside this
-- transaction only.
--
-- Signing in: auth.uid() reads request.jwt.claims (and the legacy
-- request.jwt.claim.sub on older images), so pg_temp.sign_in sets both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- People: a1 and e5 admins of tenant 1, b2 member of tenant 1, c3 admin of tenant 2,
-- d4 nobody's admin but the owner of tenant 3.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-tenant-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tenant(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-00000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.tenant(int), pg_temp.sign_in(text) to anon, authenticated, service_role;

-- An app's tenant table, with the foreign keys the migration's header recommends.
-- A tenant owned by a person goes when they do (a personal workspace).
create table public.genesis_test_teams (id uuid primary key, owner uuid references auth.users (id) on delete cascade);
insert into public.genesis_test_teams values (pg_temp.tenant(1), null), (pg_temp.tenant(2), null), (pg_temp.tenant(3), pg_temp.person('d4'));
alter table public.tenant_features add foreign key (tenant_id) references public.genesis_test_teams (id) on delete cascade;
alter table public.tenant_feature_changes add foreign key (tenant_id) references public.genesis_test_teams (id) on delete cascade;

drop function if exists private.genesis_tenant_admin(uuid, uuid);
drop function if exists private.genesis_tenant_member(uuid, uuid);

-- Shape -------------------------------------------------------------------------
select has_table('public', 'tenant_features', 'tenant_features exists');
select col_is_pk('public', 'tenant_features', array['tenant_id', 'feature_id'], 'one switch per tenant and feature');
select has_table('public', 'tenant_feature_changes', 'tenant_feature_changes exists');
select ok((select relrowsecurity from pg_class where oid = 'public.tenant_features'::regclass), 'RLS is on for the switches');
select ok((select relrowsecurity from pg_class where oid = 'public.tenant_feature_changes'::regclass), 'RLS is on for the history');
select is(
  (select count(*)::int from pg_policy where polrelid in ('public.tenant_features'::regclass, 'public.tenant_feature_changes'::regclass)),
  0,
  'no policies: the tables are reached only through the functions'
);

-- Privileges ------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.tenant_features', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.tenant_features', 'select,insert,update,delete,truncate'),
  'anon and authenticated have no privilege on the switches'
);
select ok(
  not has_table_privilege('anon', 'public.tenant_feature_changes', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.tenant_feature_changes', 'select,insert,update,delete,truncate'),
  '... nor on the history'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.tenant_features'::regclass, 'public.tenant_feature_changes'::regclass) and a.grantee = 0
  ),
  'public has no grant on either table'
);
select ok(
  has_table_privilege('service_role', 'public.tenant_features', 'insert')
  and has_table_privilege('service_role', 'public.tenant_features', 'update')
  and has_table_privilege('service_role', 'public.tenant_features', 'delete'),
  'the service role writes the switches'
);
select ok(
  not has_table_privilege('service_role', 'public.tenant_feature_changes', 'insert')
  and not has_table_privilege('service_role', 'public.tenant_feature_changes', 'update')
  and has_table_privilege('service_role', 'public.tenant_feature_changes', 'delete'),
  'the service role can purge the history but never write it'
);

select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'] and proowner::regrole::text = 'postgres') from pg_proc
   where oid in (
     'public.set_tenant_feature(uuid, text, boolean, text)'::regprocedure,
     'public.tenant_features_off(uuid)'::regprocedure,
     'public.tenant_feature_settings(uuid)'::regprocedure,
     'public.tenant_feature_history(uuid, integer)'::regprocedure,
     'private.tenant_feature_on(uuid, text)'::regprocedure,
     'private.genesis_is_tenant_admin(uuid)'::regprocedure,
     'private.genesis_is_tenant_member(uuid)'::regprocedure,
     'private.genesis_record_tenant_feature_change()'::regprocedure
   )),
  'every function is security definer, owned by postgres, with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.set_tenant_feature(uuid, text, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'public.tenant_features_off(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.tenant_feature_settings(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.tenant_feature_history(uuid, integer)', 'execute'),
  'anon executes none of the public functions'
);
select ok(
  has_function_privilege('authenticated', 'public.set_tenant_feature(uuid, text, boolean, text)', 'execute')
  and has_function_privilege('authenticated', 'public.tenant_features_off(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.tenant_feature_settings(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.tenant_feature_history(uuid, integer)', 'execute'),
  'authenticated executes them (each asks the hook)'
);
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in (
      'public.set_tenant_feature(uuid, text, boolean, text)'::regprocedure,
      'public.tenant_features_off(uuid)'::regprocedure,
      'public.tenant_feature_settings(uuid)'::regprocedure,
      'public.tenant_feature_history(uuid, integer)'::regprocedure,
      'private.tenant_feature_on(uuid, text)'::regprocedure,
      'private.genesis_is_tenant_admin(uuid)'::regprocedure,
      'private.genesis_is_tenant_member(uuid)'::regprocedure,
      'private.genesis_record_tenant_feature_change()'::regprocedure
    ) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'public executes none of them'
);
select ok(
  not has_function_privilege('anon', 'private.genesis_is_tenant_admin(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_is_tenant_admin(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_is_tenant_member(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.genesis_record_tenant_feature_change()', 'execute'),
  'the hook checks and the trigger are not executable by anon or authenticated'
);
select ok(
  not has_function_privilege('anon', 'private.tenant_feature_on(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.tenant_feature_on(uuid, text)', 'execute'),
  'the SQL gate (no member check) is for definer functions, not anon or authenticated'
);
select ok(
  not has_sequence_privilege('anon', 'public.tenant_feature_changes_id_seq', 'usage,select,update')
  and not has_sequence_privilege('authenticated', 'public.tenant_feature_changes_id_seq', 'usage,select,update'),
  'the history''s id sequence is not anon''s or authenticated''s'
);
select ok(
  not has_table_privilege('service_role', 'public.tenant_features', 'truncate,references,trigger'),
  'the service role cannot truncate the switches (which would skip the history)'
);

-- Without the hook, nobody may change anything --------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'Not yet') $$,
  '42501', 'set_tenant_feature: nobody may change tenant features yet',
  'without private.genesis_tenant_admin, set_tenant_feature refuses (fails closed)'
);
select throws_ok(
  $$ select * from public.tenant_features_off(pg_temp.tenant(1)) $$,
  '42501', null,
  '... and nobody may read a tenant''s switches'
);
reset role;

-- The app's hooks, reading a membership table of the test's own --------------------
create table private.genesis_test_members (tenant uuid, person uuid, admin boolean);
insert into private.genesis_test_members values
  (pg_temp.tenant(1), pg_temp.person('a1'), true),
  (pg_temp.tenant(1), pg_temp.person('e5'), true),
  (pg_temp.tenant(1), pg_temp.person('b2'), false),
  (pg_temp.tenant(2), pg_temp.person('c3'), true);
create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = $1 and m.person = $2 and m.admin)
$$;
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.genesis_test_members m where m.tenant = $1 and m.person = $2)
$$;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_member(uuid, uuid) from public, anon, authenticated;

-- Who may change a switch ------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'x') $$,
  '42501', null, 'anon cannot call set_tenant_feature'
);
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'x') $$,
  '42501', 'set_tenant_feature: not signed in', 'a call with nobody signed in is refused'
);
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'Members want it off') $$,
  '42501', 'set_tenant_feature: only the tenant''s admins can change its features', 'a member who isn''t an admin is refused'
);
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'Not mine') $$,
  '42501', null, 'another tenant''s admin is refused'
);
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, '   ') $$,
  '22023', null, 'a blank reason is refused'
);
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, repeat('x', 501)) $$,
  '22023', null, 'a reason over 500 characters is refused'
);
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', null, 'why') $$,
  '22004', null, 'enabled must be given'
);
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'Not An Id', false, 'why') $$,
  '23514', null, 'a feature id must have a FeatureId''s shape'
);
select lives_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, '  Launching next month  ') $$,
  'the tenant''s admin turns a feature off'
);
select lives_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'billing', false, 'Not offered here') $$,
  '... and another'
);
select throws_ok(
  $$ select * from public.tenant_features $$,
  '42501', null, 'authenticated cannot read the table directly'
);
select throws_ok(
  $$ insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values (pg_temp.tenant(1), 'x', false, 'x') $$,
  '42501', null, '... nor write it'
);
select throws_ok(
  $$ select * from public.tenant_feature_changes $$,
  '42501', null, '... nor read the history directly'
);
select throws_ok(
  $$ select private.genesis_is_tenant_admin(pg_temp.tenant(1)) $$,
  '42501', null, '... nor call the hook check itself'
);
reset role;

select is(
  (select reason from public.tenant_features where tenant_id = pg_temp.tenant(1) and feature_id = 'chat'),
  'Launching next month',
  'the reason is kept, trimmed'
);
select is(
  (select updated_by from public.tenant_features where tenant_id = pg_temp.tenant(1) and feature_id = 'chat'),
  pg_temp.person('a1'),
  '... with who set it'
);

select pg_temp.sign_in('e5');
set local role authenticated;
select lives_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'Launching next month') $$,
  'another admin saves the same switch and reason'
);
reset role;
select is(
  (select updated_by from public.tenant_features where tenant_id = pg_temp.tenant(1) and feature_id = 'chat'),
  pg_temp.person('a1'),
  '... which changes nothing, not even who set it'
);
select is(
  (select count(*)::int from public.tenant_feature_changes where tenant_id = pg_temp.tenant(1) and feature_id = 'chat'),
  1,
  '... and records nothing'
);

-- Who may read ------------------------------------------------------------------------
select pg_temp.sign_in('b2');
set local role authenticated;
select is(
  (select array_agg(f) from public.tenant_features_off(pg_temp.tenant(1)) f),
  array['billing', 'chat'],
  'a member reads the ids that are off, in order'
);
select throws_ok(
  $$ select * from public.tenant_feature_settings(pg_temp.tenant(1)) $$,
  '42501', null, '... but not the reasons (admins only)'
);
select throws_ok(
  $$ select * from public.tenant_feature_history(pg_temp.tenant(1)) $$,
  '42501', null, '... nor the history'
);
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok(
  $$ select * from public.tenant_features_off(pg_temp.tenant(1)) $$,
  '42501', null, 'someone outside the tenant cannot read its switches'
);
select is(
  (select count(*)::int from public.tenant_features_off(pg_temp.tenant(2))),
  0,
  'a tenant with no switches has nothing off'
);
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select is(
  (select array_agg(feature_id || ':' || enabled || ':' || reason order by feature_id) from public.tenant_feature_settings(pg_temp.tenant(1))),
  array['billing:false:Not offered here', 'chat:false:Launching next month'],
  'the admin reads every switch with its reason'
);
select lives_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', true, 'Launched') $$,
  'the admin turns it back on'
);
select is(
  (select array_agg(f) from public.tenant_features_off(pg_temp.tenant(1)) f),
  array['billing'],
  '... and it is no longer off'
);
select is(
  (select array_agg(enabled::text || ':' || reason || ':' || changed_role) from public.tenant_feature_history(pg_temp.tenant(1)) where feature_id = 'chat'),
  array['true:Launched:authenticated', 'false:Launching next month:authenticated'],
  'the history keeps both changes, newest first, with the role'
);
select is(
  (select count(*)::int from public.tenant_feature_history(pg_temp.tenant(1), 1)),
  1,
  'max_rows limits the history'
);
select ok(
  (select bool_and(changed_by = pg_temp.person('a1')) from public.tenant_feature_history(pg_temp.tenant(1))),
  'every change records who made it'
);
reset role;

-- The SQL gate --------------------------------------------------------------------------
select ok(not private.tenant_feature_on(pg_temp.tenant(1), 'billing'), 'tenant_feature_on: off when turned off');
select ok(private.tenant_feature_on(pg_temp.tenant(1), 'chat'), '... on when turned back on');
select ok(private.tenant_feature_on(pg_temp.tenant(2), 'billing'), '... on with no row (another tenant''s switch doesn''t leak)');

-- The service role -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select lives_ok(
  $$ insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values (pg_temp.tenant(2), 'chat', false, 'Platform: paused for review') $$,
  'the service role writes a switch directly'
);
select throws_ok(
  $$ insert into public.tenant_feature_changes (tenant_id, feature_id, enabled, reason, changed_role) values (pg_temp.tenant(2), 'chat', true, 'forged', 'authenticated') $$,
  '42501', null, '... but cannot forge history'
);
reset role;
select is(
  (select changed_role || ':' || coalesce(changed_by::text, 'nobody') from public.tenant_feature_changes where tenant_id = pg_temp.tenant(2)),
  'service_role:nobody',
  'its write is recorded, with no person'
);

-- A hook that answers null, or fails ----------------------------------------------------------
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select null::boolean $$;
select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'x') $$,
  '42501', null, 'a null answer from the hook is a no'
);
reset role;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language plpgsql stable set search_path = '' as $$ begin raise exception 'membership lookup failed'; end $$;
set local role authenticated;
select throws_ok(
  $$ select public.set_tenant_feature(pg_temp.tenant(1), 'chat', false, 'x') $$,
  'P0001', 'membership lookup failed', 'a hook that fails refuses the change'
);
reset role;

-- Deleting a tenant, or a person whose tenant goes with them, never fails on these tables ----------
select lives_ok($$ delete from public.genesis_test_teams where id = pg_temp.tenant(2) $$, 'deleting a tenant with switches and history succeeds');
select ok(
  not exists (select 1 from public.tenant_features where tenant_id = pg_temp.tenant(2))
  and not exists (select 1 from public.tenant_feature_changes where tenant_id = pg_temp.tenant(2)),
  '... and takes them with it'
);
set local role service_role;
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values (pg_temp.tenant(3), 'chat', false, 'Platform: paused');
reset role;
-- As delete_my_account does it: the person's own JWT, then the delete.
select pg_temp.sign_in('d4');
select lives_ok($$ delete from auth.users where id = pg_temp.person('d4') $$, 'a person whose tenant (with a switch) goes with them can delete their account');
select ok(not exists (select 1 from public.tenant_features where tenant_id = pg_temp.tenant(3)), '... and the tenant''s switches go too');

-- Deleting a person never fails on these tables -------------------------------------------------
select lives_ok($$ delete from auth.users where id = pg_temp.person('a1') $$, 'deleting the admin who made changes succeeds');
select ok(
  (select bool_and(changed_by is null) from public.tenant_feature_changes where tenant_id = pg_temp.tenant(1))
  and (select bool_and(updated_by is null) from public.tenant_features where tenant_id = pg_temp.tenant(1)),
  '... and their changes stay, without the person'
);

select * from finish();
rollback;
