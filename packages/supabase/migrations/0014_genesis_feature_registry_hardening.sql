-- Genesis feature registry, hardened (0008, shipped in genesis-supabase 0.6.0, changed here).
--
-- 1. Who is asking. Server code is now told apart from a person by the request's role
--    (`current_setting('role')`, which PostgREST sets per request with SET LOCAL ROLE), not by
--    request.jwt.claims, which a session can set for itself. A role that bypasses row security
--    (service_role, postgres) is server code, and so is a connection that never switched role
--    (`none`, as in migrations). Anything else, `authenticated` included, must be a member of the
--    tenant. Before, a session that switched to
--    `authenticated` without setting claims was treated as server code.
-- 2. feature_shipped(feature) answers a signed-in person only for customer-facing features
--    (visibility customer or public): an internal feature's id can no longer be confirmed by
--    guessing it. Server code still gets every feature.
-- 3. A flag that leaves the registry loses its platform_value, so a forgotten kill switch can't
--    come back with the flag. Its tenant values stay, as before.
-- 4. feature_entitlements gets an index on (feature_id) for active rows, for
--    feature_entitled_tenants and feature_on.
--
-- Needs 0004 and 0008. Verify: tests/0014_genesis_feature_registry_hardening.test.sql.

create index if not exists feature_entitlements_feature_active on public.feature_entitlements (feature_id) where active;

create or replace function private.genesis_feature_caller_is_server()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  -- No role switch (a direct connection, a migration), or a role that bypasses row security
  -- (service_role, postgres): server code. authenticated and anon never bypass it.
  return request_role = 'none'
      or coalesce((select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = request_role), false);
end;
$$;

revoke execute on function private.genesis_feature_caller_is_server() from public, anon, authenticated;

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
      and (f.visibility in ('customer', 'public') or private.genesis_feature_caller_is_server())
  )
$$;

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

  update public.feature_flags fl set in_registry = false, platform_value = null, synced_at = now()
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

