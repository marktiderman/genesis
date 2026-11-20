-- @feat:support-feedback
-- Genesis support 0033: one settings resolver, and the verify prompt as a setting (after
-- 0020_genesis_support_settings.sql and 0028_genesis_support_diagnostics_fixes.sql; genesis-supabase's
-- 0023_genesis_settings_tenant_person.sql is optional, before or after).
--
-- 0020 read settings with a resolver of its own (genesis_support_setting_layers, _fits, _value,
-- _int and _bool) that knew only the file and database layers and no preset. Support now reads
-- every setting through genesis-supabase's private.genesis_setting(key, tenant), the server's one
-- copy of resolveSettings (default and preset from the synced catalogue, the file, the database, a
-- tenant's value for a tenant-scoped key, locks), so a server gate and the screens agree. The dump's
-- trigger and purge read it here; 0020's resolver and readers are dropped.
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

-- The dump's settings, from the one resolver ---------------------------------------------------------

-- 0020's trigger: the hourly limit from diagnostics.perHour, refusing dumps while
-- diagnostics.enabled is false. Until the manifest is synced the resolver knows no key, and the
-- package defaults hold (on, 10 an hour), as resolveSettings gives with no layers.
create or replace function private.genesis_support_new_diagnostics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled jsonb;
  per_hour jsonb;
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is null then
    raise exception 'support_diagnostics: no person' using errcode = '42501';
  end if;
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    enabled := private.genesis_setting('diagnostics.enabled');
    per_hour := private.genesis_setting('diagnostics.perHour');
  end if;
  -- diagnostics.enabled off: no dump is stored, from a client or a server.
  if enabled = 'false'::jsonb then
    raise exception 'support_diagnostics: diagnostics are off (the diagnostics.enabled setting)' using errcode = '42501';
  end if;
  new.created_at := now();
  if new.feedback_id is not null
     and not exists (select 1 from public.tickets t where t.id = new.feedback_id and t.user_id = new.user_id) then
    raise exception 'support_diagnostics: not your report' using errcode = '42501';
  end if;
  perform private.genesis_support_rate_limit(new.user_id, 'diagnostics',
    coalesce(per_hour::text::numeric::integer, 10), interval '1 hour');
  return new;
end;
$$;

revoke execute on function private.genesis_support_new_diagnostics() from public, anon, authenticated;

-- 0020's purge: the default age from diagnostics.retentionDays (90 days until the manifest is synced).
create or replace function public.support_purge_diagnostics(older_than interval default null, max_rows integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
  days jsonb;
  keep interval;
begin
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    days := private.genesis_setting('diagnostics.retentionDays');
  end if;
  keep := coalesce(older_than, make_interval(days => coalesce(days::text::numeric::integer, 90)));
  if keep < interval '1 day' then
    raise exception 'support_purge_diagnostics: keep dumps at least a day' using errcode = '22023';
  end if;
  with doomed as (
    select d.id from public.support_diagnostics d
    where d.created_at < now() - keep
    order by d.created_at
    limit greatest(1, least(coalesce(max_rows, 1000), 10000))
  )
  delete from public.support_diagnostics d using doomed where d.id = doomed.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.support_purge_diagnostics(interval, integer) from public, anon, authenticated;
grant execute on function public.support_purge_diagnostics(interval, integer) to service_role;

-- 0020's own resolver and its readers, now that nothing calls them (0034 moves the support-chat
-- block's support_agents_list to the resolver).
drop function if exists private.genesis_support_setting_int(text, integer, integer, integer);
drop function if exists private.genesis_support_setting_bool(text, boolean);
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
