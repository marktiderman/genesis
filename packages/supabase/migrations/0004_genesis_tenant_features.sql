-- Genesis tenant features: public.tenant_features and public.set_tenant_feature()
--
-- Per-tenant on/off switches for shipped features: a tenant's admins turn a
-- feature off (or back on) for their tenant, with a reason, and every change
-- is kept (who, when, why) in public.tenant_feature_changes. A feature with no
-- row is on. The client half is `tenantFeatures(client, tenantId)` and
-- `setTenantFeature(client, …)` in @marktiderman/genesis-supabase.
--
-- What a switch is for: exposure (hiding a tab, a nav entry, a screen), never
-- authorization. Paid access is an entitlement, and who may see a row is RLS;
-- a gate in SQL can read `private.tenant_feature_on(tenant, feature)`.
--
-- "Tenant" is whatever your app groups people by (a team, an organization, a
-- workspace) and is keyed by a uuid. This file names no table of yours:
--
--   The app hook: `private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean`
--   decides who may change a tenant's features. Without it nobody can (set_tenant_feature
--   raises 42501 with a hint), so a fresh install fails closed. Optionally,
--   `private.genesis_tenant_member(tenant uuid, person uuid) returns boolean` decides who
--   may read which features are off (admins always may). Both run with this
--   file's (the owner's) rights, so they read your membership table whatever its RLS:
--
--   create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
--   language sql stable set search_path = '' as $$
--     select exists (select 1 from public.memberships m
--                    where m.team_id = tenant and m.user_id = person and m.role in ('owner', 'admin'))
--   $$;
--   revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
--
-- Your tenant table: add the foreign key yourself in a later migration, so a
-- deleted tenant takes its switches and their history with it (a delete that
-- cascades from elsewhere isn't recorded, so it never refuses the tenant's deletion):
--
--   alter table public.tenant_features add foreign key (tenant_id) references public.teams (id) on delete cascade;
--   alter table public.tenant_feature_changes add foreign key (tenant_id) references public.teams (id) on delete cascade;
--
-- Feature ids are the registry's FeatureIds (`features.ts`), checked here for
-- their shape only. If you mirror the registry into a table, add a foreign key.
--
-- Access: everything goes through the functions below (security definer,
-- each asking the hook). The tables have row level security on, no policies
-- and no grants to anon or authenticated. The service role (a server job, a
-- platform admin's tool) may write the switches directly, and its writes are
-- recorded too, with no person.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name. Never edit it once applied; change it with a new migration.
-- It stands alone (it doesn't need 0001 to 0003).
--
-- Verify: the pgTAP test beside this file (`tests/0004_genesis_tenant_features.test.sql`).

create schema if not exists private;

create table public.tenant_features (
  tenant_id uuid not null,
  feature_id text not null
    constraint tenant_features_feature_id_format check (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100),
  enabled boolean not null,
  reason text not null
    constraint tenant_features_reason_length check (char_length(btrim(reason)) between 1 and 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_id)
);

comment on table public.tenant_features is
  'Per-tenant feature switches (a missing row is on), with the latest reason. Written through set_tenant_feature or by the service role. Genesis tenant features.';

-- Every change, kept: who (the signed-in person, or none for the service role
-- or a migration), with which role, when, and why. A row is never edited.
create table public.tenant_feature_changes (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  feature_id text not null,
  -- null when the switch row was deleted (back to the default: on).
  enabled boolean,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_role text not null,
  changed_at timestamptz not null default now()
);

create index tenant_feature_changes_tenant on public.tenant_feature_changes (tenant_id, changed_at desc);

comment on table public.tenant_feature_changes is
  'History of public.tenant_features: who changed which switch, when and why. Written only by its trigger. Genesis tenant features.';

-- The hooks, asked with the signed-in person. Missing hook, nobody signed in,
-- or a null answer: false.
create or replace function private.genesis_is_tenant_admin(tenant uuid)
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

create or replace function private.genesis_is_tenant_member(tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or tenant is null then
    return false;
  end if;
  -- Two statements: an expression naming a missing function fails even behind `and`.
  if to_regprocedure('private.genesis_tenant_member(uuid,uuid)') is not null then
    if coalesce(private.genesis_tenant_member(tenant, me), false) then
      return true;
    end if;
  end if;
  return private.genesis_is_tenant_admin(tenant);
end;
$$;

-- For SQL gates (a policy, a function): is this feature on for this tenant?
-- Reads every row whatever the caller's RLS. A feature with no row is on.
create or replace function private.tenant_feature_on(tenant uuid, feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.tenant_features f
    where f.tenant_id = tenant and f.feature_id = feature and not f.enabled
  )
$$;

create or replace function public.set_tenant_feature(tenant uuid, feature text, enabled boolean, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text := btrim(coalesce(reason, ''));
begin
  if me is null then
    raise exception 'set_tenant_feature: not signed in' using errcode = '42501';
  end if;
  if tenant is null or feature is null or enabled is null then
    raise exception 'set_tenant_feature: tenant, feature and enabled are required' using errcode = '22004';
  end if;
  if to_regprocedure('private.genesis_tenant_admin(uuid,uuid)') is null then
    raise exception 'set_tenant_feature: nobody may change tenant features yet'
      using errcode = '42501', hint = 'Create private.genesis_tenant_admin(uuid, uuid) (see migration 0004_genesis_tenant_features).';
  end if;
  if not private.genesis_is_tenant_admin(tenant) then
    raise exception 'set_tenant_feature: only the tenant''s admins can change its features' using errcode = '42501';
  end if;
  if why = '' or char_length(why) > 500 then
    raise exception 'set_tenant_feature: say why, in at most 500 characters' using errcode = '22023';
  end if;
  insert into public.tenant_features as f (tenant_id, feature_id, enabled, reason, updated_by, updated_at)
  values (tenant, feature, enabled, why, me, now())
  on conflict (tenant_id, feature_id) do update
    set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    -- Saving the same switch and reason again changes nothing, not even who and when.
    where (f.enabled, f.reason) is distinct from (excluded.enabled, excluded.reason);
end;
$$;

comment on function public.set_tenant_feature(uuid, text, boolean, text) is
  'Turns a feature on or off for a tenant, with a reason. Only the tenant''s admins (private.genesis_tenant_admin). Genesis tenant features.';

-- The ids turned off for a tenant, for its members (and admins) to hide them.
create or replace function public.tenant_features_off(tenant uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.genesis_is_tenant_member(tenant) then
    raise exception 'tenant_features_off: only the tenant''s members can read its features' using errcode = '42501';
  end if;
  return query
    select f.feature_id from public.tenant_features f
    where f.tenant_id = tenant and not f.enabled
    order by f.feature_id;
end;
$$;

comment on function public.tenant_features_off(uuid) is
  'The feature ids a tenant has turned off. For its members. Genesis tenant features.';

-- Every switch a tenant has set, with the latest reason, who and when: for its admins' Settings screen.
create or replace function public.tenant_feature_settings(tenant uuid)
returns table (feature_id text, enabled boolean, reason text, updated_by uuid, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.genesis_is_tenant_admin(tenant) then
    raise exception 'tenant_feature_settings: only the tenant''s admins can read its switches' using errcode = '42501';
  end if;
  return query
    select f.feature_id, f.enabled, f.reason, f.updated_by, f.updated_at from public.tenant_features f
    where f.tenant_id = tenant
    order by f.feature_id;
end;
$$;

comment on function public.tenant_feature_settings(uuid) is
  'A tenant''s feature switches with their reasons. For its admins. Genesis tenant features.';

-- A tenant's history of changes, newest first, at most `max_rows` (1 to 1000).
create or replace function public.tenant_feature_history(tenant uuid, max_rows integer default 100)
returns table (feature_id text, enabled boolean, reason text, changed_by uuid, changed_role text, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.genesis_is_tenant_admin(tenant) then
    raise exception 'tenant_feature_history: only the tenant''s admins can read its history' using errcode = '42501';
  end if;
  return query
    select c.feature_id, c.enabled, c.reason, c.changed_by, c.changed_role, c.changed_at from public.tenant_feature_changes c
    where c.tenant_id = tenant
    order by c.changed_at desc, c.id desc
    limit greatest(1, least(coalesce(max_rows, 100), 1000));
end;
$$;

comment on function public.tenant_feature_history(uuid, integer) is
  'Who changed a tenant''s feature switches, when and why, newest first. For its admins. Genesis tenant features.';

create or replace function private.genesis_record_tenant_feature_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  -- Only a change of the switch or its reason is history. This skips the
  -- `on delete set null` of updated_by when a person is deleted, which would
  -- otherwise record the deleted person as the actor and refuse their deletion.
  if tg_op = 'UPDATE' and new.enabled is not distinct from old.enabled and new.reason is not distinct from old.reason
     and new.tenant_id = old.tenant_id and new.feature_id = old.feature_id then
    return null;
  end if;
  if tg_op = 'DELETE' then
    begin
      insert into public.tenant_feature_changes (tenant_id, feature_id, enabled, reason, changed_by, changed_role)
      values (old.tenant_id, old.feature_id, null, null, (select u.id from auth.users u where u.id = auth.uid()),
              coalesce(nullif(claims ->> 'role', ''), 'database'));
    exception when foreign_key_violation then
      -- The delete cascades from the tenant's own (your foreign key, or a person whose
      -- tenant goes with them): the tenant is gone, so there is nothing to record, and
      -- recording it would refuse the tenant's or the person's deletion.
      null;
    end;
    return null;
  end if;
  insert into public.tenant_feature_changes (tenant_id, feature_id, enabled, reason, changed_by, changed_role)
  values (
    new.tenant_id,
    new.feature_id,
    new.enabled,
    new.reason,
    -- Only a login that still exists: one being deleted in this statement is no one.
    (select u.id from auth.users u where u.id = auth.uid()),
    coalesce(nullif(claims ->> 'role', ''), 'database')
  );
  return null;
end;
$$;

create trigger genesis_record_change
  after insert or update or delete on public.tenant_features
  for each row execute function private.genesis_record_tenant_feature_change();

-- Row level security on, with no policies: anon and authenticated reach the
-- tables only through the functions above, even if a later grant lets them try.
alter table public.tenant_features enable row level security;
alter table public.tenant_feature_changes enable row level security;

-- Privileges by name. Supabase's default privileges give anon and
-- authenticated everything on a new public table and function, and Postgres
-- gives every function to public: take them back, then grant what's needed.
revoke all on table public.tenant_features from public, anon, authenticated;
revoke all on table public.tenant_feature_changes from public, anon, authenticated;
-- No truncate (it would skip the history trigger), references or trigger for the service role.
revoke all on table public.tenant_features from service_role;
grant select, insert, update, delete on table public.tenant_features to service_role;
revoke all on sequence public.tenant_feature_changes_id_seq from public, anon, authenticated;
-- The history is the trigger's: the service role may read and purge it, never write it.
revoke all on table public.tenant_feature_changes from service_role;
grant select, delete on table public.tenant_feature_changes to service_role;

revoke execute on function public.set_tenant_feature(uuid, text, boolean, text) from public, anon;
grant execute on function public.set_tenant_feature(uuid, text, boolean, text) to authenticated;
revoke execute on function public.tenant_features_off(uuid) from public, anon;
grant execute on function public.tenant_features_off(uuid) to authenticated;
revoke execute on function public.tenant_feature_settings(uuid) from public, anon;
grant execute on function public.tenant_feature_settings(uuid) to authenticated;
revoke execute on function public.tenant_feature_history(uuid, integer) from public, anon;
grant execute on function public.tenant_feature_history(uuid, integer) to authenticated;

-- Only the functions above call these.
revoke execute on function private.genesis_is_tenant_admin(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_is_tenant_member(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_record_tenant_feature_change() from public, anon, authenticated;
-- For gates in your own SQL, called from security definer functions (owned
-- by the migration's role, so they need no grant). It answers for any tenant,
-- without the member check: grant it to authenticated (with usage on schema
-- private) only if you mean every signed-in person to be able to ask.
revoke execute on function private.tenant_feature_on(uuid, text) from public, anon, authenticated;
grant execute on function private.tenant_feature_on(uuid, text) to service_role;
