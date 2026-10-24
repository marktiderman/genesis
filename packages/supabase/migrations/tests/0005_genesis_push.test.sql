-- pgTAP test for 0005_genesis_push.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It reads only its own users and rows and rolls everything back. (The
-- receipt cases push any other due receipt out of reach first, inside this
-- transaction.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000005' || n)::uuid, 'authenticated', 'authenticated', 'genesis-push-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.u(n text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-0000000005' || n)::uuid $$;
create function pg_temp.tok(n text) returns text language sql as $$ select 'ExponentPushToken[genesis-test-' || n || ']' $$;
-- Signs in as one of the test users (both claim settings, as 0001's test explains), or as nobody.
create function pg_temp.as_user(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when n is null then '{"role":"authenticated"}' else json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(pg_temp.u(n)::text, ''), true);
end;
$$;

-- Tables: row level security on, only what each role needs ----------------------
select ok((select relrowsecurity from pg_class where oid = 'public.push_devices'::regclass), 'push_devices has row level security on');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_preferences'::regclass), 'notification_preferences has row level security on');
select ok((select relrowsecurity from pg_class where oid = 'public.push_receipts'::regclass), 'push_receipts has row level security on');
select ok(
  not exists (
    select 1
    from unnest(array['public.push_devices', 'public.notification_preferences', 'public.push_receipts']) t(tbl),
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p(priv)
    where has_table_privilege('anon', t.tbl, p.priv)
  ),
  'anon has no privilege on any of the three tables'
);
select ok(
  has_table_privilege('authenticated', 'public.push_devices', 'select')
  and has_table_privilege('authenticated', 'public.push_devices', 'delete')
  and not has_table_privilege('authenticated', 'public.push_devices', 'insert')
  and not has_table_privilege('authenticated', 'public.push_devices', 'update')
  and not has_table_privilege('authenticated', 'public.push_devices', 'truncate'),
  'authenticated may only read and delete push_devices (writes go through genesis_push_register)'
);
select ok(
  has_table_privilege('authenticated', 'public.push_receipts', 'select')
  and not has_table_privilege('authenticated', 'public.push_receipts', 'insert')
  and not has_table_privilege('authenticated', 'public.push_receipts', 'update')
  and not has_table_privilege('authenticated', 'public.push_receipts', 'delete'),
  'authenticated may only read push_receipts'
);
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.push_devices'::regclass, 'public.notification_preferences'::regclass, 'public.push_receipts'::regclass) and a.grantee = 0
  ),
  'public has no grant on any of the three tables'
);

-- Functions: security definer, empty search_path, executable by name -------------
create temp table genesis_fns (sig regprocedure, who text);
insert into genesis_fns values
  ('public.genesis_push_register(text, text, text)'::regprocedure, 'authenticated'),
  ('public.genesis_push_forget(text)'::regprocedure, 'anyone'),
  ('public.genesis_push_status(uuid, text, boolean, boolean, timestamptz)'::regprocedure, 'service'),
  ('public.genesis_push_targets(uuid, text, boolean, boolean, timestamptz)'::regprocedure, 'service'),
  ('public.genesis_push_tickets_record(jsonb)'::regprocedure, 'service'),
  ('public.genesis_push_receipts_claim(integer)'::regprocedure, 'service'),
  ('public.genesis_push_receipts_settle(jsonb)'::regprocedure, 'service'),
  ('public.genesis_push_devices_forget(uuid[])'::regprocedure, 'service');

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from genesis_fns f join pg_proc p on p.oid = f.sig),
  'every function is security definer with an empty search_path'
);
select ok(
  (select bool_and(p.proowner::regrole::text = 'postgres') from genesis_fns f join pg_proc p on p.oid = f.sig),
  'every function is owned by postgres, as hosted migrations run'
);
select ok(
  (select bool_and(has_function_privilege('anon', f.sig, 'execute') = (f.who = 'anyone')) from genesis_fns f),
  'anon can execute genesis_push_forget and nothing else'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f.sig, 'execute') = (f.who in ('anyone', 'authenticated'))) from genesis_fns f),
  'authenticated can execute genesis_push_register and genesis_push_forget and nothing else'
);
select ok(
  (select bool_and(has_function_privilege('service_role', f.sig, 'execute')) from genesis_fns f where f.who = 'service'),
  'service_role can execute the six server functions'
);
select ok(
  not exists (
    select 1 from genesis_fns f join pg_proc p on p.oid = f.sig, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'public has no execute grant on any of them'
);
select ok(
  not has_function_privilege('authenticated', 'private.genesis_notification_preferences_check()', 'execute')
  and not has_function_privilege('anon', 'private.genesis_notification_preferences_check()', 'execute'),
  'nobody but the owner can call the preferences check directly'
);

-- Registering a device ----------------------------------------------------------
select pg_temp.as_user(null);
set local role authenticated;
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('x'), 'ios') $$, '42501', null, 'registering without a signed-in person is refused');
reset role;

set local role anon;
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('x'), 'ios') $$, '42501', null, 'anon cannot register a device');
reset role;

select pg_temp.as_user('a1');
set local role authenticated;
select isnt(public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0.0'), null, 'a signed-in person registers this device and gets its id');
select is(
  public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0.1'),
  (select id from public.push_devices where token = pg_temp.tok('a1')),
  'registering the same token again keeps one row'
);
select is((select app_version from public.push_devices where token = pg_temp.tok('a1')), '1.0.1', '... and updates its app version');
select throws_ok($$ select public.genesis_push_register('not-a-token', 'ios') $$, '23514', 'genesis_push_register: malformed token, platform or app version', 'a malformed token is refused without echoing it');
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('a9'), 'windows') $$, '23514', null, 'an unknown platform is refused');
select throws_ok($$ insert into public.push_devices (user_id, token, platform) values (pg_temp.u('a1'), pg_temp.tok('a8'), 'ios') $$, '42501', null, 'a person cannot insert a device row directly');
select throws_ok($$ update public.push_devices set user_id = pg_temp.u('b2') $$, '42501', null, 'a person cannot update a device row');
reset role;

select pg_temp.as_user('b2');
set local role authenticated;
select lives_ok($$ select public.genesis_push_register(pg_temp.tok('b2'), 'android') $$, 'a second person registers their own device');
select is((select count(*) from public.push_devices where token = pg_temp.tok('a1')), 0::bigint, 'a person cannot see another person''s device');
select is((select count(*) from public.push_devices), 1::bigint, '... and sees exactly their own');
delete from public.push_devices where token = pg_temp.tok('a1');
reset role;
select is((select count(*) from public.push_devices where token = pg_temp.tok('a1')), 1::bigint, 'a person cannot delete another person''s device');

-- The phone changes hands: b2 signs in on a1's phone.
select pg_temp.as_user('b2');
set local role authenticated;
do $$ begin perform public.genesis_push_register(pg_temp.tok('a1'), 'ios'); end $$;
reset role;
select is((select user_id from public.push_devices where token = pg_temp.tok('a1')), pg_temp.u('b2'), 'a token registered by another login moves to it');

-- At most ten devices per person, always keeping the one just registered.
select pg_temp.as_user('c3');
set local role authenticated;
do $$ begin perform public.genesis_push_register(pg_temp.tok('c3-' || n), 'ios') from generate_series(1, 11) n; end $$;
reset role;
select is((select count(*) from public.push_devices where user_id = pg_temp.u('c3')), 10::bigint, 'a person keeps at most ten devices');
select is((select count(*) from public.push_devices where token = pg_temp.tok('c3-11')), 1::bigint, '... and the one just registered is one of them');

-- Forgetting a token ------------------------------------------------------------
set local role anon;
select ok(public.genesis_push_forget(pg_temp.tok('c3-11')), 'anyone holding a token can forget it (a phone whose session already ended)');
select ok(not public.genesis_push_forget(pg_temp.tok('nope')), '... and an unknown token forgets nothing');
reset role;
select pg_temp.as_user('c3');
set local role authenticated;
delete from public.push_devices where id = (select id from public.push_devices order by id limit 1);
reset role;
select is((select count(*) from public.push_devices where user_id = pg_temp.u('c3')), 8::bigint, 'a person can delete their own device');

-- Preferences ---------------------------------------------------------------------
select pg_temp.as_user('a1');
set local role authenticated;
select lives_ok(
  $$ insert into public.notification_preferences (categories, hide_previews) values ('{"marketing": false}', true) $$,
  'a person saves their own preferences (user_id defaults to theirs)'
);
select throws_ok(
  $$ insert into public.notification_preferences (user_id) values (pg_temp.u('b2')) $$,
  '42501', null, 'a person cannot write another person''s preferences'
);
select throws_ok(
  $$ update public.notification_preferences set time_zone = 'Mars/Olympus_Mons' $$,
  '22023', null, 'an unknown time zone is refused'
);
select throws_ok(
  $$ update public.notification_preferences set categories = '{"Bad Key": true}' $$,
  '22023', null, 'a malformed category id is refused'
);
select throws_ok(
  $$ update public.notification_preferences set categories = '{"messages": "yes"}' $$,
  '23514', null, 'a category value that is not true or false is refused'
);
select throws_ok(
  $$ update public.notification_preferences set quiet_hours_enabled = true, time_zone = null $$,
  '23514', null, 'quiet hours without a time zone are refused'
);
reset role;
select pg_temp.as_user('b2');
set local role authenticated;
select is((select count(*) from public.notification_preferences), 0::bigint, 'a person cannot read another person''s preferences');
update public.notification_preferences set hide_previews = false;
reset role;
select ok((select hide_previews from public.notification_preferences where user_id = pg_temp.u('a1')), '... nor change them');

-- Who to push to: categories, quiet hours, privacy -----------------------------------
set local role service_role;
select is(
  (select row(deliver, reason, hide_previews)::text from public.genesis_push_status(pg_temp.u('c3'), 'messages')),
  '(t,ok,f)', 'without preferences, every category is delivered with its preview'
);
select is(
  (select row(deliver, reason)::text from public.genesis_push_status(pg_temp.u('a1'), 'marketing')),
  '(f,category_off)', 'a category the person turned off is not delivered'
);
select is((select count(*) from public.genesis_push_targets(pg_temp.u('a1'), 'marketing')), 0::bigint, '... and has no targets');
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('c3'), 'digest', p_default_on => false)),
  false, 'a category that is off by default is not delivered until the person turns it on'
);
select is(
  (select count(*) from public.genesis_push_targets(pg_temp.u('c3'), 'messages')), 8::bigint,
  'targets are every device of that person, and only theirs'
);
select throws_ok($$ select * from public.genesis_push_status(pg_temp.u('c3'), 'Bad Category') $$, '22023', null, 'a malformed category is refused');
reset role;

set local role anon;
select throws_ok($$ select * from public.genesis_push_targets(pg_temp.u('c3'), 'messages') $$, '42501', null, 'anon cannot ask for anyone''s tokens');
reset role;
select pg_temp.as_user('c3');
set local role authenticated;
select throws_ok($$ select * from public.genesis_push_targets(pg_temp.u('c3'), 'messages') $$, '42501', null, 'a signed-in person cannot ask for tokens, not even their own');
reset role;

-- Quiet hours 22:00 to 07:00 in New York (EST is UTC-5, EDT UTC-4).
update public.notification_preferences set quiet_hours_enabled = true, quiet_hours_start = '22:00', quiet_hours_end = '07:00', time_zone = 'America/New_York', categories = '{}'
where user_id = pg_temp.u('a1');
set local role service_role;
select is(
  (select row(deliver, reason, quiet_until)::text from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 04:00Z')),
  (select row(false, 'quiet_hours', '2026-01-15 12:00Z'::timestamptz)::text),
  '23:00 in New York is quiet, until 07:00 there the next morning'
);
select is(
  (select row(deliver, quiet_until)::text from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 11:59Z')),
  (select row(false, '2026-01-15 12:00Z'::timestamptz)::text),
  '06:59 in New York is still quiet, until 07:00 the same morning'
);
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 12:00Z')),
  true, '07:00 in New York is not quiet (the end is exclusive)'
);
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 03:00Z')),
  false, '22:00 in New York is quiet (the start is inclusive), although it is 03:00 in UTC'
);
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 20:00Z')),
  true, '15:00 in New York is not quiet'
);
select is(
  (select quiet_until from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-03-08 06:00Z')),
  '2026-03-08 11:00Z'::timestamptz,
  'across the spring daylight-saving change, quiet hours still end at 07:00 local (EDT, so 11:00 UTC)'
);
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_bypass_quiet_hours => true, p_at => '2026-01-15 04:00Z')),
  true, 'a push the sender marks urgent goes through quiet hours'
);
select is(
  (select count(*) from public.genesis_push_targets(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 04:00Z')), 0::bigint,
  'during quiet hours there are no targets'
);
reset role;

-- A window that doesn't cross midnight, in Tokyo (UTC+9, no daylight saving).
update public.notification_preferences set quiet_hours_start = '09:00', quiet_hours_end = '17:00', time_zone = 'Asia/Tokyo'
where user_id = pg_temp.u('a1');
set local role service_role;
select is(
  (select row(deliver, quiet_until)::text from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 01:00Z')),
  (select row(false, '2026-01-15 08:00Z'::timestamptz)::text),
  '10:00 in Tokyo is inside 09:00 to 17:00, quiet until 17:00 there'
);
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 09:00Z')),
  true, '18:00 in Tokyo is outside 09:00 to 17:00'
);
reset role;
update public.notification_preferences set quiet_hours_end = '09:00' where user_id = pg_temp.u('a1');
set local role service_role;
select is(
  (select deliver from public.genesis_push_status(pg_temp.u('a1'), 'messages', p_at => '2026-01-15 00:30Z')),
  true, 'a start equal to the end means no quiet hours'
);
reset role;

-- Privacy previews travel with each target.
update public.notification_preferences set quiet_hours_enabled = false where user_id = pg_temp.u('a1');
select pg_temp.as_user('a1');
set local role authenticated;
do $$ begin perform public.genesis_push_register(pg_temp.tok('a1-new'), 'ios'); end $$;
reset role;
set local role service_role;
select ok(
  (select bool_and(hide_previews) and count(*) = 1 from public.genesis_push_targets(pg_temp.u('a1'), 'messages')),
  'a person who hides previews gets targets marked hide_previews'
);
reset role;

-- Tickets and receipts --------------------------------------------------------------
update public.push_receipts set check_after = now() + interval '1 year' where status = 'sent';
set local role service_role;
select is(
  public.genesis_push_tickets_record(jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.u('a1'), 'device_id', (select id from public.push_devices where token = pg_temp.tok('a1-new')), 'category', 'messages', 'ticket_id', 'ticket-1', 'status', 'sent'),
    jsonb_build_object('user_id', pg_temp.u('a1'), 'device_id', null, 'category', 'messages', 'status', 'failed', 'error', 'MessageTooBig'),
    jsonb_build_object('user_id', '00000000-0000-4000-8000-0000000005ff', 'category', 'messages', 'ticket_id', 'ticket-x', 'status', 'sent')
  )),
  2, 'tickets are recorded, skipping a login that no longer exists'
);
select is((select count(*) from public.genesis_push_receipts_claim(100)), 0::bigint, 'a receipt is not polled before Expo has it (15 minutes)');
reset role;
update public.push_receipts set check_after = now() - interval '1 second' where ticket_id = 'ticket-1';
set local role service_role;
select is((select array_agg(ticket_id) from public.genesis_push_receipts_claim(100)), array['ticket-1'], 'a due receipt is handed out once ...');
select is((select count(*) from public.genesis_push_receipts_claim(100)), 0::bigint, '... and leased, so a second poller doesn''t take it');
select is(
  public.genesis_push_receipts_settle(jsonb_build_array(jsonb_build_object('id', (select id from public.push_receipts where ticket_id = 'ticket-1'), 'status', 'failed', 'error', 'DeviceNotRegistered'))),
  1, 'a receipt is settled'
);
reset role;
select ok(
  (select status = 'failed' and error = 'DeviceNotRegistered' and device_id is null from public.push_receipts where ticket_id = 'ticket-1'),
  'DeviceNotRegistered fails the receipt ...'
);
select is((select count(*) from public.push_devices where token = pg_temp.tok('a1-new')), 0::bigint, '... and forgets the dead device');

select pg_temp.as_user('b2');
set local role authenticated;
select is((select count(*) from public.push_receipts), 0::bigint, 'a person cannot read another person''s receipts');
reset role;
select pg_temp.as_user('a1');
set local role authenticated;
select is((select count(*) from public.push_receipts), 2::bigint, '... and reads their own');
reset role;

-- Deleting the login takes everything with it ----------------------------------------
delete from auth.users where id = pg_temp.u('a1');
select ok(
  not exists (select 1 from public.push_devices where user_id = pg_temp.u('a1'))
  and not exists (select 1 from public.notification_preferences where user_id = pg_temp.u('a1'))
  and not exists (select 1 from public.push_receipts where user_id = pg_temp.u('a1')),
  'deleting a login deletes its devices, preferences and receipts'
);

select * from finish();
rollback;
