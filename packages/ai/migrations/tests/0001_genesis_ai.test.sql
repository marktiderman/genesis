-- @feat:ai-providers
-- pgTAP test for 0001_genesis_ai.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and tenants, reads only its own rows, and rolls
-- everything back. If your app replaced private.genesis_ai_admin, it is replaced
-- again inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- People: a1 and b2 are clients of tenant e1; c3 administers it; d4 has no tenant.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'gaitest-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.u(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.t(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-9000-0000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.u(n)::text, true);
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
grant execute on function pg_temp.u(text), pg_temp.t(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server() to anon, authenticated, service_role;

-- A call with the arguments the tests don't care about filled in.
create function pg_temp.begin(p_tenant uuid, p_person uuid, p_estimate numeric, p_exempt boolean default false) returns uuid language sql as $$
  select genesis_ai.begin_call(p_tenant, p_person, 'gaitest.recap', 1, 'anthropic', 'claude-sonnet-5-5', p_estimate, p_exempt)
$$;
create function pg_temp.finish(p_call uuid, p_cost numeric) returns uuid language sql as $$
  select genesis_ai.finish_call(p_call, 'ok', 'claude-sonnet-5-5', 100, 0, 0, 20, null, p_cost, 900, '[{"name":"note","tokens":12,"ids":["n1"]}]'::jsonb)
$$;
grant execute on function pg_temp.begin(uuid, uuid, numeric, boolean), pg_temp.finish(uuid, numeric) to service_role;

create temp table k (name text primary key, id uuid);
grant select, insert on k to service_role, authenticated;
create function pg_temp.k(n text) returns uuid language sql stable as $$ select id from k where name = n $$;
grant execute on function pg_temp.k(text) to service_role, authenticated;

-- c3 administers e1.
create or replace function private.genesis_ai_admin(p_user uuid, p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = '00000000-0000-4000-8000-0000000000c3'::uuid and p_tenant = '00000000-0000-4000-9000-0000000000e1'::uuid
$$;

-- Shape and privileges ---------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'genesis_ai.consents'::regclass, 'genesis_ai.budgets'::regclass, 'genesis_ai.calls'::regclass)),
  'row level security is on for every table');
select ok(
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'genesis_ai' and p.proname in ('begin_call', 'finish_call', 'has_consent', 'set_budget', 'prune')),
  'only the server admits, records, reads consent, sets budgets and prunes');
select ok(
  (select bool_and(has_function_privilege('service_role', p.oid, 'execute'))
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'genesis_ai' and p.proname in ('begin_call', 'finish_call', 'has_consent', 'set_budget', 'prune')),
  'the service role may do all of it');
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('public', p.oid, 'execute'))
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname like 'genesis_ai%'),
  'no private genesis_ai function is granted to anon or public');
select ok(not has_function_privilege('authenticated', 'private.genesis_ai_admin(uuid, uuid)', 'execute'),
  'nobody signed in calls the admin check directly');
select ok(
  not has_table_privilege('anon', 'genesis_ai.calls', 'select')
  and not has_table_privilege('authenticated', 'genesis_ai.calls', 'insert')
  and not has_table_privilege('authenticated', 'genesis_ai.calls', 'update')
  and not has_table_privilege('authenticated', 'genesis_ai.consents', 'insert')
  and not has_table_privilege('authenticated', 'genesis_ai.budgets', 'select'),
  'people read, never write; anon reads nothing; budgets are the server''s');

-- Consent ------------------------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select genesis_ai.set_consent('anthropic', true) $$, '42501', null, 'anon can''t consent');
select pg_temp.sign_in('a1');
select lives_ok($$ select genesis_ai.set_consent('anthropic', true) $$, 'a1 agrees to anthropic');
select throws_ok($$ select genesis_ai.set_consent('Anthropic AI', true) $$, '22023', null, 'a vendor must be a vendor id');
select pg_temp.sign_in('b2');
select lives_ok($$ select genesis_ai.set_consent('openai', true) $$, 'b2 agrees to openai');
select is((select count(*)::int from genesis_ai.consents), 1, 'b2 sees only their own consent');
select pg_temp.as_server();
select ok(genesis_ai.has_consent(pg_temp.u('a1'), 'anthropic'), 'the server sees a1''s consent');
select ok(not genesis_ai.has_consent(pg_temp.u('a1'), 'openai'), 'consent is per vendor');
select pg_temp.sign_in('a1');
select genesis_ai.set_consent('anthropic', false);
select pg_temp.as_server();
select ok(not genesis_ai.has_consent(pg_temp.u('a1'), 'anthropic'), 'a withdrawn consent is no consent');
select pg_temp.sign_in('a1');
select genesis_ai.set_consent('anthropic', true);
select pg_temp.as_server();
select ok(genesis_ai.has_consent(pg_temp.u('a1'), 'anthropic'), 'consent can be given again');

-- Budgets ------------------------------------------------------------------------------
select ok(pg_temp.begin(pg_temp.t('e1'), pg_temp.u('a1'), 50) is not null, 'no budget means no limit');
select genesis_ai.finish_call(c.id, 'ok', 'claude-sonnet-5-5', 0, 0, 0, 0, null, 0, 1, '[]', null)
  from genesis_ai.calls c where c.tenant_id = pg_temp.t('e1') and c.finished_at is null;
select genesis_ai.set_budget('tenant:' || pg_temp.t('e1'), 1.00);
insert into k values ('first', pg_temp.begin(pg_temp.t('e1'), pg_temp.u('a1'), 0.6));
select ok(pg_temp.k('first') is not null, 'a call within the budget is admitted');
select ok(pg_temp.begin(pg_temp.t('e1'), pg_temp.u('b2'), 0.6) is null, 'an open call''s estimate is reserved');
select pg_temp.finish(pg_temp.k('first'), 0.1);
insert into k values ('second', pg_temp.begin(pg_temp.t('e1'), pg_temp.u('b2'), 0.6));
select ok(pg_temp.k('second') is not null, 'finishing releases the estimate and charges the cost');
select ok(pg_temp.begin(pg_temp.t('e1'), pg_temp.u('a1'), 0.6) is null, 'spend plus open estimates is the limit');
select ok(pg_temp.begin(pg_temp.t('e1'), pg_temp.u('a1'), 5, true) is not null, 'a safety check is never stopped by the budget');
select ok(genesis_ai.begin_call(pg_temp.t('e1'), pg_temp.u('a1'), 'gaitest.recap', 1, 'anthropic', 'm', 0.6, null) is null, 'an unset exemption is no exemption');
reset role;
update genesis_ai.calls set started_at = now() - interval '20 minutes' where id = pg_temp.k('second');
select pg_temp.as_server();
select ok(pg_temp.begin(pg_temp.t('e1'), pg_temp.u('a1'), 0.6) is not null, 'a call open for over 15 minutes stops reserving');

select genesis_ai.set_budget('default', 0.5, 1);
insert into k values ('d4', pg_temp.begin(null, pg_temp.u('d4'), 0.1));
select ok(pg_temp.k('d4') is not null, 'the default budget covers a person with no tenant');
select ok(pg_temp.begin(null, pg_temp.u('d4'), 0.1) is null, 'the open-call limit holds');
select ok(pg_temp.begin(null, pg_temp.u('b2'), 0.1) is not null, 'budgets without a tenant are per person');
select ok(pg_temp.begin(pg_temp.t('e2'), pg_temp.u('d4'), 0.6) is null, 'the default applies to a tenant without its own');
select genesis_ai.set_budget('default', null, null);
select ok(not exists (select 1 from genesis_ai.budgets where scope = 'default'), 'two nulls remove a budget');
select throws_ok($$ select genesis_ai.set_budget('everyone', 1) $$, '23514', null, 'a scope is default, tenant:<id> or person:<id>');
select throws_ok($$ select pg_temp.begin(null, null, 0) $$, '22023', null, 'a call needs a person or a tenant');
select throws_ok($$ select pg_temp.begin(null, pg_temp.u('a1'), -1) $$, '22023', null, 'an estimate is never negative');

-- Recording ----------------------------------------------------------------------------
select is((select outcome from genesis_ai.calls where id = pg_temp.k('first')), 'ok', 'finish_call records the outcome');
select is((select manifest from genesis_ai.calls where id = pg_temp.k('first')), '[{"name":"note","tokens":12,"ids":["n1"]}]'::jsonb,
  'the manifest keeps names, counts and ids');
select throws_ok($$ select pg_temp.finish(pg_temp.k('first'), 0.1) $$, 'P0002', null, 'a call is finished once');
select throws_ok($$ select genesis_ai.finish_call(pg_temp.k('d4'), 'ok', 'm', 1, 0, 0, 1, null, 0, 1, '[{"name":"note","tokens":3,"text":"I slept badly"}]', null) $$,
  '23514', null, 'a manifest refuses content');
select throws_ok($$ select genesis_ai.finish_call(pg_temp.k('d4'), 'great', 'm', 1, 0, 0, 1, null, 0, 1, '[]', null) $$,
  '23514', null, 'an outcome is one of the pipeline''s');
select throws_ok($$ select genesis_ai.finish_call(pg_temp.k('d4'), 'ok', 'm', 1, 0, 0, 1, null, 0, 1, '[]', repeat('x', 201)) $$,
  '23514', null, 'detail stays short');

-- Who reads calls ----------------------------------------------------------------------
select pg_temp.sign_in('a1');
select ok((select bool_and(person_id = pg_temp.u('a1')) from genesis_ai.calls) and exists (select 1 from genesis_ai.calls),
  'a1 reads only their own calls');
select pg_temp.sign_in('c3');
select ok((select count(*) from genesis_ai.calls where tenant_id = pg_temp.t('e1')) >= 4, 'the tenant''s admin reads its calls');
select ok(not exists (select 1 from genesis_ai.calls where tenant_id is distinct from pg_temp.t('e1')), 'and no other tenant''s');
select throws_ok($$ select private.genesis_ai_admin(pg_temp.u('c3'), pg_temp.t('e1')) $$, '42501', null, 'the admin check itself is private');
select pg_temp.as_anon();
select throws_ok($$ select count(*) from genesis_ai.calls $$, '42501', null, 'anon reads no calls');

-- Erasure and pruning ------------------------------------------------------------------
reset role;
delete from auth.users where id = pg_temp.u('a1');
select ok(not exists (select 1 from genesis_ai.consents where person_id = pg_temp.u('a1')), 'deleting a login deletes its consents');
select ok(exists (select 1 from genesis_ai.calls where id = pg_temp.k('first') and person_id is null), 'and keeps its calls without the person');
update genesis_ai.calls set started_at = now() - interval '500 days' where id = pg_temp.k('first');
select pg_temp.as_server();
select is(genesis_ai.prune(), 1, 'prune deletes calls past the retention');

select * from finish();
rollback;
