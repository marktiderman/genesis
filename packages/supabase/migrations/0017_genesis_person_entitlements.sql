-- Genesis feature registry: entitlements held by one person (0008 and 0014, extended here).
--
-- 0008's feature_entitlements says which tenant may use a paid feature. A membership, a class pack,
-- a course or a coaching package is bought by one person, so the gate also needs grants that belong
-- to a person record. They live in their own table, beside the tenant's, and the gate reads both:
--
--   public.feature_person_entitlements
--     Which person may use which paid feature in a tenant, by source (a billing webhook, a manual
--     grant) and source_ref (the subscription item or purchase it came from, so a webhook can be
--     replayed), optionally from starts_at and until ends_at. person_id is the app's person record,
--     not a login, so a grant bought before sign-up counts once the person signs in. Written by
--     the service role only, through grant_person_entitlement and revoke_person_entitlement; a
--     signed-in person reads their own.
--
--   Who "their own" is comes from 0016's private.genesis_viewer_person_ids(), the app's answer to
--   which person records a login is.
--
-- What changes for the gate:
--
--   feature_on(tenant, feature)
--     A paid feature is on for a signed-in person when the tenant holds it or they do. Server code
--     still gets the tenant's answer.
--   feature_entitled_tenants(feature)
--     For a signed-in person, also the tenants where they hold it themselves, so a policy over many
--     rows answers "may this person use it here".
--   feature_gate_state(tenant)
--     `entitled` is the tenant's grants plus the signed-in person's own in that tenant.
--   feature_gate_state(tenant, person)   (new, server code only)
--     The same for a person server code names, for a snapshot built on the server.
--
-- Credits, balances and which offer unlocks a feature are billing's, not the registry's: an
-- entitlement only says on or off.
--
-- Needs 0004, 0008, 0014 and 0016. Verify: tests/0017_genesis_person_entitlements.test.sql.

create table public.feature_person_entitlements (
  tenant_id uuid not null,
  person_id uuid not null,
  -- No foreign key: a billing webhook may grant a feature before the deploy that adds it syncs.
  feature_id text not null
    constraint feature_person_entitlements_feature_id_format check (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100),
  -- Where the grant comes from: 'stripe', 'manual', 'trial' …
  source text not null
    constraint feature_person_entitlements_source_format check (source ~ '^[a-z][a-z0-9_-]*$' and char_length(source) <= 40),
  -- What in the source it comes from (a subscription item, a purchase); '' when there's only one.
  source_ref text not null default ''
    constraint feature_person_entitlements_source_ref_length check (char_length(source_ref) <= 200),
  active boolean not null,
  -- Optional start and end of the grant; outside them it doesn't count.
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, person_id, feature_id, source, source_ref),
  constraint feature_person_entitlements_window check (starts_at is null or ends_at is null or starts_at < ends_at)
);

comment on table public.feature_person_entitlements is
  'Which person may use which paid feature in a tenant, by source and source_ref, optionally from starts_at until ends_at. person_id is the app''s person record. Written by the service role; a person reads their own. Genesis feature registry.';

create index feature_person_entitlements_feature_active on public.feature_person_entitlements (feature_id) where active;

-- Writing grants (server code) -------------------------------------------------------------------

-- Grant, or renew, one person's entitlement. Idempotent on (tenant, person, feature, source,
-- source_ref): a replayed webhook changes nothing but updated_at.
create or replace function public.grant_person_entitlement(
  tenant uuid, person uuid, feature text, source text, source_ref text default '',
  starts_at timestamptz default null, ends_at timestamptz default null)
returns void
language sql
set search_path = ''
as $$
  insert into public.feature_person_entitlements as e
    (tenant_id, person_id, feature_id, source, source_ref, active, starts_at, ends_at, updated_at)
  values (tenant, person, feature, source, coalesce(source_ref, ''), true, starts_at, ends_at, now())
  on conflict (tenant_id, person_id, feature_id, source, source_ref) do update
    set active = true, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = now()
$$;

comment on function public.grant_person_entitlement(uuid, uuid, text, text, text, timestamptz, timestamptz) is
  'Grant or renew a person''s entitlement to a feature, idempotently. Service role only. Genesis feature registry.';

-- Revoke one person's entitlement. The row stays, inactive, as a record; false when there was none.
create or replace function public.revoke_person_entitlement(
  tenant uuid, person uuid, feature text, source text, source_ref text default '')
returns boolean
language sql
set search_path = ''
as $$
  with revoked as (
    update public.feature_person_entitlements e
    set active = false, updated_at = now()
    where e.tenant_id = tenant and e.person_id = person and e.feature_id = feature
      and e.source = revoke_person_entitlement.source and e.source_ref = coalesce(revoke_person_entitlement.source_ref, '')
    returning 1
  )
  select exists (select 1 from revoked)
$$;

comment on function public.revoke_person_entitlement(uuid, uuid, text, text, text) is
  'Revoke a person''s entitlement to a feature; the row stays inactive. Service role only. Genesis feature registry.';

-- Reading grants ---------------------------------------------------------------------------------

-- The features a person holds in a tenant right now.
create or replace function private.genesis_person_entitled(tenant uuid, person uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.feature_id from public.feature_person_entitlements p
  where p.tenant_id = tenant and p.person_id = person and p.active
    and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())
$$;

-- The features the signed-in person holds in a tenant, through any of their person records there.
create or replace function private.genesis_viewer_entitled(tenant uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.feature_id from public.feature_person_entitlements p
  join private.genesis_viewer_person_ids() v on v.tenant_id = p.tenant_id and v.person_id = p.person_id
  where p.tenant_id = tenant and p.active
    and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())
$$;

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
      and (f.access_plan is null
        or exists (
          select 1 from public.feature_entitlements e
          where e.tenant_id = tenant and e.feature_id = f.id and e.active and (e.ends_at is null or e.ends_at > now())
        )
        or f.id in (select private.genesis_viewer_entitled(tenant)))
  );
end;
$$;

comment on function public.feature_on(uuid, text) is
  'The gate in SQL: shipped (beta, live, deprecated) and, when paid, entitled to the tenant or to the signed-in person. For row security. A signed-in caller outside the tenant gets false. Genesis feature registry.';

create or replace function public.feature_entitled_tenants(feature text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select e.tenant_id from public.feature_entitlements e
    where e.feature_id = feature and e.active and (e.ends_at is null or e.ends_at > now())
      and private.genesis_feature_may_read(e.tenant_id)
    union
    select p.tenant_id from public.feature_person_entitlements p
    join private.genesis_viewer_person_ids() v on v.tenant_id = p.tenant_id and v.person_id = p.person_id
    where p.feature_id = feature and p.active
      and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())
      and private.genesis_feature_may_read(p.tenant_id);
end;
$$;

comment on function public.feature_entitled_tenants(text) is
  'Tenants where a feature is entitled: every tenant holding it, for server code; for a signed-in person, their own tenants that hold it or where they hold it themselves. For row security, once per statement. Genesis feature registry.';

-- The snapshot's state, for the signed-in person (person grants are theirs) or for server code
-- naming a person (null: the tenant's alone).
create or replace function private.genesis_feature_gate_state(tenant uuid, person_entitled text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'off', coalesce((
      select jsonb_agg(t.feature_id order by t.feature_id) from public.tenant_features t
      where t.tenant_id = tenant and not t.enabled
    ), '[]'::jsonb),
    'entitled', coalesce((
      select jsonb_agg(x.feature_id order by x.feature_id) from (
        select e.feature_id from public.feature_entitlements e
        where e.tenant_id = tenant and e.active and (e.ends_at is null or e.ends_at > now())
        union
        select unnest(person_entitled)
      ) x
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
  )
$$;

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
  return private.genesis_feature_gate_state(tenant, array(select private.genesis_viewer_entitled(tenant)));
end;
$$;

comment on function public.feature_gate_state(uuid) is
  'A tenant''s switches off, entitlements held (the tenant''s and the signed-in person''s own) and flag values, for the gate''s snapshot. Its members and the service role. Genesis feature registry.';

create or replace function public.feature_gate_state(tenant uuid, person uuid)
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
  if not private.genesis_feature_caller_is_server() then
    raise exception 'feature_gate_state: only server code can name a person' using errcode = '42501';
  end if;
  return private.genesis_feature_gate_state(tenant,
    case when person is null then '{}'::text[] else array(select private.genesis_person_entitled(tenant, person)) end);
end;
$$;

comment on function public.feature_gate_state(uuid, uuid) is
  'A tenant''s gate state with one named person''s entitlements added. Server code only. Genesis feature registry.';

-- Access ---------------------------------------------------------------------------------------

alter table public.feature_person_entitlements enable row level security;

revoke all on table public.feature_person_entitlements from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.feature_person_entitlements to service_role;
grant select (tenant_id, person_id, feature_id, source, active, starts_at, ends_at) on table public.feature_person_entitlements to authenticated;
create policy "People read their own entitlements" on public.feature_person_entitlements for select to authenticated
  using ((tenant_id, person_id) in (select v.tenant_id, v.person_id from private.genesis_viewer_person_ids() v));

revoke execute on function public.grant_person_entitlement(uuid, uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_person_entitlement(uuid, uuid, text, text, text, timestamptz, timestamptz) to service_role;
revoke execute on function public.revoke_person_entitlement(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.revoke_person_entitlement(uuid, uuid, text, text, text) to service_role;

revoke execute on function private.genesis_person_entitled(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_viewer_entitled(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_feature_gate_state(uuid, text[]) from public, anon, authenticated;

revoke execute on function public.feature_gate_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.feature_gate_state(uuid, uuid) to service_role;
