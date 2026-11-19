-- @feat:support-feedback
-- Genesis support 0023: zero-config answers for the default tenant and staff, inside Genesis's own wrappers (after 0004_genesis_support_tickets.sql and 0021).
--
-- Support asks the app two questions through hooks. When the app hasn't answered, Genesis now
-- answers itself, in its own wrappers (0004's), so no function of the app's name is ever Genesis's
-- and the app's own hook migration, whenever it runs and however it names its parameters, never
-- collides with a default:
--
--   private.genesis_support_default_tenant_id()   the app's private.genesis_support_default_tenant()
--                                                 when it has one, else Genesis's reserved
--                                                 zero-config tenant 00000000-0000-0000-0000-000000000001
--                                                 (never an organisation's id).
--   private.genesis_support_staff_hook(person)    the app's private.genesis_support_staff(person)
--                                                 when it has one, else the app's platform admins
--                                                 (genesis-supabase 0020's private.genesis_platform_admin);
--                                                 without either, nobody.
--
-- 0021's stand-in default tenant is dropped here only while it is still exactly the stand-in (its
-- body and its 'Genesis default:' comment); an app's own hook, even one written over the stand-in
-- with `create or replace`, is never touched. Tickets written before an app adds its own default tenant stay in the
-- reserved one: move them in the same migration that adds the hook, if it should own them.
--
-- private.genesis_viewer_people is not given a default: it is the app's tenancy boundary for
-- every block (genesis-supabase 0016). Without it, support still works on the app's own desk.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0004 (`genesis migrate` orders it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0023_genesis_support_hook_defaults.test.sql`).

create schema if not exists private;

-- 0021's stand-in goes; an app's own hook stays. It is the stand-in only when its body is still
-- exactly 0021's: an app that replaced it with `create or replace` (which keeps the comment) between
-- 0021 and here keeps its own. Returns whether it dropped one.
create or replace function private.genesis_support_drop_tenant_standin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn regprocedure := to_regprocedure('private.genesis_support_default_tenant()');
begin
  if fn is null then
    return false;
  end if;
  if btrim((select p.prosrc from pg_catalog.pg_proc p where p.oid = fn)) <> 'select ''00000000-0000-0000-0000-000000000001''::uuid'
     or coalesce(obj_description(fn, 'pg_proc'), '') not like 'Genesis default:%' then
    return false;
  end if;
  execute 'drop function private.genesis_support_default_tenant()';
  return true;
end;
$$;

revoke execute on function private.genesis_support_drop_tenant_standin() from public, anon, authenticated;

select private.genesis_support_drop_tenant_standin();

-- The app's own tenant: its hook, else Genesis's reserved one. A hook that errors raises.
create or replace function private.genesis_support_default_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('private.genesis_support_default_tenant()') is null then
    return '00000000-0000-0000-0000-000000000001'::uuid;
  end if;
  return private.genesis_support_default_tenant();
end;
$$;

-- Staff: the app's hook, else its platform admins, else nobody.
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
  if to_regprocedure('private.genesis_platform_admin(uuid)') is not null then
    return coalesce(private.genesis_platform_admin(person), false);
  end if;
  return false;
end;
$$;

revoke execute on function private.genesis_support_default_tenant_id() from public, anon, authenticated;
revoke execute on function private.genesis_support_staff_hook(uuid) from public, anon, authenticated;
