-- Genesis work, content packs: genesis_work.installed_packs, genesis_work.metric_templates,
-- genesis_work.labels, and genesis_work.install_content_pack / uninstall_content_pack
--
-- A content pack is starting content for a tenant. This file is only the installer: packs are
-- defined in code with defineContentPack (genesis-features) and shipped in the genesis-content
-- package or an app's own. Installing copies a pack into the tenant's own, editable rows:
--
--   sessionTypes      -> genesis_work.session_types (owned by the tenant)
--   metricTemplates   -> genesis_work.metric_templates (a tenant's catalog; teams make metrics from
--                        them, linked by template_key)
--   fieldDefinitions  -> genesis_work.field_definitions (in the pack's namespace, so only server
--                        code writes their values)
--   labels            -> genesis_work.labels (the tenant's words: a taxonomy map)
--
-- Forms and roadmap templates belong to the app (its forms and plans tables) and are installed by
-- the app from the same manifest.
--
-- Every installed row keeps its source: the pack, its version, the template key, and a hash of
-- what the pack installed. Installing again, or a newer version, is idempotent and additive:
--   - a row the pack added and nobody changed since is updated to the new version;
--   - a row the tenant changed (its content no longer matches the hash) is kept and reported;
--   - a template the new version no longer has is left alone.
-- Uninstalling removes the pack's rows that nobody changed and nothing uses (a session type no
-- session uses, a field no row holds a value for), keeps the rest, and forgets the install. It
-- never touches people's own data.
--
-- Packs are installed by server code (the service role), after it checks who asked: a tenant's
-- admin, through the app. Signed-in people read what's installed and the rows, and edit the rows
-- as their owner-access rules allow.
--
-- This file needs 0001 to 0005 and genesis-supabase's 0009_genesis_owner_access.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0005. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0006_genesis_work_packs.test.sql`).

create schema if not exists private;
create schema if not exists genesis_work;

-- Tables ---------------------------------------------------------------------------------------

create table genesis_work.installed_packs (
  tenant_id uuid not null,
  pack_id text not null
    constraint installed_packs_id_format check (pack_id ~ '^[a-z][a-z0-9-]{0,39}$'),
  version text not null
    constraint installed_packs_version_format check (version ~ '^\d+\.\d+\.\d+$'),
  installed_by uuid references auth.users (id) on delete set null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, pack_id)
);

comment on table genesis_work.installed_packs is
  'Which content packs a tenant installed, at which version. Written by install_content_pack. Genesis work.';

create table genesis_work.metric_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_key text not null
    constraint metric_templates_key_format check (template_key ~ '^[a-z][a-z0-9_-]{0,59}$'),
  name text not null
    constraint metric_templates_name_length check (char_length(btrim(name)) between 1 and 200),
  description text,
  unit_type text not null default 'number'
    constraint metric_templates_unit_type check (unit_type in ('number', 'currency', 'percent', 'yes_no', 'duration')),
  unit text,
  cadence text not null default 'weekly'
    constraint metric_templates_cadence check (cadence in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  goal_direction text not null default 'at_least'
    constraint metric_templates_goal_direction check (goal_direction in ('at_least', 'at_most', 'between', 'none')),
  goal_value numeric,
  goal_max numeric,
  measure_kind text
    constraint metric_templates_measure_kind check (measure_kind in ('leading', 'lagging')),
  rollup text not null default 'sum'
    constraint metric_templates_rollup check (rollup in ('sum', 'average', 'latest', 'none')),
  source_pack text,
  source_version text,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_templates_one_per_key unique (tenant_id, template_key)
);

comment on table genesis_work.metric_templates is
  'A tenant''s catalog of metrics teams can track; a metric made from one shares its template_key. Genesis work. @genesis {"label": "Metric templates", "labelField": "name"}';

create table genesis_work.labels (
  tenant_id uuid not null,
  label_key text not null
    constraint labels_key_format check (label_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  text text not null
    constraint labels_text_length check (char_length(btrim(text)) between 1 and 100),
  source_pack text,
  source_version text,
  source_hash text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, label_key)
);

comment on table genesis_work.labels is
  'A tenant''s words for things (its taxonomy map), such as what a quarterly goal is called. Genesis work.';

alter table genesis_work.session_types
  add column source_pack text,
  add column source_version text,
  add column source_key text,
  add column source_hash text;
alter table genesis_work.field_definitions add column source_hash text;

create unique index session_types_source_idx on genesis_work.session_types (tenant_id, source_pack, source_key) where source_pack is not null;

-- Content hashes: what a pack installed, so a tenant's change is recognised --------------------

create or replace function private.genesis_work_hash(content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(content::text)
$$;

create or replace function private.genesis_work_session_type_content(t genesis_work.session_types)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind', t.kind, 'name', t.name, 'description', t.description,
                            'default_minutes', t.default_minutes, 'agenda', t.agenda)
$$;
create or replace function private.genesis_work_metric_template_content(t genesis_work.metric_templates)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('name', t.name, 'description', t.description, 'unit_type', t.unit_type, 'unit', t.unit,
                            'cadence', t.cadence, 'goal_direction', t.goal_direction, 'goal_value', t.goal_value,
                            'goal_max', t.goal_max, 'measure_kind', t.measure_kind, 'rollup', t.rollup)
$$;
create or replace function private.genesis_work_field_content(t genesis_work.field_definitions)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('label', t.label, 'field', t.field, 'required', t.required)
$$;

-- Install --------------------------------------------------------------------------------------

-- Installs or updates a pack for a tenant from its manifest (the JSON form of defineContentPack).
-- Returns { added, updated, kept } with the template keys in each.
create or replace function genesis_work.install_content_pack(tenant uuid, manifest jsonb, installed_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pack text := manifest ->> 'id';
  ver text := manifest ->> 'version';
  item jsonb;
  k text;
  content jsonb;
  h text;
  added text[] := '{}';
  updated text[] := '{}';
  kept text[] := '{}';
  st genesis_work.session_types;
  mt genesis_work.metric_templates;
  fd genesis_work.field_definitions;
  lb genesis_work.labels;
begin
  if tenant is null or pack is null or ver is null then
    raise exception 'A pack install needs a tenant, the pack''s id and its version' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('genesis_work_pack:' || tenant::text, 0));

  -- Session types.
  for item in select * from jsonb_array_elements(coalesce(manifest -> 'sessionTypes', '[]'::jsonb)) loop
    k := item ->> 'key';
    content := jsonb_build_object('kind', coalesce(item ->> 'kind', 'meeting'), 'name', item ->> 'name',
      'description', item ->> 'description', 'default_minutes', (item ->> 'defaultMinutes')::int,
      'agenda', coalesce(item -> 'agenda', '[]'::jsonb));
    h := private.genesis_work_hash(content);
    select * into st from genesis_work.session_types s where s.tenant_id = tenant and s.source_pack = pack and s.source_key = k;
    if st.id is null then
      insert into genesis_work.session_types (tenant_id, organization_id, kind, name, description, default_minutes, agenda,
                                              source_pack, source_version, source_key, source_hash)
      values (tenant, tenant, content ->> 'kind', content ->> 'name', content ->> 'description',
              (content ->> 'default_minutes')::int, content -> 'agenda', pack, ver, k, h);
      added := added || ('sessionTypes.' || k);
    elsif private.genesis_work_hash(private.genesis_work_session_type_content(st)) is distinct from st.source_hash then
      kept := kept || ('sessionTypes.' || k);
    elsif st.source_hash is distinct from h then
      update genesis_work.session_types s
         set kind = content ->> 'kind', name = content ->> 'name', description = content ->> 'description',
             default_minutes = (content ->> 'default_minutes')::int, agenda = content -> 'agenda',
             source_version = ver, source_hash = h
       where s.id = st.id;
      updated := updated || ('sessionTypes.' || k);
    else
      update genesis_work.session_types s set source_version = ver where s.id = st.id;
    end if;
  end loop;

  -- Metric templates.
  for item in select * from jsonb_array_elements(coalesce(manifest -> 'metricTemplates', '[]'::jsonb)) loop
    k := item ->> 'key';
    content := jsonb_build_object('name', item ->> 'name', 'description', item ->> 'description',
      'unit_type', coalesce(item ->> 'unitType', 'number'), 'unit', item ->> 'unit',
      'cadence', coalesce(item ->> 'cadence', 'weekly'), 'goal_direction', coalesce(item ->> 'goalDirection', 'at_least'),
      'goal_value', (item ->> 'goalValue')::numeric, 'goal_max', (item ->> 'goalMax')::numeric,
      'measure_kind', item ->> 'measureKind', 'rollup', coalesce(item ->> 'rollup', 'sum'));
    h := private.genesis_work_hash(content);
    select * into mt from genesis_work.metric_templates m where m.tenant_id = tenant and m.template_key = k;
    if mt.id is null then
      insert into genesis_work.metric_templates (tenant_id, template_key, name, description, unit_type, unit, cadence,
        goal_direction, goal_value, goal_max, measure_kind, rollup, source_pack, source_version, source_hash)
      values (tenant, k, content ->> 'name', content ->> 'description', content ->> 'unit_type', content ->> 'unit',
        content ->> 'cadence', content ->> 'goal_direction', (content ->> 'goal_value')::numeric, (content ->> 'goal_max')::numeric,
        content ->> 'measure_kind', content ->> 'rollup', pack, ver, h);
      added := added || ('metricTemplates.' || k);
    elsif mt.source_pack is distinct from pack
       or private.genesis_work_hash(private.genesis_work_metric_template_content(mt)) is distinct from mt.source_hash then
      kept := kept || ('metricTemplates.' || k);
    elsif mt.source_hash is distinct from h then
      update genesis_work.metric_templates m
         set name = content ->> 'name', description = content ->> 'description', unit_type = content ->> 'unit_type',
             unit = content ->> 'unit', cadence = content ->> 'cadence', goal_direction = content ->> 'goal_direction',
             goal_value = (content ->> 'goal_value')::numeric, goal_max = (content ->> 'goal_max')::numeric,
             measure_kind = content ->> 'measure_kind', rollup = content ->> 'rollup',
             source_version = ver, source_hash = h, updated_at = now()
       where m.id = mt.id;
      updated := updated || ('metricTemplates.' || k);
    else
      update genesis_work.metric_templates m set source_version = ver where m.id = mt.id;
    end if;
  end loop;

  -- Field definitions, in the pack's namespace.
  for item in select * from jsonb_array_elements(coalesce(manifest -> 'fieldDefinitions', '[]'::jsonb)) loop
    k := item ->> 'key';
    content := jsonb_build_object('label', item ->> 'label', 'field', item -> 'field',
                                  'required', coalesce((item ->> 'required')::boolean, false));
    h := private.genesis_work_hash(content);
    select * into fd from genesis_work.field_definitions f
     where f.tenant_id = tenant and f.target = item ->> 'target' and f.namespace = pack and f.key = k;
    if fd.id is null then
      insert into genesis_work.field_definitions (tenant_id, target, namespace, key, label, field, required,
                                                   source_pack, source_version, source_key, source_hash)
      values (tenant, item ->> 'target', pack, k, content ->> 'label', content -> 'field', (content ->> 'required')::boolean,
              pack, ver, k, h);
      added := added || ('fieldDefinitions.' || k);
    elsif private.genesis_work_hash(private.genesis_work_field_content(fd)) is distinct from fd.source_hash then
      kept := kept || ('fieldDefinitions.' || k);
    elsif fd.source_hash is distinct from h then
      update genesis_work.field_definitions f
         set label = content ->> 'label', field = content -> 'field', required = (content ->> 'required')::boolean,
             source_version = ver, source_hash = h
       where f.id = fd.id;
      updated := updated || ('fieldDefinitions.' || k);
    else
      update genesis_work.field_definitions f set source_version = ver where f.id = fd.id;
    end if;
  end loop;

  -- Labels.
  for k, content in select e.key, e.value from jsonb_each(coalesce(manifest -> 'labels', '{}'::jsonb)) e loop
    h := private.genesis_work_hash(content);
    select * into lb from genesis_work.labels l where l.tenant_id = tenant and l.label_key = k;
    if lb.label_key is null then
      insert into genesis_work.labels (tenant_id, label_key, text, source_pack, source_version, source_hash)
      values (tenant, k, content #>> '{}', pack, ver, h);
      added := added || ('labels.' || k);
    elsif lb.source_pack is distinct from pack
       or private.genesis_work_hash(to_jsonb(lb.text)) is distinct from lb.source_hash then
      kept := kept || ('labels.' || k);
    elsif lb.source_hash is distinct from h then
      update genesis_work.labels l set text = content #>> '{}', source_version = ver, source_hash = h, updated_at = now()
       where l.tenant_id = tenant and l.label_key = k;
      updated := updated || ('labels.' || k);
    end if;
  end loop;

  insert into genesis_work.installed_packs (tenant_id, pack_id, version, installed_by)
  values (tenant, pack, ver, installed_by)
  on conflict (tenant_id, pack_id) do update set version = excluded.version, updated_at = now();

  return jsonb_build_object('added', to_jsonb(added), 'updated', to_jsonb(updated), 'kept', to_jsonb(kept));
end;
$$;

-- Removes a pack's rows that nobody changed and nothing uses, and forgets the install. Returns
-- { removed, kept }.
create or replace function genesis_work.uninstall_content_pack(tenant uuid, pack text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed text[] := '{}';
  kept text[] := '{}';
  st genesis_work.session_types;
  mt genesis_work.metric_templates;
  fd genesis_work.field_definitions;
  lb genesis_work.labels;
begin
  perform pg_advisory_xact_lock(hashtextextended('genesis_work_pack:' || tenant::text, 0));

  for st in select * from genesis_work.session_types s where s.tenant_id = tenant and s.source_pack = pack loop
    if private.genesis_work_hash(private.genesis_work_session_type_content(st)) = st.source_hash
       and not exists (select 1 from genesis_work.sessions x where x.session_type_id = st.id) then
      delete from genesis_work.session_types s where s.id = st.id;
      removed := removed || ('sessionTypes.' || st.source_key);
    else
      kept := kept || ('sessionTypes.' || st.source_key);
    end if;
  end loop;

  for mt in select * from genesis_work.metric_templates m where m.tenant_id = tenant and m.source_pack = pack loop
    if private.genesis_work_hash(private.genesis_work_metric_template_content(mt)) = mt.source_hash
       and not exists (select 1 from genesis_work.metrics x where x.tenant_id = tenant and x.template_key = mt.template_key) then
      delete from genesis_work.metric_templates m where m.id = mt.id;
      removed := removed || ('metricTemplates.' || mt.template_key);
    else
      kept := kept || ('metricTemplates.' || mt.template_key);
    end if;
  end loop;

  for fd in select * from genesis_work.field_definitions f where f.tenant_id = tenant and f.source_pack = pack loop
    if private.genesis_work_hash(private.genesis_work_field_content(fd)) = fd.source_hash
       and not exists (select 1 from genesis_work.pursuits x where x.tenant_id = tenant and x.custom ? (fd.namespace || '.' || fd.key))
       and not exists (select 1 from genesis_work.work_items x where x.tenant_id = tenant and x.custom ? (fd.namespace || '.' || fd.key))
       and not exists (select 1 from genesis_work.metrics x where x.tenant_id = tenant and x.custom ? (fd.namespace || '.' || fd.key))
       and not exists (select 1 from genesis_work.session_details x where x.tenant_id = tenant and x.custom ? (fd.namespace || '.' || fd.key)) then
      delete from genesis_work.field_definitions f where f.id = fd.id;
      removed := removed || ('fieldDefinitions.' || fd.key);
    else
      kept := kept || ('fieldDefinitions.' || fd.key);
    end if;
  end loop;

  for lb in select * from genesis_work.labels l where l.tenant_id = tenant and l.source_pack = pack loop
    if private.genesis_work_hash(to_jsonb(lb.text)) = lb.source_hash then
      delete from genesis_work.labels l where l.tenant_id = tenant and l.label_key = lb.label_key;
      removed := removed || ('labels.' || lb.label_key);
    else
      kept := kept || ('labels.' || lb.label_key);
    end if;
  end loop;

  delete from genesis_work.installed_packs p where p.tenant_id = tenant and p.pack_id = pack;
  return jsonb_build_object('removed', to_jsonb(removed), 'kept', to_jsonb(kept));
end;
$$;

revoke execute on function private.genesis_work_hash(jsonb) from public, anon, authenticated;
revoke execute on function private.genesis_work_session_type_content(genesis_work.session_types) from public, anon, authenticated;
revoke execute on function private.genesis_work_metric_template_content(genesis_work.metric_templates) from public, anon, authenticated;
revoke execute on function private.genesis_work_field_content(genesis_work.field_definitions) from public, anon, authenticated;
revoke execute on function genesis_work.install_content_pack(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function genesis_work.uninstall_content_pack(uuid, text) from public, anon, authenticated;
grant execute on function genesis_work.install_content_pack(uuid, jsonb, uuid) to service_role;
grant execute on function genesis_work.uninstall_content_pack(uuid, text) to service_role;

-- Access ---------------------------------------------------------------------------------------
-- What's installed, the tenant's metric templates and its labels are the tenant's own rows:
-- whoever may read the tenant's own rows reads them; whoever may write them edits templates and
-- labels. Only the install functions (server code) write installed_packs.

alter table genesis_work.installed_packs enable row level security;
alter table genesis_work.metric_templates enable row level security;
alter table genesis_work.labels enable row level security;

create policy installed_packs_read on genesis_work.installed_packs for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = installed_packs.tenant_id and r.owner_id = installed_packs.tenant_id));

create policy metric_templates_read on genesis_work.metric_templates for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = metric_templates.tenant_id and r.owner_id = metric_templates.tenant_id));
create policy metric_templates_write_insert on genesis_work.metric_templates for insert to authenticated
  with check (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));
create policy metric_templates_write_update on genesis_work.metric_templates for update to authenticated
  using (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));
create policy metric_templates_write_delete on genesis_work.metric_templates for delete to authenticated
  using (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));

create policy labels_read on genesis_work.labels for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = labels.tenant_id and r.owner_id = labels.tenant_id));
create policy labels_write_insert on genesis_work.labels for insert to authenticated
  with check (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));
create policy labels_write_update on genesis_work.labels for update to authenticated
  using (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));
create policy labels_write_delete on genesis_work.labels for delete to authenticated
  using (private.genesis_owner_allows(tenant_id, null, null, tenant_id, 'write'));

revoke all on genesis_work.installed_packs, genesis_work.metric_templates, genesis_work.labels from public, anon, authenticated;
grant select on genesis_work.installed_packs to authenticated;
grant select, insert, update, delete on genesis_work.metric_templates, genesis_work.labels to authenticated;
grant all on genesis_work.installed_packs, genesis_work.metric_templates, genesis_work.labels to service_role;
