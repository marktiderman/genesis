-- @feat:support-feedback
-- Genesis support 0021: a default tenant for 0004, so support installs with no SQL of the app's own (before 0004_genesis_support_tickets.sql).
--
-- 0004 stops unless private.genesis_support_default_tenant() exists. For an app that hasn't
-- defined it, this file defines it for 0004's sake, returning Genesis's reserved zero-config
-- tenant:
--
--   bda1457d-053b-422c-8887-e046e54b8344   never an organisation's id; reserved by Genesis
--
-- It is a stand-in, not the app's hook: its comment says 'Genesis default:', and 0023 (right
-- after 0004) drops it again while its body is still exactly this one, and answers from the same
-- reserved id itself. An app that writes its own over it with `create or replace` first keeps it. So an app's own
-- definition later, with a plain `create function` and any parameter or column names it likes,
-- never collides with it. An app that has defined the hook already keeps it: nothing is created.
--
-- This file defines nothing else. Staff default to the app's platform admins in 0023, inside
-- Genesis's own wrapper; private.genesis_viewer_people (genesis-supabase 0016) is the app's alone,
-- because chat, work and entitlements read it as their tenant boundary, and support works without
-- it (a ticket goes to the app's own desk).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, before
-- 0004 (`genesis migrate` orders it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test `tests/0023_genesis_support_hook_defaults.test.sql` (with 0023).

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
      as $body$ select 'bda1457d-053b-422c-8887-e046e54b8344'::uuid $body$
    $f$;
    execute 'revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated';
    execute $c$comment on function private.genesis_support_default_tenant() is
      'Genesis default: a stand-in for support 0004, dropped by support 0023. Genesis support 0021.'$c$;
  end if;
end;
$do$;
