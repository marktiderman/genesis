-- @feat:support-feedback
-- pgTAP test for 0003_genesis_support_findings.sql (after 0006_genesis_support.sql). Copy into
-- your app's `supabase/tests/database/` and run `supabase test db`. It writes only its own
-- users, reports and replies and rolls everything back. If your app already has the staff hook
-- (`private.genesis_support_staff`) or the handler hook (`private.genesis_support_report_handler`),
-- they are replaced inside this transaction only.
--
-- People: a1 reports, b2 is someone else, c3 is staff, d4 handles a1's first report (the app's
-- hook says so), nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000003' || n)::uuid, 'authenticated', 'authenticated',
       'genesis-support-findings-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'd4']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000003' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create table pg_temp.ids (name text primary key, id uuid);
create function pg_temp.remember(name text, q text) returns void language plpgsql as $$
declare v uuid;
begin
  execute q into v;
  insert into pg_temp.ids values (name, v);
end $$;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from pg_temp.ids where name = n $$;
grant select, insert on pg_temp.ids to anon, authenticated;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.remember(text, text), pg_temp.id(text)
  to anon, authenticated, service_role;

drop function if exists private.genesis_support_staff(uuid);
create function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-0000000003c3'::uuid
$$;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

-- The schema --------------------------------------------------------------------------
select has_column('public', 'support_reports', 'severity', 'a report has a severity');
select ok(
  has_column_privilege('authenticated', 'public.support_reports', 'severity', 'insert')
  and not has_column_privilege('authenticated', 'public.support_reports', 'severity', 'update'),
  'the person sends a severity with the report, and can''t change it after'
);
select ok(
  not has_function_privilege('authenticated', 'private.genesis_support_handler(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.support_handles(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.support_verify_report(uuid, boolean, text)', 'execute')
  and has_function_privilege('authenticated', 'public.support_verify_report(uuid, boolean, text)', 'execute'),
  'the handler check is the database''s, and anon calls nothing'
);

-- Severity ----------------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select pg_temp.remember('r1', $$ insert into public.support_reports (type, title, message, severity) values ('bug', 'Export broke', 'It broke', 'high') returning id $$);
select pg_temp.remember('r2', $$ insert into public.support_reports (type, title, message) values ('bug', 'Second', 'Another') returning id $$);
select throws_ok($$ insert into public.support_reports (type, message, severity) values ('bug', 'x', 'dire') $$,
  '23514', null, 'a severity outside the list is refused');
reset role;
select is((select severity from public.support_reports where id = pg_temp.id('r1')), 'high', 'the severity is kept');

-- Without the app's handler hook, only the person and staff handle a report ----------------
select pg_temp.sign_in('d4');
set local role authenticated;
select ok(not public.support_handles(pg_temp.id('r1')), 'without the hook, someone else doesn''t handle it');
select is((select count(*)::int from public.support_reports where id = pg_temp.id('r1')), 0, 'or read it');
reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select ok(public.support_handles(pg_temp.id('r1')), 'staff handle every report');
reset role;

-- The app names a handler ---------------------------------------------------------------
drop function if exists private.genesis_support_report_handler(uuid, uuid);
create function private.genesis_support_report_handler(report uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-0000000003d4'::uuid
     and report = (select id from pg_temp.ids where name = 'r1')
$$;
revoke execute on function private.genesis_support_report_handler(uuid, uuid) from public, anon, authenticated;

select pg_temp.sign_in('d4');
set local role authenticated;
select ok(public.support_handles(pg_temp.id('r1')), 'the hook''s handler handles the report it names');
select ok(not public.support_handles(pg_temp.id('r2')), 'and not another');
select is((select count(*)::int from public.support_reports where user_id = pg_temp.person('a1')), 1, 'and reads only that one');
insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'Looking at it');
select is((select from_staff from public.support_replies where report_id = pg_temp.id('r1') and body = 'Looking at it'), true,
  'a handler replies as support');
select throws_ok($$ insert into public.support_replies (report_id, body) values (pg_temp.id('r2'), 'Not mine') $$,
  '42501', null, 'but not on a report they don''t handle');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('r1'), 'in_progress') $$, 'a handler sets the status');
select throws_ok($$ select public.support_set_report_status(pg_temp.id('r2'), 'in_progress') $$,
  '42501', null, 'not on a report they don''t handle');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select ok(not public.support_handles(pg_temp.id('r1')), 'someone else doesn''t handle it');
reset role;

-- The verify loop -----------------------------------------------------------------------
select pg_temp.sign_in('d4');
set local role authenticated;
select public.support_set_report_status(pg_temp.id('r1'), 'addressed');
reset role;
select isnt((select resolved_at from public.support_reports where id = pg_temp.id('r1')), null, 'marked addressed, it is stamped');
select is((select count(*)::int from public.support_replies where report_id = pg_temp.id('r1') and from_staff and body like 'This is marked fixed.%'), 1,
  'and its person is asked to check the fix');

-- Flipped back and forth within the hour: asked once.
select pg_temp.sign_in('d4');
set local role authenticated;
select public.support_set_report_status(pg_temp.id('r1'), 'in_progress');
select public.support_set_report_status(pg_temp.id('r1'), 'addressed');
reset role;
select is((select count(*)::int from public.support_replies where report_id = pg_temp.id('r1') and body like 'This is marked fixed.%'), 1,
  'a status flipped back and forth asks once an hour');

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok($$ select public.support_verify_report(pg_temp.id('r1'), true) $$, '42501', null, 'only its person verifies it');
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select public.support_verify_report(pg_temp.id('r1'), false, 'Still broken');
reset role;
select is((select status from public.support_reports where id = pg_temp.id('r1')), 'in_progress', 'not fixed: it is reopened');
select ok((select reopened_at is not null and resolved_at is null from public.support_reports where id = pg_temp.id('r1')),
  'stamped reopened, and no longer resolved');
select is((select count(*)::int from public.support_replies where report_id = pg_temp.id('r1') and not from_staff and body = 'Still broken'), 1,
  'with what is still wrong in the thread');

select pg_temp.sign_in('a1');
set local role authenticated;
select throws_ok($$ select public.support_verify_report(pg_temp.id('r1'), true) $$, '22023', null, 'a report not marked fixed can''t be confirmed');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select public.support_set_report_status(pg_temp.id('r1'), 'addressed');
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
select public.support_verify_report(pg_temp.id('r1'), true);
reset role;
select ok((select status = 'addressed' and verified_at is not null from public.support_reports where id = pg_temp.id('r1')),
  'fixed: it stays addressed, confirmed');

select * from finish();
rollback;
