-- @feat:support-feedback
-- pgTAP test for 0030_genesis_support_notifications.sql: a new ticket and the person's messages
-- tell the desk's agents (support.message), support's answers tell the person (support.reply), the
-- verify prompt asks them (support.verify), a move tells the new desk, an assignee silences the rest,
-- support.staffAlerts off tells no staff, and without genesis-notifications nothing fails. A stand-in
-- genesis_notify records each call. Rolls back.
--
-- People: a1 writes and belongs to tenant b0; b2 is staff; d3 is b0's tenant admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000025' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

insert into auth.users (id, aud, role, email, instance_id, raw_user_meta_data)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-notify-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000', jsonb_build_object('full_name', 'Person ' || n)
from unnest(array['a1', 'b2', 'd3']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000000b0'::uuid, viewer
   where viewer in ('00000000-0000-4000-8000-0000000025a1'::uuid, '00000000-0000-4000-8000-0000000025d3'::uuid) $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000025b2'::uuid $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select tenant = '00000000-0000-4000-8000-0000000000b0'::uuid and person = '00000000-0000-4000-8000-0000000025d3'::uuid $$;
-- Whom support names as agents (never a scan of every login): the app's staff list and its tenant admins.
create or replace function private.genesis_support_staff_list() returns setof uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-0000000025b2'::uuid $$;
create or replace function private.genesis_tenant_admin_list(tenant uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000025d3'::uuid where tenant = '00000000-0000-4000-8000-0000000000b0'::uuid $$;
create or replace function private.genesis_support_verify_prompt_enabled() returns boolean
language sql stable set search_path = '' as $$ select true $$;

-- genesis-notifications' genesis_notify, recording what it was asked.
create table pg_temp.told (n bigint generated always as identity, type text, users text, data jsonb, key text, collapse text, tenant uuid);
grant all on pg_temp.told to public;
create function public.genesis_notify(p_type text, p_recipients jsonb, p_data jsonb default '{}', p_idempotency_key text default null,
  p_thread_key text default null, p_collapse_key text default null, p_badge integer default null, p_tenant_id uuid default null,
  p_brand jsonb default null, p_secret text default null)
returns table (notification_id uuid, recipient_key text, created boolean)
language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.told (type, users, data, key, collapse, tenant)
  select p_type, string_agg(right(r ->> 'user_id', 2), ',' order by r ->> 'user_id'), p_data, p_idempotency_key, p_collapse_key, p_tenant_id
    from jsonb_array_elements(p_recipients) r;
  return;
end $$;

create function pg_temp.last() returns pg_temp.told language sql as $$ select * from pg_temp.told order by n desc limit 1 $$;
create function pg_temp.count() returns int language sql as $$ select count(*)::int from pg_temp.told $$;
create temp table t (name text primary key, id uuid);
grant all on t to public;

-- 1. A new ticket, an answer, the person's answer ------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message) values ('bug', 'Export', 'Export does nothing');
reset role;
insert into t select 'bug', id from public.tickets where user_id = pg_temp.person('a1');

select is((select row(type, users, data ->> 'by', data ->> 'new', data ->> 'title')::text from pg_temp.last()),
  row('support.message', 'b2', 'Person a1', 'true', 'Export')::text, 'a new ticket tells the app''s staff, by name');

select pg_temp.sign_in('b2');
set local role authenticated;
insert into public.support_replies (report_id, body) values ((select id from t where name = 'bug'), 'Fixed in 2.1');
reset role;
select is((select row(type, users, data ->> 'excerpt', collapse)::text from pg_temp.last()),
  row('support.reply', 'a1', 'Fixed in 2.1', 'support-reply:' || (select id from t where name = 'bug'))::text,
  'support''s answer tells the person, one email a ticket');

select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.support_replies (report_id, body) values ((select id from t where name = 'bug'), 'Still broken');
reset role;
select is((select row(type, users, data ->> 'new', data ->> 'body')::text from pg_temp.last()),
  row('support.message', 'b2', 'false', 'Still broken')::text, 'the person''s answer tells staff');

-- 2. The verify prompt ----------------------------------------------------------------------------

select pg_temp.sign_in('b2');
set local role authenticated;
select lives_ok($$select public.support_set_report_status((select id from t where name = 'bug'), 'addressed', null)$$, 'staff mark it fixed');
reset role;
select is((select type || ':' || users from pg_temp.last()), 'support.verify:a1', 'the person is asked to check it');
select is((select count(*)::int from pg_temp.told where type = 'support.reply'), 1, 'and the prompt is no support.reply');

-- 3. An assignee silences the rest -------------------------------------------------------------------

select pg_temp.sign_in('b2');
set local role authenticated;
select public.support_assign_report((select id from t where name = 'bug'), pg_temp.person('b2'));
reset role;
select pg_temp.count() as before \gset
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.support_replies (report_id, body) values ((select id from t where name = 'bug'), 'Hello?');
reset role;
select is(pg_temp.count(), :before, 'with someone on it, nobody else is told');

-- 4. Desks: a desk's ticket, and a move ---------------------------------------------------------------

select pg_temp.sign_in('d3');
set local role authenticated;
select public.support_set_desk('00000000-0000-4000-8000-0000000000b0', true);
reset role;
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, message) values ('question', 'Where is my invoice?');
reset role;
insert into t select 'q', id from public.tickets where user_id = pg_temp.person('a1') and type = 'question';
select is((select row(type, users, data ->> 'desk')::text from pg_temp.last()),
  row('support.message', 'd3', '00000000-0000-4000-8000-0000000000b0')::text, 'a desk''s ticket tells its agents, naming the desk');
select is((select tenant from pg_temp.last()), '00000000-0000-4000-8000-0000000000b0'::uuid, 'in the desk''s tenant (its sender and defaults)');

select pg_temp.sign_in('d3');
set local role authenticated;
select public.support_escalate_ticket((select id from t where name = 'q'), 'needs billing');
reset role;
select is((select row(type, users, data ->> 'escalated', data ->> 'excerpt', data ->> 'by')::text from pg_temp.last()),
  row('support.message', 'b2', 'true', 'needs billing', 'Person d3')::text, 'an escalated ticket tells the app''s staff, with why');
select ok(not ((select data from pg_temp.last()) ? 'desk'), 'at the app''s desk, no desk named');

-- 5. Staff alerts off ---------------------------------------------------------------------------------

insert into public.genesis_app_manifest (app_id, catalogue) values ('notify-test', '{"support.staffAlerts": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": true, "standard": true, "min": false}}}');
insert into public.genesis_settings (key, value) values ('support.staffAlerts', 'false');
select is(private.genesis_support_staff_alerts_on(), false, 'support.staffAlerts false in genesis_settings is read');
select pg_temp.count() as before \gset
select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, message) values ('bug', 'Another one');
reset role;
select is(pg_temp.count(), :before, 'staff alerts off: a new ticket tells nobody');
select pg_temp.sign_in('b2');
set local role authenticated;
insert into public.support_replies (report_id, body) values ((select id from t where name = 'q'), 'On it');
reset role;
select is((select type || ':' || users from pg_temp.last()), 'support.reply:a1', 'but the person still hears support''s answer');

-- 6. A failing or missing notifier --------------------------------------------------------------------

delete from public.genesis_settings where key = 'support.staffAlerts';
create or replace function public.genesis_notify(p_type text, p_recipients jsonb, p_data jsonb default '{}', p_idempotency_key text default null,
  p_thread_key text default null, p_collapse_key text default null, p_badge integer default null, p_tenant_id uuid default null,
  p_brand jsonb default null, p_secret text default null)
returns table (notification_id uuid, recipient_key text, created boolean)
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'genesis_notify: unknown or retired type %', p_type using errcode = '22023';
end $$;
select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$insert into public.tickets (type, message) values ('bug', 'type not synced')$$, 'a type not synced yet never fails the ticket');
reset role;
drop function public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text);
select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$insert into public.tickets (type, message) values ('bug', 'no notifications')$$, 'nor does an app without genesis-notifications');
reset role;

-- 6b. Names, never addresses; a person's login ------------------------------------------------------

update auth.users set raw_user_meta_data = jsonb_build_object('full_name', 'genesis-notify-a1@example.test') where id = pg_temp.person('a1');
select is(private.genesis_support_notify_name(pg_temp.person('a1')), 'Someone', 'a name that is an email address shows as Someone');
create or replace function private.genesis_person_login(person uuid) returns uuid
language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-0000000025d3'::uuid where person = '00000000-0000-4000-8000-0000000025ff'::uuid $$;
insert into public.ticket_agents (tenant_id, person_id) values ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000025ff');
drop function private.genesis_tenant_admin_list(uuid);
select is(private.genesis_support_person_login('00000000-0000-4000-8000-0000000025ff'), pg_temp.person('d3'), 'an agent row''s person resolves to its login through the app''s hook');

-- 7. Whom to tell, with many logins -----------------------------------------------------------------

insert into auth.users (id, aud, role, is_anonymous, instance_id)
select gen_random_uuid(), 'authenticated', 'authenticated', true, '00000000-0000-0000-0000-000000000000' from generate_series(1, 20000);
select set_config('genesis_test.started', clock_timestamp()::text, true);
select is((select array_agg(right(u::text, 2)) from unnest(private.genesis_support_staff_to_tell((select id from t where name = 'q'))) u), array['b2'],
  'with 20,000 more logins, the app''s desk tells its staff');
select ok(clock_timestamp() - current_setting('genesis_test.started')::timestamptz < interval '200 milliseconds', 'without reading every login');

select ok(not has_function_privilege('authenticated', 'private.genesis_support_notify(text, uuid[], jsonb, text, uuid, text)', 'execute'), 'nobody notifies through support''s function');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_staff_to_tell(uuid)', 'execute'), 'nor lists whom it tells');

select * from finish();
rollback;
