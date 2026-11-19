-- @feat:support-feedback
-- Genesis support 0021: safe default hooks, so support works with no SQL of the app's own (before 0004_genesis_support_tickets.sql).
--
-- Support asks the app three questions through hooks. Until now an app had to answer each in a
-- migration of its own before 0004 would run. This file answers them for an app that hasn't, with
-- the zero-config answers (Genesis settings, config-layer §2.3):
--
--   private.genesis_support_default_tenant() returns uuid
--     The app itself: one fixed tenant, 00000000-0000-4000-8000-0000000000a1 (the starter's).
--   private.genesis_support_staff(person uuid) returns boolean
--     Staff are the app's platform admins: whoever genesis-supabase 0020's hook
--     private.genesis_platform_admin(person) names. Without that hook, nobody is staff (as before).
--   private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
--     Every login is one person in the app's tenant: (the default tenant, the login's id), for a
--     login that exists in auth.users.
--
-- Each is created only when the app hasn't defined it, so an app that already has its own keeps
-- it, and this file never replaces anything. To answer differently later (a multi-tenant app's
-- organizations, staff from a table of the app's own), define the hook in a later migration with
-- `create or replace function` (a plain `create function` stops: this one is there already).
--
-- Each default says what it is in its comment ('Genesis default: …'), so a tool can tell it from
-- the app's own.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, before
-- 0004 (`genesis migrate` orders it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0021_genesis_support_default_hooks.test.sql`).

create schema if not exists private;

do $do$
begin
  if to_regprocedure('private.genesis_support_default_tenant()') is null then
    execute $f$
      create function private.genesis_support_default_tenant()
      returns uuid
      language sql
      stable
      set search_path = ''
      as $body$ select '00000000-0000-4000-8000-0000000000a1'::uuid $body$
    $f$;
    execute 'revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated';
    execute $c$comment on function private.genesis_support_default_tenant() is
      'Genesis default: the app is its own one tenant. Replace it with create or replace for an app with organizations. Genesis support 0021.'$c$;
  end if;

  if to_regprocedure('private.genesis_support_staff(uuid)') is null then
    execute $f$
      create function private.genesis_support_staff(person uuid)
      returns boolean
      language plpgsql
      stable
      set search_path = ''
      as $body$
      begin
        if person is null or to_regprocedure('private.genesis_platform_admin(uuid)') is null then
          return false;
        end if;
        return coalesce(private.genesis_platform_admin(person), false);
      end;
      $body$
    $f$;
    execute 'revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated';
    execute $c$comment on function private.genesis_support_staff(uuid) is
      'Genesis default: support staff are the app''s platform admins (private.genesis_platform_admin). Replace it with create or replace. Genesis support 0021.'$c$;
  end if;

  if to_regprocedure('private.genesis_viewer_people(uuid)') is null then
    execute $f$
      create function private.genesis_viewer_people(viewer uuid)
      returns table (tenant_id uuid, person_id uuid)
      language plpgsql
      stable
      set search_path = ''
      as $body$
      begin
        if viewer is null or to_regprocedure('private.genesis_support_default_tenant()') is null then
          return;
        end if;
        return query
          select private.genesis_support_default_tenant(), u.id from auth.users u where u.id = viewer;
      end;
      $body$
    $f$;
    execute 'revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated';
    execute $c$comment on function private.genesis_viewer_people(uuid) is
      'Genesis default: every login is one person in the app''s own tenant (private.genesis_support_default_tenant). Replace it with create or replace for an app with organizations. Genesis support 0021.'$c$;
  end if;
end;
$do$;
