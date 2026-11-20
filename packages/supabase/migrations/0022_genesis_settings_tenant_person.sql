-- Genesis settings 0022: the tenant and person layers, and Realtime refresh (after
-- 0020_genesis_settings.sql and 0021_genesis_settings_integer.sql).
--
-- resolveSettings (genesis-config) resolves default → preset → file → database → tenant → person.
-- 0020 stores the first four; this file stores the last two:
--
--   genesis_tenant_settings   a tenant's value per key, only for keys the catalogue declares
--                             `scope: "tenant"`. Set by the tenant's admins, for their own tenant.
--   genesis_person_settings   a person's value per key, only for keys declared `scope: "person"`.
--                             Set by the person, for themselves.
--   genesis_scoped_setting_changes
--                             every change to either (who, when, the old and new value).
--
-- Both writes are checked like set_genesis_setting's (0020): the key must be declared, apply at
-- runtime and fit its type and bounds. A key genesis.config.json locks, or the database layer
-- locks (genesis_settings.locked), is refused: a later layer can't change it. A tenant or person
-- value carries no lock of its own: under the scope rule nothing after it may set the same key.
--
-- genesis_settings_layers(tenant), beside 0020's genesis_settings_layers(), also returns the tenant
-- layer (the given tenant's, for its members, its admins and platform admins; {} for null) and the
-- person layer (the signed-in person's).
--
-- The app hooks (as in 0004_genesis_tenant_features; none is created here):
--   private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean  who may set a tenant's
--     values. Without it nobody can (42501, with a hint): a fresh install fails closed.
--   private.genesis_tenant_member(tenant uuid, person uuid) returns boolean  optional: who may read
--     a tenant's values (its admins always may).
--   private.genesis_platform_admin(person uuid) returns boolean  (0020): platform admins read every
--     tenant's and person's values and the history; they don't write tenant or person values.
--
-- Your tenant table: add the foreign key yourself in a later migration, so a deleted tenant takes
-- its values and their history with it:
--
--   alter table public.genesis_tenant_settings add foreign key (tenant_id) references public.teams (id) on delete cascade;
--   alter table public.genesis_scoped_setting_changes add foreign key (tenant_id) references public.teams (id) on delete cascade;
--
-- A deleted person takes their values and their history with them.
--
-- Realtime: a change to genesis_settings, genesis_tenant_settings or genesis_person_settings is
-- broadcast (realtime.send, private channels) on `genesis-settings` (the database layer, every
-- signed-in person), `genesis-settings:tenant:<tenant uuid>` and `genesis-settings:person:<person
-- uuid>`, with the layer and key only, never the value. Who may listen is a policy on
-- realtime.messages: the same people who may read that layer. Clients re-read the layers
-- (watchAppSettings in genesis-supabase). Without Realtime (no realtime.send), nothing is sent.
--
-- Access: writes only through the functions below (security definer). The tables have row level
-- security on; anon has nothing, authenticated may only select what the policies allow: a tenant's
-- members and admins its values and their history, a person their own, platform admins everything.
-- The service role may write the values directly (recorded, with no person).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0020 and 0021 (`genesis migrate` does it). Never edit it once applied.
--
-- Verify: the pgTAP test beside this file (`tests/0022_genesis_settings_tenant_person.test.sql`).

create schema if not exists private;

create table public.genesis_tenant_settings (
  tenant_id uuid not null,
  key text not null
    constraint genesis_tenant_settings_key_format check (key ~ '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$' and char_length(key) <= 200),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

comment on table public.genesis_tenant_settings is
  'The tenant layer of Genesis settings: a tenant''s value per key declared scope "tenant". Written through set_genesis_tenant_setting or by the service role. Genesis settings.';

create table public.genesis_person_settings (
  person_id uuid not null references auth.users (id) on delete cascade,
  key text not null
    constraint genesis_person_settings_key_format check (key ~ '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$' and char_length(key) <= 200),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (person_id, key)
);

comment on table public.genesis_person_settings is
  'The person layer of Genesis settings: a person''s own value per key declared scope "person". Written through set_genesis_person_setting or by the service role. Genesis settings.';

-- Every change to either table, kept. A row is never edited.
create table public.genesis_scoped_setting_changes (
  id bigint generated always as identity primary key,
  layer text not null,
  tenant_id uuid,
  person_id uuid references auth.users (id) on delete cascade,
  key text not null,
  -- null on the old side when the value was created, on the new side when it was cleared.
  old_value jsonb,
  new_value jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  changed_role text not null,
  changed_at timestamptz not null default now(),
  constraint genesis_scoped_setting_changes_owner check (
    (layer = 'tenant' and tenant_id is not null and person_id is null)
    or (layer = 'person' and person_id is not null and tenant_id is null)
  )
);

create index genesis_scoped_setting_changes_tenant on public.genesis_scoped_setting_changes (tenant_id, changed_at desc) where tenant_id is not null;
create index genesis_scoped_setting_changes_person on public.genesis_scoped_setting_changes (person_id, changed_at desc) where person_id is not null;

comment on table public.genesis_scoped_setting_changes is
  'History of public.genesis_tenant_settings and public.genesis_person_settings: who changed which key, when, from what to what. Written only by their trigger. Genesis settings.';

-- The hooks, asked with the signed-in person. Missing hook, nobody signed in, or a null answer: false.
create or replace function private.genesis_settings_tenant_admin(tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or tenant is null or to_regprocedure('private.genesis_tenant_admin(uuid,uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_tenant_admin(tenant, me), false);
end;
$$;

-- Who may read: the person themself, the tenant's members and admins, and platform admins. Also
-- what the policies below and the Realtime channels ask, so it is the one public helper.
create or replace function public.genesis_settings_can_read(tenant uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or (tenant is null) = (person is null) then
    return false;
  end if;
  if person is not null and person = me then
    return true;
  end if;
  if private.genesis_is_platform_admin() then
    return true;
  end if;
  if tenant is null then
    return false;
  end if;
  -- Two statements: an expression naming a missing function fails even behind `and`.
  if to_regprocedure('private.genesis_tenant_member(uuid,uuid)') is not null then
    if coalesce(private.genesis_tenant_member(tenant, me), false) then
      return true;
    end if;
  end if;
  return private.genesis_settings_tenant_admin(tenant);
end;
$$;

comment on function public.genesis_settings_can_read(uuid, uuid) is
  'Whether the signed-in person may read a tenant''s (tenant, null) or a person''s (null, person) settings: the person themself, the tenant''s members and admins, platform admins. Genesis settings.';

-- Why a value can't be stored in the tenant or person layer; null when it can. 0020's checks, then
-- the scope, then a lock in the database layer.
create or replace function private.genesis_scoped_setting_problem(layer text, setting_key text, setting_value jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  problem text := private.genesis_setting_problem(setting_key, setting_value);
  scope text;
begin
  if problem is not null then
    return problem;
  end if;
  select coalesce(m.catalogue -> setting_key ->> 'scope', 'app') into scope from public.genesis_app_manifest m limit 1;
  if scope is distinct from layer then
    return format('%s has scope "%s": the %s layer can''t change it', setting_key, coalesce(scope, 'app'), layer);
  end if;
  if exists (select 1 from public.genesis_settings s where s.key = setting_key and s.locked) then
    return format('%s is locked in the database layer: a platform admin changes it there', setting_key);
  end if;
  return null;
end;
$$;

create or replace function public.set_genesis_tenant_setting(tenant uuid, key text, value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored jsonb := coalesce(set_genesis_tenant_setting.value, 'null'::jsonb);
  problem text;
begin
  if me is null then
    raise exception 'set_genesis_tenant_setting: not signed in' using errcode = '42501';
  end if;
  if tenant is null or key is null then
    raise exception 'set_genesis_tenant_setting: tenant and key are required' using errcode = '22004';
  end if;
  if to_regprocedure('private.genesis_tenant_admin(uuid,uuid)') is null then
    raise exception 'set_genesis_tenant_setting: nobody may change tenant settings yet'
      using errcode = '42501', hint = 'Create private.genesis_tenant_admin(uuid, uuid) (see migration 0022_genesis_settings_tenant_person).';
  end if;
  if not private.genesis_settings_tenant_admin(tenant) then
    raise exception 'set_genesis_tenant_setting: only the tenant''s admins can change its settings' using errcode = '42501';
  end if;
  problem := private.genesis_scoped_setting_problem('tenant', key, stored);
  if problem is not null then
    raise exception 'set_genesis_tenant_setting: %', problem using errcode = '22023';
  end if;
  insert into public.genesis_tenant_settings as s (tenant_id, key, value, updated_by, updated_at)
  values (tenant, set_genesis_tenant_setting.key, stored, me, now())
  on conflict on constraint genesis_tenant_settings_pkey do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    -- Saving the same value again changes nothing, not even who and when.
    where s.value is distinct from excluded.value;
end;
$$;

comment on function public.set_genesis_tenant_setting(uuid, text, jsonb) is
  'Sets a tenant''s value for a key declared scope "tenant". Only the tenant''s admins (private.genesis_tenant_admin); checked against the catalogue, refused when the file or database layer locks the key. Genesis settings.';

create or replace function public.clear_genesis_tenant_setting(tenant uuid, key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'clear_genesis_tenant_setting: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_settings_tenant_admin(tenant) then
    raise exception 'clear_genesis_tenant_setting: only the tenant''s admins can change its settings'
      using errcode = '42501', hint = 'Create private.genesis_tenant_admin(uuid, uuid) (see migration 0022_genesis_settings_tenant_person).';
  end if;
  delete from public.genesis_tenant_settings s where s.tenant_id = tenant and s.key = clear_genesis_tenant_setting.key;
end;
$$;

comment on function public.clear_genesis_tenant_setting(uuid, text) is
  'Removes a tenant''s value, so the app''s applies again. Only the tenant''s admins. Genesis settings.';

create or replace function public.set_genesis_person_setting(key text, value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored jsonb := coalesce(set_genesis_person_setting.value, 'null'::jsonb);
  problem text;
begin
  if me is null then
    raise exception 'set_genesis_person_setting: not signed in' using errcode = '42501';
  end if;
  if key is null then
    raise exception 'set_genesis_person_setting: key is required' using errcode = '22004';
  end if;
  problem := private.genesis_scoped_setting_problem('person', key, stored);
  if problem is not null then
    raise exception 'set_genesis_person_setting: %', problem using errcode = '22023';
  end if;
  insert into public.genesis_person_settings as s (person_id, key, value, updated_at)
  values (me, set_genesis_person_setting.key, stored, now())
  on conflict on constraint genesis_person_settings_pkey do update
    set value = excluded.value, updated_at = excluded.updated_at
    where s.value is distinct from excluded.value;
end;
$$;

comment on function public.set_genesis_person_setting(text, jsonb) is
  'Sets the signed-in person''s own value for a key declared scope "person"; checked against the catalogue, refused when the file or database layer locks the key. Genesis settings.';

create or replace function public.clear_genesis_person_setting(key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'clear_genesis_person_setting: not signed in' using errcode = '42501';
  end if;
  delete from public.genesis_person_settings s where s.person_id = me and s.key = clear_genesis_person_setting.key;
end;
$$;

comment on function public.clear_genesis_person_setting(text) is
  'Removes the signed-in person''s own value, so the tenant''s or app''s applies again. Genesis settings.';

-- The layers a client resolves, with the tenant and person layers: 0020's genesis_settings_layers()
-- plus `tenant` (the given tenant's, or {} for null) and `person` (the signed-in person's). 0020's
-- function stays as it was, for clients that don't send a tenant.
create function public.genesis_settings_layers(tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  server boolean := private.genesis_settings_caller_is_server();
  m public.genesis_app_manifest;
  declared text[];
  runtime text[];
  tenant_keys text[];
  person_keys text[];
begin
  if me is null and not server then
    raise exception 'genesis_settings_layers: not signed in' using errcode = '42501';
  end if;
  if tenant is not null and not server and not public.genesis_settings_can_read(tenant, null) then
    raise exception 'genesis_settings_layers: only the tenant''s members can read its settings' using errcode = '42501';
  end if;
  select * into m from public.genesis_app_manifest limit 1;
  select coalesce(array_agg(c.key), '{}'),
         coalesce(array_agg(c.key) filter (where coalesce(c.value ->> 'applies', 'runtime') = 'runtime'), '{}'),
         coalesce(array_agg(c.key) filter (where coalesce(c.value ->> 'applies', 'runtime') = 'runtime' and c.value ->> 'scope' = 'tenant'), '{}'),
         coalesce(array_agg(c.key) filter (where coalesce(c.value ->> 'applies', 'runtime') = 'runtime' and c.value ->> 'scope' = 'person'), '{}')
    into declared, runtime, tenant_keys, person_keys
  from jsonb_each(coalesce(m.catalogue, '{}'::jsonb)) c
  where jsonb_typeof(c.value) = 'object';
  return jsonb_build_object(
    'preset', coalesce(m.preset, 'max'),
    'file', coalesce((select jsonb_object_agg(f.key, f.value) from jsonb_each(coalesce(m.file_settings, '{}'::jsonb)) f where f.key = any (declared)), '{}'::jsonb),
    'database', coalesce((
      select jsonb_object_agg(s.key, jsonb_build_object('value', s.value, 'locked', s.locked))
      from public.genesis_settings s where s.key = any (runtime)
    ), '{}'::jsonb),
    'tenant', coalesce((
      select jsonb_object_agg(t.key, jsonb_build_object('value', t.value))
      from public.genesis_tenant_settings t where tenant is not null and t.tenant_id = tenant and t.key = any (tenant_keys)
    ), '{}'::jsonb),
    'person', coalesce((
      select jsonb_object_agg(p.key, jsonb_build_object('value', p.value))
      from public.genesis_person_settings p where me is not null and p.person_id = me and p.key = any (person_keys)
    ), '{}'::jsonb),
    'reportedAt', m.reported_at
  );
end;
$$;

comment on function public.genesis_settings_layers(uuid) is
  'The preset, the file settings, the database layer, the given tenant''s layer (for its members) and the signed-in person''s layer, for resolveSettings. Genesis settings.';

create or replace function private.genesis_settings_announce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  topic text;
  layer text;
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return null;
  end if;
  if tg_op = 'DELETE' then
    r := to_jsonb(old);
  else
    r := to_jsonb(new);
  end if;
  if tg_table_name = 'genesis_tenant_settings' then
    layer := 'tenant';
    topic := 'genesis-settings:tenant:' || (r ->> 'tenant_id');
  elsif tg_table_name = 'genesis_person_settings' then
    layer := 'person';
    topic := 'genesis-settings:person:' || (r ->> 'person_id');
  else
    layer := 'database';
    topic := 'genesis-settings';
  end if;
  begin
    execute 'select realtime.send($1, $2, $3, true)' using jsonb_build_object('layer', layer, 'key', r ->> 'key'), 'changed', topic;
  exception
    when others then
      null;
  end;
  return null;
end;
$$;

create trigger genesis_settings_announce
  after insert or update or delete on public.genesis_settings
  for each row execute function private.genesis_settings_announce();
create trigger genesis_settings_announce
  after insert or update or delete on public.genesis_tenant_settings
  for each row execute function private.genesis_settings_announce();
create trigger genesis_settings_announce
  after insert or update or delete on public.genesis_person_settings
  for each row execute function private.genesis_settings_announce();

create or replace function private.genesis_record_scoped_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  who_role text := coalesce(nullif(claims ->> 'role', ''), 'database');
  -- Only a login that still exists: one being deleted in this statement is no one.
  who uuid := (select u.id from auth.users u where u.id = auth.uid());
  layer text := case when tg_table_name = 'genesis_tenant_settings' then 'tenant' else 'person' end;
  owner_col text := case when tg_table_name = 'genesis_tenant_settings' then 'tenant_id' else 'person_id' end;
  o jsonb;
  n jsonb;
  entries jsonb[];
  e jsonb;
  owner uuid;
begin
  if tg_op <> 'INSERT' then
    o := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    n := to_jsonb(new);
  end if;
  if tg_op = 'UPDATE' and o -> 'value' = n -> 'value' and o ->> 'key' = n ->> 'key' and o ->> owner_col = n ->> owner_col then
    return null;
  end if;
  -- A change of owner or key is two changes: the old one goes, the new one comes.
  if tg_op = 'UPDATE' and (o ->> 'key' <> n ->> 'key' or o ->> owner_col <> n ->> owner_col) then
    entries := array[jsonb_build_object('at', o, 'old', o -> 'value'), jsonb_build_object('at', n, 'new', n -> 'value')];
  else
    entries := array[
      jsonb_build_object('at', coalesce(n, o))
      || case when o is null then '{}'::jsonb else jsonb_build_object('old', o -> 'value') end
      || case when n is null then '{}'::jsonb else jsonb_build_object('new', n -> 'value') end
    ];
  end if;
  foreach e in array entries loop
    owner := (e -> 'at' ->> owner_col)::uuid;
    -- The person is being deleted: their history goes with them, so record nothing.
    if layer = 'person' and not exists (select 1 from auth.users u where u.id = owner) then
      continue;
    end if;
    insert into public.genesis_scoped_setting_changes (layer, tenant_id, person_id, key, old_value, new_value, changed_by, changed_role)
    values (
      layer,
      case when layer = 'tenant' then owner end,
      case when layer = 'person' then owner end,
      e -> 'at' ->> 'key',
      e -> 'old',
      e -> 'new',
      who,
      who_role
    );
  end loop;
  return null;
end;
$$;

create trigger genesis_record_change
  after insert or update or delete on public.genesis_tenant_settings
  for each row execute function private.genesis_record_scoped_setting_change();
create trigger genesis_record_change
  after insert or update or delete on public.genesis_person_settings
  for each row execute function private.genesis_record_scoped_setting_change();

-- Row level security: reads by the policies, writes only through the functions above.
alter table public.genesis_tenant_settings enable row level security;
alter table public.genesis_person_settings enable row level security;
alter table public.genesis_scoped_setting_changes enable row level security;

create policy genesis_tenant_settings_read on public.genesis_tenant_settings
  for select to authenticated using (public.genesis_settings_can_read(tenant_id, null));
create policy genesis_person_settings_read on public.genesis_person_settings
  for select to authenticated using (public.genesis_settings_can_read(null, person_id));
create policy genesis_scoped_setting_changes_read on public.genesis_scoped_setting_changes
  for select to authenticated using (public.genesis_settings_can_read(tenant_id, person_id));

-- Who may listen on the settings channels: anyone signed in on `genesis-settings`, else whoever
-- may read that tenant's or person's settings.
do $rt$
begin
  if to_regclass('realtime.messages') is not null
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'genesis_settings_listen') then
    execute $p$
      create policy genesis_settings_listen on realtime.messages
        for select to authenticated
        using (
          extension = 'broadcast'
          and case
            when realtime.topic() = 'genesis-settings' then (select auth.uid()) is not null
            when realtime.topic() ~ '^genesis-settings:tenant:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.genesis_settings_can_read(substr(realtime.topic(), 25)::uuid, null)
            when realtime.topic() ~ '^genesis-settings:person:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.genesis_settings_can_read(null, substr(realtime.topic(), 25)::uuid)
            else false
          end
        )
    $p$;
  end if;
end;
$rt$;

-- Privileges by name.
revoke all on table public.genesis_tenant_settings from public, anon, authenticated;
revoke all on table public.genesis_person_settings from public, anon, authenticated;
revoke all on table public.genesis_scoped_setting_changes from public, anon, authenticated;
revoke all on sequence public.genesis_scoped_setting_changes_id_seq from public, anon, authenticated;
grant select on table public.genesis_tenant_settings to authenticated;
grant select on table public.genesis_person_settings to authenticated;
grant select on table public.genesis_scoped_setting_changes to authenticated;
-- The service role may write the values (no truncate: it would skip the history) and reads the history.
revoke all on table public.genesis_tenant_settings from service_role;
grant select, insert, update, delete on table public.genesis_tenant_settings to service_role;
revoke all on table public.genesis_person_settings from service_role;
grant select, insert, update, delete on table public.genesis_person_settings to service_role;
revoke all on table public.genesis_scoped_setting_changes from service_role;
grant select on table public.genesis_scoped_setting_changes to service_role;

revoke execute on function public.genesis_settings_can_read(uuid, uuid) from public, anon;
grant execute on function public.genesis_settings_can_read(uuid, uuid) to authenticated;
revoke execute on function public.set_genesis_tenant_setting(uuid, text, jsonb) from public, anon;
grant execute on function public.set_genesis_tenant_setting(uuid, text, jsonb) to authenticated;
revoke execute on function public.clear_genesis_tenant_setting(uuid, text) from public, anon;
grant execute on function public.clear_genesis_tenant_setting(uuid, text) to authenticated;
revoke execute on function public.set_genesis_person_setting(text, jsonb) from public, anon;
grant execute on function public.set_genesis_person_setting(text, jsonb) to authenticated;
revoke execute on function public.clear_genesis_person_setting(text) from public, anon;
grant execute on function public.clear_genesis_person_setting(text) to authenticated;
revoke execute on function public.genesis_settings_layers(uuid) from public, anon;
grant execute on function public.genesis_settings_layers(uuid) to authenticated, service_role;

-- Only the functions above call these.
revoke execute on function private.genesis_settings_tenant_admin(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_scoped_setting_problem(text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_settings_announce() from public, anon, authenticated;
revoke execute on function private.genesis_record_scoped_setting_change() from public, anon, authenticated;
