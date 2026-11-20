-- Genesis settings 0025: a string's shape (after 0023_genesis_settings_tenant_person.sql).
--
-- genesis-config's defineSettings takes `pattern` on a string (a regular expression's source,
-- anchored: a Sentry DSN, an organization slug), and catalogueManifest writes it into the synced
-- catalogue. private.genesis_setting_value_problem, the one value check (set_genesis_setting's, the
-- tenant and person writes' and the server's resolver), now refuses a string that doesn't match, as
-- resolveSettings does, so no layer stores a value every reader would skip. A `pattern` that isn't
-- a string, or that Postgres can't compile, is a malformed catalogue entry and refuses every value.
-- Nothing else changes: the function is 0023's, with the pattern check added before `options`.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0025_genesis_settings_pattern.test.sql`).

create or replace function private.genesis_setting_value_problem(setting_key text, def jsonb, setting_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text := def ->> 'type';
  given text := coalesce(jsonb_typeof(setting_value), 'null');
  n numeric;
begin
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
    -- A bound that isn't a number is a malformed catalogue entry: say so, never raise on the cast.
    if def ? 'min' and jsonb_typeof(def -> 'min') <> 'number'
       or def ? 'max' and jsonb_typeof(def -> 'max') <> 'number' then
      return format('the synced catalogue''s entry for %s is malformed (write the manifest again: writeAppManifest)', setting_key);
    end if;
    n := case when kind = 'number' then setting_value::text::numeric else jsonb_array_length(setting_value) end;
    if def ? 'min' and n < (def ->> 'min')::numeric then
      return format('%s must be at least %s%s', setting_key, def ->> 'min', case when kind = 'list' then ' items' else '' end);
    end if;
    if def ? 'max' and n > (def ->> 'max')::numeric then
      return format('%s must be at most %s%s', setting_key, def ->> 'max', case when kind = 'list' then ' items' else '' end);
    end if;
  end if;
  -- A string's shape (catalogueManifest's `pattern`, a regular expression's source): one that isn't
  -- a string, or doesn't compile here, is a malformed catalogue entry and refuses every value.
  if def ? 'pattern' then
    if jsonb_typeof(def -> 'pattern') <> 'string' then
      return format('the synced catalogue''s entry for %s is malformed (write the manifest again: writeAppManifest)', setting_key);
    end if;
    if kind = 'string' then
      begin
        if not ((setting_value #>> '{}') ~ (def ->> 'pattern')) then
          return format('%s must match %s', setting_key, def ->> 'pattern');
        end if;
      exception when invalid_regular_expression then
        return format('the synced catalogue''s entry for %s is malformed (write the manifest again: writeAppManifest)', setting_key);
      end;
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

revoke execute on function private.genesis_setting_value_problem(text, jsonb, jsonb) from public, anon, authenticated;
