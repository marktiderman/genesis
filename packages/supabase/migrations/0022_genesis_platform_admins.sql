-- Genesis settings 0022: a default list of platform admins (after 0020_genesis_settings.sql).
--
-- 0020 asks the app for `private.genesis_platform_admin(person uuid) returns boolean`, and without
-- it nobody may change settings, and (with genesis-support's 0023) nobody is support staff. So an
-- app with no SQL of its own can have an admin, this file adds the narrowest default: an explicit
-- list, read inside Genesis's own wrappers only while the app has no hook.
--
--   genesis_platform_admins                 one row per platform admin. It starts empty, so nobody
--                                           is an admin until someone is added by hand: never
--                                           every signed-in person.
--   private.genesis_person_is_platform_admin(person)
--                                           the app's private.genesis_platform_admin(person) when it
--                                           has one, else whether the person is in the list.
--
-- No function under the app's hook name is ever Genesis's (as support's 0023 does it): the app adds,
-- replaces or renames the parameters of its own hook whenever it likes, and from then on the list is
-- unused. private.genesis_is_platform_admin() (0020's wrapper) and set_genesis_setting now go
-- through the function above; set_genesis_setting still says "nobody may change settings yet" while
-- the app has no hook and the list is empty.
--
-- Add the first admin with the service role or the SQL editor (`genesis doctor` reports an empty
-- list as `platform-admin-missing`, with this in its fix). It adds a confirmed email only, and
-- refuses when the email matches more than one person:
--
--   do $$ begin
--     if (select count(*) from auth.users where lower(email) = lower('you@example.com') and email_confirmed_at is not null) <> 1 then
--       raise exception 'no single confirmed person has that email: nobody was added';
--     end if;
--     insert into public.genesis_platform_admins (person)
--     select id from auth.users where lower(email) = lower('you@example.com') and email_confirmed_at is not null
--     on conflict do nothing;
--   end $$;
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
  'The app''s platform admins while it has no private.genesis_platform_admin hook of its own. Starts empty; rows are added by the service role. Genesis settings.';

alter table public.genesis_platform_admins enable row level security;
revoke all on table public.genesis_platform_admins from public, anon, authenticated;
revoke all on table public.genesis_platform_admins from service_role;
grant select, insert, update, delete on table public.genesis_platform_admins to service_role;

-- The app's hook, else the list.
create or replace function private.genesis_person_is_platform_admin(person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if person is null then
    return false;
  end if;
  if to_regprocedure('private.genesis_platform_admin(uuid)') is not null then
    return coalesce(private.genesis_platform_admin(person), false);
  end if;
  return exists (select 1 from public.genesis_platform_admins a where a.person = genesis_person_is_platform_admin.person);
end;
$$;

-- 0020's wrapper, through the function above.
create or replace function private.genesis_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_person_is_platform_admin(auth.uid());
$$;

-- 0020's, with "nobody may change settings yet" when the app has no hook and the list is empty.
create or replace function public.set_genesis_setting(key text, value jsonb, locked boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored jsonb := coalesce(set_genesis_setting.value, 'null'::jsonb);
  problem text;
begin
  if me is null then
    raise exception 'set_genesis_setting: not signed in' using errcode = '42501';
  end if;
  if to_regprocedure('private.genesis_platform_admin(uuid)') is null and not exists (select 1 from public.genesis_platform_admins) then
    raise exception 'set_genesis_setting: nobody may change settings yet'
      using errcode = '42501', hint = 'Add the first platform admin to public.genesis_platform_admins, or create private.genesis_platform_admin(uuid) (see migration 0022_genesis_platform_admins).';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'set_genesis_setting: only platform admins can change settings' using errcode = '42501';
  end if;
  if key is null or locked is null then
    raise exception 'set_genesis_setting: key and locked are required' using errcode = '22004';
  end if;
  problem := private.genesis_setting_problem(key, stored);
  if problem is not null then
    raise exception 'set_genesis_setting: %', problem using errcode = '22023';
  end if;
  perform set_config('genesis.setting_source', 'admin', true);
  insert into public.genesis_settings as s (key, value, locked, updated_by, updated_at)
  values (set_genesis_setting.key, stored, set_genesis_setting.locked, me, now())
  on conflict on constraint genesis_settings_pkey do update
    set value = excluded.value, locked = excluded.locked, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    -- Saving the same value and lock again changes nothing, not even who and when.
    where (s.value, s.locked) is distinct from (excluded.value, excluded.locked);
  -- The source names this write only, not later ones in the same transaction.
  perform set_config('genesis.setting_source', '', true);
end;
$$;

comment on function public.set_genesis_setting(text, jsonb, boolean) is
  'Sets a runtime setting in the database layer, optionally locked. Only platform admins (private.genesis_platform_admin, else public.genesis_platform_admins); checked against the manifest''s catalogue, and refused for a key genesis.config.json locks. Genesis settings.';

revoke execute on function private.genesis_person_is_platform_admin(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_is_platform_admin() from public, anon, authenticated;
revoke execute on function public.set_genesis_setting(text, jsonb, boolean) from public, anon;
grant execute on function public.set_genesis_setting(text, jsonb, boolean) to authenticated;
