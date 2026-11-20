-- Genesis settings 0022: a default list of platform admins (after 0020_genesis_settings.sql).
--
-- 0020 asks the app for `private.genesis_platform_admin(person uuid) returns boolean`, and without
-- it nobody may change settings, and (with genesis-support's 0023) nobody is support staff. So an
-- app with no SQL of its own has an admin, this file adds the narrowest default: an explicit list.
--
--   genesis_platform_admins  one row per platform admin. It starts empty, so nobody is an admin
--                            until someone is added by hand: never every signed-in person.
--
-- The hook is created only when the app has none. An app that already defines it keeps its own,
-- and this table is unused. An app that defines it later replaces the default with
-- `create or replace function private.genesis_platform_admin(…)` (plain `create function` fails:
-- the default already exists).
--
-- Add the first admin with the service role or the SQL editor (`genesis doctor` reports an empty
-- list as `platform-admin-missing`, with this line in its fix):
--
--   insert into public.genesis_platform_admins (person)
--   select id from auth.users where lower(email) = lower('you@example.com')
--   on conflict do nothing;
--
-- Access: row level security on, no policies, no grants to anon or authenticated. Only the service
-- role (and the database owner) reads and writes the list. A deleted person leaves it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0022_genesis_platform_admins.test.sql`).

create schema if not exists private;

create table public.genesis_platform_admins (
  person uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table public.genesis_platform_admins is
  'The app''s platform admins, when it has no private.genesis_platform_admin hook of its own. Starts empty; rows are added by the service role. Genesis settings.';

alter table public.genesis_platform_admins enable row level security;
revoke all on table public.genesis_platform_admins from public, anon, authenticated;
revoke all on table public.genesis_platform_admins from service_role;
grant select, insert, update, delete on table public.genesis_platform_admins to service_role;

do $do$
begin
  if to_regprocedure('private.genesis_platform_admin(uuid)') is not null then
    return;
  end if;
  create function private.genesis_platform_admin(person uuid) returns boolean
  language sql stable set search_path = '' as $$
    select exists (select 1 from public.genesis_platform_admins a where a.person = $1)
  $$;
  comment on function private.genesis_platform_admin(uuid) is
    'Genesis default: the people in public.genesis_platform_admins. Replace it with create or replace for another model.';
  revoke execute on function private.genesis_platform_admin(uuid) from public, anon, authenticated;
end
$do$;
