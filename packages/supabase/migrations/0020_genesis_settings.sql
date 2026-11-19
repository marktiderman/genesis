-- Genesis settings: public.genesis_settings, its history, the app manifest, and the RPCs
-- genesis_settings_resolved() and set_genesis_setting()
--
-- The database layer of Genesis settings (@marktiderman/genesis-config, `resolveSettings`): the
-- runtime settings a platform admin changes live, on top of the package defaults, the preset and
-- genesis.config.json `settings`. Every change is kept (who, when, the old and new value, and from
-- where) in public.genesis_setting_changes. A key with no row keeps the value from the layers
-- below it.
--
-- The resolver is the TypeScript one, so the server, the web and phones agree: this file stores
-- the inputs and returns them (genesis_settings_resolved), it doesn't re-implement the layers.
--
--   genesis_app_manifest  one row: what this app runs. Its packages and versions, the preset, the
--                         file's settings, and the settings catalogue (each key's type, bounds,
--                         scope and whether it applies at runtime), written by the service role on
--                         deploy and at app start (`writeAppManifest` in genesis-supabase).
--   genesis_settings      the database layer: a value per key, optionally locked so tenant and
--                         person values can't change it.
--
-- The app hook: `private.genesis_platform_admin(person uuid) returns boolean` decides who may
-- change settings: the app's platform admins (ADR 0003's `platform` zone). Without it nobody can
-- (set_genesis_setting raises 42501 with a hint), so a fresh install fails closed, as
-- tenant_features (0004) does. It runs with this file's (the owner's) rights:
--
--   create function private.genesis_platform_admin(person uuid) returns boolean
--   language sql stable set search_path = '' as $$
--     select exists (select 1 from public.platform_admins a where a.user_id = person)
--   $$;
--   revoke execute on function private.genesis_platform_admin(uuid) from public, anon, authenticated;
--
-- What set_genesis_setting accepts is checked against the catalogue in the manifest: the key must
-- be declared and apply at runtime, and the value must fit its type and bounds. Without a synced
-- catalogue it refuses every write (22023, with a hint), so nothing unchecked gets in.
--
-- Secrets are never settings: a key names the secret it needs, the value lives in its own store
-- (Vault, Edge Function secrets, the server's environment, CI). Nothing here holds one.
--
-- Access: everything goes through the functions below (security definer). The tables have row
-- level security on, no policies and no grants to anon or authenticated. The service role (the
-- deploy step, a server, the CLI) may write the settings and the manifest directly; its setting
-- writes are recorded too, with no person and the source it names in `genesis.setting_source`
-- (`set_config('genesis.setting_source', 'cli', true)`), else `server`.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name (or let
-- `genesis add settings` do it). Never edit it once applied; change it with a new migration. It
-- stands alone.
--
-- Verify: the pgTAP test beside this file (`tests/0020_genesis_settings.test.sql`).

create schema if not exists private;

-- The manifest: one row, written by the service role.
create table public.genesis_app_manifest (
  app_id text primary key
    constraint genesis_app_manifest_app_id_format check (app_id ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  -- Exactly one row: every row has `one = true`, and it is unique.
  one boolean not null default true unique constraint genesis_app_manifest_one_row check (one),
  name text constraint genesis_app_manifest_name_length check (name is null or char_length(name) <= 200),
  -- { "@marktiderman/genesis-support": "0.11.0", … } from genesis.lock.json
  packages jsonb not null default '{}'::jsonb constraint genesis_app_manifest_packages_object check (jsonb_typeof(packages) = 'object'),
  preset text not null default 'max' constraint genesis_app_manifest_preset check (preset in ('max', 'standard', 'min')),
  config_hash text,
  -- genesis.config.json `settings`, as written (a value, or { "value": …, "locked": true }).
  file_settings jsonb not null default '{}'::jsonb constraint genesis_app_manifest_file_settings_object check (jsonb_typeof(file_settings) = 'object'),
  -- { "support.dumpRetentionDays": { "type": "number", "applies": "runtime", "scope": "app", "min": 7, "max": 365 }, … }
  catalogue jsonb not null default '{}'::jsonb constraint genesis_app_manifest_catalogue_object check (jsonb_typeof(catalogue) = 'object'),
  reported_at timestamptz not null default now()
);

comment on table public.genesis_app_manifest is
  'One row: the Genesis packages this app runs, its preset, its file settings and the settings catalogue. Written by the service role on deploy and at app start. Genesis settings.';

create table public.genesis_settings (
  key text primary key
    constraint genesis_settings_key_format check (key ~ '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$' and char_length(key) <= 200),
  value jsonb not null,
  locked boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.genesis_settings is
  'The database layer of Genesis settings: a runtime value per key, locked or not. Written through set_genesis_setting or by the service role. Genesis settings.';

-- Every change, kept. A row is never edited.
create table public.genesis_setting_changes (
  id bigint generated always as identity primary key,
  key text not null,
  -- null on the old side when the row was created, on the new side when it was deleted.
  old_value jsonb,
  new_value jsonb,
  old_locked boolean,
  new_locked boolean,
  changed_by uuid references auth.users (id) on delete set null,
  changed_role text not null,
  source text not null
    constraint genesis_setting_changes_source check (source in ('admin', 'wizard', 'cli', 'central', 'server', 'database')),
  changed_at timestamptz not null default now()
);

create index genesis_setting_changes_key on public.genesis_setting_changes (key, changed_at desc);

comment on table public.genesis_setting_changes is
  'History of public.genesis_settings: who changed which key, when, from where, and the old and new value. Written only by its trigger. Genesis settings.';

-- The hook, asked with the signed-in person. Missing hook, nobody signed in, or a null answer: false.
create or replace function private.genesis_is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or to_regprocedure('private.genesis_platform_admin(uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_platform_admin(me), false);
end;
$$;

-- Why a value can't be stored for a key, by the manifest's catalogue; null when it can.
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
  given text := jsonb_typeof(setting_value);
  n numeric;
begin
  select m.catalogue into cat from public.genesis_app_manifest m limit 1;
  if cat is null or cat = '{}'::jsonb then
    return 'no settings catalogue has been synced yet (write the manifest on deploy: writeAppManifest)';
  end if;
  def := cat -> setting_key;
  if def is null or jsonb_typeof(def) <> 'object' then
    return format('%s isn''t a setting any installed package declares', setting_key);
  end if;
  if coalesce(def ->> 'applies', 'runtime') <> 'runtime' then
    return format('%s applies at build time: change it in genesis.config.json', setting_key);
  end if;
  -- JSON null is "not set", and fits every key.
  if setting_value is null or given = 'null' then
    return null;
  end if;
  kind := def ->> 'type';
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

create or replace function public.set_genesis_setting(key text, value jsonb, locked boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  problem text;
begin
  if me is null then
    raise exception 'set_genesis_setting: not signed in' using errcode = '42501';
  end if;
  if to_regprocedure('private.genesis_platform_admin(uuid)') is null then
    raise exception 'set_genesis_setting: nobody may change settings yet'
      using errcode = '42501', hint = 'Create private.genesis_platform_admin(uuid) (see migration 0020_genesis_settings).';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'set_genesis_setting: only platform admins can change settings' using errcode = '42501';
  end if;
  if key is null or value is null or locked is null then
    raise exception 'set_genesis_setting: key, value and locked are required (JSON null for "not set")' using errcode = '22004';
  end if;
  problem := private.genesis_setting_problem(key, value);
  if problem is not null then
    raise exception 'set_genesis_setting: %', problem using errcode = '22023';
  end if;
  perform set_config('genesis.setting_source', 'admin', true);
  insert into public.genesis_settings as s (key, value, locked, updated_by, updated_at)
  values (set_genesis_setting.key, set_genesis_setting.value, set_genesis_setting.locked, me, now())
  on conflict on constraint genesis_settings_pkey do update
    set value = excluded.value, locked = excluded.locked, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    -- Saving the same value and lock again changes nothing, not even who and when.
    where (s.value, s.locked) is distinct from (excluded.value, excluded.locked);
  -- The source names this write only, not later ones in the same transaction.
  perform set_config('genesis.setting_source', '', true);
end;
$$;

comment on function public.set_genesis_setting(text, jsonb, boolean) is
  'Sets a runtime setting in the database layer, optionally locked. Only platform admins (private.genesis_platform_admin); checked against the manifest''s catalogue. Genesis settings.';

-- Back to the layers below: the database row goes.
create or replace function public.clear_genesis_setting(key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'clear_genesis_setting: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'clear_genesis_setting: only platform admins can change settings'
      using errcode = '42501', hint = 'Create private.genesis_platform_admin(uuid) (see migration 0020_genesis_settings).';
  end if;
  perform set_config('genesis.setting_source', 'admin', true);
  delete from public.genesis_settings s where s.key = clear_genesis_setting.key;
  perform set_config('genesis.setting_source', '', true);
end;
$$;

comment on function public.clear_genesis_setting(text) is
  'Removes a setting from the database layer, so the file, preset or default applies again. Only platform admins. Genesis settings.';

-- The inputs a signed-in client resolves with: the preset, the file's settings and the database
-- layer, each only for keys the catalogue declares as runtime. Never a secret (none is stored).
create or replace function public.genesis_settings_resolved()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.genesis_app_manifest;
  runtime text[];
begin
  if auth.uid() is null then
    raise exception 'genesis_settings_resolved: not signed in' using errcode = '42501';
  end if;
  select * into m from public.genesis_app_manifest limit 1;
  select coalesce(array_agg(c.key), '{}') into runtime
  from jsonb_each(coalesce(m.catalogue, '{}'::jsonb)) c
  where jsonb_typeof(c.value) = 'object' and coalesce(c.value ->> 'applies', 'runtime') = 'runtime';
  return jsonb_build_object(
    'preset', coalesce(m.preset, 'max'),
    'file', coalesce((select jsonb_object_agg(f.key, f.value) from jsonb_each(coalesce(m.file_settings, '{}'::jsonb)) f where f.key = any (runtime)), '{}'::jsonb),
    'database', coalesce((
      select jsonb_object_agg(s.key, jsonb_build_object('value', s.value, 'locked', s.locked))
      from public.genesis_settings s where s.key = any (runtime)
    ), '{}'::jsonb),
    'reportedAt', m.reported_at
  );
end;
$$;

comment on function public.genesis_settings_resolved() is
  'The preset, file settings and database layer for every runtime key, for any signed-in person to resolve with resolveSettings. Genesis settings.';

-- The database layer's history, newest first, at most `max_rows` (1 to 1000). For platform admins.
create or replace function public.genesis_setting_history(max_rows integer default 100)
returns table (key text, old_value jsonb, new_value jsonb, old_locked boolean, new_locked boolean, changed_by uuid, changed_role text, source text, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.genesis_is_platform_admin() then
    raise exception 'genesis_setting_history: only platform admins can read the history' using errcode = '42501';
  end if;
  return query
    select c.key, c.old_value, c.new_value, c.old_locked, c.new_locked, c.changed_by, c.changed_role, c.source, c.changed_at
    from public.genesis_setting_changes c
    order by c.changed_at desc, c.id desc
    limit greatest(1, least(coalesce(max_rows, 100), 1000));
end;
$$;

comment on function public.genesis_setting_history(integer) is
  'Who changed which setting, when, from where, and from what to what, newest first. For platform admins. Genesis settings.';

create or replace function private.genesis_record_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  who_role text := coalesce(nullif(claims ->> 'role', ''), 'database');
  named text := nullif(current_setting('genesis.setting_source', true), '');
  src text;
begin
  -- Only a change of the value or the lock is history: this skips the `on delete set null` of
  -- updated_by when a person is deleted, which would otherwise record them and refuse their deletion.
  if tg_op = 'UPDATE' and new.key = old.key and new.value is not distinct from old.value and new.locked is not distinct from old.locked then
    return null;
  end if;
  src := case
    when named in ('admin', 'wizard', 'cli', 'central', 'server', 'database') then named
    when who_role = 'service_role' then 'server'
    else 'database'
  end;
  insert into public.genesis_setting_changes (key, old_value, new_value, old_locked, new_locked, changed_by, changed_role, source)
  values (
    coalesce(new.key, old.key),
    case when tg_op = 'INSERT' then null else old.value end,
    case when tg_op = 'DELETE' then null else new.value end,
    case when tg_op = 'INSERT' then null else old.locked end,
    case when tg_op = 'DELETE' then null else new.locked end,
    -- Only a login that still exists: one being deleted in this statement is no one.
    (select u.id from auth.users u where u.id = auth.uid()),
    who_role,
    src
  );
  return null;
end;
$$;

create trigger genesis_record_change
  after insert or update or delete on public.genesis_settings
  for each row execute function private.genesis_record_setting_change();

-- Row level security on, with no policies: anon and authenticated reach the tables only through
-- the functions above, even if a later grant lets them try.
alter table public.genesis_app_manifest enable row level security;
alter table public.genesis_settings enable row level security;
alter table public.genesis_setting_changes enable row level security;

-- Privileges by name. Supabase's default privileges give anon and authenticated everything on a
-- new public table and function, and Postgres gives every function to public: take them back,
-- then grant what's needed.
revoke all on table public.genesis_app_manifest from public, anon, authenticated;
revoke all on table public.genesis_settings from public, anon, authenticated;
revoke all on table public.genesis_setting_changes from public, anon, authenticated;
revoke all on sequence public.genesis_setting_changes_id_seq from public, anon, authenticated;
-- The service role writes the manifest and the settings (no truncate: it would skip the history).
revoke all on table public.genesis_app_manifest from service_role;
grant select, insert, update, delete on table public.genesis_app_manifest to service_role;
revoke all on table public.genesis_settings from service_role;
grant select, insert, update, delete on table public.genesis_settings to service_role;
-- The history is the trigger's: the service role may read and purge it, never write it.
revoke all on table public.genesis_setting_changes from service_role;
grant select, delete on table public.genesis_setting_changes to service_role;

revoke execute on function public.set_genesis_setting(text, jsonb, boolean) from public, anon;
grant execute on function public.set_genesis_setting(text, jsonb, boolean) to authenticated;
revoke execute on function public.clear_genesis_setting(text) from public, anon;
grant execute on function public.clear_genesis_setting(text) to authenticated;
revoke execute on function public.genesis_settings_resolved() from public, anon;
grant execute on function public.genesis_settings_resolved() to authenticated, service_role;
revoke execute on function public.genesis_setting_history(integer) from public, anon;
grant execute on function public.genesis_setting_history(integer) to authenticated;

-- Only the functions above call these.
revoke execute on function private.genesis_is_platform_admin() from public, anon, authenticated;
revoke execute on function private.genesis_setting_problem(text, jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_record_setting_change() from public, anon, authenticated;
