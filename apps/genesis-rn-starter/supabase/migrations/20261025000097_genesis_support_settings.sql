-- @feat:support-feedback
-- Genesis support 0020: the dump's limits follow Genesis settings (after 0019_genesis_support_diagnostics.sql).
--
-- Two numbers 0019 fixed now come from the app's settings (genesis-supabase 0020's
-- genesis_settings and genesis_app_manifest), so a platform admin changes them live:
--
--   diagnostics.perHour        dumps one person may send in an hour      (default 10, 1 to 100)
--   diagnostics.retentionDays  days a dump is kept before it is purged   (default 90, 7 to 365)
--
-- private.genesis_support_setting(key) reads one key the way the resolver would for these: a
-- value genesis.config.json locks, else the database layer's, else genesis.config.json's, else
-- null (the caller's default). It reads nothing when genesis-supabase's settings migration isn't
-- applied, so this file stands alone: without settings, 10 an hour and 90 days, as before. A
-- value that isn't a whole number in range is ignored, never trusted.
--
-- public.support_purge_diagnostics(older_than, max_rows): `older_than` now defaults to the
-- setting (null means "the setting"). Passing it still wins (the cleanup function's
-- GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0020_genesis_support_settings.test.sql`).

create schema if not exists private;

-- One setting's value, or null. Locked in the file > the database layer > the file.
create or replace function private.genesis_support_setting(setting_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  file_entry jsonb;
  file_value jsonb;
  file_locked boolean := false;
  db_value jsonb;
begin
  if to_regclass('public.genesis_app_manifest') is not null then
    execute 'select m.file_settings -> $1 from public.genesis_app_manifest m limit 1' into file_entry using setting_key;
    -- `{ "value": …, "locked": true }` exactly is a locked entry; anything else is the value.
    if jsonb_typeof(file_entry) = 'object'
       and (select array_agg(k order by k) from jsonb_object_keys(file_entry) k) = array['locked', 'value']
       and jsonb_typeof(file_entry -> 'locked') = 'boolean' then
      file_value := file_entry -> 'value';
      file_locked := (file_entry ->> 'locked')::boolean;
    else
      file_value := file_entry;
    end if;
  end if;
  if file_locked then
    return file_value;
  end if;
  if to_regclass('public.genesis_settings') is not null then
    execute 'select s.value from public.genesis_settings s where s.key = $1' into db_value using setting_key;
  end if;
  return coalesce(db_value, file_value);
exception when others then
  -- A settings table of another shape: the caller's default, never a failed insert.
  return null;
end;
$$;

-- A whole number setting within bounds, else the fallback.
create or replace function private.genesis_support_setting_int(setting_key text, fallback integer, lo integer, hi integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw jsonb := private.genesis_support_setting(setting_key);
  n numeric;
begin
  if raw is null or jsonb_typeof(raw) is distinct from 'number' then
    return fallback;
  end if;
  n := raw::text::numeric;
  if n <> trunc(n) or n < lo or n > hi then
    return fallback;
  end if;
  return n::integer;
end;
$$;

revoke execute on function private.genesis_support_setting(text) from public, anon, authenticated;
revoke execute on function private.genesis_support_setting_int(text, integer, integer, integer) from public, anon, authenticated;

-- 0019's trigger, with the hourly limit from diagnostics.perHour.
create or replace function private.genesis_support_new_diagnostics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is null then
    raise exception 'support_diagnostics: no person' using errcode = '42501';
  end if;
  new.created_at := now();
  if new.feedback_id is not null
     and not exists (select 1 from public.tickets t where t.id = new.feedback_id and t.user_id = new.user_id) then
    raise exception 'support_diagnostics: not your report' using errcode = '42501';
  end if;
  perform private.genesis_support_rate_limit(new.user_id, 'diagnostics',
    private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), interval '1 hour');
  return new;
end;
$$;

revoke execute on function private.genesis_support_new_diagnostics() from public, anon, authenticated;

-- 0019's purge, with the default age from diagnostics.retentionDays.
create or replace function public.support_purge_diagnostics(older_than interval default null, max_rows integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
  keep interval := coalesce(older_than, make_interval(days => private.genesis_support_setting_int('diagnostics.retentionDays', 90, 7, 365)));
begin
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

comment on function public.support_purge_diagnostics(interval, integer) is
  'Deletes context dumps older than older_than (default: the diagnostics.retentionDays setting, else 90 days), a batch at a time. Service role only. Genesis support.';

revoke execute on function public.support_purge_diagnostics(interval, integer) from public, anon, authenticated;
grant execute on function public.support_purge_diagnostics(interval, integer) to service_role;
