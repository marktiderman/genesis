-- Genesis app release policy: public.app_release_policy
--
-- What a native app reads at launch to decide whether this install must
-- update from the store, whether the app is down for maintenance, and which
-- release notes to show. The client half is `supabasePolicySource(client)` in
-- @marktiderman/genesis-native/updates.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name (e.g. `20261024000000_genesis_app_release_policy.sql`).
-- Never edit it once applied; change it with a new migration.
--
-- Access: anyone may read (anon included: the app reads it before sign-in);
-- nobody but the service role (or a migration) may write. Edit the row from
-- the SQL editor, a migration, or a server job with the secret key.
--
-- Failing open: the client never blocks on a missing row, a malformed value
-- or a failed read. The checks below keep malformed values out in the first
-- place: a minimum version is plain dotted numbers (`1`, `1.4`, `1.4.0`),
-- store links are https (or the stores' own schemes), notes are an array of
-- `{ "version": "1.4.0", "title"?: "...", "body": "..." }`.
--
-- One row per app (`app_id`, default 'default'). For example:
--
--   insert into public.app_release_policy (app_id, min_version_ios, store_url_ios)
--   values ('default', '1.4.0', 'https://apps.apple.com/app/id0000000000')
--   on conflict (app_id) do update set min_version_ios = excluded.min_version_ios,
--     store_url_ios = excluded.store_url_ios, updated_at = now();
--
-- Maintenance: set `maintenance = true` (and a `maintenance_message`). The
-- client honours it only from a live read, never from its cache, so a phone
-- offline when maintenance ends is never stuck behind it.
--
-- Verify: the pgTAP test beside this file (`tests/0002_genesis_app_release_policy.test.sql`).

create table if not exists public.app_release_policy (
  app_id text primary key default 'default'
    constraint app_release_policy_app_id_format check (app_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  min_version_ios text
    constraint app_release_policy_min_version_ios_format check (min_version_ios ~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,3}$'),
  min_version_android text
    constraint app_release_policy_min_version_android_format check (min_version_android ~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,3}$'),
  store_url_ios text
    constraint app_release_policy_store_url_ios_format check (store_url_ios ~ '^(https|itms-apps)://'),
  store_url_android text
    constraint app_release_policy_store_url_android_format check (store_url_android ~ '^(https|market)://'),
  maintenance boolean not null default false,
  maintenance_message text
    constraint app_release_policy_maintenance_message_length check (char_length(maintenance_message) <= 500),
  notes jsonb not null default '[]'::jsonb
    constraint app_release_policy_notes_shape check (
      jsonb_typeof(notes) = 'array'
      and not jsonb_path_exists(notes, '$[*] ? (!exists(@.version ? (@.type() == "string")) || !exists(@.body ? (@.type() == "string")))')
    ),
  updated_at timestamptz not null default now()
);

comment on table public.app_release_policy is
  'Minimum store versions, maintenance switch and release notes for native apps. Readable by everyone, written only by the service role. Genesis updates block.';

alter table public.app_release_policy enable row level security;

-- Reading: everyone, every row. No insert, update or delete policy exists, so
-- under RLS anon and authenticated can't write even if a later grant lets them try.
drop policy if exists app_release_policy_read on public.app_release_policy;
create policy app_release_policy_read on public.app_release_policy
  for select to anon, authenticated
  using (true);

-- Privileges by name. Supabase's default privileges give anon and
-- authenticated every privilege on a new public table; take them back and
-- grant only select. The service role bypasses RLS and keeps write access.
revoke all on table public.app_release_policy from public, anon, authenticated;
grant select on table public.app_release_policy to anon, authenticated;
grant select, insert, update, delete on table public.app_release_policy to service_role;
