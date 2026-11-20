-- Genesis settings 0024: what the app's Settings host needs (after 0020–0023).
--
-- The Settings screen inside the app is served by genesis-supabase's `createSettingsHandler`, which
-- calls these functions with the signed-in person's own JWT, so every check below (and in 0020–0023)
-- runs as that person:
--
--   genesis_settings_viewer(tenant)     who the caller is to the settings (platform admin, the
--                                       tenant's admin), and the synced catalogue they may see:
--                                       every key for a platform admin, else the keys of their
--                                       scope (tenant or person).
--   genesis_setting_proposals           a change someone asked for (who, for which tenant or for
--                                       themselves, key, value, why), which a platform admin
--                                       approves for everyone (the database layer, as by
--                                       set_genesis_setting), approves for the requesting tenant only
--                                       (its layer, when the locks allow), or declines.
--   clear_genesis_setting_if(key, value, locked)
--                                       clears a database-layer value only while it is still the one
--                                       a plan was made for (the Settings screen's fixes).
--   set_genesis_vault_secret(name, value)
--                                       sets or rotates a Supabase Vault secret a package declares
--                                       (`needs: "secret:NAME", store: "vault"`). Platform admins
--                                       only; write-only: nothing ever returns the value.
--   genesis_secret_rotations            when each Vault secret was set, and by whom. Never the value.
--   genesis_vault_secret_status()       each declared Vault secret: set or not, and when last set.
--   genesis_settings_audit(…)           one history, newest first, a page at a time: the database
--                                       layer, the tenant and person layers, and secret rotations,
--                                       each only to those who may read it.
--
-- Why a secret's value stays out of query logs and pg_stat_statements: the value is only ever a
-- parameter. PostgREST sends an RPC's arguments as a bind parameter of a prepared statement, so
-- pg_stat_statements (and log_statement) record the statement text with `$1`, never the value; this
-- function passes it on to vault.create_secret / vault.update_secret as a PL/pgSQL variable, which
-- is a parameter too (no EXECUTE, no format(), no string building), and never raises an error that
-- quotes it. A Postgres log can still print a statement's parameters if it is configured to; leave
-- each of these at Supabase's default:
--   log_parameter_max_length_on_error   0: no parameters in the log line of a failed statement;
--   log_statement / log_min_duration_statement with log_parameter_max_length
--                                       a logged statement prints its parameters unless
--                                       log_parameter_max_length is 0 (-1 prints them whole), so
--                                       don't turn statement or duration logging on with it non-zero;
--   auto_explain.log_parameter_max_length
--                                       when auto_explain logs plans (log_min_duration >= 0), 0;
--   pgaudit.log_parameter               off (pgaudit would write every parameter to the audit log).
-- Vault stores the value encrypted; genesis_secret_rotations has no column that could hold it.
--
-- Access: the tables have row level security on, no policies and no grants to anon or
-- authenticated; everything goes through the functions below (security definer). The service role
-- reads both tables.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0020–0023 (`genesis migrate` does it). Never edit it once applied.
--
-- Verify: the pgTAP test beside this file (`tests/0024_genesis_settings_host.test.sql`).

create schema if not exists private;

create table public.genesis_setting_proposals (
  id bigint generated always as identity primary key,
  key text not null
    constraint genesis_setting_proposals_key_format check (key ~ '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*\.[a-z][a-zA-Z0-9]*$' and char_length(key) <= 200),
  value jsonb not null,
  locked boolean not null default false,
  reason text constraint genesis_setting_proposals_reason_length check (reason is null or char_length(reason) <= 1000),
  proposed_by uuid not null references auth.users (id) on delete cascade,
  -- The tenant whose admin asked (add a foreign key to your tenant table, as for 0023's tables);
  -- null when a person asked for themselves.
  tenant_id uuid,
  proposed_at timestamptz not null default now(),
  status text not null default 'pending'
    constraint genesis_setting_proposals_status check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  -- Where an approval wrote the value: `database` (everyone) or `tenant` (the requesting tenant).
  approved_layer text constraint genesis_setting_proposals_approved_layer check (approved_layer in ('database', 'tenant')),
  constraint genesis_setting_proposals_decided check ((status = 'pending') = (decided_at is null)),
  constraint genesis_setting_proposals_approved check ((status = 'approved') = (approved_layer is not null)),
  constraint genesis_setting_proposals_tenant_layer check (approved_layer is distinct from 'tenant' or tenant_id is not null)
);

-- One pending proposal per person, tenant and key: proposing again replaces it.
create unique index genesis_setting_proposals_one_pending on public.genesis_setting_proposals (proposed_by, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), key) where status = 'pending';
create index genesis_setting_proposals_status on public.genesis_setting_proposals (status, proposed_at desc);

comment on table public.genesis_setting_proposals is
  'Changes to the database layer someone asked for, with why; a platform admin approves (the value is written) or declines each. Written through propose_genesis_setting and decide_genesis_setting_proposal. Genesis settings.';

create table public.genesis_secret_rotations (
  id bigint generated always as identity primary key,
  name text not null constraint genesis_secret_rotations_name_format check (name ~ '^[A-Z][A-Z0-9_]{0,99}$'),
  -- True when the secret was created, false when an existing one was replaced.
  created boolean not null,
  rotated_by uuid references auth.users (id) on delete set null,
  rotated_at timestamptz not null default now()
);

create index genesis_secret_rotations_name on public.genesis_secret_rotations (name, rotated_at desc);

comment on table public.genesis_secret_rotations is
  'When each Vault secret was set from the Settings screen, and by whom. Never the value. Written by set_genesis_vault_secret. Genesis settings.';

-- The Vault secrets the installed packages declare (a catalogue entry's `secret` with store vault).
create or replace function private.genesis_settings_vault_names()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.value -> 'secret' ->> 'name'), '{}')
  from public.genesis_app_manifest m, jsonb_each(m.catalogue) c
  where jsonb_typeof(c.value) = 'object'
    and c.value -> 'secret' ->> 'store' = 'vault'
    and c.value -> 'secret' ->> 'name' ~ '^[A-Z][A-Z0-9_]{0,99}$';
$$;

create or replace function public.genesis_settings_viewer(tenant uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  admin boolean;
  tenant_admin boolean;
  m public.genesis_app_manifest;
  visible text;
begin
  if me is null then
    raise exception 'genesis_settings_viewer: not signed in' using errcode = '42501';
  end if;
  admin := private.genesis_is_platform_admin();
  tenant_admin := tenant is not null and private.genesis_settings_tenant_admin(tenant);
  select * into m from public.genesis_app_manifest limit 1;
  visible := case when admin then null when tenant_admin then 'tenant' else 'person' end;
  return jsonb_build_object(
    'platformAdmin', admin,
    'tenantAdmin', tenant_admin,
    'preset', coalesce(m.preset, 'max'),
    'reportedAt', m.reported_at,
    -- The keys of the viewer's scope, and every key they require (to any depth), so the client can
    -- resolve `requires` exactly; a required key of another scope is read-only to them.
    'catalogue', coalesce((
      with recursive wanted(key) as (
        select c.key from jsonb_each(coalesce(m.catalogue, '{}'::jsonb)) c
        where visible is null or (jsonb_typeof(c.value) = 'object' and c.value ->> 'scope' = visible)
        union
        select r.value #>> '{}'
        from wanted w
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(m.catalogue -> w.key -> 'requires') = 'array' then m.catalogue -> w.key -> 'requires' else '[]'::jsonb end
        ) r
        where m.catalogue ? (r.value #>> '{}')
      )
      select jsonb_object_agg(w.key, m.catalogue -> w.key) from wanted w
    ), '{}'::jsonb),
    -- What the app runs, for the Upgrades tab: platform admins only.
    'packages', case when admin then coalesce(m.packages, '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

comment on function public.genesis_settings_viewer(uuid) is
  'Who the signed-in person is to the settings (platform admin, the given tenant''s admin) and the synced catalogue they may see: every key for a platform admin, else the keys of their scope and the keys those require. Genesis settings.';

create or replace function public.propose_genesis_setting(key text, value jsonb, locked boolean default false, reason text default null, tenant uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored jsonb := coalesce(propose_genesis_setting.value, 'null'::jsonb);
  problem text;
  new_id bigint;
begin
  if me is null then
    raise exception 'propose_genesis_setting: not signed in' using errcode = '42501';
  end if;
  if propose_genesis_setting.key is null or propose_genesis_setting.locked is null then
    raise exception 'propose_genesis_setting: key and locked are required' using errcode = '22004';
  end if;
  -- A tenant's admin asks for their tenant; anyone else for themselves.
  if propose_genesis_setting.tenant is not null and not private.genesis_settings_tenant_admin(propose_genesis_setting.tenant) then
    raise exception 'propose_genesis_setting: only the tenant''s admins propose for it' using errcode = '42501';
  end if;
  if propose_genesis_setting.reason is not null and char_length(propose_genesis_setting.reason) > 1000 then
    raise exception 'propose_genesis_setting: the reason is longer than 1000 characters' using errcode = '22023';
  end if;
  problem := private.genesis_setting_problem(propose_genesis_setting.key, stored);
  if problem is not null then
    raise exception 'propose_genesis_setting: %', problem using errcode = '22023';
  end if;
  -- One proposal per person, tenant and key: two at once for the same one wait for each other here.
  perform pg_advisory_xact_lock(hashtext('genesis_setting_proposals'), hashtext(me::text || coalesce(propose_genesis_setting.tenant::text, '') || propose_genesis_setting.key));
  update public.genesis_setting_proposals p
    set value = stored, locked = propose_genesis_setting.locked, reason = nullif(btrim(propose_genesis_setting.reason), ''), proposed_at = now()
    where p.proposed_by = me and p.tenant_id is not distinct from propose_genesis_setting.tenant
      and p.key = propose_genesis_setting.key and p.status = 'pending'
    returning p.id into new_id;
  if new_id is not null then
    return new_id;
  end if;
  -- At most 20 waiting at once per person.
  if (select count(*) from public.genesis_setting_proposals p where p.proposed_by = me and p.status = 'pending') >= 20 then
    raise exception 'propose_genesis_setting: 20 of your proposals are still waiting for a decision' using errcode = '22023';
  end if;
  insert into public.genesis_setting_proposals (key, value, locked, reason, proposed_by, tenant_id)
  values (propose_genesis_setting.key, stored, propose_genesis_setting.locked, nullif(btrim(propose_genesis_setting.reason), ''), me, propose_genesis_setting.tenant)
  returning id into new_id;
  return new_id;
end;
$$;

comment on function public.propose_genesis_setting(text, jsonb, boolean, text, uuid) is
  'Asks for a value, with why, for a platform admin to approve (for everyone, or for the asking tenant only) or decline. Any signed-in person for themselves, a tenant''s admin for that tenant; checked against the catalogue like set_genesis_setting. Genesis settings.';

-- `layer`: `database` writes the value for everyone (as set_genesis_setting); `tenant` writes it
-- for the tenant that asked only, as its admins would, and only when its checks pass (a tenant-scope
-- key that neither genesis.config.json nor the database layer locks).
create or replace function public.decide_genesis_setting_proposal(proposal bigint, approve boolean, layer text default 'database')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.genesis_setting_proposals;
  problem text;
begin
  if me is null then
    raise exception 'decide_genesis_setting_proposal: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'decide_genesis_setting_proposal: only platform admins decide proposals' using errcode = '42501';
  end if;
  if proposal is null or approve is null or layer is null or layer not in ('database', 'tenant') then
    raise exception 'decide_genesis_setting_proposal: proposal, approve and a layer (database or tenant) are required' using errcode = '22004';
  end if;
  select * into p from public.genesis_setting_proposals s where s.id = proposal for update;
  if not found then
    raise exception 'decide_genesis_setting_proposal: no proposal %', proposal using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'decide_genesis_setting_proposal: proposal % was already %', proposal, p.status using errcode = '22023';
  end if;
  if approve and layer = 'database' then
    -- Checked and recorded exactly as the admin setting it by hand.
    perform public.set_genesis_setting(p.key, p.value, p.locked);
  elsif approve then
    if p.tenant_id is null then
      raise exception 'decide_genesis_setting_proposal: proposal % wasn''t made for a tenant', proposal using errcode = '22023';
    end if;
    problem := private.genesis_scoped_setting_problem('tenant', p.key, p.value);
    if problem is not null then
      raise exception 'decide_genesis_setting_proposal: %', problem using errcode = '22023';
    end if;
    insert into public.genesis_tenant_settings as t (tenant_id, key, value, updated_by, updated_at)
    values (p.tenant_id, p.key, p.value, me, now())
    on conflict on constraint genesis_tenant_settings_pkey do update
      set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      where t.value is distinct from excluded.value;
  end if;
  update public.genesis_setting_proposals s
    set status = case when approve then 'approved' else 'declined' end,
        approved_layer = case when approve then layer end,
        decided_by = me, decided_at = now()
    where s.id = proposal;
end;
$$;

comment on function public.decide_genesis_setting_proposal(bigint, boolean, text) is
  'Approves a pending proposal for everyone (the database layer, as set_genesis_setting) or for the asking tenant only (its layer, when the locks allow), or declines it. Platform admins only. Genesis settings.';

-- Every pending proposal for a platform admin; the caller's own (any status) for anyone else.
-- `tenant_layer_ok`: approving for the asking tenant alone would pass the tenant layer's checks now.
create or replace function public.genesis_setting_proposals(max_rows integer default 100)
returns table (id bigint, key text, value jsonb, locked boolean, reason text, proposed_by uuid, proposed_by_email text, tenant_id uuid, proposed_at timestamptz, status text, approved_layer text, decided_by uuid, decided_at timestamptz, tenant_layer_ok boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  admin boolean;
begin
  if me is null then
    raise exception 'genesis_setting_proposals: not signed in' using errcode = '42501';
  end if;
  admin := private.genesis_is_platform_admin();
  return query
    select p.id, p.key, p.value, p.locked, p.reason, p.proposed_by,
           case when admin then (select u.email::text from auth.users u where u.id = p.proposed_by) end,
           p.tenant_id, p.proposed_at, p.status, p.approved_layer, p.decided_by, p.decided_at,
           p.status = 'pending' and p.tenant_id is not null and private.genesis_scoped_setting_problem('tenant', p.key, p.value) is null
    from public.genesis_setting_proposals p
    where (admin and p.status = 'pending') or p.proposed_by = me
    order by p.proposed_at desc, p.id desc
    limit greatest(1, least(coalesce(max_rows, 100), 500));
end;
$$;

comment on function public.genesis_setting_proposals(integer) is
  'Proposals, newest first: every pending one for a platform admin, the caller''s own otherwise, with who asked, for which tenant, and whether approving for that tenant alone is allowed. Genesis settings.';

-- A plan's clear, applied only while the stored value is still the one the plan was made for:
-- false (nothing removed) when it changed or went in between. Platform admins only.
create or replace function public.clear_genesis_setting_if(key text, value jsonb, locked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'clear_genesis_setting_if: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'clear_genesis_setting_if: only platform admins can change settings' using errcode = '42501';
  end if;
  if clear_genesis_setting_if.key is null or clear_genesis_setting_if.value is null or clear_genesis_setting_if.locked is null then
    raise exception 'clear_genesis_setting_if: key, value and locked are required' using errcode = '22004';
  end if;
  perform set_config('genesis.setting_source', 'admin', true);
  delete from public.genesis_settings s
    where s.key = clear_genesis_setting_if.key and s.value = clear_genesis_setting_if.value and s.locked = clear_genesis_setting_if.locked;
  get diagnostics removed = row_count;
  perform set_config('genesis.setting_source', '', true);
  return removed > 0;
end;
$$;

comment on function public.clear_genesis_setting_if(text, jsonb, boolean) is
  'Removes a database-layer value only if it is still exactly this value and lock (a planned fix); true when it did. Platform admins only. Genesis settings.';

-- The value is a parameter all the way into Vault (see the header): no dynamic SQL here, and no
-- error names it.
create or replace function public.set_genesis_vault_secret(name text, value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing uuid;
begin
  if me is null then
    raise exception 'set_genesis_vault_secret: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'set_genesis_vault_secret: only platform admins set secrets' using errcode = '42501';
  end if;
  if name is null or name !~ '^[A-Z][A-Z0-9_]{0,99}$' then
    raise exception 'set_genesis_vault_secret: that isn''t a secret name (capitals, digits and _)' using errcode = '22023';
  end if;
  if not (name = any (private.genesis_settings_vault_names())) then
    raise exception 'set_genesis_vault_secret: % isn''t a Vault secret any installed package declares', name using errcode = '22023';
  end if;
  if set_genesis_vault_secret.value is null or btrim(set_genesis_vault_secret.value) = '' or char_length(set_genesis_vault_secret.value) > 8192 then
    raise exception 'set_genesis_vault_secret: the value must be 1 to 8192 characters, not only spaces' using errcode = '22023';
  end if;
  if to_regclass('vault.secrets') is null then
    raise exception 'set_genesis_vault_secret: Supabase Vault isn''t in this database' using errcode = '55000';
  end if;
  -- Two sets of the same name wait for each other, so the first one's create is never raced into
  -- a second create. A row lock can't do it: the database owner may only read vault.secrets (Vault
  -- writes it through its own functions), and FOR UPDATE needs UPDATE.
  perform pg_advisory_xact_lock(hashtext('genesis_vault_secret'), hashtext(set_genesis_vault_secret.name));
  select s.id into existing from vault.secrets s where s.name = set_genesis_vault_secret.name;
  if existing is null then
    perform vault.create_secret(set_genesis_vault_secret.value, set_genesis_vault_secret.name, 'Set from the Genesis Settings screen');
  else
    perform vault.update_secret(existing, set_genesis_vault_secret.value);
  end if;
  insert into public.genesis_secret_rotations (name, created, rotated_by) values (set_genesis_vault_secret.name, existing is null, me);
end;
$$;

comment on function public.set_genesis_vault_secret(text, text) is
  'Sets or rotates a Vault secret an installed package declares. Platform admins only; write-only (nothing returns the value); each change is recorded in genesis_secret_rotations without it. Genesis settings.';

create or replace function public.genesis_vault_secret_status()
returns table (name text, is_set boolean, last_rotated timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  vault_here boolean := to_regclass('vault.secrets') is not null;
begin
  if not private.genesis_is_platform_admin() then
    raise exception 'genesis_vault_secret_status: only platform admins read secret status' using errcode = '42501';
  end if;
  if vault_here then
    return query
      select n.name,
             exists (select 1 from vault.secrets s where s.name = n.name),
             greatest(
               (select max(r.rotated_at) from public.genesis_secret_rotations r where r.name = n.name),
               (select max(s.updated_at) from vault.secrets s where s.name = n.name)
             )
      from unnest(private.genesis_settings_vault_names()) as n(name)
      order by 1;
  else
    return query
      select n.name, false, (select max(r.rotated_at) from public.genesis_secret_rotations r where r.name = n.name)
      from unnest(private.genesis_settings_vault_names()) as n(name)
      order by 1;
  end if;
end;
$$;

comment on function public.genesis_vault_secret_status() is
  'Each Vault secret the installed packages declare: whether it is set, and when it was last set. Never a value. Platform admins only. Genesis settings.';

-- One history, newest first. `before_at` and `before_seq` are the last row of the page before
-- (null for the first page). `cleared` is true when the change removed the value (SQL null, never
-- a JSON null value). With `tenant`: that tenant's history, for its admins and platform
-- admins. Without: everything for a platform admin (the database layer, every tenant and person,
-- secret rotations), the caller's own person history for anyone else.
create or replace function public.genesis_settings_audit(tenant uuid default null, before_at timestamptz default null, before_seq text default null, max_rows integer default 25)
returns table (seq text, at timestamptz, kind text, layer text, subject text, old_value jsonb, new_value jsonb, old_locked boolean, new_locked boolean, cleared boolean, actor uuid, actor_email text, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  admin boolean;
  n integer := greatest(1, least(coalesce(max_rows, 25), 200));
begin
  if me is null then
    raise exception 'genesis_settings_audit: not signed in' using errcode = '42501';
  end if;
  admin := private.genesis_is_platform_admin();
  if tenant is not null and not public.genesis_settings_can_read(tenant, null, true) then
    raise exception 'genesis_settings_audit: only the tenant''s admins read its history' using errcode = '42501';
  end if;
  return query
    select x.seq, x.at, x.kind, x.layer, x.subject, x.old_value, x.new_value, x.old_locked, x.new_locked, x.cleared, x.actor,
           case when admin then (select u.email::text from auth.users u where u.id = x.actor) end,
           x.source
    from (
      select 'd:' || lpad(c.id::text, 19, '0') as seq, c.changed_at as at, 'setting'::text as kind, 'database'::text as layer, c.key as subject,
             c.old_value, c.new_value, c.old_locked, c.new_locked, c.new_value is null as cleared, c.changed_by as actor, c.source
      from public.genesis_setting_changes c
      where admin and tenant is null
      union all
      select 's:' || lpad(c.id::text, 19, '0'), c.changed_at, 'setting', c.layer, c.key,
             c.old_value, c.new_value, null::boolean, null::boolean, c.new_value is null, c.changed_by, null::text
      from public.genesis_scoped_setting_changes c
      where (tenant is not null and c.tenant_id = tenant)
         or (tenant is null and (admin or c.person_id = me))
      union all
      select 'v:' || lpad(r.id::text, 19, '0'), r.rotated_at, 'secret', null::text, r.name,
             null::jsonb, null::jsonb, null::boolean, null::boolean, false, r.rotated_by, null::text
      from public.genesis_secret_rotations r
      where admin and tenant is null
    ) x
    where before_at is null or (x.at, x.seq) < (before_at, coalesce(before_seq, ''))
    order by x.at desc, x.seq desc
    limit n;
end;
$$;

comment on function public.genesis_settings_audit(uuid, timestamptz, text, integer) is
  'The settings history, newest first, a page at a time: the database layer, tenant and person layers and secret rotations, each to those who may read it. Never a secret''s value. Genesis settings.';

alter table public.genesis_setting_proposals enable row level security;
alter table public.genesis_secret_rotations enable row level security;

-- Privileges by name (Supabase's default privileges open new tables and functions to anon and
-- authenticated; Postgres gives every function to public).
revoke all on table public.genesis_setting_proposals from public, anon, authenticated;
revoke all on table public.genesis_secret_rotations from public, anon, authenticated;
revoke all on sequence public.genesis_setting_proposals_id_seq from public, anon, authenticated;
revoke all on sequence public.genesis_secret_rotations_id_seq from public, anon, authenticated;
revoke all on table public.genesis_setting_proposals from service_role;
grant select on table public.genesis_setting_proposals to service_role;
revoke all on table public.genesis_secret_rotations from service_role;
grant select on table public.genesis_secret_rotations to service_role;

revoke execute on function public.genesis_settings_viewer(uuid) from public, anon;
grant execute on function public.genesis_settings_viewer(uuid) to authenticated;
revoke execute on function public.propose_genesis_setting(text, jsonb, boolean, text, uuid) from public, anon;
grant execute on function public.propose_genesis_setting(text, jsonb, boolean, text, uuid) to authenticated;
revoke execute on function public.decide_genesis_setting_proposal(bigint, boolean, text) from public, anon;
grant execute on function public.decide_genesis_setting_proposal(bigint, boolean, text) to authenticated;
revoke execute on function public.clear_genesis_setting_if(text, jsonb, boolean) from public, anon;
grant execute on function public.clear_genesis_setting_if(text, jsonb, boolean) to authenticated;
revoke execute on function public.genesis_setting_proposals(integer) from public, anon;
grant execute on function public.genesis_setting_proposals(integer) to authenticated;
revoke execute on function public.set_genesis_vault_secret(text, text) from public, anon;
grant execute on function public.set_genesis_vault_secret(text, text) to authenticated;
revoke execute on function public.genesis_vault_secret_status() from public, anon;
grant execute on function public.genesis_vault_secret_status() to authenticated;
revoke execute on function public.genesis_settings_audit(uuid, timestamptz, text, integer) from public, anon;
grant execute on function public.genesis_settings_audit(uuid, timestamptz, text, integer) to authenticated;

revoke execute on function private.genesis_settings_vault_names() from public, anon, authenticated;
