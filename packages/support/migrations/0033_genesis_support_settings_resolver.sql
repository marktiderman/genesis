-- @feat:support-feedback
-- Genesis support 0033: one settings resolver, and the verify prompt as a setting (after
-- 0020_genesis_support_settings.sql and 0028_genesis_support_diagnostics_fixes.sql; genesis-supabase's
-- 0023_genesis_settings_tenant_person.sql is optional, before or after).
--
-- 0020 read settings with a resolver of its own (genesis_support_setting_layers, _fits and _value)
-- that knew only the file and database layers and no preset. Support now reads every setting
-- through genesis-supabase's private.genesis_setting(key, tenant), the server's one copy of
-- resolveSettings (default and preset from the synced catalogue, the file, the database, a
-- tenant's value for a tenant-scoped key, locks), so a server gate and the screens agree:
--
--   private.genesis_support_setting_int(key, fallback, lo, hi) and _bool(key, fallback)
--                 now ask private.genesis_setting; the fallback applies when it is missing or
--                 declares no such key (before the manifest is synced). Deprecated: kept for one
--                 release for 0022's support_agents_list and any app SQL that calls them.
--   0020's _layers, _fits and _value are dropped.
--
--   support.verifyPrompt (boolean, default off) turns on 0003's verify prompt: a report someone
--                 else marks addressed asks its person to check the fix. The app's hook
--                 private.genesis_support_verify_prompt_enabled() still turns it on too, for one
--                 release (deprecated: set support.verifyPrompt instead).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0033_genesis_support_settings_resolver.test.sql`).

create schema if not exists private;

-- The readers, on the one resolver ---------------------------------------------------------------

create or replace function private.genesis_support_setting_int(setting_key text, fallback integer, lo integer, hi integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  n numeric;
begin
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    v := private.genesis_setting(setting_key);
  end if;
  if jsonb_typeof(v) is distinct from 'number' then
    return fallback;
  end if;
  n := v::text::numeric;
  return case when n = trunc(n) and n between lo and hi then n::integer else fallback end;
end;
$$;

create or replace function private.genesis_support_setting_bool(setting_key text, fallback boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    v := private.genesis_setting(setting_key);
  end if;
  return case when jsonb_typeof(v) = 'boolean' then v::boolean else fallback end;
end;
$$;

comment on function private.genesis_support_setting_int(text, integer, integer, integer) is
  'Deprecated: call private.genesis_setting (genesis-supabase 0023). One integer setting, else the fallback. Genesis support.';
comment on function private.genesis_support_setting_bool(text, boolean) is
  'Deprecated: call private.genesis_setting (genesis-supabase 0023). One boolean setting, else the fallback. Genesis support.';

revoke execute on function private.genesis_support_setting_int(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function private.genesis_support_setting_bool(text, boolean) from public, anon, authenticated;

drop function if exists private.genesis_support_setting_value(text, jsonb, integer, integer);
drop function if exists private.genesis_support_setting_fits(jsonb, integer, integer);
drop function if exists private.genesis_support_setting_layers(text);

-- The verify prompt: support.verifyPrompt, or the deprecated hook ----------------------------------

-- 0003's trigger function, with the same body; only what turns it on changed.
create or replace function private.genesis_support_ask_to_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prompt_on boolean := false;
begin
  -- A status set directly is depth 1; through support-chat's conversation sync, 2. Deeper is a
  -- loop of triggers, never a person marking a fix.
  if pg_trigger_depth() > 2 then
    return null;
  end if;
  -- Separate statements: one SQL expression may evaluate a call even when its function is missing.
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    prompt_on := coalesce(private.genesis_setting('support.verifyPrompt') = 'true'::jsonb, false);
  end if;
  if not prompt_on and to_regprocedure('private.genesis_support_verify_prompt_enabled()') is not null then
    prompt_on := coalesce(private.genesis_support_verify_prompt_enabled(), false);
  end if;
  if not prompt_on then
    return null;
  end if;
  if auth.uid() is null or auth.uid() = new.user_id
     or exists (select 1 from public.support_replies r
                 where r.report_id = new.id and r.prompt = 'verify' and r.created_at > now() - interval '1 hour') then
    return null;
  end if;
  begin
    insert into public.support_replies (report_id, body, prompt)
    values (new.id, 'This is marked fixed. Please check it: confirm the fix, or reopen it if it isn''t fixed.', 'verify');
  exception
    when insufficient_privilege or sqlstate 'GS429' then
      raise log 'genesis-support: the verify prompt for report % was not posted (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function private.genesis_support_ask_to_verify() from public, anon, authenticated;
