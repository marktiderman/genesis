-- Genesis settings 0021: whole numbers (after 0020_genesis_settings.sql).
--
-- genesis-config's defineSettings takes `integer: true` on a number (a count, days, milliseconds),
-- and catalogueManifest writes it into the synced catalogue. private.genesis_setting_problem now
-- refuses a fraction for such a key, as resolveSettings does, so set_genesis_setting can't store a
-- value every reader would skip. A catalogue entry whose `integer` isn't `true` is malformed, like
-- any other bad entry. Nothing else changes.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0021_genesis_settings_integer.test.sql`).

create or replace function private.genesis_setting_problem(setting_key text, setting_value jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cat jsonb;
  def jsonb;
  kind text;
  given text := coalesce(jsonb_typeof(setting_value), 'null');
  n numeric;
  file_entry jsonb;
begin
  if setting_key is null or setting_key !~ '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$' then
    return format('%s isn''t a setting key (namespace.key)', coalesce(setting_key, 'null'));
  end if;
  select m.catalogue, m.file_settings -> setting_key into cat, file_entry from public.genesis_app_manifest m limit 1;
  if cat is null or cat = '{}'::jsonb then
    return 'no settings catalogue has been synced yet (write the manifest on deploy: writeAppManifest)';
  end if;
  def := cat -> setting_key;
  if def is null or jsonb_typeof(def) <> 'object' then
    return format('%s isn''t a setting any installed package declares', setting_key);
  end if;
  kind := def ->> 'type';
  if kind is null or kind not in ('boolean', 'number', 'string', 'list', 'object')
     or (def ? 'min' and jsonb_typeof(def -> 'min') <> 'number')
     or (def ? 'max' and jsonb_typeof(def -> 'max') <> 'number')
     or (def ? 'integer' and def -> 'integer' <> 'true'::jsonb)
     or (def ? 'options' and jsonb_typeof(def -> 'options') <> 'array')
     or coalesce(def ->> 'applies', 'runtime') not in ('build', 'runtime') then
    return format('the synced catalogue''s entry for %s is malformed (write the manifest again: writeAppManifest)', setting_key);
  end if;
  if def ->> 'applies' = 'build' then
    return format('%s applies at build time: change it in genesis.config.json', setting_key);
  end if;
  -- A value genesis.config.json locks: no later layer may change it, so don't store one.
  if jsonb_typeof(file_entry) = 'object' and (select count(*) from jsonb_object_keys(file_entry)) = 2
     and file_entry ? 'value' and file_entry -> 'locked' = 'true'::jsonb then
    return format('%s is locked by genesis.config.json: change it there', setting_key);
  end if;
  -- JSON null is "not set": only for a key whose default is null.
  if given = 'null' then
    if def -> 'nullable' = 'true'::jsonb then
      return null;
    end if;
    return format('%s can''t be null: it has a default, so set a value', setting_key);
  end if;
  if kind = 'boolean' and given <> 'boolean'
     or kind = 'number' and given <> 'number'
     or kind = 'string' and given <> 'string'
     or kind = 'list' and given <> 'array'
     or kind = 'object' and given <> 'object' then
    return format('%s must be a %s', setting_key, kind);
  end if;
  if kind = 'list' and exists (select 1 from jsonb_array_elements(setting_value) e where jsonb_typeof(e) not in ('string', 'number')) then
    return format('%s must be a list of strings or numbers', setting_key);
  end if;
  -- A number declared whole (catalogueManifest's `integer: true`): no fraction.
  if kind = 'number' and def -> 'integer' = 'true'::jsonb
     and setting_value::text::numeric <> trunc(setting_value::text::numeric) then
    return format('%s must be a whole number', setting_key);
  end if;
  if kind in ('number', 'list') then
    n := case when kind = 'number' then setting_value::text::numeric else jsonb_array_length(setting_value) end;
    if def ? 'min' and n < (def ->> 'min')::numeric then
      return format('%s must be at least %s%s', setting_key, def ->> 'min', case when kind = 'list' then ' items' else '' end);
    end if;
    if def ? 'max' and n > (def ->> 'max')::numeric then
      return format('%s must be at most %s%s', setting_key, def ->> 'max', case when kind = 'list' then ' items' else '' end);
    end if;
  end if;
  if def ? 'options' and kind in ('string', 'number') and not (def -> 'options') @> jsonb_build_array(setting_value) then
    return format('%s must be one of %s', setting_key, def -> 'options');
  end if;
  if def ? 'options' and kind = 'list' and exists (
    select 1 from jsonb_array_elements(setting_value) e where not (def -> 'options') @> jsonb_build_array(e)
  ) then
    return format('%s may only hold %s', setting_key, def -> 'options');
  end if;
  return null;
end;
$$;


revoke execute on function private.genesis_setting_problem(text, jsonb) from public, anon, authenticated;
