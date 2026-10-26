-- @feat:notifications
-- pgTAP test for 0001_genesis_notifications.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and `gntest.*` types, reads only its own rows,
-- and rolls everything back. If your app replaced
-- private.genesis_notifications_admin, it is replaced again inside this
-- transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(119);

-- People: a1 and b2 have logins; c3 is an admin; "outside" has no login.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'gntest-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create function pg_temp.u(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.tok(n text) returns text language sql immutable as $$ select 'ExponentPushToken[gntest-' || n || ']' $$;
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
grant execute on function pg_temp.u(text), pg_temp.tok(text), pg_temp.sign_in(text), pg_temp.as_anon() to anon, authenticated;

-- c3 administers tenant T1 and the app.
create or replace function private.genesis_notifications_admin(p_user uuid, p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = '00000000-0000-4000-8000-0000000000c3'::uuid
$$;

-- Types, as the code would mirror them.
insert into public.notification_types (key, category, channels, critical, transactional, email_delay_seconds, secret_link, ios_category) values
  ('gntest.message', 'gntest-messages', '{"in_app": true, "push": true, "email": true}', false, false, 600, false, 'message'),
  ('gntest.receipt', 'gntest-forms', '{"email": true}', false, true, 0, true, null),
  ('gntest.security', 'gntest-security', '{"in_app": true, "push": true, "email": true}', true, false, 0, false, null),
  ('gntest.news', 'gntest-news', '{"in_app": true, "email": false}', false, false, 0, false, null),
  ('gntest.alert', 'gntest-alerts', '{"in_app": true, "push": true}', false, true, 0, false, null);

create temp table k (name text primary key, id uuid);
grant select on k to authenticated, anon;
create function pg_temp.k(n text) returns uuid language sql stable as $$ select id from k where name = n $$;
grant execute on function pg_temp.k(text) to authenticated, anon;

-- Shape and privileges -----------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.notifications'::regclass, 'public.notification_deliveries'::regclass, 'public.notification_types'::regclass,
  'public.notification_senders'::regclass, 'public.notification_tenant_defaults'::regclass, 'public.notification_suppressions'::regclass,
  'public.push_devices'::regclass, 'public.notification_preferences'::regclass, 'public.push_receipts'::regclass, 'public.push_device_moves'::regclass)),
  'row level security is on for every table');
select has_column('public', 'notification_preferences', 'channels', 'notification_preferences gains channels');
select has_column('public', 'push_receipts', 'delivery_id', 'push_receipts gains delivery_id');
select ok(
  not has_function_privilege('authenticated', 'public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text)', 'execute')
  and has_function_privilege('service_role', 'public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text)', 'execute'),
  'only the service role may notify');
select ok(
  not has_function_privilege('authenticated', 'public.genesis_notifications_claim(text, integer, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.genesis_notifications_erase(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.genesis_notifications_unsubscribe(uuid, text, text, uuid)', 'execute'),
  'the runner, erasure and unsubscribe are the service role''s');
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('public', p.oid, 'execute'))
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'private' and p.proname like 'genesis_notifications%'),
  'no private notifications function is granted to anon or public');
select ok(not has_column_privilege('authenticated', 'public.notification_deliveries', 'rendered', 'select')
  and not has_column_privilege('authenticated', 'public.notification_deliveries', 'secret_ciphertext', 'select'),
  'nobody signed in can read a rendered email or a secret');

-- Devices: knowing a token never takes it -----------------------------------------
select pg_temp.sign_in('a1');
select lives_ok($$ select public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0', '11111111-1111-4111-8111-111111111111') $$, 'a1 registers its phone with its install id');
select pg_temp.sign_in('b2');
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0') $$, '42501', null, 'b2 cannot take a1''s token without an install id');
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0', '22222222-2222-4222-8222-222222222222') $$, '42501', null, '... nor with another phone''s install id');
reset role;
select is((select user_id from public.push_devices where token = pg_temp.tok('a1')), pg_temp.u('a1'), '... and the token stays a1''s');
select is((select count(*) from public.push_device_moves where to_user_id = pg_temp.u('b2')), 0::bigint, '... and nothing moved');
select pg_temp.sign_in('b2');
select lives_ok($$ select public.genesis_push_register(pg_temp.tok('a1'), 'ios', '1.0', '11111111-1111-4111-8111-111111111111') $$, 'on the same phone (same install id) b2 may take it over');
reset role;
select is((select user_id from public.push_devices where token = pg_temp.tok('a1')), pg_temp.u('b2'), '... and it is b2''s');
select is((select count(*) from public.push_device_moves where from_user_id = pg_temp.u('a1') and to_user_id = pg_temp.u('b2')), 1::bigint, '... and the move is audited');
select is((select token_hash from public.push_device_moves where to_user_id = pg_temp.u('b2')), encode(sha256(convert_to(pg_temp.tok('a1'), 'UTF8')), 'hex'), '... by the token''s hash, not the token');
select pg_temp.sign_in('a1');
select lives_ok($$ select public.genesis_push_register(pg_temp.tok('a1-phone'), 'ios', '1.0') $$, 'the three-argument register still registers a new token');

select pg_temp.as_anon();
select ok(public.genesis_push_forget(pg_temp.tok('a1-phone')), 'forget works signed out, the token as proof');
select ok(public.genesis_push_forget(pg_temp.tok('nobody')), '... and answers the same for a token nobody has');
select ok(public.genesis_push_forget('ExponentPushToken[gntest-%]'), '... and a pattern is just text');
reset role;
select is((select count(*) from public.push_devices where token = pg_temp.tok('a1-phone')), 0::bigint, 'the forgotten token is gone');
select is((select count(*) from public.push_devices where token = pg_temp.tok('a1')), 1::bigint, '... and only that exact token');

-- Devices for the push tests below.
select pg_temp.sign_in('a1');
select public.genesis_push_register(pg_temp.tok('a1-2'), 'ios', '1.0', '33333333-3333-4333-8333-333333333333');
reset role;

-- Idempotency ---------------------------------------------------------------------
insert into k select 'm1', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('a1')),
  '{"conversation_id": "c1", "preview": "Hi"}', 'push:msg-1', 'c1', null, 3, null, null, null);
select is((select created from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('a1')), '{"conversation_id": "c1"}', 'push:msg-1')), false,
  'the same key again for the same recipient makes nothing new');
select is((select count(*) from public.notifications where user_id = pg_temp.u('a1') and idempotency_key = 'push:msg-1'), 1::bigint, '... one row');
select is((select count(*) from public.notification_deliveries where notification_id = pg_temp.k('m1')), 2::bigint, '... with one push and one email job, not two of each');
select is((select count(*) from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'push:msg-1') where created), 1::bigint,
  'the same key for another recipient is theirs');
insert into k select 'b1', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(jsonb_build_object('user_id', pg_temp.u('c3'), 'badge', 7)), '{}', 'push:msg-badge', null, null, 1);
select is((select badge from public.notifications where id = pg_temp.k('b1')), 7, 'a recipient''s own badge wins over the call''s');
select is((select count(*) from public.genesis_notify('gntest.message', '[{"user_id": "00000000-0000-4000-8000-0000000000ff"}]', '{}', 'push:msg-2')), 0::bigint,
  'a login that no longer exists is skipped');
select throws_ok($$ select * from public.genesis_notify('gntest.nope', '["00000000-0000-4000-8000-0000000000a1"]', '{}', 'x') $$, '22023', null, 'an unknown type is refused');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{}', null) $$, '22023', null, 'an idempotency key is required');

-- Feed under row level security ---------------------------------------------------
select pg_temp.sign_in('a1');
select is((select count(*) from public.notifications where id = pg_temp.k('m1')), 1::bigint, 'a1 reads its own notification');
select is((select count(*) from public.notifications where user_id = pg_temp.u('b2')), 0::bigint, '... and none of b2''s');
select is(public.genesis_notifications_mark(array[pg_temp.k('m1')], 'read'), 1, 'a1 marks its own read');
select pg_temp.sign_in('b2');
select is((select count(*) from public.notifications where id = pg_temp.k('m1')), 0::bigint, 'b2 cannot read a1''s notification');
select is(public.genesis_notifications_mark(array[pg_temp.k('m1')], 'archived'), 0, '... nor mark it');
select throws_ok($$ select * from public.notification_deliveries $$, '42501', null, 'nobody signed in reads a delivery''s hidden columns (select *)');
select is((select count(*) from public.notification_deliveries where id is not null), 0::bigint, '... and sees no log row (not an admin)');
select pg_temp.as_anon();
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'anon cannot read the feed');
reset role;
select pg_temp.sign_in('c3');
select ok((select count(*) from public.notification_deliveries where notification_id = pg_temp.k('m1')) = 2, 'an admin reads the log');
reset role;

-- Secrets never in data -----------------------------------------------------------
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{"invite_token": "abc"}', 's1') $$,
  '22023', null, 'a key named like a secret is refused');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{"x": {"link": "https://app.example/i?token=abc"}}', 's2') $$,
  '22023', null, 'a link carrying a token, however deep, is refused');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{}', 's3', null, null, null, null, null, 'plain') $$,
  '22023', null, 'a type without a secret link takes no secret');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{"inviteToken": "abc"}', 's4') $$,
  '22023', null, 'a camelCase secret key is refused too');
select lives_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000a1"]', '{"token_count": 3}', 's5') $$,
  '... but not a key that only starts with one');
select throws_ok($$ select * from public.genesis_notify('gntest.receipt', '[{"email": "x1@example.test"}, {"email": "x2@example.test"}]', '{}', 's6', null, null, null, null, null, 'one-time') $$,
  '22023', null, 'a one-time secret goes to exactly one recipient, never copied to another');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["not-a-uuid"]', '{}', 's7') $$,
  '22023', 'genesis_notify: a recipient is not a user id', 'a malformed user id is refused without echoing it');
insert into k select 'r1', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "outside@example.test", "name": "Out Side", "ref": "people:9"}]',
  '{"response_id": "resp-1"}', 'receipt:resp-1', null, null, null, null, null, 'plain-secret-value');
select ok(not exists (select 1 from public.notifications where id = pg_temp.k('r1') and data::text like '%plain-secret-value%'), 'the secret is not in data');
select ok((select secret_ciphertext is not null and position('plain-secret-value' in encode(secret_ciphertext, 'escape')) = 0 from public.notification_deliveries where notification_id = pg_temp.k('r1')),
  '... it travels encrypted on the email job');
create temp table claimed as select * from public.genesis_notifications_claim('email', 50);
select is((select secret from claimed where notification_id = pg_temp.k('r1')), 'plain-secret-value', 'the runner gets it back when it claims the email');
select is((select email from claimed where notification_id = pg_temp.k('r1')), 'outside@example.test', '... with the address of someone with no login');
select ok(public.genesis_notifications_settle((select id from claimed where notification_id = pg_temp.k('r1')), (select claim_id from claimed where notification_id = pg_temp.k('r1')),
  '{"status": "sent", "provider_id": "re_1"}'), 'settling with the claim id records it');
select ok((select secret_ciphertext is null and status = 'sent' from public.notification_deliveries where notification_id = pg_temp.k('r1')), '... and clears the secret');
select ok(not public.genesis_notifications_settle((select id from claimed where notification_id = pg_temp.k('r1')), gen_random_uuid(), '{"status": "failed"}'),
  'a stale claim settles nothing');

-- Preferences ----------------------------------------------------------------------
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), null, 'gntest.news', 'email'), false, 'an opt-in channel is off by default');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), null, 'gntest.news', 'in_app'), true, '... and a default one on');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), null, 'gntest.receipt', 'push'), false, 'a channel the type doesn''t offer is never on');
insert into public.notification_tenant_defaults (tenant_id, category, channel, enabled) values ('00000000-0000-4000-8000-00000000aaaa', 'gntest-news', 'email', true);
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), '00000000-0000-4000-8000-00000000aaaa', 'gntest.news', 'email'), true, 'a tenant default turns it on for its people');
select pg_temp.sign_in('b2');
select lives_ok($$ select public.genesis_notifications_set_preference('gntest-news', 'email', false) $$, 'b2 turns it off');
select lives_ok($$ select public.genesis_notifications_set_preference('gntest-messages', 'push', false) $$, '... and message pushes');
select is((select channels from public.notification_preferences where user_id = pg_temp.u('b2')), '{"gntest-news": {"email": false}, "gntest-messages": {"push": false}}'::jsonb,
  'each choice merges into the row');
select throws_ok($$ select public.genesis_notifications_set_preference('gntest-security', 'email', false) $$, '22023', null, 'a critical category can''t be turned off');
select throws_ok($$ select public.genesis_notifications_set_preference('gntest-forms', 'push', true) $$, '22023', null, 'nor a channel no type offers turned on');
reset role;
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), '00000000-0000-4000-8000-00000000aaaa', 'gntest.news', 'email'), false, 'the person''s choice beats the tenant''s default');
update public.notification_preferences set channels = channels || '{"gntest-security": {"email": false}}' where user_id = pg_temp.u('b2');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), null, 'gntest.security', 'email'), true, 'a critical type ignores a choice that slipped in');
insert into public.notification_preferences (user_id, categories) values (pg_temp.u('c3'), '{"gntest-messages": false}');
select is(private.genesis_notifications_channel_on(pg_temp.u('c3'), null, 'gntest.message', 'push'), false, '0005''s category switch still turns push off');
select is(private.genesis_notifications_channel_on(pg_temp.u('c3'), null, 'gntest.message', 'in_app'), true, '... but not the feed');

-- Quiet hours across daylight saving (America/New_York) ------------------------------
update public.notification_preferences set quiet_hours_enabled = true, quiet_hours_start = '22:00', quiet_hours_end = '02:30', time_zone = 'America/New_York'
where user_id = pg_temp.u('c3');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-03-08 06:30+00'), '2026-03-08 07:00+00'::timestamptz,
  'an end time the spring-forward change skips ends quiet hours at the change');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-03-07 04:00+00'), '2026-03-07 07:30+00'::timestamptz, '... and at 02:30 the night before');
update public.notification_preferences set quiet_hours_start = '01:30', quiet_hours_end = '06:00' where user_id = pg_temp.u('c3');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-11-01 05:45+00'), '2026-11-01 11:00+00'::timestamptz, 'fall back: quiet from the first 01:30');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-11-01 06:45+00'), '2026-11-01 11:00+00'::timestamptz, '... the repeated hour doesn''t restart it');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-11-01 11:00+00'), null, '... and the end is exclusive');
update public.notification_preferences set quiet_hours_start = '06:00' where user_id = pg_temp.u('c3');
select is(private.genesis_notifications_quiet_until(pg_temp.u('c3'), '2026-11-01 10:59+00'), null, 'a start equal to the end is no quiet hours');

-- Push during quiet hours waits; a transactional one doesn't ----------------------------
-- a1 is quiet all day long, in UTC.
insert into public.notification_preferences (user_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone)
values (pg_temp.u('a1'), true, '00:00', '23:59', 'UTC')
on conflict (user_id) do update set quiet_hours_enabled = true, quiet_hours_start = '00:00', quiet_hours_end = '23:59', time_zone = 'UTC';
insert into k select 'q1', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('a1')), '{}', 'push:msg-q');
insert into k select 'q2', notification_id from public.genesis_notify('gntest.alert', jsonb_build_array(pg_temp.u('a1')), '{}', 'alert-1');
update public.notification_deliveries set send_after = now() - interval '1 minute' where notification_id in (pg_temp.k('q1'), pg_temp.k('q2'));
create temp table pushes as select * from public.genesis_notifications_claim('push', 50);
select ok(not exists (select 1 from pushes where notification_id = pg_temp.k('q1')), 'a push in quiet hours is not handed out');
select ok((select status = 'pending' and send_after > now() and attempts = 0 from public.notification_deliveries where notification_id = pg_temp.k('q1') and channel = 'push'),
  '... it waits until they end, with no attempt used');
select ok(exists (select 1 from pushes where notification_id = pg_temp.k('q2') and jsonb_array_length(devices) = 1), 'a transactional push goes through quiet hours, to the person''s devices');
select is((select d.skip_reason from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
           where n.user_id = pg_temp.u('b2') and n.idempotency_key = 'push:msg-1' and d.channel = 'push'), 'preference',
  'a push queued before the person turned the channel off is skipped at send');

-- Email: delay, then skip if read; suppressions; transactional bypass -----------------------
select ok((select send_after > now() + interval '9 minutes' from public.notification_deliveries where notification_id = pg_temp.k('m1') and channel = 'email'),
  'a message email waits its delay');
update public.notification_deliveries set send_after = now() - interval '1 second' where notification_id = pg_temp.k('m1') and channel = 'email';
select ok(not exists (select 1 from public.genesis_notifications_claim('email', 50) c where c.notification_id = pg_temp.k('m1')), 'a1 read it in the app, so no email');
select is((select skip_reason from public.notification_deliveries where notification_id = pg_temp.k('m1') and channel = 'email'), 'read_in_app', '... recorded as read_in_app');

insert into public.notification_suppressions (email_hash, category, reason) values (private.genesis_notifications_email_hash('GNTEST-b2@example.test '), '*', 'complaint');
insert into k select 'n1', notification_id from public.genesis_notify('gntest.security', jsonb_build_array(pg_temp.u('b2')), '{}', 'sec-1');
insert into k select 'n2', notification_id from public.genesis_notify('gntest.receipt', jsonb_build_array(pg_temp.u('b2')), '{}', 'rcpt-b2');
create temp table mails as select * from public.genesis_notifications_claim('email', 50);
select is((select skip_reason from public.notification_deliveries where notification_id = pg_temp.k('n1') and channel = 'email'), 'suppressed', 'a complaint stops non-transactional mail');
select ok(exists (select 1 from mails where notification_id = pg_temp.k('n2') and transactional), 'a transactional email still goes to a complainer');
select ok((select send_after <= now() from public.notification_deliveries where notification_id = pg_temp.k('n2')), '... and is never delayed');
select ok(public.genesis_notifications_unsubscribe(null, private.genesis_notifications_email_hash('outside@example.test'), 'gntest-forms'), 'someone with no login unsubscribes from a category');
select ok(public.genesis_notifications_unsubscribe(pg_temp.u('a1'), null, 'gntest-messages'), 'a login unsubscribes through their preferences');
select is((select channels -> 'gntest-messages' ->> 'email' from public.notification_preferences where user_id = pg_temp.u('a1')), 'false', '... the category''s email is off');
select ok(public.genesis_notifications_email_event('re_1', 'bounced', true), 'a hard bounce is recorded');
select ok(exists (select 1 from public.notification_suppressions where email_hash = private.genesis_notifications_email_hash('outside@example.test') and category = '*' and reason = 'bounce'),
  '... and suppresses the address');

-- Collapse ---------------------------------------------------------------------------
insert into k select 'c1', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'push:c-1', 't1', 'conv-1');
insert into k select 'c2', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'push:c-2', 't1', 'conv-1');
select is((select status from public.notification_deliveries where notification_id = pg_temp.k('c1') and channel = 'email'), 'cancelled', 'a newer message with the same collapse key cancels the older unsent email');
select ok((select archived_at is not null from public.notifications where id = pg_temp.k('c1')), '... and archives the older feed row');
select ok((select archived_at is null from public.notifications where id = pg_temp.k('c2')), '... leaving the newer one');

-- Type mirror --------------------------------------------------------------------------
select is(public.genesis_notifications_sync_types((select jsonb_agg(to_jsonb(t) - 'retired_at' - 'updated_at') from public.notification_types t where t.key <> 'gntest.news')), 
  (select count(*)::integer from public.notification_types where key <> 'gntest.news'), 'syncing writes every type in the list');
select ok((select retired_at is not null from public.notification_types where key = 'gntest.news'), '... retires one left out (never deletes it)');
select throws_ok($$ select * from public.genesis_notify('gntest.news', '["00000000-0000-4000-8000-0000000000a1"]', '{}', 'n-x') $$, '22023', null, '... and a retired type takes no new notifications');

-- Admin --------------------------------------------------------------------------------
select pg_temp.sign_in('c3');
select ok(public.genesis_notifications_send_test() is not null, 'an admin sends a test to themself');
select pg_temp.sign_in('b2');
select throws_ok($$ select public.genesis_notifications_send_test() $$, '42501', null, 'someone else may not');
select throws_ok($$ select public.genesis_notifications_set_tenant_default('00000000-0000-4000-8000-00000000aaaa', 'gntest-news', 'email', false) $$, '42501', null, '... nor change a tenant''s defaults');
reset role;

-- Transactional email ignores unsubscribes ------------------------------------------------
update public.notification_preferences set channels = channels || '{"gntest-forms": {"email": false}}' where user_id = pg_temp.u('b2');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), null, 'gntest.receipt', 'email'), true, 'an unsubscribe never stops a transactional email');

-- Cancel ------------------------------------------------------------------------------------
create temp table release42 as select * from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2'), pg_temp.u('c3')), '{}', 'release:42');
update public.notification_preferences set categories = '{}' where user_id = pg_temp.u('c3');
insert into k select 'x3', notification_id from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('c3')), '{}', 'release:43');
update public.notification_deliveries set status = 'sent', sent_at = now()
where notification_id = pg_temp.k('x3') and channel = 'push';
select is((select cancelled from public.genesis_notifications_cancel('gntest.message', 'release:42', null, jsonb_build_array(pg_temp.u('b2')))), 1,
  'cancel stops the pending email of only the recipient named');
select is((select status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
           where n.idempotency_key = 'release:42' and n.user_id = pg_temp.u('b2') and d.channel = 'email'), 'cancelled', '... marked cancelled');
select is((select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
           where n.idempotency_key = 'release:42' and n.user_id = pg_temp.u('c3') and d.status = 'pending'), 0::bigint,
  '... (c3 had message email off, so nothing was queued for them)');
select is((select archived_at from public.notifications where idempotency_key = 'release:42' and user_id = pg_temp.u('b2')), null, '... and leaves the feed row without archive');
select is((select row(cancelled, archived)::text from public.genesis_notifications_cancel('gntest.message', 'release:43', null, null, true)), '(1,1)',
  'cancel with archive: the pending email cancelled and the feed row archived');
select is((select status from public.notification_deliveries where notification_id = pg_temp.k('x3') and channel = 'push'), 'sent', 'a job already sent is left alone');
update public.notification_deliveries set send_after = now() - interval '1 day' where status = 'cancelled';
select ok(not exists (select 1 from public.genesis_notifications_claim('email', 500) c join public.notification_deliveries d on d.id = c.id
                      join public.notifications n on n.id = d.notification_id where n.idempotency_key in ('release:42', 'release:43')),
  'a cancelled job is never claimed');
select throws_ok($$ select * from public.genesis_notifications_cancel('gntest.message', null) $$, '22023', null, 'cancel needs an idempotency key');
select ok(not has_function_privilege('authenticated', 'public.genesis_notifications_cancel(text, text, uuid, jsonb, boolean)', 'execute'), '... and is the service role''s');

-- A job whose lease keeps running out fails --------------------------------------------------
update public.notification_deliveries set status = 'sending', lease_until = now() - interval '1 minute', attempts = 8, send_after = now() - interval '1 hour'
where notification_id = pg_temp.k('x3') and channel = 'email';
select ok(not exists (select 1 from public.genesis_notifications_claim('email', 500) c where c.notification_id = pg_temp.k('x3')), 'a job that lost its lease 8 times isn''t handed out again');
select is((select status || ':' || error from public.notification_deliveries where notification_id = pg_temp.k('x3') and channel = 'email'), 'failed:lease_expired', '... it fails as lease_expired');

-- 0005's category switch becomes channel choices on the first change ---------------------------
update public.notification_preferences set categories = '{"gntest-messages": false}', channels = '{}' where user_id = pg_temp.u('c3');
select pg_temp.sign_in('c3');
select is(public.genesis_notifications_set_preference('gntest-messages', 'push', true), '{"gntest-messages": {"push": true, "email": false}}'::jsonb,
  'turning push back on keeps email off, as the old switch had it');
reset role;
select is((select categories from public.notification_preferences where user_id = pg_temp.u('c3')), '{}'::jsonb, '... and the old switch is gone');

-- Erasure ------------------------------------------------------------------------------
select is(public.genesis_notifications_erase(null, 'OUTSIDE@example.test', null), 1, 'erasing someone with no login, by address');
select is((select count(*) from public.notifications where lower(email) = 'outside@example.test' or person_ref = 'people:9'), 0::bigint, '... leaves none of their notifications');
select ok(public.genesis_notifications_erase(pg_temp.u('a1')) >= 1, 'erasing a login');
select is((select count(*) from public.notifications where user_id = pg_temp.u('a1')), 0::bigint, '... deletes their notifications');
select is((select count(*) from public.notification_deliveries d where not exists (select 1 from public.notifications n where n.id = d.notification_id)), 0::bigint, '... and every send job with them');
select is((select count(*) from public.push_devices where user_id = pg_temp.u('a1')), 0::bigint, '... their devices');
select is((select count(*) from public.notification_preferences where user_id = pg_temp.u('a1')), 0::bigint, '... and their preferences');
select is((select count(*) from public.push_device_moves where from_user_id = pg_temp.u('a1') or to_user_id = pg_temp.u('a1')), 0::bigint, '... and their device moves');
select ok((public.genesis_notifications_prune(interval '1 hour', interval '0'))->>'deliveries' is not null, 'prune runs and reports what it removed');

-- Review fixes ------------------------------------------------------------------------------
create function pg_temp.t(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-00000000' || repeat(n, 4))::uuid $$;

-- Sender domains: one tenant per verified domain, proved with its own token.
select pg_temp.sign_in('c3');
select lives_ok($$ select public.genesis_notifications_set_sender(pg_temp.t('a'), 'Tenant A', null, 'mail.gntest.example') $$, 'tenant A sets its own domain');
select lives_ok($$ select public.genesis_notifications_set_sender(pg_temp.t('b'), 'Tenant B', null, 'mail.gntest.example') $$, '... and tenant B may name the same one while neither has verified it');
reset role;
select ok((select bool_and(domain_token ~ '^[0-9a-f]{32}$') from public.notification_senders where tenant_id in (pg_temp.t('a'), pg_temp.t('b'))), 'each sender gets an ownership token for the TXT record');
select ok((select count(distinct domain_token) = 2 from public.notification_senders where tenant_id in (pg_temp.t('a'), pg_temp.t('b'))), '... a token of its own');
select ok(public.genesis_notifications_set_sender_dns(pg_temp.t('a'), 'mail.gntest.example', 'verified', '{"ownership": true}'), 'tenant A verifies it');
select throws_ok($$ select public.genesis_notifications_set_sender_dns(pg_temp.t('b'), 'mail.gntest.example', 'verified', '{"ownership": true}') $$, '23505', null,
  'tenant B can never verify a domain tenant A has verified');
select is((select domain_status from public.notification_senders where tenant_id = pg_temp.t('b')), 'pending', '... and stays unverified');
select ok(not public.genesis_notifications_set_sender_dns(pg_temp.t('a'), 'other.gntest.example', 'failed', '{}'), 'a check of a domain the tenant no longer has changes nothing');
select pg_temp.sign_in('c3');
select throws_ok($$ select public.genesis_notifications_set_sender(pg_temp.t('c'), 'Tenant C', null, 'MAIL.gntest.example') $$, '23505', null, 'a third tenant may not even name a verified domain');
select lives_ok($$ select public.genesis_notifications_set_sender(pg_temp.t('b'), 'Tenant B', null, 'b.gntest.example') $$, 'tenant B moves to another domain');
reset role;
select ok((select domain_token is not null and domain_status = 'pending' from public.notification_senders where tenant_id = pg_temp.t('b')), '... pending again, with a fresh token');

-- Idempotency is per type and tenant.
select is((select count(*) from (
  select * from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'tenant-key', null, null, null, pg_temp.t('a'))
  union all
  select * from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'tenant-key', null, null, null, pg_temp.t('b'))
) x where created), 2::bigint, 'the same key for tenants A and B gives two notifications');
select is((select created from public.genesis_notify('gntest.message', jsonb_build_array(pg_temp.u('b2')), '{}', 'tenant-key', null, null, null, pg_temp.t('a'))), false,
  '... and the key again for tenant A finds tenant A''s');
select is((select created from public.genesis_notify('gntest.alert', jsonb_build_array(pg_temp.u('b2')), '{}', 'tenant-key', null, null, null, pg_temp.t('a'))), true,
  '... while another type with the key is a notification of its own');
select is((select cancelled from public.genesis_notifications_cancel('gntest.message', 'tenant-key', pg_temp.t('a'))), 1, 'cancel for tenant A cancels its pending email');
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
           where n.idempotency_key = 'tenant-key' and n.tenant_id = pg_temp.t('b') and d.channel = 'email'), 'pending', '... and never tenant B''s');
select is((select cancelled from public.genesis_notifications_cancel('gntest.message', 'tenant-key')), 0, '... nor does a cancel with no tenant');

-- A cancel during a send sticks.
insert into k select 'cm', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "cancel-mid@example.test"}]', '{}', 'cancel-mid');
insert into k select 'cl', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "cancel-lease@example.test"}]', '{}', 'cancel-lease');
create temp table cmc as select * from public.genesis_notifications_claim('email', 500);
select is((select count(*) from cmc where notification_id in (pg_temp.k('cm'), pg_temp.k('cl'))), 2::bigint, 'claimed: both are being sent');
select is((select cancelled from public.genesis_notifications_cancel('gntest.receipt', 'cancel-mid')), 1, 'a cancel while one is being sent counts it');
select ok(public.genesis_notifications_settle((select id from cmc where notification_id = pg_temp.k('cm')), (select claim_id from cmc where notification_id = pg_temp.k('cm')),
  '{"status": "retry", "error": "Resend answered HTTP 500", "counted": true}'), 'the runner settles a retry');
select is((select status || ':' || skip_reason from public.notification_deliveries where notification_id = pg_temp.k('cm')), 'cancelled:cancelled', '... and it ends cancelled, not back in the queue');
select is((select cancelled from public.genesis_notifications_cancel('gntest.receipt', 'cancel-lease')), 1, 'cancel the other mid-send');
update public.notification_deliveries set lease_until = now() - interval '1 minute', send_after = now() - interval '1 hour' where notification_id in (pg_temp.k('cm'), pg_temp.k('cl'));
select ok(not exists (select 1 from public.genesis_notifications_claim('email', 500) c where c.notification_id in (pg_temp.k('cm'), pg_temp.k('cl'))),
  'claim -> cancel -> settle retry (or a lost lease) -> never claimed again');
select is((select status from public.notification_deliveries where notification_id = pg_temp.k('cl')), 'cancelled', '... a lost lease ends cancelled too');

-- One secret that won't decrypt fails alone.
insert into k select 'sb', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "bad-secret@example.test"}]', '{}', 'bad-secret', null, null, null, null, null, 'unreadable');
insert into k select 'sg', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "good-secret@example.test"}]', '{}', 'good-secret', null, null, null, null, null, 'readable');
update public.notification_deliveries set secret_ciphertext = '\xc30d04070302deadbeef'::bytea where notification_id = pg_temp.k('sb');
create temp table sbc as select * from public.genesis_notifications_claim('email', 500);
select is((select secret from sbc where notification_id = pg_temp.k('sg')), 'readable', 'a corrupt secret on one email never blocks another''s');
select is((select status || ':' || error from public.notification_deliveries where notification_id = pg_temp.k('sb')), 'failed:secret_unreadable', '... it fails as secret_unreadable');
select ok((select secret_ciphertext is null from public.notification_deliveries where notification_id = pg_temp.k('sb')), '... and drops the ciphertext');

-- The provider's id is kept before settle, so an early webhook finds the job.
select ok(public.genesis_notifications_record_provider_id((select id from sbc where notification_id = pg_temp.k('sg')), (select claim_id from sbc where notification_id = pg_temp.k('sg')), 're_early'),
  'the provider id is kept as soon as the send returns');
select ok(public.genesis_notifications_email_event('re_early', 'delivered'), 'a webhook that comes before settle finds the job');
select is((select status from public.notification_deliveries where notification_id = pg_temp.k('sg')), 'delivered', '... and settles it');
select ok(not public.genesis_notifications_settle((select id from sbc where notification_id = pg_temp.k('sg')), (select claim_id from sbc where notification_id = pg_temp.k('sg')), '{"status": "sent"}'),
  '... so the runner''s late settle is stale and changes nothing');
select ok(not has_function_privilege('authenticated', 'public.genesis_notifications_record_provider_id(uuid, uuid, text)', 'execute'), '... and it is the service role''s');

-- Unsubscribe is for the tenant the email came from.
select ok(public.genesis_notifications_unsubscribe(null, private.genesis_notifications_email_hash('Tenant-Out@example.test'), 'gntest-messages', pg_temp.t('a')),
  'someone with no login unsubscribes from tenant A''s mail, by the address''s hash');
insert into k select 'ua', notification_id from public.genesis_notify('gntest.message', '[{"email": "tenant-out@example.test"}]', '{}', 'unsub-a', null, null, null, pg_temp.t('a'));
insert into k select 'ub', notification_id from public.genesis_notify('gntest.message', '[{"email": "tenant-out@example.test"}]', '{}', 'unsub-b', null, null, null, pg_temp.t('b'));
create temp table uc as select * from public.genesis_notifications_claim('email', 500);
select is((select skip_reason from public.notification_deliveries where notification_id = pg_temp.k('ua')), 'suppressed', '... tenant A''s mail stops');
select ok(exists (select 1 from uc where notification_id = pg_temp.k('ub')), '... tenant B''s doesn''t');
select ok(public.genesis_notifications_unsubscribe(pg_temp.u('b2'), null, 'gntest-messages', pg_temp.t('a')), 'a login unsubscribes from tenant A''s mail');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), pg_temp.t('a'), 'gntest.message', 'email'), false, '... off for tenant A');
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), pg_temp.t('b'), 'gntest.message', 'email'), true, '... still on for tenant B');
select pg_temp.sign_in('b2');
select lives_ok($$ select public.genesis_notifications_set_preference('gntest-messages', 'email', true) $$, 'turning it on in Settings');
reset role;
select is(private.genesis_notifications_channel_on(pg_temp.u('b2'), pg_temp.t('a'), 'gntest.message', 'email'), true, '... turns it on for tenant A again');

-- A token from before install ids is adopted by the first register that brings one.
insert into public.push_devices (user_id, token, platform) values (pg_temp.u('c3'), pg_temp.tok('legacy'), 'ios');
select pg_temp.sign_in('b2');
select lives_ok($$ select public.genesis_push_register(pg_temp.tok('legacy'), 'ios', '1.0', '44444444-4444-4444-8444-444444444444') $$,
  'a token 0005 left with no install id is adopted by the first register that brings one');
reset role;
select is((select user_id::text || ':' || installation_id::text from public.push_devices where token = pg_temp.tok('legacy')),
  pg_temp.u('b2')::text || ':44444444-4444-4444-8444-444444444444', '... it is b2''s, with that install id');
select is((select count(*) from public.push_device_moves where from_user_id = pg_temp.u('c3') and to_user_id = pg_temp.u('b2')), 1::bigint, '... and the move is audited');
select pg_temp.sign_in('c3');
select throws_ok($$ select public.genesis_push_register(pg_temp.tok('legacy'), 'ios', '1.0', '55555555-5555-4555-8555-555555555555') $$, '42501', null,
  '... after which only that phone may move it');
reset role;

-- 0005's switch left on never opts anyone into email; clearing a choice never made is fine.
update public.notification_types set retired_at = null where key = 'gntest.news';
update public.notification_preferences set categories = '{"gntest-news": true}', channels = '{}' where user_id = pg_temp.u('c3');
select pg_temp.sign_in('c3');
select is(public.genesis_notifications_set_preference('gntest-news', 'in_app', false), '{"gntest-news": {"in_app": false}}'::jsonb,
  'an old switch left on carries over as nothing, not as email on');
select lives_ok($$ select public.genesis_notifications_set_preference('gntest-forms', 'email', null) $$, 'clearing a choice in a category with none is fine');
reset role;
select is(private.genesis_notifications_channel_on(pg_temp.u('c3'), null, 'gntest.news', 'email'), false, '... so opt-in email stays off');

-- Secrets: relative links and any parameter ending like one.
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000b2"]', '{"link": "/accept?inviteCode=abc"}', 'rel-1') $$,
  '22023', null, 'a relative link carrying a code is refused');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000b2"]', '{"next": "?otp=123456"}', 'rel-2') $$,
  '22023', null, '... and a bare query');
select throws_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000b2"]', '{"verification_code": "1"}', 'rel-3') $$,
  '22023', null, '... and a key ending in code');
select lives_ok($$ select * from public.genesis_notify('gntest.message', '["00000000-0000-4000-8000-0000000000b2"]', '{"link": "/messages/42?tab=files"}', 'rel-4') $$,
  '... but not a plain link');

-- Erasing a login erases mail addressed to its email.
insert into k select 'em', notification_id from public.genesis_notify('gntest.receipt', '[{"email": "GNTEST-b2@example.test"}]', '{}', 'erase-mail');
select ok(public.genesis_notifications_erase(pg_temp.u('b2')) >= 1, 'erasing a login');
select is((select count(*) from public.notifications where id = pg_temp.k('em')), 0::bigint, '... also erases what was addressed to its email');

select * from finish();
rollback;
