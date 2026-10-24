-- Genesis push: the devices a person gets pushes on, their notification
-- preferences, the receipts of what was sent, and who a push may go to now.
--
-- The client half is `@marktiderman/genesis-native/push` (it registers this
-- device's Expo push token and edits the preferences); the sender is the
-- `genesis-push-send` Edge Function shipped beside this file in
-- @marktiderman/genesis-supabase.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name. Never edit it once applied; change it with a new
-- migration. It stands alone (it needs none of 0001 to 0004).
--
-- Tables (all in `public`, row level security on):
--   push_devices              one row per device token: whose it is, the
--                             platform, the app version, when it was last seen.
--                             The owner reads and deletes their own rows; rows
--                             are written only through genesis_push_register.
--   notification_preferences  one row per person: categories turned off or on,
--                             quiet hours (start, end, IANA time zone) and
--                             hide_previews. The owner reads and writes their
--                             own row; absent means the defaults.
--   push_receipts             one row per message handed to Expo: category,
--                             Expo's ticket id and status, never the content.
--                             The owner reads their own; the sender writes.
--
-- Who can do what (granted and revoked by name, never in bulk):
--   authenticated  genesis_push_register (its own token)
--   anon,          genesis_push_forget(token): holding the token is the proof,
--   authenticated  so a phone whose session has already ended (signed out,
--                  expired) still stops getting that person's pushes.
--   service_role   genesis_push_status / genesis_push_targets (who to push to
--                  now), genesis_push_tickets_record, genesis_push_receipts_claim,
--                  genesis_push_receipts_settle, genesis_push_devices_forget.
--
-- An Expo push token is a credential: with it (and no Expo access token
-- required on the project) anyone can push to that phone. Nothing here hands
-- one to anyone but its owner and the service role; turn on "Enhanced Security
-- for Push Notifications" in your Expo project and give the sender
-- EXPO_ACCESS_TOKEN as well.
--
-- Quiet hours are read in the person's time zone, may run past midnight
-- (22:00 to 07:00), and end at `quiet_hours_end` local time even across a
-- daylight-saving change. A start equal to the end means no quiet hours (not
-- all day). A zone that later vanishes from the server's tz database turns
-- quiet hours off rather than silencing the person.
--
-- Deleting a login (any way) deletes its devices, preferences and receipts
-- (foreign keys with on delete cascade).
--
-- Verify: the pgTAP test beside this file (`tests/0005_genesis_push.test.sql`).

create schema if not exists private;

-- Devices -------------------------------------------------------------------

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
  'Expo push tokens of each login''s devices. The owner reads and deletes their own; written through genesis_push_register. Genesis push block.';

alter table public.push_devices enable row level security;

create policy push_devices_owner_read on public.push_devices
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_devices_owner_delete on public.push_devices
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.push_devices from public, anon, authenticated;
grant select, delete on table public.push_devices to authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

-- Preferences ---------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Category id -> on (true) or off (false). A category not listed has the
  -- default the sender names (`p_default_on`), so a new category needs no row.
  categories jsonb not null default '{}'::jsonb
    constraint notification_preferences_categories_shape check (
      jsonb_typeof(categories) = 'object'
      and not jsonb_path_exists(categories, '$.* ? (@.type() != "boolean")')
      and pg_column_size(categories) <= 8192
    ),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  -- IANA name ("Europe/London"), checked against the server's tz database on write.
  time_zone text
    constraint notification_preferences_time_zone_length check (char_length(time_zone) between 1 and 64),
  -- Hide what a push says (title and body) on the lock screen and in Notification
  -- Center: the sender replaces it with neutral text, so the words never leave the server.
  hide_previews boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_quiet_hours_zone check (not quiet_hours_enabled or time_zone is not null)
);

comment on table public.notification_preferences is
  'Per-person notification categories, quiet hours and lock-screen privacy. The owner reads and writes their own row. Genesis push block.';

-- Rejects an unknown time zone or a malformed category id, and stamps updated_at.
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
$$;

create trigger genesis_notification_preferences_check
  before insert or update on public.notification_preferences
  for each row execute function private.genesis_notification_preferences_check();

alter table public.notification_preferences enable row level security;

create policy notification_preferences_owner_read on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_owner_insert on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_preferences_owner_update on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notification_preferences_owner_delete on public.notification_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.notification_preferences to service_role;

-- Receipts ------------------------------------------------------------------

create table public.push_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.push_devices (id) on delete set null,
  category text not null
    constraint push_receipts_category_format check (category ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  -- Expo's ticket id, polled for its receipt.
  ticket_id text
    constraint push_receipts_ticket_id_length check (char_length(ticket_id) <= 128),
  -- sent: Expo took it; delivered: Expo handed it to Apple or Google;
  -- failed: refused (error says why); unknown: no receipt within a day.
  status text not null
    constraint push_receipts_status check (status in ('sent', 'delivered', 'failed', 'unknown')),
  -- An Expo error code ("DeviceNotRegistered"), never a message or content.
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
  'What was handed to Expo''s push service and what became of it (no content). The owner reads their own; written by genesis-push-send. Kept 30 days. Genesis push block.';

alter table public.push_receipts enable row level security;

create policy push_receipts_owner_read on public.push_receipts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.push_receipts from public, anon, authenticated;
grant select on table public.push_receipts to authenticated;
grant select, insert, update, delete on table public.push_receipts to service_role;

-- Client functions ----------------------------------------------------------

-- Keeps this device's token against the caller and returns its device id. A
-- token another login held (the phone changed hands, or someone else signed in
-- on it) moves to the caller, leaving the last login's receipts behind. The
-- caller's ten most recently seen devices are kept; older ones are phones long gone.
create function public.genesis_push_register(p_token text, p_platform text, p_app_version text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  device uuid;
begin
  if me is null then
    raise exception 'genesis_push_register: sign in first' using errcode = '42501';
  end if;
  delete from public.push_devices where token = p_token and user_id <> me;
  insert into public.push_devices as d (user_id, token, platform, app_version)
  values (me, p_token, p_platform, p_app_version)
  on conflict (token) do update
    set platform = excluded.platform, app_version = excluded.app_version, last_seen_at = now()
  returning d.id into device;
  delete from public.push_devices d
  where d.user_id = me
    and d.id not in (
      select k.id from public.push_devices k where k.user_id = me
      order by k.id = device desc, k.last_seen_at desc, k.id limit 10
    );
  return device;
exception
  when check_violation then
    -- Raised afresh so the error (and the server log) never carries the failing row, token and all.
    raise exception 'genesis_push_register: malformed token, platform or app version' using errcode = '23514';
end;
$$;

-- Forgets a token, whoever holds it. Returns true when there was one.
create function public.genesis_push_forget(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_devices where token = p_token;
  return found;
end;
$$;

-- Server functions ----------------------------------------------------------

-- May `p_category` reach `p_user_id` at `p_at`? `deliver` is false with a
-- `reason` ('category_off' or 'quiet_hours'; 'quiet_hours' says until when);
-- `hide_previews` tells the sender to replace what the push says.
create function public.genesis_push_status(
  p_user_id uuid,
  p_category text,
  p_default_on boolean default true,
  p_bypass_quiet_hours boolean default false,
  p_at timestamptz default now()
)
returns table (deliver boolean, reason text, quiet_until timestamptz, hide_previews boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences;
  local_now timestamp;
  local_end timestamp;
  quiet boolean := false;
begin
  if p_category is null or p_category !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'genesis_push_status: malformed category' using errcode = '22023';
  end if;
  select * into pref from public.notification_preferences n where n.user_id = p_user_id;
  hide_previews := coalesce(pref.hide_previews, false);
  quiet_until := null;

  if not coalesce((pref.categories ->> p_category)::boolean, coalesce(p_default_on, true)) then
    deliver := false;
    reason := 'category_off';
    return next;
    return;
  end if;

  if pref.quiet_hours_enabled and not coalesce(p_bypass_quiet_hours, false) and pref.quiet_hours_start <> pref.quiet_hours_end then
    begin
      local_now := coalesce(p_at, now()) at time zone pref.time_zone;
    exception
      when invalid_parameter_value then
        local_now := null;
    end;
    if local_now is not null then
      if pref.quiet_hours_start < pref.quiet_hours_end then
        quiet := local_now::time >= pref.quiet_hours_start and local_now::time < pref.quiet_hours_end;
      else
        quiet := local_now::time >= pref.quiet_hours_start or local_now::time < pref.quiet_hours_end;
      end if;
      if quiet then
        local_end := local_now::date + pref.quiet_hours_end;
        if local_end <= local_now then
          local_end := local_end + interval '1 day';
        end if;
        quiet_until := local_end at time zone pref.time_zone;
      end if;
    end if;
  end if;

  deliver := not quiet;
  reason := case when quiet then 'quiet_hours' else 'ok' end;
  return next;
end;
$$;

-- The devices to push `p_category` to now: none when the person turned the
-- category off or is in quiet hours. Each row says whether to hide the preview.
create function public.genesis_push_targets(
  p_user_id uuid,
  p_category text,
  p_default_on boolean default true,
  p_bypass_quiet_hours boolean default false,
  p_at timestamptz default now()
)
returns table (device_id uuid, token text, platform text, hide_previews boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.token, d.platform, s.hide_previews
  from public.genesis_push_status(p_user_id, p_category, p_default_on, p_bypass_quiet_hours, p_at) s
  join public.push_devices d on d.user_id = p_user_id
  where s.deliver
  order by d.last_seen_at desc, d.id;
$$;

-- Records what Expo answered for each message sent:
-- [{ "user_id", "device_id", "category", "ticket_id", "status": "sent" | "failed", "error" }].
-- A login or device deleted meanwhile is skipped or left null. Returns the rows kept.
create function public.genesis_push_tickets_record(p_tickets jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept integer;
begin
  if jsonb_typeof(p_tickets) is distinct from 'array' or jsonb_array_length(p_tickets) > 1000 then
    raise exception 'genesis_push_tickets_record: expected an array of at most 1000 tickets' using errcode = '22023';
  end if;
  insert into public.push_receipts (user_id, device_id, category, ticket_id, status, error, check_after)
  select t.user_id,
         (select d.id from public.push_devices d where d.id = t.device_id),
         t.category,
         t.ticket_id,
         t.status,
         t.error,
         case when t.status = 'sent' then now() + interval '15 minutes' end
  from jsonb_to_recordset(p_tickets) as t (user_id uuid, device_id uuid, category text, ticket_id text, status text, error text)
  where t.status in ('sent', 'failed')
    and exists (select 1 from auth.users u where u.id = t.user_id);
  get diagnostics kept = row_count;
  return kept;
end;
$$;

-- Hands out up to p_limit tickets whose receipts are due (Expo has them about
-- 15 minutes after sending and keeps them a day), each leased for 30 minutes
-- so two pollers never take the same one. Tickets without a receipt after a
-- day become 'unknown'; receipts older than 30 days are deleted.
create function public.genesis_push_receipts_claim(p_limit integer default 300)
returns table (id bigint, ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_receipts r
  set status = 'unknown', check_after = null, checked_at = now()
  where r.status = 'sent' and r.created_at < now() - interval '1 day';
  delete from public.push_receipts r where r.created_at < now() - interval '30 days';

  return query
  update public.push_receipts r
  set attempts = r.attempts + 1, check_after = now() + interval '30 minutes'
  where r.id in (
    select q.id from public.push_receipts q
    where q.status = 'sent' and q.check_after <= now()
    order by q.check_after
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
    for update skip locked
  )
  returning r.id, r.ticket_id;
end;
$$;

-- Records receipts: [{ "id", "status": "delivered" | "failed", "error" }]. A
-- DeviceNotRegistered receipt also forgets its device (the app was deleted or
-- notifications were turned off). Returns the receipts settled.
create function public.genesis_push_receipts_settle(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  settled integer;
  dead uuid[];
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 1000 then
    raise exception 'genesis_push_receipts_settle: expected an array of at most 1000 results' using errcode = '22023';
  end if;
  with results as (
    select x.id, x.status, x.error
    from jsonb_to_recordset(p_results) as x (id bigint, status text, error text)
    where x.status in ('delivered', 'failed')
  ), updated as (
    update public.push_receipts r
    set status = s.status, error = case when s.status = 'failed' then s.error end, check_after = null, checked_at = now()
    from results s
    where r.id = s.id and r.status = 'sent'
    returning r.device_id, r.error
  )
  select count(*), array_agg(u.device_id) filter (where u.error = 'DeviceNotRegistered' and u.device_id is not null)
  into settled, dead
  from updated u;
  -- A separate statement: the receipts' foreign key sets their device_id to null.
  if dead is not null then
    delete from public.push_devices d where d.id = any (dead);
  end if;
  return settled;
end;
$$;

-- Forgets devices Expo called dead when it answered the send. Returns how many.
create function public.genesis_push_devices_forget(p_device_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  delete from public.push_devices d where d.id = any (p_device_ids);
  get diagnostics gone = row_count;
  return gone;
end;
$$;

-- Privileges by name. Supabase's default privileges grant execute on a new
-- public function to anon and authenticated, so each is revoked here; a later
-- blanket `grant … on all functions` would hand them back, so such a grant
-- must exclude them.
revoke execute on function private.genesis_notification_preferences_check() from public, anon, authenticated;
revoke execute on function public.genesis_push_register(text, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_push_forget(text) from public, anon, authenticated;
revoke execute on function public.genesis_push_status(uuid, text, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.genesis_push_targets(uuid, text, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.genesis_push_tickets_record(jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_push_receipts_claim(integer) from public, anon, authenticated;
revoke execute on function public.genesis_push_receipts_settle(jsonb) from public, anon, authenticated;
revoke execute on function public.genesis_push_devices_forget(uuid[]) from public, anon, authenticated;
grant execute on function public.genesis_push_register(text, text, text) to authenticated;
grant execute on function public.genesis_push_forget(text) to anon, authenticated;
grant execute on function public.genesis_push_status(uuid, text, boolean, boolean, timestamptz) to service_role;
grant execute on function public.genesis_push_targets(uuid, text, boolean, boolean, timestamptz) to service_role;
grant execute on function public.genesis_push_tickets_record(jsonb) to service_role;
grant execute on function public.genesis_push_receipts_claim(integer) to service_role;
grant execute on function public.genesis_push_receipts_settle(jsonb) to service_role;
grant execute on function public.genesis_push_devices_forget(uuid[]) to service_role;
