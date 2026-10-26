-- Genesis feature registry in the database: the mirror, entitlements, flag values and the gate.
--
-- Feature and flag definitions live in code (`features.ts`, `flags.json`). This file gives the
-- app's database the rows the gate needs (ADR 0001, "One feature gate"):
--
--   public.features, public.feature_flags
--     A mirror of the registry, written only by public.sync_feature_registry with the service
--     key, by production deploys only (a preview must never sync production). Each sync carries a
--     version: the time the deployment started serving, not its build time, so an instant
--     rollback to an older build syncs as the newest. An older version than the last one synced is
--     refused (two instances racing), and the same hash again changes nothing. An empty registry,
--     or one that drops more than a fifth of the features (at least 3), is refused unless the call
--     says allow_shrink: a broken features.json must not switch everything off. Nothing is ever
--     deleted: a feature or flag gone from the registry is marked in_registry = false, and a
--     flag's per-tenant values stay until it comes back or you delete them.
--
--   public.feature_entitlements
--     Which tenant may use which paid feature (`access: { plan }`), by source (a billing webhook,
--     a manual grant), optionally until a time. Written by the service role only.
--
--   public.tenant_flag_values, feature_flags.platform_value
--     A flag's value for one tenant, overriding its default; and a value for every tenant at once
--     (a kill switch), overriding tenant values. Written by the service role only.
--
--   public.feature_on(tenant, feature)
--     The gate in SQL, for row security and functions: shipped (beta, live or deprecated) and,
--     when paid, entitled. Nothing else: platform, tenant switches and flags are exposure, which
--     server code enforces with the TypeScript gate (`requireFeature`).
--
--   public.feature_gate_state(tenant)
--     A tenant's runtime state in one call (switches off, entitlements held, flag values), for the
--     server to build the gate's snapshot. For the tenant's members, and the service role.
--
-- Tenants and membership: as in 0004_genesis_tenant_features, a tenant is any uuid your app
-- groups people by, and private.genesis_tenant_member / private.genesis_tenant_admin (your
-- hooks) decide who belongs. This file needs 0004 (it reads tenant_features and its hooks).
-- Add your tenant foreign keys yourself in a later migration:
--
--   alter table public.feature_entitlements add foreign key (tenant_id) references public.teams (id) on delete cascade;
--   alter table public.tenant_flag_values add foreign key (tenant_id) references public.teams (id) on delete cascade;
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0008_genesis_feature_registry.test.sql`).

create schema if not exists private;

-- The mirror -----------------------------------------------------------------------------------

create table public.features (
  id text primary key
    constraint features_id_format check (id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(id) <= 100),
  name text not null,
  status text not null
    constraint features_status check (status in ('idea', 'planned', 'building', 'beta', 'live', 'deprecated', 'retired')),
  visibility text not null default 'customer',
  -- The plan a paid feature needs (`access: { plan }`); null when everyone gets it.
  access_plan text,
  -- The status per platform (`platforms`), when the registry gives one.
  platforms jsonb,
  -- The whole registry entry, as code defines it.
  record jsonb not null,
  in_registry boolean not null default true,
  synced_at timestamptz not null default now()
);

comment on table public.features is
  'Mirror of features.ts, written only by sync_feature_registry. Ids are permanent: rows are never deleted. Genesis feature registry.';

create table public.feature_flags (
  key text primary key,
  feature_id text not null references public.features (id),
  kind text not null,
  default_value jsonb not null,
  scopes text[] not null default '{}',
  expires date,
  record jsonb not null,
  in_registry boolean not null default true,
  -- A value for every tenant, set by the service role: a kill switch or a global rollout. It
  -- overrides tenant values, and sync never touches it.
  platform_value jsonb,
  synced_at timestamptz not null default now()
);

create index feature_flags_feature on public.feature_flags (feature_id);

comment on table public.feature_flags is
  'Mirror of flags.json, written only by sync_feature_registry. A flag gone from the registry is kept, marked in_registry = false. Genesis feature registry.';

create table private.feature_registry_state (
  id boolean primary key default true constraint feature_registry_state_one_row check (id),
  version bigint not null,
  hash text not null,
  synced_at timestamptz not null default now()
);

create or replace function public.sync_feature_registry(version bigint, hash text, features jsonb, flags jsonb, allow_shrink boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count int;
  gone_count int;
begin
  if version is null or hash is null
     or jsonb_typeof(features) is distinct from 'array' or jsonb_typeof(flags) is distinct from 'array' then
    raise exception 'sync_feature_registry: needs a version, a hash and two arrays' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(features) r where coalesce(r ->> 'id', '') = '')
     or jsonb_array_length(features) <> (select count(distinct r ->> 'id') from jsonb_array_elements(features) r) then
    raise exception 'sync_feature_registry: every feature needs a unique id' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(flags) r where coalesce(r ->> 'key', '') = '')
     or jsonb_array_length(flags) <> (select count(distinct r ->> 'key') from jsonb_array_elements(flags) r) then
    raise exception 'sync_feature_registry: every flag needs a unique key' using errcode = '22023';
  end if;
  -- One sync at a time: a second deploy waits, then finds itself already current.
  perform pg_advisory_xact_lock(hashtext('public.sync_feature_registry'));
  -- Never backwards, and nothing to do for the same registry.
  if exists (select 1 from private.feature_registry_state s where s.version > sync_feature_registry.version or s.hash = sync_feature_registry.hash) then
    return false;
  end if;
  -- A broken or foreign registry must not switch everything off.
  select count(*) into current_count from public.features f where f.in_registry;
  select count(*) into gone_count from public.features f
  where f.in_registry and not exists (select 1 from jsonb_array_elements(features) r where r ->> 'id' = f.id);
  if not coalesce(allow_shrink, false) and (jsonb_array_length(features) = 0 or (gone_count >= 3 and gone_count * 5 > current_count)) then
    raise exception 'sync_feature_registry: this registry drops % of % features', gone_count, current_count
      using errcode = '22023', hint = 'Check features.json; if the removal is intended, call again with allow_shrink => true.';
  end if;

  insert into public.features as f (id, name, status, visibility, access_plan, platforms, record, in_registry, synced_at)
  select r ->> 'id', r ->> 'name', r ->> 'status', coalesce(r ->> 'visibility', 'customer'),
         case when jsonb_typeof(r -> 'access') = 'object' then nullif(btrim(r -> 'access' ->> 'plan'), '') end,
         case when jsonb_typeof(r -> 'platforms') = 'object' then r -> 'platforms' end,
         r, true, now()
  from jsonb_array_elements(features) r
  on conflict (id) do update set
    name = excluded.name, status = excluded.status, visibility = excluded.visibility, access_plan = excluded.access_plan,
    platforms = excluded.platforms, record = excluded.record, in_registry = true, synced_at = excluded.synced_at;

  -- Ids are permanent: a feature the registry no longer lists stays, marked as gone.
  update public.features f set in_registry = false, synced_at = now()
  where f.in_registry and not exists (select 1 from jsonb_array_elements(features) r where r ->> 'id' = f.id);

  update public.feature_flags fl set in_registry = false, synced_at = now()
  where fl.in_registry and not exists (select 1 from jsonb_array_elements(flags) r where r ->> 'key' = fl.key);
  insert into public.feature_flags as fl (key, feature_id, kind, default_value, scopes, expires, record, in_registry, synced_at)
  select r ->> 'key', r ->> 'feature', r ->> 'kind', coalesce(r -> 'default', 'false'::jsonb),
         coalesce(array(select jsonb_array_elements_text(r -> 'scopes')), '{}'),
         (r ->> 'expires')::date, r, true, now()
  from jsonb_array_elements(flags) r
  on conflict (key) do update set
    feature_id = excluded.feature_id, kind = excluded.kind, default_value = excluded.default_value,
    scopes = excluded.scopes, expires = excluded.expires, record = excluded.record, in_registry = true,
    synced_at = excluded.synced_at;

  insert into private.feature_registry_state (id, version, hash, synced_at)
  values (true, sync_feature_registry.version, sync_feature_registry.hash, now())
  on conflict (id) do update set version = excluded.version, hash = excluded.hash, synced_at = excluded.synced_at;
  return true;
end;
$$;

comment on function public.sync_feature_registry(bigint, text, jsonb, jsonb, boolean) is
  'Mirrors features.ts and flags.json into features and feature_flags. Service role, production deploys only. Refuses an older version, an empty registry or a sharp shrink (unless allow_shrink); the same hash is a no-op; nothing is deleted. Genesis feature registry.';

create or replace function public.feature_registry_synced()
returns table (version bigint, hash text, synced_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.version, s.hash, s.synced_at from private.feature_registry_state s
$$;

comment on function public.feature_registry_synced() is
  'The version, hash and time of the last registry sync. Service role only. Genesis feature registry.';

-- Paid access and flag values ------------------------------------------------------------------

create table public.feature_entitlements (
  tenant_id uuid not null,
  -- No foreign key: a billing webhook may grant a feature before the deploy that adds it syncs.
  feature_id text not null
    constraint feature_entitlements_feature_id_format check (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100),
  -- Where the grant comes from: 'stripe', 'manual', 'trial' … One row per source.
  source text not null
    constraint feature_entitlements_source_format check (source ~ '^[a-z][a-z0-9_-]*$' and char_length(source) <= 40),
  active boolean not null,
  -- Optional end of the grant; past it the entitlement no longer counts.
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_id, source)
);

comment on table public.feature_entitlements is
  'Which tenant may use which paid feature, by source, optionally until ends_at. The feature id doubles as the billing lookup key. Service role only. Genesis feature registry.';

create table public.tenant_flag_values (
  tenant_id uuid not null,
  flag_key text not null references public.feature_flags (key),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, flag_key)
);

comment on table public.tenant_flag_values is
  'A flag''s value for one tenant, overriding its default. Kept while its flag is out of the registry. Service role only. Genesis feature registry.';

-- The gate -------------------------------------------------------------------------------------

-- Who is asking: server code (the service role, or a direct database connection with no request
-- claims) answers for any tenant; everyone else must be a member. Decided on the request's role,
-- never on a missing person: an authenticated request without `sub` is refused, not trusted.
create or replace function private.genesis_feature_caller_is_server()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  request_role text := coalesce(nullif(claims ->> 'role', ''), nullif(current_setting('request.jwt.claim.role', true), ''));
begin
  return request_role is null or request_role = 'service_role';
end;
$$;

create or replace function private.genesis_feature_may_read(tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.genesis_feature_caller_is_server() or private.genesis_is_tenant_member(tenant);
end;
$$;

-- Shipped and, when paid, entitled: the part of the gate that row security enforces. A signed-in
-- caller gets an answer only for a tenant they belong to (false otherwise), so a policy can't be
-- used to probe another tenant's plan. Server code (the service role, no signed-in person) gets
-- an answer for any tenant.
create or replace function public.feature_on(tenant uuid, feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or feature is null then
    return false;
  end if;
  if not private.genesis_feature_may_read(tenant) then
    return false;
  end if;
  return exists (
    select 1 from public.features f
    where f.id = feature and f.in_registry and f.status in ('beta', 'live', 'deprecated')
      and (f.access_plan is null or exists (
        select 1 from public.feature_entitlements e
        where e.tenant_id = tenant and e.feature_id = f.id and e.active and (e.ends_at is null or e.ends_at > now())
      ))
  );
end;
$$;

comment on function public.feature_on(uuid, text) is
  'The gate in SQL: shipped (beta, live, deprecated) and entitled when paid. For row security. A signed-in caller outside the tenant gets false. Genesis feature registry.';

-- For row security over many rows, two answers Postgres computes once per statement instead of
-- once per row (wrap them in a subquery):
--   free feature:  using ((select public.feature_shipped('notes')) and <your row rule>)
--   paid feature:  using ((select public.feature_shipped('exports'))
--                         and tenant_id = any (array(select public.feature_entitled_tenants('exports'))) and <your row rule>)
create or replace function public.feature_shipped(feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.features f
    where f.id = feature and f.in_registry and f.status in ('beta', 'live', 'deprecated')
  )
$$;

comment on function public.feature_shipped(text) is
  'Whether a feature has shipped (beta, live, deprecated), whatever the tenant. For row security, once per statement. Genesis feature registry.';

-- The tenants with an active entitlement to a feature: every one for server code, only the
-- caller's own for a signed-in person.
create or replace function public.feature_entitled_tenants(feature text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select distinct e.tenant_id from public.feature_entitlements e
    where e.feature_id = feature and e.active and (e.ends_at is null or e.ends_at > now())
      and private.genesis_feature_may_read(e.tenant_id);
end;
$$;

comment on function public.feature_entitled_tenants(text) is
  'Tenants holding an active entitlement to a feature (the caller''s own when signed in). For row security, once per statement. Genesis feature registry.';

-- A tenant's runtime state for the gate's snapshot: { off: [ids], entitled: [ids], flags: { key: value } }.
create or replace function public.feature_gate_state(tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null then
    raise exception 'feature_gate_state: tenant is required' using errcode = '22004';
  end if;
  if not private.genesis_feature_may_read(tenant) then
    raise exception 'feature_gate_state: only the tenant''s members can read its features' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'off', coalesce((
      select jsonb_agg(t.feature_id order by t.feature_id) from public.tenant_features t
      where t.tenant_id = tenant and not t.enabled
    ), '[]'::jsonb),
    'entitled', coalesce((
      select jsonb_agg(distinct e.feature_id) from public.feature_entitlements e
      where e.tenant_id = tenant and e.active and (e.ends_at is null or e.ends_at > now())
    ), '[]'::jsonb),
    -- The tenant's own values, then platform values on top: a platform value (a kill switch)
    -- applies to every tenant, whatever the tenant's own value.
    'flags', coalesce((
      select jsonb_object_agg(v.flag_key, v.value) from public.tenant_flag_values v
      join public.feature_flags fl on fl.key = v.flag_key and fl.in_registry
      where v.tenant_id = tenant
    ), '{}'::jsonb) || coalesce((
      select jsonb_object_agg(fl.key, fl.platform_value) from public.feature_flags fl
      where fl.in_registry and fl.platform_value is not null
    ), '{}'::jsonb)
  );
end;
$$;

comment on function public.feature_gate_state(uuid) is
  'A tenant''s switches off, entitlements held and flag values, for the gate''s snapshot. Its members and the service role. Genesis feature registry.';

-- Access ---------------------------------------------------------------------------------------

alter table public.features enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_entitlements enable row level security;
alter table public.tenant_flag_values enable row level security;
alter table private.feature_registry_state enable row level security;

-- Signed-in people (not anonymous sign-ins) read shipped, customer-facing features, and only the
-- columns a screen needs: the full record (owners, plans, acceptance, links) stays server side.
-- Flags, entitlements and flag values are read through feature_gate_state.
revoke all on table public.features from public, anon, authenticated, service_role;
grant select on table public.features to service_role;
grant select (id, name, status, visibility, access_plan, platforms, in_registry) on table public.features to authenticated;
create policy "Signed-in people read shipped features" on public.features for select to authenticated
  using (
    in_registry and status in ('beta', 'live', 'deprecated') and visibility in ('customer', 'public')
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.feature_flags from public, anon, authenticated, service_role;
grant select on table public.feature_flags to service_role;
-- The service role sets platform values; everything else in the row belongs to the sync.
grant update (platform_value) on table public.feature_flags to service_role;

revoke all on table public.feature_entitlements from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.feature_entitlements to service_role;

revoke all on table public.tenant_flag_values from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.tenant_flag_values to service_role;

revoke all on table private.feature_registry_state from public, anon, authenticated, service_role;
revoke execute on function private.genesis_feature_caller_is_server() from public, anon, authenticated;
revoke execute on function private.genesis_feature_may_read(uuid) from public, anon, authenticated;

revoke execute on function public.sync_feature_registry(bigint, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_feature_registry(bigint, text, jsonb, jsonb, boolean) to service_role;
revoke execute on function public.feature_registry_synced() from public, anon, authenticated;
grant execute on function public.feature_registry_synced() to service_role;
revoke execute on function public.feature_gate_state(uuid) from public, anon;
grant execute on function public.feature_gate_state(uuid) to authenticated, service_role;

-- For one row or a function: `public.feature_on(tenant_id, 'my-feature')`; over many rows prefer
-- feature_shipped and feature_entitled_tenants (above). Policies run as the
-- querying role, so authenticated needs execute. Anon gets nothing: without a signed-in person
-- the function answers for any tenant, which is for server code only.
revoke execute on function public.feature_on(uuid, text) from public, anon;
grant execute on function public.feature_on(uuid, text) to authenticated, service_role;
revoke execute on function public.feature_shipped(text) from public, anon;
grant execute on function public.feature_shipped(text) to authenticated, service_role;
revoke execute on function public.feature_entitled_tenants(text) from public, anon;
grant execute on function public.feature_entitled_tenants(text) to authenticated, service_role;
