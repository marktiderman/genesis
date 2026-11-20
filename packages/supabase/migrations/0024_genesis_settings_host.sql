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
--   genesis_setting_proposals           a change someone asked for (who, key, value, why), which a
--                                       platform admin approves (the value is written, as by
--                                       set_genesis_setting) or declines.
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
-- quotes it. Postgres logs a statement's parameters only with log_parameter_max_length_on_error > 0
-- or log_statement = 'all' with log_parameter_max_length <> 0: leave those at Supabase's defaults.
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
  proposed_at timestamptz not null default now(),
  status text not null default 'pending'
    constraint genesis_setting_proposals_status check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  constraint genesis_setting_proposals_decided check ((status = 'pending') = (decided_at is null))
);

-- One pending proposal per person and key: proposing again replaces it.
create unique index genesis_setting_proposals_one_pending on public.genesis_setting_proposals (proposed_by, key) where status = 'pending';
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
    'catalogue', coalesce((
      select jsonb_object_agg(c.key, c.value)
      from jsonb_each(coalesce(m.catalogue, '{}'::jsonb)) c
      where visible is null or (jsonb_typeof(c.value) = 'object' and c.value ->> 'scope' = visible)
    ), '{}'::jsonb),
    -- What the app runs, for the Upgrades tab: platform admins only.
    'packages', case when admin then coalesce(m.packages, '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

comment on function public.genesis_settings_viewer(uuid) is
  'Who the signed-in person is to the settings (platform admin, the given tenant''s admin) and the synced catalogue they may see: every key for a platform admin, else the keys of their scope. Genesis settings.';

create or replace function public.propose_genesis_setting(key text, value jsonb, locked boolean default false, reason text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
  if propose_genesis_setting.reason is not null and char_length(propose_genesis_setting.reason) > 1000 then
    raise exception 'propose_genesis_setting: the reason is longer than 1000 characters' using errcode = '22023';
  end if;
  problem := private.genesis_setting_problem(propose_genesis_setting.key, stored);
  if problem is not null then
    raise exception 'propose_genesis_setting: %', problem using errcode = '22023';
  end if;
  -- At most 20 waiting at once per person (a new one for a key they already proposed replaces it).
  if (select count(*) from public.genesis_setting_proposals p
      where p.proposed_by = me and p.status = 'pending' and p.key <> propose_genesis_setting.key) >= 20 then
    raise exception 'propose_genesis_setting: 20 of your proposals are still waiting for a decision' using errcode = '22023';
  end if;
  insert into public.genesis_setting_proposals as p (key, value, locked, reason, proposed_by)
  values (propose_genesis_setting.key, stored, propose_genesis_setting.locked, nullif(btrim(propose_genesis_setting.reason), ''), me)
  on conflict (proposed_by, key) where status = 'pending' do update
    set value = excluded.value, locked = excluded.locked, reason = excluded.reason, proposed_at = now()
  returning p.id into new_id;
  return new_id;
end;
$$;

comment on function public.propose_genesis_setting(text, jsonb, boolean, text) is
  'Asks for a database-layer value, with why, for a platform admin to approve or decline. Any signed-in person; checked against the catalogue like set_genesis_setting. Genesis settings.';

create or replace function public.decide_genesis_setting_proposal(proposal bigint, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.genesis_setting_proposals;
begin
  if me is null then
    raise exception 'decide_genesis_setting_proposal: not signed in' using errcode = '42501';
  end if;
  if not private.genesis_is_platform_admin() then
    raise exception 'decide_genesis_setting_proposal: only platform admins decide proposals' using errcode = '42501';
  end if;
  if proposal is null or approve is null then
    raise exception 'decide_genesis_setting_proposal: proposal and approve are required' using errcode = '22004';
  end if;
  select * into p from public.genesis_setting_proposals s where s.id = proposal for update;
  if not found then
    raise exception 'decide_genesis_setting_proposal: no proposal %', proposal using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'decide_genesis_setting_proposal: proposal % was already %', proposal, p.status using errcode = '22023';
  end if;
  if approve then
    -- Checked and recorded exactly as the admin setting it by hand.
    perform public.set_genesis_setting(p.key, p.value, p.locked);
  end if;
  update public.genesis_setting_proposals s
    set status = case when approve then 'approved' else 'declined' end, decided_by = me, decided_at = now()
    where s.id = proposal;
end;
$$;

comment on function public.decide_genesis_setting_proposal(bigint, boolean) is
  'Approves (writes the value, as set_genesis_setting) or declines a pending proposal. Platform admins only. Genesis settings.';

-- Every pending proposal for a platform admin; the caller's own (any status) for anyone else.
create or replace function public.genesis_setting_proposals(max_rows integer default 100)
returns table (id bigint, key text, value jsonb, locked boolean, reason text, proposed_by uuid, proposed_by_email text, proposed_at timestamptz, status text, decided_by uuid, decided_at timestamptz)
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
           p.proposed_at, p.status, p.decided_by, p.decided_at
    from public.genesis_setting_proposals p
    where (admin and p.status = 'pending') or p.proposed_by = me
    order by p.proposed_at desc, p.id desc
    limit greatest(1, least(coalesce(max_rows, 100), 500));
end;
$$;

comment on function public.genesis_setting_proposals(integer) is
  'Proposals, newest first: every pending one for a platform admin, the caller''s own otherwise. Genesis settings.';

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
  select s.id into existing from vault.secrets s where s.name = set_genesis_vault_secret.name for update;
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
revoke execute on function public.propose_genesis_setting(text, jsonb, boolean, text) from public, anon;
grant execute on function public.propose_genesis_setting(text, jsonb, boolean, text) to authenticated;
revoke execute on function public.decide_genesis_setting_proposal(bigint, boolean) from public, anon;
grant execute on function public.decide_genesis_setting_proposal(bigint, boolean) to authenticated;
revoke execute on function public.genesis_setting_proposals(integer) from public, anon;
grant execute on function public.genesis_setting_proposals(integer) to authenticated;
revoke execute on function public.set_genesis_vault_secret(text, text) from public, anon;
grant execute on function public.set_genesis_vault_secret(text, text) to authenticated;
revoke execute on function public.genesis_vault_secret_status() from public, anon;
grant execute on function public.genesis_vault_secret_status() to authenticated;
revoke execute on function public.genesis_settings_audit(uuid, timestamptz, text, integer) from public, anon;
grant execute on function public.genesis_settings_audit(uuid, timestamptz, text, integer) to authenticated;

revoke execute on function private.genesis_settings_vault_names() from public, anon, authenticated;
