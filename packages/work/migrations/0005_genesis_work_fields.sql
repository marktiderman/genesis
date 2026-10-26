-- Genesis work, custom fields: genesis_work.field_definitions and a `custom` column on pursuits,
-- work items, metrics and sessions
--
-- A tenant adds its own fields to genesis-work rows without code or a migration: "Region" on a
-- goal, "Campus" on a metric. A field definition says which table it extends, its key, its label
-- and its field (a genesis-forms serializable field: type, options, validation), and whose it is:
--
--   namespace 'tenant'  the tenant's own fields, added and changed by whoever may write the
--                       tenant's own rows (your owner-access hook decides who that is);
--   namespace '<app>'   an app's or a content pack's fields (for example 'my-app'), added and
--                       written only by server code, so people can read them but not change them.
--
-- Values live in each row's `custom` jsonb, keyed '<namespace>.<key>', with a GIN index. The
-- database checks a value's shape against its field type (text, number, yes or no, a list); the
-- full validation (options, lengths, ranges) runs on the server with the genesis-forms engine. A
-- key with no active definition is refused, so `custom` never becomes a dumping ground. A field
-- that's filtered or joined heavily belongs in a table of your own instead, keyed by the row's id.
--
-- Definitions copied from a content pack keep their source (pack, version, template key), so an
-- update can tell a pack's field from one the tenant changed.
--
-- This file needs 0001 to 0004 and genesis-supabase's 0009_genesis_owner_access.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0004. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0005_genesis_work_fields.test.sql`).

create schema if not exists private;
create schema if not exists genesis_work;

-- Definitions ----------------------------------------------------------------------------------

create table genesis_work.field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  target text not null
    constraint field_definitions_target check (target in ('pursuits', 'work_items', 'metrics', 'sessions')),
  namespace text not null default 'tenant'
    constraint field_definitions_namespace_format check (namespace ~ '^[a-z][a-z0-9-]{0,39}$'),
  key text not null
    constraint field_definitions_key_format check (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  label text not null
    constraint field_definitions_label_length check (char_length(btrim(label)) between 1 and 200),
  -- A genesis-forms serializable field: { "type": ..., "props": ..., "validation": ... }.
  field jsonb not null
    constraint field_definitions_field_object check (jsonb_typeof(field) = 'object'),
  -- Copied from field.type, for the shape check.
  field_type text not null
    constraint field_definitions_field_type check (field_type in (
      'short-text', 'long-text', 'email', 'phone', 'url', 'date', 'time',
      'number', 'rating', 'nps', 'scale', 'yes-no',
      'single-choice', 'dropdown', 'multi-choice', 'list', 'table')),
  required boolean not null default false,
  position integer not null default 0,
  active boolean not null default true,
  source_pack text,
  source_version text,
  source_key text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_definitions_one_per_key unique (tenant_id, target, namespace, key),
  constraint field_definitions_source_pair check ((source_pack is null) = (source_version is null))
);

comment on table genesis_work.field_definitions is
  'A tenant''s or an app''s custom fields on genesis-work rows. Genesis work. @genesis {"label": "Custom fields", "labelField": "label"}';

create index field_definitions_lookup_idx on genesis_work.field_definitions (tenant_id, target, namespace, key) where active;
create index field_definitions_created_by_idx on genesis_work.field_definitions (created_by);

-- The custom column on each extendable table ----------------------------------------------------

alter table genesis_work.pursuits add column custom jsonb not null default '{}'::jsonb
  constraint pursuits_custom_object check (jsonb_typeof(custom) = 'object');
alter table genesis_work.work_items add column custom jsonb not null default '{}'::jsonb
  constraint work_items_custom_object check (jsonb_typeof(custom) = 'object');
alter table genesis_work.metrics add column custom jsonb not null default '{}'::jsonb
  constraint metrics_custom_object check (jsonb_typeof(custom) = 'object');
alter table genesis_work.sessions add column custom jsonb not null default '{}'::jsonb
  constraint sessions_custom_object check (jsonb_typeof(custom) = 'object');

create index pursuits_custom_idx on genesis_work.pursuits using gin (custom jsonb_path_ops);
create index work_items_custom_idx on genesis_work.work_items using gin (custom jsonb_path_ops);
create index metrics_custom_idx on genesis_work.metrics using gin (custom jsonb_path_ops);
create index sessions_custom_idx on genesis_work.sessions using gin (custom jsonb_path_ops);

comment on column genesis_work.pursuits.custom is 'Custom field values, keyed <namespace>.<key>. @genesis {"label": "Custom fields"}';
comment on column genesis_work.work_items.custom is 'Custom field values, keyed <namespace>.<key>. @genesis {"label": "Custom fields"}';
comment on column genesis_work.metrics.custom is 'Custom field values, keyed <namespace>.<key>. @genesis {"label": "Custom fields"}';
comment on column genesis_work.sessions.custom is 'Custom field values, keyed <namespace>.<key>. @genesis {"label": "Custom fields"}';

-- Checks ---------------------------------------------------------------------------------------

create or replace function private.genesis_work_fields_caller_is_person()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_setting('role', true) = 'authenticated'
$$;

-- Whether a value has the shape its field type needs. A null value clears the field.
create or replace function private.genesis_work_field_value_ok(field_type text, value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or jsonb_typeof(value) = 'null' then true
    when field_type in ('short-text', 'long-text', 'email', 'phone', 'url', 'single-choice', 'dropdown')
      then jsonb_typeof(value) = 'string'
    when field_type = 'date' then jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    when field_type = 'time' then jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\d{2}:\d{2}(:\d{2})?$'
    when field_type in ('number', 'rating', 'nps', 'scale') then jsonb_typeof(value) = 'number'
    when field_type = 'yes-no' then jsonb_typeof(value) = 'boolean'
    when field_type in ('multi-choice', 'list') then jsonb_typeof(value) = 'array'
    when field_type = 'table' then jsonb_typeof(value) = 'array'
    else false
  end
$$;

-- A row's custom values: every changed key has an active definition for its tenant and table, its
-- value has the right shape, and a signed-in person changes only the tenant's own fields.
create or replace function private.genesis_work_check_custom()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  ns text;
  fkey text;
  ftype text;
begin
  for k, v in select e.key, e.value from jsonb_each(new.custom) e loop
    -- Only keys that are new or changed are checked, so retiring a field leaves old values alone.
    if tg_op = 'UPDATE' and (old.custom -> k) is not distinct from v then
      continue;
    end if;
    if k !~ '^[a-z][a-z0-9-]{0,39}\.[a-z][a-z0-9_]{0,59}$' then
      raise exception 'A custom value''s key is <namespace>.<key>, not %', k using errcode = '22023';
    end if;
    ns := split_part(k, '.', 1);
    fkey := split_part(k, '.', 2);
    select d.field_type into ftype from genesis_work.field_definitions d
     where d.tenant_id = new.tenant_id and d.target = tg_table_name and d.namespace = ns and d.key = fkey and d.active;
    if ftype is null then
      raise exception 'No custom field % on %', k, tg_table_name using errcode = '22023';
    end if;
    if not private.genesis_work_field_value_ok(ftype, v) then
      raise exception 'The value of % isn''t a %', k, ftype using errcode = '22023';
    end if;
    if ns <> 'tenant' and private.genesis_work_fields_caller_is_person() then
      raise exception 'Only server code writes the % fields', ns using errcode = '42501';
    end if;
  end loop;
  -- A signed-in person doesn't remove an app's values either.
  if tg_op = 'UPDATE' and private.genesis_work_fields_caller_is_person() then
    for k in select e.key from jsonb_each(old.custom) e loop
      if split_part(k, '.', 1) <> 'tenant' and not (new.custom ? k) then
        raise exception 'Only server code writes the % fields', split_part(k, '.', 1) using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger pursuits_check_custom before insert or update of custom on genesis_work.pursuits
  for each row execute function private.genesis_work_check_custom();
create trigger work_items_check_custom before insert or update of custom on genesis_work.work_items
  for each row execute function private.genesis_work_check_custom();
create trigger metrics_check_custom before insert or update of custom on genesis_work.metrics
  for each row execute function private.genesis_work_check_custom();
create trigger sessions_check_custom before insert or update of custom on genesis_work.sessions
  for each row execute function private.genesis_work_check_custom();

-- Definitions: field_type from the field, who made it, the fixed tenant, and only server code
-- touches an app's namespace. A field's type changes only while no row holds a value for it.
create or replace function private.genesis_work_field_definitions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  in_use boolean;
begin
  new.field_type := new.field ->> 'type';
  if private.genesis_work_fields_caller_is_person() then
    if new.namespace <> 'tenant' then
      raise exception 'Only server code manages the % fields', new.namespace using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if (new.tenant_id, new.target, new.namespace, new.key) is distinct from (old.tenant_id, old.target, old.namespace, old.key) then
      raise exception 'A custom field''s tenant, table, namespace and key never change' using errcode = '22023';
    end if;
    if new.field_type is distinct from old.field_type then
      execute format('select exists (select 1 from genesis_work.%I r where r.tenant_id = $1 and r.custom ? $2)', old.target)
        into in_use using old.tenant_id, old.namespace || '.' || old.key;
      if in_use then
        raise exception 'A custom field''s type is fixed once rows hold values for it' using errcode = '22023';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger field_definitions_guard
  before insert or update on genesis_work.field_definitions
  for each row execute function private.genesis_work_field_definitions_guard();

revoke execute on function private.genesis_work_fields_caller_is_person() from public, anon, authenticated;
revoke execute on function private.genesis_work_field_value_ok(text, jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_work_check_custom() from public, anon, authenticated;
revoke execute on function private.genesis_work_field_definitions_guard() from public, anon, authenticated;

-- Access ---------------------------------------------------------------------------------------
-- A tenant's fields are the tenant's own rows: whoever may read the tenant's own rows reads them,
-- and whoever may write them manages the tenant's fields.

alter table genesis_work.field_definitions enable row level security;

create policy field_definitions_read on genesis_work.field_definitions for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = field_definitions.tenant_id and r.owner_id = field_definitions.tenant_id));
create policy field_definitions_write on genesis_work.field_definitions for all to authenticated
  using (namespace = 'tenant' and private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'))
  with check (namespace = 'tenant' and private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));

revoke all on genesis_work.field_definitions from public, anon, authenticated;
grant select, insert, update, delete on genesis_work.field_definitions to authenticated;
grant all on genesis_work.field_definitions to service_role;
