-- Genesis notifications: one notifier for every domain. A domain (chat,
-- forms, sites, support) decides who is told and what; this decides how and
-- when: the channel (the in-app feed, Expo push, email), quiet hours,
-- preferences by category and channel (with tenant defaults; critical types
-- always on), delay-then-skip-if-read for email, dedupe, retries, delivery
-- receipts and pruning dead tokens. It never reads a domain's tables.
--
-- The TypeScript half is @marktiderman/genesis-notifications: `notify()` (a
-- wrapper over genesis_notify), the runner that sends, the Expo and Resend
-- providers, the feed hooks and screens.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name, and its pgTAP test into `supabase/tests/database/`. Never
-- edit it once applied; change it with a new migration.
--
-- Push ownership moves here from @marktiderman/genesis-supabase's migration
-- 0005 (genesis_push). This migration works with or without 0005:
--   - With 0005 applied, it adopts push_devices, notification_preferences and
--     push_receipts as they are and only adds to them (a `channels` column on
--     notification_preferences, a `delivery_id` on push_receipts). No row is
--     touched. The sender-side functions of 0005 (genesis_push_targets, …)
--     and the genesis-push-send function stay but are superseded by the runner
--     here; stop calling them once this runs.
--   - Without 0005, it creates those three tables and their policies exactly
--     as 0005 does, so the push block works.
--   Either way it (re)defines the device-side functions the phone calls, with
--   two security rules 0005 didn't have: genesis_push_register moves a token
--   another login holds only when the caller registers it with the same
--   install id (the same phone), and records the move in push_device_moves
--   (knowing a token never takes it); genesis_push_forget still works signed
--   out with the token as proof, deletes only that exact token's row, and
--   answers the same whether or not there was one.
--
-- Tables (public, row level security on):
--   notification_types          mirrored from code (defineNotifications), never edited by hand.
--   notifications               the in-app feed, and the outbox: one row per recipient,
--                               unique on (recipient, idempotency_key). A person reads only
--                               their own rows.
--   notification_deliveries     one row per notification and channel (push, email): status,
--                               attempts, send_after, the provider's id, an error code. Claimed
--                               with SKIP LOCKED. Admins read the log columns of their tenant's.
--   notification_tenant_defaults  a tenant's default for a category and channel.
--   notification_senders        a tenant's email identity (from name, reply-to, own domain).
--   notification_suppressions   addresses not to email (bounces, complaints, unsubscribes of
--                               people with no login), by SHA-256 of the address only.
--
-- Who can do what (granted and revoked by name, never in bulk):
--   authenticated  read their own feed; genesis_notifications_mark / _mark_all (seen, read,
--                  archived); genesis_notifications_set_preference; and, gated by
--                  private.genesis_notifications_admin, the admin functions (tenant defaults,
--                  sender identity, send a test to yourself, lift a suppression).
--   service_role   genesis_notify, genesis_notifications_cancel, the runner's claim/settle
--                  functions, receipts, webhooks, unsubscribe, erase, prune and the type mirror.
--
-- Admins: private.genesis_notifications_admin(user uuid, tenant uuid) says who may see a
-- tenant's delivery log (tenant null: the whole app, and the suppression list). It answers
-- false until you replace it in a migration of your own, after this one.
--
-- Secrets: `data` never holds one (genesis_notify refuses keys such as `token` or a link
-- with `?token=`). A secret link is built at send time from a reference. A token that
-- exists only hashed in your tables (an invite) is passed as `p_secret`: it is encrypted
-- onto the email's delivery row with a key kept in Vault, handed to the runner only when
-- it claims the email, and cleared once the email is sent, skipped or failed.
--
-- Realtime: a new notification (and a read or archive) sends a broadcast with ids only on
-- the private channel `user:<id>`; the app refetches. No Postgres Changes.
--
-- Erasure: genesis_notifications_erase(user, email, ref) deletes a person's notifications
-- (with their deliveries), devices, receipts and preferences, logins or not. Deleting a
-- login also cascades. Delivery logs are kept as long as genesis_notifications_prune says.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_notifications.test.sql`).

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

-- 0005's tables, created only where 0005 never ran ---------------------------

do $adopt$
begin
  if to_regclass('public.push_devices') is not null then
    return;
  end if;

  create table public.push_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    token text not null unique
      constraint push_devices_token_format check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
    platform text not null
      constraint push_devices_platform check (platform in ('ios', 'android')),
    app_version text
      constraint push_devices_app_version_length check (char_length(app_version) <= 64),
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  );
  create index push_devices_user_id on public.push_devices (user_id, last_seen_at desc);
  comment on table public.push_devices is
    'Expo push tokens of each login''s devices. The owner reads and deletes their own; written through genesis_push_register. Genesis notifications.';
  alter table public.push_devices enable row level security;
  create policy push_devices_owner_read on public.push_devices
    for select to authenticated using (user_id = (select auth.uid()));
  create policy push_devices_owner_delete on public.push_devices
    for delete to authenticated using (user_id = (select auth.uid()));
  revoke all on table public.push_devices from public, anon, authenticated;
  grant select, delete on table public.push_devices to authenticated;
  grant select, insert, update, delete on table public.push_devices to service_role;

  create table public.notification_preferences (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    categories jsonb not null default '{}'::jsonb
      constraint notification_preferences_categories_shape check (
        jsonb_typeof(categories) = 'object'
        and not jsonb_path_exists(categories, '$.* ? (@.type() != "boolean")')
        and pg_column_size(categories) <= 8192
      ),
    quiet_hours_enabled boolean not null default false,
    quiet_hours_start time not null default '22:00',
    quiet_hours_end time not null default '07:00',
    time_zone text
      constraint notification_preferences_time_zone_length check (char_length(time_zone) between 1 and 64),
    hide_previews boolean not null default false,
    updated_at timestamptz not null default now(),
    constraint notification_preferences_quiet_hours_zone check (not quiet_hours_enabled or time_zone is not null)
  );
  comment on table public.notification_preferences is
    'Per-person notification choices, quiet hours and lock-screen privacy. The owner reads and writes their own row. Genesis notifications.';

  execute $f$
    create function private.genesis_notification_preferences_check()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      if new.time_zone is not null and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
        raise exception 'notification_preferences: unknown time zone' using errcode = '22023';
      end if;
      if exists (select 1 from pg_catalog.jsonb_object_keys(new.categories) k where k !~ '^[a-z0-9][a-z0-9._-]{0,63}$') then
        raise exception 'notification_preferences: a category id must be lower case letters, digits, ".", "_" or "-"' using errcode = '22023';
      end if;
      new.updated_at := now();
      return new;
    end;
    $$
  $f$;
  create trigger genesis_notification_preferences_check
    before insert or update on public.notification_preferences
    for each row execute function private.genesis_notification_preferences_check();
  revoke execute on function private.genesis_notification_preferences_check() from public, anon, authenticated;

  alter table public.notification_preferences enable row level security;
  create policy notification_preferences_owner_read on public.notification_preferences
    for select to authenticated using (user_id = (select auth.uid()));
  create policy notification_preferences_owner_insert on public.notification_preferences
    for insert to authenticated with check (user_id = (select auth.uid()));
  create policy notification_preferences_owner_update on public.notification_preferences
    for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy notification_preferences_owner_delete on public.notification_preferences
    for delete to authenticated using (user_id = (select auth.uid()));
  revoke all on table public.notification_preferences from public, anon, authenticated;
  grant select, insert, update, delete on table public.notification_preferences to authenticated;
  grant select, insert, update, delete on table public.notification_preferences to service_role;

  create table public.push_receipts (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    device_id uuid references public.push_devices (id) on delete set null,
    category text not null
      constraint push_receipts_category_format check (category ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    ticket_id text
      constraint push_receipts_ticket_id_length check (char_length(ticket_id) <= 128),
    status text not null
      constraint push_receipts_status check (status in ('sent', 'delivered', 'failed', 'unknown')),
    error text
      constraint push_receipts_error_format check (error ~ '^[A-Za-z_]{1,64}$'),
    created_at timestamptz not null default now(),
    check_after timestamptz,
    checked_at timestamptz,
    attempts integer not null default 0,
    constraint push_receipts_sent_has_ticket check (status <> 'sent' or ticket_id is not null)
  );
  create index push_receipts_due on public.push_receipts (check_after) where status = 'sent';
  create index push_receipts_user_id on public.push_receipts (user_id, created_at desc);
  create index push_receipts_created_at on public.push_receipts (created_at);
  comment on table public.push_receipts is
    'What was handed to Expo''s push service and what became of it (no content). The owner reads their own. Genesis notifications.';
  alter table public.push_receipts enable row level security;
  create policy push_receipts_owner_read on public.push_receipts
    for select to authenticated using (user_id = (select auth.uid()));
  revoke all on table public.push_receipts from public, anon, authenticated;
  grant select on table public.push_receipts to authenticated;
  grant select, insert, update, delete on table public.push_receipts to service_role;

end;
$adopt$;

-- Preferences by category and channel ----------------------------------------

-- Category id -> channel -> on. A pair not listed has its default (the tenant's, then the type's).
alter table public.notification_preferences
  add column channels jsonb not null default '{}'::jsonb
    constraint notification_preferences_channels_shape check (
      jsonb_typeof(channels) = 'object'
      and not jsonb_path_exists(channels, '$.* ? (@.type() != "object")')
      and not jsonb_path_exists(channels, '$.*.* ? (@.type() != "boolean")')
      and pg_column_size(channels) <= 16384
    );

create function private.genesis_notifications_channels_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from pg_catalog.jsonb_each(new.channels) c, pg_catalog.jsonb_object_keys(c.value) ch
    where c.key !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or ch not in ('in_app', 'push', 'email')
  ) then
    raise exception 'notification_preferences: channels are { category: { in_app | push | email: boolean } }' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger genesis_notifications_channels_check
  before insert or update of channels on public.notification_preferences
  for each row execute function private.genesis_notifications_channels_check();

-- Types, mirrored from code -------------------------------------------------

create table public.notification_types (
  key text primary key
    constraint notification_types_key_format check (key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  category text not null
    constraint notification_types_category_format check (category ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  -- Channel -> on by default. A channel not listed is never used for this type.
  channels jsonb not null
    constraint notification_types_channels_shape check (
      jsonb_typeof(channels) = 'object'
      and channels <> '{}'::jsonb
      and not jsonb_path_exists(channels, '$.* ? (@.type() != "boolean")')
      and not jsonb_path_exists(channels, '$.keyvalue() ? (@.key != "in_app" && @.key != "push" && @.key != "email")')
    ),
  critical boolean not null default false,
  transactional boolean not null default false,
  email_delay_seconds integer not null default 0
    constraint notification_types_email_delay check (email_delay_seconds between 0 and 604800),
  secret_link boolean not null default false,
  push_privacy text not null default 'default'
    constraint notification_types_push_privacy check (push_privacy in ('default', 'generic')),
  ios_category text
    constraint notification_types_ios_category check (ios_category ~ '^[A-Za-z0-9_]{1,64}$'),
  retired_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.notification_types is
  'Notification types, mirrored from the app''s defineNotifications by genesis_notifications_sync_types; never edited by hand, never deleted (retired_at). Genesis notifications.';

alter table public.notification_types enable row level security;
create policy notification_types_read on public.notification_types
  for select to authenticated using (true);
revoke all on table public.notification_types from public, anon, authenticated;
grant select on table public.notification_types to authenticated;
grant select, insert, update, delete on table public.notification_types to service_role;

-- The admin's own test notification (Admin -> Send a test).
insert into public.notification_types (key, category, channels, critical, transactional)
values ('genesis.test', 'genesis', '{"in_app": true, "push": true, "email": true}', true, true);

-- Devices: a token moves between logins only from its own device ------------

-- Which install of the app holds a token: a random id the phone keeps across
-- sign-ins. A token moves to another login only when that login registers it
-- with the same install id (the same phone).
alter table public.push_devices
  add column installation_id uuid;

-- Every time a token moved from one login to another. Read by the service role only.
create table public.push_device_moves (
  id bigint generated always as identity primary key,
  -- SHA-256 of the token: the move is traceable without keeping the credential twice.
  token_hash text not null,
  from_user_id uuid references auth.users (id) on delete set null,
  to_user_id uuid references auth.users (id) on delete set null,
  installation_id uuid,
  moved_at timestamptz not null default now()
);
create index push_device_moves_moved_at on public.push_device_moves (moved_at);

comment on table public.push_device_moves is
  'Audit of push tokens that moved between logins on one device (same install id). Service role only. Genesis notifications.';

alter table public.push_device_moves enable row level security;
revoke all on table public.push_device_moves from public, anon, authenticated;
grant select, delete on table public.push_device_moves to service_role;

-- Keeps this device's token against the caller and returns its device id.
-- A token another login holds moves to the caller only when the caller
-- registers it with the install id stored with it (the same phone, where the
-- other login didn't sign out cleanly); the move is recorded in
-- push_device_moves. Otherwise it is refused (42501) and nothing changes:
-- knowing a token never takes it. The caller's ten most recently seen devices
-- are kept.
create function public.genesis_push_register(p_token text, p_platform text, p_app_version text, p_installation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  holder public.push_devices;
  device uuid;
begin
  if me is null then
    raise exception 'genesis_push_register: sign in first' using errcode = '42501';
  end if;
  if p_token is null or p_platform is null then
    raise exception 'genesis_push_register: malformed token, platform or app version' using errcode = '23514';
  end if;
  select * into holder from public.push_devices d where d.token = p_token for update;
  if found and holder.user_id <> me then
    if p_installation_id is null or holder.installation_id is null or holder.installation_id <> p_installation_id then
      raise exception 'genesis_push_register: this token is registered to another sign-in' using errcode = '42501';
    end if;
    delete from public.push_devices d where d.id = holder.id;
    insert into public.push_device_moves (token_hash, from_user_id, to_user_id, installation_id)
    values (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), holder.user_id, me, p_installation_id);
  end if;
  insert into public.push_devices as d (user_id, token, platform, app_version, installation_id)
  values (me, p_token, p_platform, p_app_version, p_installation_id)
  on conflict (token) do update
    set platform = excluded.platform, app_version = excluded.app_version, last_seen_at = now(),
        installation_id = coalesce(excluded.installation_id, d.installation_id)
    where d.user_id = me
  returning d.id into device;
  if device is null then
    raise exception 'genesis_push_register: the token changed hands; try again' using errcode = '40001';
  end if;
  delete from public.push_devices d
  where d.user_id = me
    and d.id not in (
      select k.id from public.push_devices k where k.user_id = me
      order by k.id = device desc, k.last_seen_at desc, k.id limit 10
    );
  return device;
exception
  when check_violation or not_null_violation then
    -- Raised afresh so the error (and the server log) never carries the failing row, token and all.
    raise exception 'genesis_push_register: malformed token, platform or app version' using errcode = '23514';
end;
$$;

-- The three-argument form (0005's, and genesis-native's supabasePushBackend):
-- now without an install id, so it never moves a token another login holds.
create or replace function public.genesis_push_register(p_token text, p_platform text, p_app_version text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.genesis_push_register(p_token, p_platform, p_app_version, null::uuid);
$$;

-- Forgets a token, whoever holds it: holding the token is the proof, so a
-- phone already signed out still stops getting the last person's pushes. It
-- deletes only the row with exactly that token, and answers true whether or
-- not there was one, so it tells a caller nothing about anyone's tokens.
create or replace function public.genesis_push_forget(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is not null and p_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$' then
    delete from public.push_devices d where d.token = p_token;
  end if;
  return true;
end;
$$;

-- Senders, tenant defaults, suppressions -------------------------------------

-- A tenant's email identity. Without a verified domain of its own, mail goes
-- from the app's shared domain with the tenant's name as the from name and
-- its reply-to; with one, from that domain.
create table public.notification_senders (
  tenant_id uuid primary key,
  from_name text
    constraint notification_senders_from_name check (from_name ~ '^[^"<>\r\n]{1,100}$'),
  reply_to text
    constraint notification_senders_reply_to check (reply_to ~ '^[^\s@<>,;:"()\[\]\\]+@[^\s@<>,;:"()\[\]\\]+\.[^\s@<>,;:"()\[\]\\]+$' and char_length(reply_to) <= 254),
  -- The tenant's own sending domain (mail.example.com), used once verified.
  domain text
    constraint notification_senders_domain check (domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  domain_status text not null default 'none'
    constraint notification_senders_domain_status check (domain_status in ('none', 'pending', 'verified', 'failed')),
  -- What the last check found: { spf, dkim, dmarc: boolean }.
  dns jsonb,
  checked_at timestamptz,
  -- The tenant's default brand: { name, logoUrl, color, url }.
  brand jsonb
    constraint notification_senders_brand check (brand is null or (jsonb_typeof(brand) = 'object' and pg_column_size(brand) <= 4096)),
  updated_at timestamptz not null default now()
);

comment on table public.notification_senders is
  'Each tenant''s email identity: from name, reply-to, an own sending domain once verified, and its brand. Genesis notifications.';

-- A tenant's default for one category and channel, before the person chooses.
create table public.notification_tenant_defaults (
  tenant_id uuid not null,
  category text not null
    constraint notification_tenant_defaults_category check (category ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  channel text not null
    constraint notification_tenant_defaults_channel check (channel in ('in_app', 'push', 'email')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, category, channel)
);

comment on table public.notification_tenant_defaults is
  'A tenant''s default for a category and channel; a person''s own choice wins, a critical type ignores both. Genesis notifications.';

-- Addresses not to email, by SHA-256 of the lower-cased address. category '*'
-- is every category: a hard bounce stops all mail, a complaint all but
-- transactional mail; an unsubscribe (of someone with no login) one category.
create table public.notification_suppressions (
  email_hash text not null
    constraint notification_suppressions_hash check (email_hash ~ '^[0-9a-f]{64}$'),
  category text not null default '*'
    constraint notification_suppressions_category check (category = '*' or category ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  reason text not null
    constraint notification_suppressions_reason check (reason in ('bounce', 'complaint', 'unsubscribe', 'manual')),
  -- For the admin list: "s***@example.com".
  email_masked text
    constraint notification_suppressions_masked check (char_length(email_masked) <= 254),
  created_at timestamptz not null default now(),
  primary key (email_hash, category)
);

comment on table public.notification_suppressions is
  'Addresses not to email (bounce, complaint, unsubscribe), by hash only. Platform admins read it. Genesis notifications.';

-- The feed, which is also the outbox --------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null references public.notification_types (key),
  category text not null,
  tenant_id uuid,
  -- A login, or (for someone with none) an email address; never neither.
  user_id uuid references auth.users (id) on delete cascade,
  email text
    constraint notifications_email check (char_length(email) <= 254),
  recipient_name text
    constraint notifications_recipient_name check (char_length(recipient_name) <= 200),
  -- The domain's id for a recipient with no login ("people:42"), so erasing them finds the rows.
  person_ref text
    constraint notifications_person_ref check (char_length(person_ref) <= 200),
  recipient_key text not null generated always as (coalesce(user_id::text, 'email:' || lower(email))) stored,
  idempotency_key text not null
    constraint notifications_idempotency_key check (char_length(idempotency_key) between 1 and 200),
  -- References and display values; never a secret (genesis_notify checks).
  data jsonb not null default '{}'::jsonb
    constraint notifications_data check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  thread_key text
    constraint notifications_thread_key check (char_length(thread_key) <= 200),
  collapse_key text
    constraint notifications_collapse_key check (char_length(collapse_key) <= 200),
  badge integer
    constraint notifications_badge check (badge between 0 and 99999),
  brand jsonb
    constraint notifications_brand check (brand is null or (jsonb_typeof(brand) = 'object' and pg_column_size(brand) <= 4096)),
  -- Whether it shows in the feed (the in_app channel was on for this person).
  in_feed boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  constraint notifications_recipient check (user_id is not null or email is not null),
  constraint notifications_feed_needs_login check (not in_feed or user_id is not null),
  constraint notifications_once unique (recipient_key, idempotency_key)
);
create index notifications_feed on public.notifications (user_id, created_at desc) where in_feed and archived_at is null;
create index notifications_unread on public.notifications (user_id) where in_feed and read_at is null and archived_at is null;
create index notifications_email on public.notifications (lower(email)) where email is not null;
create index notifications_person_ref on public.notifications (person_ref) where person_ref is not null;
create index notifications_collapse on public.notifications (recipient_key, collapse_key) where collapse_key is not null;
create index notifications_created_at on public.notifications (created_at);

comment on table public.notifications is
  'The in-app feed and the outbox: one row per recipient, unique per idempotency key. A person reads only their own. Genesis notifications.';

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  -- Copied from the notification, so an admin's log reads no feed row.
  tenant_id uuid,
  type text not null,
  channel text not null
    constraint notification_deliveries_channel check (channel in ('push', 'email')),
  status text not null default 'pending'
    constraint notification_deliveries_status check (status in ('pending', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'cancelled')),
  attempts integer not null default 0,
  deferrals integer not null default 0,
  send_after timestamptz not null default now(),
  lease_until timestamptz,
  -- The claim this row is leased to; settling with another one is stale.
  claim_id uuid,
  -- Resend's email id, or the push ticket ids live in push_receipts.
  provider_id text
    constraint notification_deliveries_provider_id check (char_length(provider_id) <= 200),
  -- An error code or a short safe reason: never content or an address.
  error text
    constraint notification_deliveries_error check (char_length(error) <= 500),
  skip_reason text
    constraint notification_deliveries_skip_reason check (skip_reason ~ '^[a-z_]{1,64}$'),
  recipient_masked text
    constraint notification_deliveries_recipient_masked check (char_length(recipient_masked) <= 254),
  -- The email as first rendered ({ from, to, reply_to, subject, html, text, headers }), so every
  -- retry sends the same bytes. Cleared by genesis_notifications_prune after a day.
  rendered jsonb,
  rendered_hash text
    constraint notification_deliveries_rendered_hash check (rendered_hash ~ '^[0-9a-f]{64}$'),
  -- A one-time secret for the email (pgp_sym_encrypt with the Vault key), cleared once it settles.
  secret_ciphertext bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_deliveries_once unique (notification_id, channel)
);
create index notification_deliveries_due on public.notification_deliveries (channel, send_after) where status in ('pending', 'sending');
create index notification_deliveries_provider on public.notification_deliveries (provider_id) where provider_id is not null;
create index notification_deliveries_log on public.notification_deliveries (tenant_id, created_at desc);
create index notification_deliveries_created_at on public.notification_deliveries (created_at);

comment on table public.notification_deliveries is
  'One send job per notification and channel: status, attempts, send_after, the provider''s id, an error code. Admins read the log columns. Genesis notifications.';

alter table public.push_receipts
  add column delivery_id uuid references public.notification_deliveries (id) on delete set null;
create index push_receipts_delivery_id on public.push_receipts (delivery_id) where delivery_id is not null;

-- Admins ---------------------------------------------------------------------

-- Who may read a tenant's delivery log and manage its defaults and sender
-- (p_tenant null: the whole app, and the suppression list). False for
-- everyone until the app replaces it in a migration of its own, after this:
--   create or replace function private.genesis_notifications_admin(p_user uuid, p_tenant uuid) returns boolean
--   language sql stable security definer set search_path = '' as $$ … $$;
-- Row level security calls it as the signed-in person, so `authenticated` may
-- execute it (the private schema isn't exposed through the API); never grant
-- it to anon or public.
create function private.genesis_notifications_admin(p_user uuid, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

-- Helpers --------------------------------------------------------------------

create function private.genesis_notifications_email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;

-- "s***@example.com": enough for an admin to recognise, not to harvest.
create function private.genesis_notifications_mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end;
$$;

-- Refuses data with a key named like a secret, or a link that carries one in its query.
create function private.genesis_notifications_assert_no_secrets(p_data jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  bad text;
begin
  with recursive walk(path, value) as (
    select '', p_data
    union all
    select w.path || coalesce('.' || e.key, '[]'), e.value
    from walk w
    cross join lateral (
      select o.key, o.value from pg_catalog.jsonb_each(case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end) o
      union all
      select null, a.value from pg_catalog.jsonb_array_elements(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end) a
    ) e
  )
  -- Each key as words (inviteToken -> invite_token), so camelCase is caught as well as snake_case.
  select substr(w.path, 2) into bad
  from walk w
  where lower(regexp_replace(w.path, '([a-z0-9])([A-Z])', '\1_\2', 'g'))
          ~ '(^|[._-])(token|secret|password|passcode|otp|api_?key|signature|sig|magic_?link|invite_?link|reset_?link|access_?key|client_?secret|auth_?token|access_?token|refresh_?token)$'
     or (jsonb_typeof(w.value) = 'string' and (w.value #>> '{}') ~* '^[a-z][a-z0-9+.-]*://\S*[?&#](token|access_token|signature|sig|code|key|secret|otp)=')
  limit 1;
  if bad is not null then
    raise exception 'genesis_notify: data.% looks like a secret; store a reference and build the link at send time', bad using errcode = '22023';
  end if;
end;
$$;

-- The Vault key that encrypts one-time secrets on send jobs, made once.
do $key$
begin
  if to_regclass('vault.secrets') is not null
     and not exists (select 1 from vault.secrets where name = 'genesis_notifications_job_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'genesis_notifications_job_key',
      'Encrypts one-time secrets on notification send jobs (genesis-notifications). Rotate only with no email pending.');
  end if;
end;
$key$;

create function private.genesis_notifications_job_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'genesis_notifications: Vault is not installed, so a secret can''t travel on a send job' using errcode = '55000';
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into k using 'genesis_notifications_job_key';
  if k is null then
    raise exception 'genesis_notifications: no genesis_notifications_job_key in Vault' using errcode = '55000';
  end if;
  return k;
end;
$$;

-- Ids only, on the person's private channel; best effort (the app also refetches on focus).
create function private.genesis_notifications_broadcast(p_user uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return;
  end if;
  begin
    execute 'select realtime.send($1, $2, $3, true)' using p_payload, p_event, 'user:' || p_user::text;
  exception
    when others then
      null;
  end;
end;
$$;

-- The first instant at which the clock in `p_zone` reads `p_local` or later,
-- coming from the day before: the first of a repeated (fall-back) time, the
-- moment of the change for a skipped (spring-forward) one. (0005's
-- genesis_push_local_instant, so this stands without it.)
create function private.genesis_notifications_local_instant(p_local timestamp, p_zone text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  guess timestamptz := p_local at time zone p_zone;
  t timestamptz;
  found_at timestamptz := null;
begin
  if ((guess - interval '3 hours') at time zone p_zone) - (guess - interval '3 hours') at time zone 'UTC'
     = ((guess + interval '3 hours') at time zone p_zone) - (guess + interval '3 hours') at time zone 'UTC' then
    return guess;
  end if;
  t := guess + interval '1 hour';
  while t > guess - interval '3 hours' loop
    if (t at time zone p_zone) >= p_local and ((t - interval '1 minute') at time zone p_zone) < p_local then
      found_at := t;
    end if;
    t := t - interval '1 minute';
  end loop;
  return coalesce(found_at, guess);
end;
$$;

-- When the person's quiet hours end, if `p_at` is inside them; null otherwise.
-- Each night's window runs from the first moment the local clock reads the
-- start to the first moment after it that it reads the end (past midnight when
-- the start is later). A start equal to the end is no quiet hours; a zone the
-- server no longer knows never silences anyone.
create function private.genesis_notifications_quiet_until(p_user uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences;
  local_now timestamp;
  day date;
  window_start timestamptz;
  window_end timestamptz;
begin
  select * into pref from public.notification_preferences n where n.user_id = p_user;
  if not found or not pref.quiet_hours_enabled or pref.quiet_hours_start = pref.quiet_hours_end then
    return null;
  end if;
  begin
    local_now := p_at at time zone pref.time_zone;
  exception
    when invalid_parameter_value then
      return null;
  end;
  foreach day in array array[local_now::date, local_now::date - 1] loop
    window_start := private.genesis_notifications_local_instant(day + pref.quiet_hours_start, pref.time_zone);
    if window_start <= p_at then
      window_end := private.genesis_notifications_local_instant(
        day + pref.quiet_hours_end + case when pref.quiet_hours_end < pref.quiet_hours_start then interval '1 day' else interval '0' end,
        pref.time_zone
      );
      return case when p_at < window_end then window_end end;
    end if;
  end loop;
  return null;
end;
$$;

-- Is `p_channel` on for this type, person and tenant? A channel the type
-- doesn't offer: no. A critical type, or the email of a transactional one: as
-- the type defaults it. Otherwise the
-- person's choice for the category and channel, then (for push and email) a
-- category the person turned off entirely (0005's `categories`), then the
-- tenant's default, then the type's.
create function private.genesis_notifications_channel_on(p_user uuid, p_tenant uuid, p_type text, p_channel text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.notification_types;
  base boolean;
  chosen boolean;
  pref public.notification_preferences;
begin
  select * into t from public.notification_types where key = p_type;
  if not found then
    return false;
  end if;
  base := (t.channels ->> p_channel)::boolean;
  if base is null then
    return false;
  end if;
  if t.critical then
    return base;
  end if;
  -- Transactional mail skips unsubscribe: no choice or default turns its email off.
  if t.transactional and p_channel = 'email' then
    return base;
  end if;
  if p_user is not null then
    select * into pref from public.notification_preferences n where n.user_id = p_user;
    if found then
      chosen := (pref.channels -> t.category ->> p_channel)::boolean;
      if chosen is not null then
        return chosen;
      end if;
      if p_channel <> 'in_app' and (pref.categories ->> t.category)::boolean is false then
        return false;
      end if;
    end if;
  end if;
  if p_tenant is not null then
    select d.enabled into chosen from public.notification_tenant_defaults d
    where d.tenant_id = p_tenant and d.category = t.category and d.channel = p_channel;
    if chosen is not null then
      return chosen;
    end if;
  end if;
  return base;
end;
$$;

-- notify ---------------------------------------------------------------------

-- What a domain calls (through notify() in TypeScript, or from its own SQL):
-- one notification per recipient, and a send job per channel that is on.
-- p_recipients: [{ "user_id": uuid } | { "email", "name"?, "ref"? }], at most 1000.
-- The same idempotency key again for a recipient finds the first one
-- (created false) and sends nothing more. A login that no longer exists is
-- skipped (no row returned). A collapse key replaces the recipient's older
-- unsent push and email with that key, and archives the older feed row.
create function public.genesis_notify(
  p_type text,
  p_recipients jsonb,
  p_data jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_thread_key text default null,
  p_collapse_key text default null,
  p_badge integer default null,
  p_tenant_id uuid default null,
  p_brand jsonb default null,
  p_secret text default null
)
returns table (notification_id uuid, recipient_key text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.notification_types;
  r jsonb;
  uid uuid;
  addr text;
  n_id uuid;
  n_key text;
  feed boolean;
  push_on boolean;
  email_on boolean;
  cipher bytea;
  data_ jsonb := coalesce(p_data, '{}'::jsonb);
begin
  select * into t from public.notification_types where key = p_type and retired_at is null;
  if not found then
    raise exception 'genesis_notify: unknown or retired type %', p_type using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'genesis_notify: an idempotency key (1 to 200 characters) is required' using errcode = '22023';
  end if;
  if jsonb_typeof(data_) <> 'object' then
    raise exception 'genesis_notify: data must be an object' using errcode = '22023';
  end if;
  perform private.genesis_notifications_assert_no_secrets(data_);
  if p_secret is not null and not t.secret_link then
    raise exception 'genesis_notify: type % carries no secret link', p_type using errcode = '22023';
  end if;
  if p_secret is not null and (t.channels ->> 'email') is null then
    raise exception 'genesis_notify: a secret travels only by email' using errcode = '22023';
  end if;
  if p_secret is not null and jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)) <> 1 then
    -- A one-time secret is one person's: never copied onto anyone else's email.
    raise exception 'genesis_notify: a secret goes to exactly one recipient' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipients) is distinct from 'array' or jsonb_array_length(p_recipients) not between 1 and 1000 then
    raise exception 'genesis_notify: recipients is an array of 1 to 1000' using errcode = '22023';
  end if;
  if p_secret is not null then
    cipher := extensions.pgp_sym_encrypt(p_secret, private.genesis_notifications_job_key());
  end if;

  for r in select value from jsonb_array_elements(p_recipients) loop
    uid := null;
    addr := null;
    if jsonb_typeof(r) = 'string' or r ? 'user_id' then
      begin
        uid := (case when jsonb_typeof(r) = 'string' then r #>> '{}' else r ->> 'user_id' end)::uuid;
      exception
        when invalid_text_representation then
          -- Raised afresh so the error never echoes the input.
          raise exception 'genesis_notify: a recipient is not a user id' using errcode = '22023';
      end;
    elsif r ? 'email' then
      addr := btrim(r ->> 'email');
      if addr !~ '^[^\s@<>,;:"()\[\]\\]+@[^\s@<>,;:"()\[\]\\]+\.[^\s@<>,;:"()\[\]\\]+$' or char_length(addr) > 254 then
        raise exception 'genesis_notify: a recipient has no valid email address' using errcode = '22023';
      end if;
    else
      raise exception 'genesis_notify: a recipient is { user_id } or { email }' using errcode = '22023';
    end if;
    if uid is not null and not exists (select 1 from auth.users u where u.id = uid) then
      continue;
    end if;

    feed := uid is not null and private.genesis_notifications_channel_on(uid, p_tenant_id, p_type, 'in_app');
    push_on := uid is not null and private.genesis_notifications_channel_on(uid, p_tenant_id, p_type, 'push');
    email_on := private.genesis_notifications_channel_on(uid, p_tenant_id, p_type, 'email');

    insert into public.notifications as n (type, category, tenant_id, user_id, email, recipient_name, person_ref, idempotency_key, data, thread_key, collapse_key, badge, brand, in_feed)
    values (p_type, t.category, p_tenant_id, uid, addr, left(r ->> 'name', 200), left(r ->> 'ref', 200), p_idempotency_key, data_, p_thread_key, p_collapse_key, p_badge, p_brand, feed)
    on conflict on constraint notifications_once do nothing
    returning n.id, n.recipient_key into n_id, n_key;

    if n_id is null then
      select n.id, n.recipient_key into n_id, n_key from public.notifications n
      where n.recipient_key = coalesce(uid::text, 'email:' || lower(addr)) and n.idempotency_key = p_idempotency_key;
      notification_id := n_id;
      recipient_key := n_key;
      created := false;
      return next;
      continue;
    end if;

    if p_collapse_key is not null then
      update public.notification_deliveries d
      set status = 'cancelled', skip_reason = 'collapsed', secret_ciphertext = null, updated_at = now()
      from public.notifications o
      where d.notification_id = o.id and o.recipient_key = n_key and o.collapse_key = p_collapse_key and o.id <> n_id
        and d.status = 'pending';
      update public.notifications o
      set archived_at = now()
      where o.recipient_key = n_key and o.collapse_key = p_collapse_key and o.id <> n_id and o.archived_at is null and o.read_at is null;
    end if;

    if push_on then
      insert into public.notification_deliveries (notification_id, tenant_id, type, channel)
      values (n_id, p_tenant_id, p_type, 'push');
    end if;
    if email_on then
      insert into public.notification_deliveries (notification_id, tenant_id, type, channel, send_after, secret_ciphertext, recipient_masked)
      values (
        n_id, p_tenant_id, p_type, 'email',
        -- Delay, then skip if read: only worth it when the person also has it in the app.
        now() + case when feed and not t.transactional then make_interval(secs => t.email_delay_seconds) else interval '0' end,
        cipher,
        private.genesis_notifications_mask_email(coalesce(addr, (select u.email from auth.users u where u.id = uid)))
      );
    end if;
    if feed then
      perform private.genesis_notifications_broadcast(uid, 'notification', jsonb_build_object('id', n_id, 'kind', 'created'));
    end if;

    notification_id := n_id;
    recipient_key := n_key;
    created := true;
    return next;
  end loop;
end;
$$;

-- The runner -----------------------------------------------------------------

-- Hands out up to p_limit due send jobs on one channel, each leased for
-- p_lease_seconds to a new claim id (settle with it). Due: pending and past
-- send_after, or sending with a lease that ran out (`redelivery`). Before
-- handing one out it decides again, at send time:
--   - the person turned the channel off since: skipped (preference);
--   - email, delayed and read in the app meanwhile: skipped (read_in_app);
--   - email to a suppressed address: skipped (suppressed);
--   - push in quiet hours (not transactional): back to pending until they end, no attempt used;
--   - push with no devices: skipped (no_devices).
-- A job whose lease ran out p_max_attempts times (the runner died with it each
-- time) fails as lease_expired instead of coming back for ever. The secret,
-- when there is one, is decrypted for the runner here and nowhere else.
create function public.genesis_notifications_claim(p_channel text, p_limit integer default 25, p_lease_seconds integer default 300, p_max_attempts integer default 8)
returns table (
  id uuid,
  claim_id uuid,
  notification_id uuid,
  channel text,
  attempt integer,
  deferrals integer,
  redelivery boolean,
  type text,
  category text,
  tenant_id uuid,
  user_id uuid,
  email text,
  recipient_name text,
  data jsonb,
  thread_key text,
  collapse_key text,
  badge integer,
  brand jsonb,
  transactional boolean,
  critical boolean,
  push_privacy text,
  ios_category text,
  hide_previews boolean,
  devices jsonb,
  sender jsonb,
  rendered jsonb,
  rendered_hash text,
  secret text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  claim uuid := gen_random_uuid();
  quiet timestamptz;
  addr text;
  devs jsonb;
  key_ text;
begin
  if p_channel not in ('push', 'email') then
    raise exception 'genesis_notifications_claim: channel is push or email' using errcode = '22023';
  end if;
  for d in
    select q.*, n.user_id as n_user, n.email as n_email, n.recipient_name as n_name, n.data as n_data, n.thread_key as n_thread,
           n.collapse_key as n_collapse, n.badge as n_badge, n.brand as n_brand, n.read_at as n_read, n.category as n_category,
           n.in_feed as n_feed, t.transactional as t_transactional, t.critical as t_critical, t.push_privacy as t_privacy, t.ios_category as t_ios,
           t.email_delay_seconds as t_delay
    from public.notification_deliveries q
    join public.notifications n on n.id = q.notification_id
    join public.notification_types t on t.key = q.type
    where q.id in (
      select c.id from public.notification_deliveries c
      where c.channel = p_channel
        and ((c.status = 'pending' and c.send_after <= now()) or (c.status = 'sending' and c.lease_until < now()))
      order by c.send_after
      limit greatest(1, least(coalesce(p_limit, 25), 500))
      for update skip locked
    )
  loop
    if d.status = 'sending' and d.attempts >= greatest(1, coalesce(p_max_attempts, 8)) then
      update public.notification_deliveries x set status = 'failed', error = 'lease_expired', secret_ciphertext = null, lease_until = null, claim_id = null, updated_at = now() where x.id = d.id;
      continue;
    end if;
    -- The person may have changed their mind since it was queued.
    if not private.genesis_notifications_channel_on(d.n_user, d.tenant_id, d.type, p_channel) then
      update public.notification_deliveries x set status = 'skipped', skip_reason = 'preference', secret_ciphertext = null, lease_until = null, updated_at = now() where x.id = d.id;
      continue;
    end if;

    if p_channel = 'email' then
      if d.t_delay > 0 and d.n_feed and not d.t_transactional and d.n_read is not null then
        update public.notification_deliveries x set status = 'skipped', skip_reason = 'read_in_app', secret_ciphertext = null, lease_until = null, updated_at = now() where x.id = d.id;
        continue;
      end if;
      addr := coalesce(d.n_email, (select u.email from auth.users u where u.id = d.n_user));
      if addr is null then
        update public.notification_deliveries x set status = 'skipped', skip_reason = 'no_address', secret_ciphertext = null, lease_until = null, updated_at = now() where x.id = d.id;
        continue;
      end if;
      key_ := private.genesis_notifications_email_hash(addr);
      if exists (
        select 1 from public.notification_suppressions s
        where s.email_hash = key_
          and (s.reason = 'bounce' or (not d.t_transactional and (s.category = '*' or s.category = d.n_category)))
      ) then
        update public.notification_deliveries x set status = 'skipped', skip_reason = 'suppressed', secret_ciphertext = null, lease_until = null, updated_at = now() where x.id = d.id;
        continue;
      end if;
      devs := null;
    else
      addr := null;
      if not d.t_transactional then
        quiet := private.genesis_notifications_quiet_until(d.n_user, now());
        if quiet is not null then
          update public.notification_deliveries x set status = 'pending', send_after = quiet, lease_until = null, updated_at = now() where x.id = d.id;
          continue;
        end if;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'token', v.token, 'platform', v.platform) order by v.last_seen_at desc), '[]'::jsonb)
      into devs
      from public.push_devices v where v.user_id = d.n_user;
      if jsonb_array_length(devs) = 0 then
        update public.notification_deliveries x set status = 'skipped', skip_reason = 'no_devices', lease_until = null, updated_at = now() where x.id = d.id;
        continue;
      end if;
    end if;

    update public.notification_deliveries x
    set status = 'sending', attempts = x.attempts + 1, lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
        claim_id = claim, updated_at = now()
    where x.id = d.id;

    id := d.id;
    claim_id := claim;
    notification_id := d.notification_id;
    channel := p_channel;
    attempt := d.attempts + 1;
    deferrals := d.deferrals;
    redelivery := d.status = 'sending';
    type := d.type;
    category := d.n_category;
    tenant_id := d.tenant_id;
    user_id := d.n_user;
    email := addr;
    recipient_name := d.n_name;
    data := d.n_data;
    thread_key := d.n_thread;
    collapse_key := d.n_collapse;
    badge := d.n_badge;
    transactional := d.t_transactional;
    critical := d.t_critical;
    push_privacy := d.t_privacy;
    ios_category := d.t_ios;
    hide_previews := coalesce((select p.hide_previews from public.notification_preferences p where p.user_id = d.n_user), false);
    devices := devs;
    select case when s.tenant_id is null then null else jsonb_build_object(
             'from_name', s.from_name, 'reply_to', s.reply_to, 'domain', s.domain, 'domain_verified', s.domain_status = 'verified')
           end,
           coalesce(d.n_brand, s.brand)
    into sender, brand
    from (select 1) one left join public.notification_senders s on s.tenant_id = d.tenant_id;
    rendered := d.rendered;
    rendered_hash := d.rendered_hash;
    secret := case when d.secret_ciphertext is not null then extensions.pgp_sym_decrypt(d.secret_ciphertext, private.genesis_notifications_job_key()) end;
    return next;
  end loop;
end;
$$;

-- Keeps the email as first rendered, so every retry sends the same bytes:
-- the first call stores it, later ones get the stored copy back.
create function public.genesis_notifications_store_rendered(p_id uuid, p_claim uuid, p_rendered jsonb, p_hash text)
returns table (rendered jsonb, rendered_hash text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries d
  set rendered = p_rendered, rendered_hash = p_hash, updated_at = now()
  where d.id = p_id and d.claim_id = p_claim and d.status = 'sending' and d.rendered is null;
  return query
  select d.rendered, d.rendered_hash from public.notification_deliveries d where d.id = p_id and d.claim_id = p_claim;
end;
$$;

-- Records what became of a claimed job (the runner's outcome):
-- { "status": "sent" | "skipped" | "filtered" | "failed" | "retry", "error", "reason",
--   "retry_at", "counted", "provider_id" }. False when the claim was no longer held
-- (stale). A settled job's secret is cleared; a retry keeps it for the next try.
create function public.genesis_notifications_settle(p_id uuid, p_claim uuid, p_outcome jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text := p_outcome ->> 'status';
  counted boolean := coalesce((p_outcome ->> 'counted')::boolean, true);
begin
  if st not in ('sent', 'skipped', 'filtered', 'failed', 'retry') then
    raise exception 'genesis_notifications_settle: unknown status' using errcode = '22023';
  end if;
  update public.notification_deliveries d
  set status = case st when 'sent' then 'sent' when 'retry' then 'pending' when 'failed' then 'failed' else 'skipped' end,
      send_after = case when st = 'retry' then coalesce((p_outcome ->> 'retry_at')::timestamptz, now() + interval '5 minutes') else d.send_after end,
      attempts = case when st = 'retry' and not counted then greatest(0, d.attempts - 1) else d.attempts end,
      deferrals = case when st = 'retry' and not counted then d.deferrals + 1 else d.deferrals end,
      error = case when st in ('failed', 'retry') then left(p_outcome ->> 'error', 500) else null end,
      skip_reason = case when st = 'skipped' then coalesce(substring(p_outcome ->> 'reason' from '^[a-z_]{1,64}$'), 'not_sent') when st = 'filtered' then 'filtered' end,
      provider_id = coalesce(left(p_outcome ->> 'provider_id', 200), d.provider_id),
      sent_at = case when st = 'sent' then now() else d.sent_at end,
      secret_ciphertext = case when st = 'retry' then d.secret_ciphertext end,
      lease_until = null,
      claim_id = null,
      updated_at = now()
  where d.id = p_id and d.claim_id = p_claim and d.status = 'sending';
  return found;
end;
$$;

-- Records Expo's tickets for one push job:
-- [{ "device_id", "ticket_id", "status": "sent" | "failed", "error" }]. A device Expo
-- called DeviceNotRegistered is forgotten at once. Returns the receipts kept.
create function public.genesis_notifications_push_tickets(p_delivery uuid, p_tickets jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept integer;
  n public.notifications;
begin
  if jsonb_typeof(p_tickets) is distinct from 'array' or jsonb_array_length(p_tickets) > 100 then
    raise exception 'genesis_notifications_push_tickets: expected an array of at most 100 tickets' using errcode = '22023';
  end if;
  select o.* into n from public.notifications o join public.notification_deliveries d on d.notification_id = o.id where d.id = p_delivery;
  if not found then
    return 0;
  end if;
  insert into public.push_receipts (user_id, device_id, category, ticket_id, status, error, check_after, delivery_id)
  select n.user_id,
         (select v.id from public.push_devices v where v.id = t.device_id),
         n.category,
         t.ticket_id,
         t.status,
         substring(t.error from '^[A-Za-z_]{1,64}$'),
         case when t.status = 'sent' then now() + interval '15 minutes' end,
         p_delivery
  from jsonb_to_recordset(p_tickets) as t (device_id uuid, ticket_id text, status text, error text)
  where t.status in ('sent', 'failed') and (t.status <> 'sent' or t.ticket_id is not null);
  get diagnostics kept = row_count;
  delete from public.push_devices v
  using jsonb_to_recordset(p_tickets) as t (device_id uuid, error text)
  where v.id = t.device_id and t.error = 'DeviceNotRegistered' and v.user_id = n.user_id;
  return kept;
end;
$$;

-- Hands out up to p_limit tickets whose receipts are due (about 15 minutes
-- after sending; Expo keeps them a day), each leased for 30 minutes. Tickets
-- with no receipt after a day become 'unknown'.
create function public.genesis_notifications_receipts_claim(p_limit integer default 1000)
returns table (id bigint, ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_receipts r
  set status = 'unknown', check_after = null, checked_at = now()
  where r.status = 'sent' and r.created_at < now() - interval '1 day';
  return query
  update public.push_receipts r
  set attempts = r.attempts + 1, check_after = now() + interval '30 minutes'
  where r.id in (
    select q.id from public.push_receipts q
    where q.status = 'sent' and q.check_after <= now()
    order by q.check_after
    limit greatest(1, least(coalesce(p_limit, 1000), 1000))
    for update skip locked
  )
  returning r.id, r.ticket_id;
end;
$$;

-- Records receipts: [{ "id", "status": "delivered" | "failed", "error" }]. A
-- DeviceNotRegistered receipt forgets its device (unless registered again since
-- the push); a delivered one marks its job delivered. Returns the receipts settled.
create function public.genesis_notifications_receipts_settle(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  settled integer;
  dead jsonb;
  delivered uuid[];
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 1000 then
    raise exception 'genesis_notifications_receipts_settle: expected an array of at most 1000 results' using errcode = '22023';
  end if;
  with results as (
    select x.id, x.status, x.error
    from jsonb_to_recordset(p_results) as x (id bigint, status text, error text)
    where x.status in ('delivered', 'failed')
  ), updated as (
    update public.push_receipts r
    set status = s.status, error = case when s.status = 'failed' then substring(s.error from '^[A-Za-z_]{1,64}$') end, check_after = null, checked_at = now()
    from results s
    where r.id = s.id and r.status = 'sent'
    returning r.device_id, r.error, r.created_at, r.status, r.delivery_id
  )
  select count(*),
         jsonb_agg(jsonb_build_object('device_id', u.device_id, 'sent_at', u.created_at)) filter (where u.error = 'DeviceNotRegistered' and u.device_id is not null),
         array_agg(distinct u.delivery_id) filter (where u.status = 'delivered' and u.delivery_id is not null)
  into settled, dead, delivered
  from updated u;
  if dead is not null then
    delete from public.push_devices v
    using jsonb_to_recordset(dead) as x (device_id uuid, sent_at timestamptz)
    where v.id = x.device_id and v.last_seen_at <= x.sent_at;
  end if;
  if delivered is not null then
    update public.notification_deliveries d set status = 'delivered', updated_at = now()
    where d.id = any (delivered) and d.status = 'sent';
  end if;
  return settled;
end;
$$;

-- Email events from the provider's webhook (Resend): 'delivered', 'bounced'
-- (p_permanent: a hard bounce suppresses the address for all mail),
-- 'complained' (suppresses all but transactional mail). Returns whether the
-- email was one of ours.
create function public.genesis_notifications_email_event(p_provider_id text, p_event text, p_permanent boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.notification_deliveries;
  addr text;
begin
  select * into d from public.notification_deliveries x where x.provider_id = p_provider_id and x.channel = 'email' limit 1;
  if not found then
    return false;
  end if;
  select coalesce(n.email, (select u.email from auth.users u where u.id = n.user_id)) into addr
  from public.notifications n where n.id = d.notification_id;
  if p_event = 'delivered' then
    update public.notification_deliveries x set status = 'delivered', updated_at = now() where x.id = d.id and x.status = 'sent';
  elsif p_event = 'bounced' then
    update public.notification_deliveries x set status = 'failed', error = case when p_permanent then 'bounced' else 'bounced_transient' end, updated_at = now()
    where x.id = d.id and x.status in ('sent', 'delivered');
    if p_permanent and addr is not null then
      insert into public.notification_suppressions (email_hash, category, reason, email_masked)
      values (private.genesis_notifications_email_hash(addr), '*', 'bounce', private.genesis_notifications_mask_email(addr))
      on conflict (email_hash, category) do update set reason = 'bounce';
    end if;
  elsif p_event = 'complained' then
    if addr is not null then
      insert into public.notification_suppressions (email_hash, category, reason, email_masked)
      values (private.genesis_notifications_email_hash(addr), '*', 'complaint', private.genesis_notifications_mask_email(addr))
      on conflict (email_hash, category) do nothing;
    end if;
  else
    raise exception 'genesis_notifications_email_event: unknown event' using errcode = '22023';
  end if;
  return true;
end;
$$;

-- One-click unsubscribe (the signed link's endpoint): a person with a login
-- turns the category's email off in their preferences (they can turn it back
-- on); someone with none is suppressed for the category.
create function public.genesis_notifications_unsubscribe(p_user_id uuid, p_email text, p_category text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_category !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'genesis_notifications_unsubscribe: malformed category' using errcode = '22023';
  end if;
  if p_user_id is not null then
    if not exists (select 1 from auth.users u where u.id = p_user_id) then
      return false;
    end if;
    insert into public.notification_preferences as p (user_id, channels)
    values (p_user_id, jsonb_build_object(p_category, jsonb_build_object('email', false)))
    on conflict (user_id) do update
      set channels = jsonb_set(p.channels, array[p_category], coalesce(p.channels -> p_category, '{}'::jsonb) || '{"email": false}'::jsonb);
    return true;
  end if;
  if p_email is null then
    return false;
  end if;
  insert into public.notification_suppressions (email_hash, category, reason, email_masked)
  values (private.genesis_notifications_email_hash(p_email), p_category, 'unsubscribe', private.genesis_notifications_mask_email(p_email))
  on conflict (email_hash, category) do nothing;
  return true;
end;
$$;

-- Erases a person: their notifications (and with them every send job), and
-- for a login also their devices, receipts, preferences and device moves.
-- Pass what you know: the login, the address (someone with no login), the
-- domain's ref. Suppressions stay: they hold a hash only, and keep a bounced
-- address from being mailed again. Returns the notifications deleted.
create function public.genesis_notifications_erase(p_user_id uuid default null, p_email text default null, p_person_ref text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  if p_user_id is null and p_email is null and p_person_ref is null then
    raise exception 'genesis_notifications_erase: say whom' using errcode = '22023';
  end if;
  delete from public.notifications n
  where (p_user_id is not null and n.user_id = p_user_id)
     or (p_email is not null and lower(n.email) = lower(btrim(p_email)))
     or (p_person_ref is not null and n.person_ref = p_person_ref);
  get diagnostics gone = row_count;
  if p_user_id is not null then
    delete from public.push_devices v where v.user_id = p_user_id;
    delete from public.push_receipts r where r.user_id = p_user_id;
    delete from public.notification_preferences p where p.user_id = p_user_id;
    delete from public.push_device_moves m where m.from_user_id = p_user_id or m.to_user_id = p_user_id;
  end if;
  return gone;
end;
$$;

-- Keeps the delivery log short: send jobs settled more than p_keep ago are
-- deleted (default 30 days), the rendered email of a settled job after
-- p_keep_rendered (default a day), receipts, device moves and notifications
-- that were never in a feed (email-only recipients) after p_keep, and, when
-- p_keep_feed is given, feed rows older than that. Schedule it daily.
create function public.genesis_notifications_prune(
  p_keep interval default interval '30 days',
  p_keep_rendered interval default interval '1 day',
  p_keep_feed interval default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  jobs integer;
  bodies integer;
  feed integer := 0;
begin
  if p_keep < interval '1 hour' or p_keep_rendered < interval '0' then
    raise exception 'genesis_notifications_prune: keep at least an hour' using errcode = '22023';
  end if;
  update public.notification_deliveries d set rendered = null, updated_at = now()
  where d.rendered is not null and d.status not in ('pending', 'sending') and d.updated_at < now() - p_keep_rendered;
  get diagnostics bodies = row_count;
  delete from public.notification_deliveries d
  where d.status not in ('pending', 'sending') and d.updated_at < now() - p_keep;
  get diagnostics jobs = row_count;
  delete from public.push_receipts r where r.created_at < now() - p_keep;
  delete from public.push_device_moves m where m.moved_at < now() - p_keep;
  -- Rows that were never in a feed (email-only recipients, or the in-app channel off) are only
  -- the send log's: they go with it, address and all.
  delete from public.notifications n
  where not n.in_feed and n.created_at < now() - p_keep
    and not exists (select 1 from public.notification_deliveries d where d.notification_id = n.id);
  if p_keep_feed is not null then
    delete from public.notifications n
    where n.created_at < now() - p_keep_feed
      and not exists (select 1 from public.notification_deliveries d where d.notification_id = n.id and d.status in ('pending', 'sending'));
    get diagnostics feed = row_count;
  end if;
  return jsonb_build_object('deliveries', jobs, 'rendered', bodies, 'feed', feed);
end;
$$;

-- Mirrors the code's types: [{ key, category, channels, critical, transactional,
-- email_delay_seconds, secret_link, push_privacy, ios_category }]. Types no
-- longer in the list are retired (never deleted: the feed still names them);
-- one that comes back is un-retired. Returns the rows written.
create function public.genesis_notifications_sync_types(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'genesis_notifications_sync_types: expected an array' using errcode = '22023';
  end if;
  insert into public.notification_types as t (key, category, channels, critical, transactional, email_delay_seconds, secret_link, push_privacy, ios_category, retired_at, updated_at)
  select x.key, x.category, x.channels, coalesce(x.critical, false), coalesce(x.transactional, false), coalesce(x.email_delay_seconds, 0),
         coalesce(x.secret_link, false), coalesce(x.push_privacy, 'default'), x.ios_category, null, now()
  from jsonb_to_recordset(p_rows) as x (key text, category text, channels jsonb, critical boolean, transactional boolean, email_delay_seconds integer, secret_link boolean, push_privacy text, ios_category text)
  on conflict (key) do update
    set category = excluded.category, channels = excluded.channels, critical = excluded.critical, transactional = excluded.transactional,
        email_delay_seconds = excluded.email_delay_seconds, secret_link = excluded.secret_link, push_privacy = excluded.push_privacy,
        ios_category = excluded.ios_category, retired_at = null, updated_at = now();
  get diagnostics written = row_count;
  update public.notification_types t set retired_at = now(), updated_at = now()
  where t.retired_at is null and t.key <> 'genesis.test'
    and t.key not in (select x.key from jsonb_to_recordset(p_rows) as x (key text));
  return written;
end;
$$;

-- Sets the outcome of a sender domain check (the server runs it: SPF, DKIM, DMARC).
create function public.genesis_notifications_set_sender_dns(p_tenant uuid, p_status text, p_dns jsonb)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.notification_senders s
  set domain_status = p_status, dns = p_dns, checked_at = now(), updated_at = now()
  where s.tenant_id = p_tenant
  returning true;
$$;

-- The person's own --------------------------------------------------------

-- Marks the caller's own notifications: 'seen', 'read', 'unread', 'archived'
-- or 'unarchived'. Returns how many changed.
create function public.genesis_notifications_mark(p_ids uuid[], p_state text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  changed integer;
begin
  if me is null then
    raise exception 'genesis_notifications_mark: sign in first' using errcode = '42501';
  end if;
  if p_state not in ('seen', 'read', 'unread', 'archived', 'unarchived') then
    raise exception 'genesis_notifications_mark: unknown state' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'genesis_notifications_mark: at most 500 at a time' using errcode = '22023';
  end if;
  update public.notifications n
  set seen_at = case when p_state in ('seen', 'read') then coalesce(n.seen_at, now()) else n.seen_at end,
      read_at = case when p_state = 'read' then coalesce(n.read_at, now()) when p_state = 'unread' then null else n.read_at end,
      archived_at = case when p_state = 'archived' then coalesce(n.archived_at, now()) when p_state = 'unarchived' then null else n.archived_at end
  where n.id = any (p_ids) and n.user_id = me and n.in_feed;
  get diagnostics changed = row_count;
  if changed > 0 then
    perform private.genesis_notifications_broadcast(me, 'notification', jsonb_build_object('kind', p_state));
  end if;
  return changed;
end;
$$;

-- Marks all the caller's feed 'seen' or 'read'. Returns how many changed.
create function public.genesis_notifications_mark_all(p_state text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  changed integer;
begin
  if me is null then
    raise exception 'genesis_notifications_mark_all: sign in first' using errcode = '42501';
  end if;
  if p_state not in ('seen', 'read') then
    raise exception 'genesis_notifications_mark_all: seen or read' using errcode = '22023';
  end if;
  update public.notifications n
  set seen_at = coalesce(n.seen_at, now()),
      read_at = case when p_state = 'read' then coalesce(n.read_at, now()) else n.read_at end
  where n.user_id = me and n.in_feed and n.archived_at is null
    and (n.seen_at is null or (p_state = 'read' and n.read_at is null));
  get diagnostics changed = row_count;
  if changed > 0 then
    perform private.genesis_notifications_broadcast(me, 'notification', jsonb_build_object('kind', p_state));
  end if;
  return changed;
end;
$$;

-- Sets (or with p_on null, clears back to the default) the caller's choice for
-- one category and channel, merged into their row so no other choice changes.
-- A category whose types are all critical can't be turned off.
create function public.genesis_notifications_set_preference(p_category text, p_channel text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result jsonb;
begin
  if me is null then
    raise exception 'genesis_notifications_set_preference: sign in first' using errcode = '42501';
  end if;
  if p_channel not in ('in_app', 'push', 'email') then
    raise exception 'genesis_notifications_set_preference: unknown channel' using errcode = '22023';
  end if;
  if not exists (select 1 from public.notification_types t where t.category = p_category and t.retired_at is null and t.channels ? p_channel) then
    raise exception 'genesis_notifications_set_preference: no type in that category uses that channel' using errcode = '22023';
  end if;
  if p_on is false and not exists (
    select 1 from public.notification_types t where t.category = p_category and t.retired_at is null and t.channels ? p_channel and not t.critical
  ) then
    raise exception 'genesis_notifications_set_preference: that category can''t be turned off' using errcode = '22023';
  end if;
  -- 0005's switch for the whole category (push and email), if the person had one, becomes
  -- explicit channel choices first, so this change doesn't bring back what they turned off.
  update public.notification_preferences p
  set channels = jsonb_set(
        p.channels, array[p_category],
        jsonb_strip_nulls(jsonb_build_object('push', (p.categories ->> p_category)::boolean, 'email', (p.categories ->> p_category)::boolean))
          || coalesce(p.channels -> p_category, '{}'::jsonb)),
      categories = p.categories - p_category
  where p.user_id = me and p.categories ? p_category;
  insert into public.notification_preferences as p (user_id, channels)
  values (me, case when p_on is null then '{}'::jsonb else jsonb_build_object(p_category, jsonb_build_object(p_channel, p_on)) end)
  on conflict (user_id) do update
    set channels = case
      when p_on is null then
        case when (p.channels -> p_category) - p_channel = '{}'::jsonb then p.channels - p_category
             else jsonb_set(p.channels, array[p_category], (p.channels -> p_category) - p_channel) end
      else jsonb_set(p.channels, array[p_category], coalesce(p.channels -> p_category, '{}'::jsonb) || jsonb_build_object(p_channel, p_on))
    end
  returning p.channels into result;
  return result;
end;
$$;

-- Cancels what hasn't gone out for an idempotency key (a release rolled
-- back, an event undone): every pending send job of the notifications made
-- with it, for all recipients or only those in p_recipients (the same shape
-- as genesis_notify's). A job already sent, or being sent right now, is left
-- alone. With p_archive, the feed rows are archived too. The runner never
-- claims a cancelled job. Returns how many jobs and feed rows changed.
create function public.genesis_notifications_cancel(p_idempotency_key text, p_recipients jsonb default null, p_archive boolean default false)
returns table (cancelled integer, archived integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  keys text[];
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'genesis_notifications_cancel: an idempotency key (1 to 200 characters) is required' using errcode = '22023';
  end if;
  if p_recipients is not null then
    if jsonb_typeof(p_recipients) <> 'array' or jsonb_array_length(p_recipients) > 1000 then
      raise exception 'genesis_notifications_cancel: recipients is an array of at most 1000' using errcode = '22023';
    end if;
    begin
      select array_agg(case
               when jsonb_typeof(r) = 'string' then ((r #>> '{}')::uuid)::text
               when r ? 'user_id' then ((r ->> 'user_id')::uuid)::text
               when r ? 'email' then 'email:' || lower(btrim(r ->> 'email'))
             end)
      into keys
      from jsonb_array_elements(p_recipients) r;
    exception
      when invalid_text_representation then
        raise exception 'genesis_notifications_cancel: a recipient is not a user id' using errcode = '22023';
    end;
  end if;

  update public.notification_deliveries d
  set status = 'cancelled', skip_reason = 'cancelled', secret_ciphertext = null, lease_until = null, updated_at = now()
  from public.notifications n
  where d.notification_id = n.id
    and n.idempotency_key = p_idempotency_key
    and (keys is null or n.recipient_key = any (keys))
    and d.status = 'pending';
  get diagnostics cancelled = row_count;

  archived := 0;
  if coalesce(p_archive, false) then
    update public.notifications n
    set archived_at = now()
    where n.idempotency_key = p_idempotency_key
      and (keys is null or n.recipient_key = any (keys))
      and n.archived_at is null;
    get diagnostics archived = row_count;
  end if;
  return next;
end;
$$;

-- Admins (private.genesis_notifications_admin decides) -------------------------

-- A tenant's default for a category and channel (p_enabled null removes it).
create function public.genesis_notifications_set_tenant_default(p_tenant uuid, p_category text, p_channel text, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.genesis_notifications_admin((select auth.uid()), p_tenant) or p_tenant is null then
    raise exception 'genesis_notifications_set_tenant_default: not allowed' using errcode = '42501';
  end if;
  if p_enabled is null then
    delete from public.notification_tenant_defaults d where d.tenant_id = p_tenant and d.category = p_category and d.channel = p_channel;
  else
    insert into public.notification_tenant_defaults as d (tenant_id, category, channel, enabled)
    values (p_tenant, p_category, p_channel, p_enabled)
    on conflict (tenant_id, category, channel) do update set enabled = excluded.enabled, updated_at = now();
  end if;
  return true;
end;
$$;

-- A tenant's email identity. Changing the domain makes it 'pending' until checked.
create function public.genesis_notifications_set_sender(p_tenant uuid, p_from_name text, p_reply_to text, p_domain text default null, p_brand jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tenant is null or not private.genesis_notifications_admin((select auth.uid()), p_tenant) then
    raise exception 'genesis_notifications_set_sender: not allowed' using errcode = '42501';
  end if;
  insert into public.notification_senders as s (tenant_id, from_name, reply_to, domain, domain_status, brand)
  values (p_tenant, p_from_name, p_reply_to, lower(p_domain), case when p_domain is null then 'none' else 'pending' end, p_brand)
  on conflict (tenant_id) do update
    set from_name = excluded.from_name, reply_to = excluded.reply_to, brand = excluded.brand,
        domain = excluded.domain,
        domain_status = case when excluded.domain is not distinct from s.domain then s.domain_status when excluded.domain is null then 'none' else 'pending' end,
        dns = case when excluded.domain is not distinct from s.domain then s.dns end,
        updated_at = now();
  return true;
end;
$$;

-- Admin -> Send a test: a 'genesis.test' notification to the admin themselves,
-- on every channel they have (transactional, so quiet hours don't hold it).
create function public.genesis_notifications_send_test(p_tenant uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  made uuid;
begin
  if me is null or not private.genesis_notifications_admin(me, p_tenant) then
    raise exception 'genesis_notifications_send_test: not allowed' using errcode = '42501';
  end if;
  select g.notification_id into made
  from public.genesis_notify('genesis.test', jsonb_build_array(jsonb_build_object('user_id', me)), jsonb_build_object('sent_at', now()),
                             'genesis.test:' || gen_random_uuid()::text, null, null, null, p_tenant, null, null) g;
  return made;
end;
$$;

-- Lifts a suppression (an address fixed, a complaint withdrawn). Platform admins only.
create function public.genesis_notifications_remove_suppression(p_email_hash text, p_category text default '*')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.genesis_notifications_admin((select auth.uid()), null) then
    raise exception 'genesis_notifications_remove_suppression: not allowed' using errcode = '42501';
  end if;
  delete from public.notification_suppressions s where s.email_hash = p_email_hash and s.category = p_category;
  return found;
end;
$$;

-- Row level security ---------------------------------------------------------

alter table public.notifications enable row level security;
create policy notifications_owner_read on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and in_feed);
revoke all on table public.notifications from public, anon, authenticated;
grant select (id, type, category, tenant_id, data, thread_key, created_at, seen_at, read_at, archived_at, in_feed, user_id)
  on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

alter table public.notification_deliveries enable row level security;
create policy notification_deliveries_admin_read on public.notification_deliveries
  for select to authenticated
  using (private.genesis_notifications_admin((select auth.uid()), tenant_id) or private.genesis_notifications_admin((select auth.uid()), null));
revoke all on table public.notification_deliveries from public, anon, authenticated;
-- The log columns only: never the rendered email or the secret.
grant select (id, notification_id, tenant_id, type, channel, status, attempts, deferrals, send_after, provider_id, error, skip_reason, recipient_masked, created_at, updated_at, sent_at)
  on table public.notification_deliveries to authenticated;
grant select, insert, update, delete on table public.notification_deliveries to service_role;

alter table public.notification_senders enable row level security;
create policy notification_senders_admin_read on public.notification_senders
  for select to authenticated
  using (private.genesis_notifications_admin((select auth.uid()), tenant_id));
revoke all on table public.notification_senders from public, anon, authenticated;
grant select on table public.notification_senders to authenticated;
grant select, insert, update, delete on table public.notification_senders to service_role;

alter table public.notification_tenant_defaults enable row level security;
create policy notification_tenant_defaults_admin_read on public.notification_tenant_defaults
  for select to authenticated
  using (private.genesis_notifications_admin((select auth.uid()), tenant_id));
revoke all on table public.notification_tenant_defaults from public, anon, authenticated;
grant select on table public.notification_tenant_defaults to authenticated;
grant select, insert, update, delete on table public.notification_tenant_defaults to service_role;

alter table public.notification_suppressions enable row level security;
create policy notification_suppressions_admin_read on public.notification_suppressions
  for select to authenticated
  using (private.genesis_notifications_admin((select auth.uid()), null));
revoke all on table public.notification_suppressions from public, anon, authenticated;
grant select on table public.notification_suppressions to authenticated;
grant select, insert, update, delete on table public.notification_suppressions to service_role;

-- Only the person themself may listen on their private channel.
do $rt$
begin
  if to_regclass('realtime.messages') is not null
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'genesis_notifications_own_channel') then
    execute $p$
      create policy genesis_notifications_own_channel on realtime.messages
        for select to authenticated
        using (realtime.topic() = 'user:' || (select auth.uid())::text and extension = 'broadcast')
    $p$;
  end if;
end;
$rt$;

-- Privileges by name ---------------------------------------------------------

revoke execute on function private.genesis_notifications_channels_check() from public, anon, authenticated;
revoke execute on function private.genesis_notifications_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_email_hash(text) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_mask_email(text) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_assert_no_secrets(jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_job_key() from public, anon, authenticated;
revoke execute on function private.genesis_notifications_broadcast(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_local_instant(timestamp, text) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_quiet_until(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.genesis_notifications_channel_on(uuid, uuid, text, text) from public, anon, authenticated;

revoke execute on function public.genesis_push_register(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.genesis_push_register(text, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_push_forget(text) from public, anon, authenticated;
revoke execute on function public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_claim(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_store_rendered(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_settle(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_push_tickets(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_receipts_claim(integer) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_receipts_settle(jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_email_event(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_unsubscribe(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_erase(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_cancel(text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_prune(interval, interval, interval) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_sync_types(jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_set_sender_dns(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_mark(uuid[], text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_mark_all(text) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_set_preference(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_set_tenant_default(uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_set_sender(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_send_test(uuid) from public, anon, authenticated;
revoke execute on function public.genesis_notifications_remove_suppression(text, text) from public, anon, authenticated;

grant execute on function private.genesis_notifications_admin(uuid, uuid) to authenticated;
grant execute on function public.genesis_push_register(text, text, text, uuid) to authenticated;
grant execute on function public.genesis_push_register(text, text, text) to authenticated;
grant execute on function public.genesis_push_forget(text) to anon, authenticated;
grant execute on function public.genesis_notifications_mark(uuid[], text) to authenticated;
grant execute on function public.genesis_notifications_mark_all(text) to authenticated;
grant execute on function public.genesis_notifications_set_preference(text, text, boolean) to authenticated;
grant execute on function public.genesis_notifications_set_tenant_default(uuid, text, text, boolean) to authenticated;
grant execute on function public.genesis_notifications_set_sender(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.genesis_notifications_send_test(uuid) to authenticated;
grant execute on function public.genesis_notifications_remove_suppression(text, text) to authenticated;

grant execute on function public.genesis_notify(text, jsonb, jsonb, text, text, text, integer, uuid, jsonb, text) to service_role;
grant execute on function public.genesis_notifications_claim(text, integer, integer, integer) to service_role;
grant execute on function public.genesis_notifications_store_rendered(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.genesis_notifications_settle(uuid, uuid, jsonb) to service_role;
grant execute on function public.genesis_notifications_push_tickets(uuid, jsonb) to service_role;
grant execute on function public.genesis_notifications_receipts_claim(integer) to service_role;
grant execute on function public.genesis_notifications_receipts_settle(jsonb) to service_role;
grant execute on function public.genesis_notifications_email_event(text, text, boolean) to service_role;
grant execute on function public.genesis_notifications_unsubscribe(uuid, text, text) to service_role;
grant execute on function public.genesis_notifications_erase(uuid, text, text) to service_role;
grant execute on function public.genesis_notifications_cancel(text, jsonb, boolean) to service_role;
grant execute on function public.genesis_notifications_prune(interval, interval, interval) to service_role;
grant execute on function public.genesis_notifications_sync_types(jsonb) to service_role;
grant execute on function public.genesis_notifications_set_sender_dns(uuid, text, jsonb) to service_role;
