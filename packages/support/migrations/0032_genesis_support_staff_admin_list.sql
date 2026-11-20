-- @feat:support-feedback
-- Genesis support 0032: staff from genesis-supabase's platform-admin list, where the app has no hooks (after 0023_genesis_support_hook_defaults.sql).
--
-- 0023's private.genesis_support_staff_hook(person) made the app's platform admins support staff
-- through the app's private.genesis_platform_admin(person). genesis-supabase 0022 adds a default for
-- an app with no such hook: the people in public.genesis_platform_admins, read by Genesis's own
-- private.genesis_person_is_platform_admin(person), never under the app's hook name. Staff now
-- follow that function when it exists, so with zero app SQL the people in the list are staff too:
--
--   private.genesis_support_staff_hook(person)    the app's private.genesis_support_staff(person)
--                                                 when it has one; else its platform admins (its
--                                                 hook, else 0022's list); without either, nobody.
--
-- An app that has its own hooks sees no change. The list starts empty, so nobody new is staff until
-- someone is added to it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0023 (`genesis migrate` orders it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0032_genesis_support_staff_admin_list.test.sql`).

create schema if not exists private;

create or replace function private.genesis_support_staff_hook(person uuid)
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
  if to_regprocedure('private.genesis_support_staff(uuid)') is not null then
    return coalesce(private.genesis_support_staff(person), false);
  end if;
  -- genesis-supabase 0022: the app's platform-admin hook, else its list.
  if to_regprocedure('private.genesis_person_is_platform_admin(uuid)') is not null then
    return coalesce(private.genesis_person_is_platform_admin(person), false);
  end if;
  if to_regprocedure('private.genesis_platform_admin(uuid)') is not null then
    return coalesce(private.genesis_platform_admin(person), false);
  end if;
  return false;
end;
$$;

revoke execute on function private.genesis_support_staff_hook(uuid) from public, anon, authenticated;
