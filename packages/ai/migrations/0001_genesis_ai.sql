-- Genesis AI: consent, budgets and the usage record for every AI call, in the
-- genesis_ai schema. The TypeScript half is @marktiderman/genesis-ai; its
-- `supabaseStore` (from `@marktiderman/genesis-ai/supabase`) calls the functions
-- here with a service-role client, on the server only.
--
--   consents  every time someone agreed to share their data with a vendor (anthropic,
--             openai, deepgram) or withdrew, with the version of the text they saw. It
--             only grows: the latest row per person and vendor is the answer, the rest
--             is the record. A person adds their own with genesis_ai.set_consent.
--   budgets   a monthly limit in USD for a tenant, a person without a tenant, or the
--             default for everyone; how much of a tenant's one person may spend; and how
--             many calls one may have open at once. No matching row means no limit.
--   keys      a tenant's or a person's own vendor key (BYOK). The key itself is in
--             Supabase Vault; the row keeps its last four characters. Calls on an own
--             key are recorded but don't spend the platform budget.
--   calls     one row per call: opened by begin_call when the call is admitted, closed
--             by finish_call with its outcome, the model that answered, tokens, cost,
--             latency and the context manifest (layer names, token counts and row ids).
--             Never a prompt, an answer or anything a person wrote.
--
-- Budgets: begin_call admits a call on the platform's key while this month's platform spend
-- plus the estimates of calls still open stays within the limit (and the person's share
-- within per_person_usd), so the overshoot is bounded by what one call can
-- cost beyond its estimate. Admission for a tenant is serialized with an advisory lock.
-- Calls open for more than 15 minutes stop counting (a crashed server). Safety checks
-- (budget_exempt) are always admitted.
--
-- Who can do what (granted and revoked by name, never in bulk):
--   authenticated  read their own consents, keys (never the key) and calls;
--                  genesis_ai.set_consent for themselves; genesis_ai.set_key and
--                  remove_key for their own key or, as a tenant's admin, the tenant's;
--                  and, gated by private.genesis_ai_admin (through genesis_ai.i_admin),
--                  read a tenant's calls and keys.
--   service_role   begin_call, finish_call, has_consent, key_for, set_budget, prune.
--
-- Vault: keys are stored with Supabase Vault (vault.create_secret), which every Supabase
-- project has.
--
-- Admins: private.genesis_ai_admin(user uuid, tenant uuid) says who may read a tenant's
-- calls (tenant null: every call). It answers false until you replace it in a migration of
-- your own, after this one:
--
--   create or replace function private.genesis_ai_admin(p_user uuid, p_tenant uuid)
--   returns boolean language sql stable security definer set search_path = '' as $$
--     select exists (select 1 from public.practice_members m
--                    where m.user_id = p_user and m.practice_id = p_tenant and m.role in ('owner', 'admin'))
--   $$;
--
-- People: a person is a login (auth.users). Deleting a login deletes its consents and its
-- own keys; its calls stay for the tenant's accounts with the person cleared.
--
-- Use: `genesis add ai` copies this file into supabase/migrations under a new timestamped
-- name. Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_ai.test.sql`).

create schema if not exists private;
create schema if not exists genesis_ai;

comment on schema genesis_ai is 'Genesis AI: consent, budgets and the usage record of every AI call. Reached through RLS and the functions in this schema.';

grant usage on schema genesis_ai to authenticated, service_role;

-- ── Consents ──────────────────────────────────────────────────────────────────

create table genesis_ai.consents (
  id bigint generated always as identity primary key,
  person_id uuid not null references auth.users (id) on delete cascade,
  vendor text not null
    constraint consents_vendor_format check (vendor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  granted boolean not null,
  -- The version of the consent text the person saw, when the app versions it.
  policy_version text constraint consents_policy_version_length check (char_length(policy_version) <= 64),
  at timestamptz not null default now()
);
comment on table genesis_ai.consents is
  'Every consent to share data with an AI vendor, and every withdrawal; the latest row per person and vendor counts. Added through genesis_ai.set_consent. Genesis AI.';
create index consents_latest on genesis_ai.consents (person_id, vendor, id desc);

alter table genesis_ai.consents enable row level security;
create policy consents_owner_read on genesis_ai.consents
  for select to authenticated using (person_id = (select auth.uid()));
revoke all on table genesis_ai.consents from public, anon, authenticated;
grant select on table genesis_ai.consents to authenticated;
grant select, insert, delete on table genesis_ai.consents to service_role;

-- ── Budgets ───────────────────────────────────────────────────────────────────

create table genesis_ai.budgets (
  -- 'default', 'tenant:<uuid>' or 'person:<uuid>' (a person with no tenant).
  scope text primary key
    constraint budgets_scope_format check (scope = 'default' or scope ~ '^(tenant|person):[0-9a-f-]{36}$'),
  monthly_usd numeric(12, 4)
    constraint budgets_monthly_usd_positive check (monthly_usd is null or monthly_usd >= 0),
  max_open_calls integer
    constraint budgets_max_open_calls_positive check (max_open_calls is null or max_open_calls > 0),
  -- Of a tenant's monthly_usd, the most one person may spend.
  per_person_usd numeric(12, 4)
    constraint budgets_per_person_usd_positive check (per_person_usd is null or per_person_usd >= 0),
  updated_at timestamptz not null default now()
);
comment on table genesis_ai.budgets is
  'Monthly AI spend limits (USD) and open-call limits by tenant, by person without a tenant, or by default. Set with genesis_ai.set_budget. Genesis AI.';

alter table genesis_ai.budgets enable row level security;
revoke all on table genesis_ai.budgets from public, anon, authenticated;
grant select, insert, update, delete on table genesis_ai.budgets to service_role;

-- ── Calls ─────────────────────────────────────────────────────────────────────

create table genesis_ai.calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  person_id uuid references auth.users (id) on delete set null,
  task_id text not null
    constraint calls_task_id_format check (task_id ~ '^[a-z0-9]+([.-][a-z0-9]+)*$' and char_length(task_id) <= 128),
  task_version integer not null constraint calls_task_version_positive check (task_version > 0),
  vendor text not null constraint calls_vendor_format check (vendor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  requested_model text not null constraint calls_requested_model_length check (char_length(requested_model) between 1 and 128),
  estimate_usd numeric(12, 6) not null constraint calls_estimate_positive check (estimate_usd >= 0),
  budget_exempt boolean not null default false,
  -- Whose key paid: the platform's, or the tenant's or person's own (BYOK).
  key_source text not null default 'platform' constraint calls_key_source check (key_source in ('platform', 'tenant', 'person')),
  started_at timestamptz not null default now(),
  -- Set by finish_call.
  outcome text
    constraint calls_outcome check (outcome in ('ok', 'invalid_input', 'off', 'no_consent', 'forbidden', 'safety_routed',
                                                'over_budget', 'refused', 'invalid_output', 'unavailable')),
  model text constraint calls_model_length check (char_length(model) <= 128),
  input_tokens integer constraint calls_input_tokens check (input_tokens >= 0),
  cache_read_tokens integer constraint calls_cache_read_tokens check (cache_read_tokens >= 0),
  cache_write_tokens integer constraint calls_cache_write_tokens check (cache_write_tokens >= 0),
  output_tokens integer constraint calls_output_tokens check (output_tokens >= 0),
  quantity numeric(14, 4) constraint calls_quantity check (quantity >= 0),
  cost_usd numeric(12, 6) not null default 0 constraint calls_cost_positive check (cost_usd >= 0),
  latency_ms integer constraint calls_latency check (latency_ms >= 0),
  -- [{ "name": "recent messages", "tokens": 1200, "ids": ["…"] }]: names, counts and ids only.
  manifest jsonb not null default '[]'::jsonb
    constraint calls_manifest_shape check (
      jsonb_typeof(manifest) = 'array'
      and pg_column_size(manifest) <= 32768
      and not jsonb_path_exists(manifest, '$[*] ? (@.type() != "object" || @.name.type() != "string" || @.tokens.type() != "number")')
      and not jsonb_path_exists(manifest, '$[*].keyvalue() ? (@.key != "name" && @.key != "tokens" && @.key != "ids")')
      and not jsonb_path_exists(manifest, '$[*].ids[*] ? (@.type() != "string")')
    ),
  detail text constraint calls_detail_length check (char_length(detail) <= 200),
  finished_at timestamptz,
  constraint calls_finished_with_outcome check ((outcome is null) = (finished_at is null))
);
comment on table genesis_ai.calls is
  'One row per AI call: who, which task and model, outcome, tokens, cost, latency and the context manifest. Never content. Written by begin_call and finish_call. Genesis AI.';

create index calls_tenant_month on genesis_ai.calls (tenant_id, started_at desc);
create index calls_person on genesis_ai.calls (person_id, started_at desc);
create index calls_open on genesis_ai.calls (started_at) where finished_at is null;

-- ── Keys (BYOK) ───────────────────────────────────────────────────────────────

create table genesis_ai.keys (
  -- 'tenant:<uuid>' or 'person:<uuid>'.
  scope text not null constraint keys_scope_format check (scope ~ '^(tenant|person):[0-9a-f-]{36}$'),
  vendor text not null constraint keys_vendor_format check (vendor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  -- The key, in Supabase Vault. Only key_for reads it, as the service role.
  secret_id uuid not null,
  -- Its last four characters, so people can tell keys apart.
  hint text not null constraint keys_hint_length check (char_length(hint) <= 8),
  person_id uuid references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (scope, vendor),
  constraint keys_person_scope check ((scope like 'person:%') = (person_id is not null))
);
comment on table genesis_ai.keys is
  'A tenant''s or person''s own AI vendor key (BYOK). The key is in Vault; this row has its hint. Changed through genesis_ai.set_key and remove_key. Genesis AI.';

-- ── Admins ────────────────────────────────────────────────────────────────────

-- Replace in a migration of your own (see the header). Answers false until then.
create function private.genesis_ai_admin(p_user uuid, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select false $$;
revoke execute on function private.genesis_ai_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function private.genesis_ai_admin(uuid, uuid) to service_role;

-- Whether the signed-in person administers a tenant's AI use (tenant null: all of it).
-- The policy's way to reach the private check without granting the private schema.
create function genesis_ai.i_admin(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.genesis_ai_admin((select auth.uid()), p_tenant), false) $$;
revoke execute on function genesis_ai.i_admin(uuid) from public, anon;
grant execute on function genesis_ai.i_admin(uuid) to authenticated;

alter table genesis_ai.calls enable row level security;
create policy calls_owner_read on genesis_ai.calls
  for select to authenticated using (person_id = (select auth.uid()));
create policy calls_admin_read on genesis_ai.calls
  for select to authenticated using (genesis_ai.i_admin(tenant_id) or genesis_ai.i_admin(null));
revoke all on table genesis_ai.calls from public, anon, authenticated;
grant select on table genesis_ai.calls to authenticated;
grant select, delete on table genesis_ai.calls to service_role;

alter table genesis_ai.keys enable row level security;
create policy keys_owner_read on genesis_ai.keys
  for select to authenticated using (person_id = (select auth.uid()));
create policy keys_admin_read on genesis_ai.keys
  for select to authenticated using (scope like 'tenant:%' and genesis_ai.i_admin(substr(scope, 8)::uuid));
revoke all on table genesis_ai.keys from public, anon, authenticated;
grant select (scope, vendor, hint, person_id, created_by, updated_at) on table genesis_ai.keys to authenticated;
grant select on table genesis_ai.keys to service_role;

-- ── Functions ─────────────────────────────────────────────────────────────────

-- The scope a budget applies to: the tenant's, else the person's.
create function private.genesis_ai_scope(p_tenant uuid, p_person uuid)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p_tenant is not null then 'tenant:' || p_tenant::text else 'person:' || coalesce(p_person::text, '') end $$;
revoke execute on function private.genesis_ai_scope(uuid, uuid) from public, anon, authenticated;

-- A person agrees to (or withdraws from) sharing with a vendor, to a version of the text.
create function genesis_ai.set_consent(p_vendor text, p_granted boolean, p_policy_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'genesis_ai.set_consent: sign in first' using errcode = '42501';
  end if;
  if p_vendor is null or p_vendor !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or p_granted is null then
    raise exception 'genesis_ai.set_consent: unknown vendor' using errcode = '22023';
  end if;
  insert into genesis_ai.consents (person_id, vendor, granted, policy_version) values (me, p_vendor, p_granted, p_policy_version);
end $$;
revoke execute on function genesis_ai.set_consent(text, boolean, text) from public, anon;
grant execute on function genesis_ai.set_consent(text, boolean, text) to authenticated;

-- Whether a person's latest word on a vendor is yes (to this version of the text, when given).
create function genesis_ai.has_consent(p_person uuid, p_vendor text, p_policy_version text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted and (p_policy_version is null or c.policy_version is not distinct from p_policy_version)
    from genesis_ai.consents c
    where c.person_id = p_person and c.vendor = p_vendor
    order by c.id desc
    limit 1
  ), false)
$$;
revoke execute on function genesis_ai.has_consent(uuid, text, text) from public, anon, authenticated;
grant execute on function genesis_ai.has_consent(uuid, text, text) to service_role;

-- Whether the signed-in person may change a key in this scope: their own, or their tenant's as its admin.
create function private.genesis_ai_may_manage_key(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_scope = 'person:' || (select auth.uid())::text then true
    when p_scope ~ '^tenant:[0-9a-f-]{36}$' then coalesce(private.genesis_ai_admin((select auth.uid()), substr(p_scope, 8)::uuid), false)
    else false
  end
$$;
revoke execute on function private.genesis_ai_may_manage_key(text) from public, anon, authenticated;

-- Stores a tenant's or person's own key in Vault (replacing one there). Returns its hint.
create function genesis_ai.set_key(p_scope text, p_vendor text, p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_hint text;
  v_secret uuid;
begin
  if me is null or not private.genesis_ai_may_manage_key(p_scope) then
    raise exception 'genesis_ai.set_key: not yours to change' using errcode = '42501';
  end if;
  if p_vendor is null or p_vendor !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'genesis_ai.set_key: unknown vendor' using errcode = '22023';
  end if;
  if p_key is null or char_length(btrim(p_key)) < 12 or char_length(p_key) > 512 then
    raise exception 'genesis_ai.set_key: that isn''t a key' using errcode = '22023';
  end if;
  v_hint := right(btrim(p_key), 4);
  select k.secret_id into v_secret from genesis_ai.keys k where k.scope = p_scope and k.vendor = p_vendor for update;
  if v_secret is null then
    v_secret := vault.create_secret(btrim(p_key), null, 'genesis_ai key ' || p_vendor);
    insert into genesis_ai.keys (scope, vendor, secret_id, hint, person_id, created_by)
    values (p_scope, p_vendor, v_secret, v_hint, case when p_scope like 'person:%' then me end, me);
  else
    perform vault.update_secret(v_secret, btrim(p_key));
    update genesis_ai.keys set hint = v_hint, created_by = me, updated_at = now() where scope = p_scope and vendor = p_vendor;
  end if;
  return v_hint;
end $$;
revoke execute on function genesis_ai.set_key(text, text, text) from public, anon;
grant execute on function genesis_ai.set_key(text, text, text) to authenticated;

-- Removes a key and its Vault secret.
create function genesis_ai.remove_key(p_scope text, p_vendor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.genesis_ai_may_manage_key(p_scope) then
    raise exception 'genesis_ai.remove_key: not yours to change' using errcode = '42501';
  end if;
  -- The trigger below takes its Vault secret with it.
  delete from genesis_ai.keys k where k.scope = p_scope and k.vendor = p_vendor;
end $$;
revoke execute on function genesis_ai.remove_key(text, text) from public, anon;
grant execute on function genesis_ai.remove_key(text, text) to authenticated;

-- The key a call should use: the person's own, else their tenant's, else none (the platform's).
create function genesis_ai.key_for(p_tenant uuid, p_person uuid, p_vendor text)
returns table (api_key text, source text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret, split_part(k.scope, ':', 1)
  from genesis_ai.keys k
  join vault.decrypted_secrets d on d.id = k.secret_id
  where k.vendor = p_vendor
    and (k.scope = 'person:' || p_person::text or (p_tenant is not null and k.scope = 'tenant:' || p_tenant::text))
  order by (k.scope like 'person:%') desc
  limit 1
$$;
revoke execute on function genesis_ai.key_for(uuid, uuid, text) from public, anon, authenticated;
grant execute on function genesis_ai.key_for(uuid, uuid, text) to service_role;

-- A deleted login's own keys leave Vault with them.
create function private.genesis_ai_forget_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets s where s.id = old.secret_id;
  return old;
end $$;
revoke execute on function private.genesis_ai_forget_key() from public, anon, authenticated;
create trigger keys_forget_secret after delete on genesis_ai.keys
  for each row execute function private.genesis_ai_forget_key();

-- Sets (or, with every limit null, removes) a budget.
create function genesis_ai.set_budget(p_scope text, p_monthly_usd numeric, p_max_open_calls integer default null, p_per_person_usd numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_monthly_usd is null and p_max_open_calls is null and p_per_person_usd is null then
    delete from genesis_ai.budgets where scope = p_scope;
    return;
  end if;
  insert into genesis_ai.budgets (scope, monthly_usd, max_open_calls, per_person_usd) values (p_scope, p_monthly_usd, p_max_open_calls, p_per_person_usd)
  on conflict (scope) do update
    set monthly_usd = excluded.monthly_usd, max_open_calls = excluded.max_open_calls, per_person_usd = excluded.per_person_usd, updated_at = now();
end $$;
revoke execute on function genesis_ai.set_budget(text, numeric, integer, numeric) from public, anon, authenticated;
grant execute on function genesis_ai.set_budget(text, numeric, integer, numeric) to service_role;

-- Admits a call: returns its id, or null when the budget or the open-call limit says no.
-- A call on an own key (p_key_source tenant or person) counts toward the open-call limit
-- but not the platform budget.
create function genesis_ai.begin_call(
  p_tenant uuid,
  p_person uuid,
  p_task text,
  p_task_version integer,
  p_vendor text,
  p_model text,
  p_estimate_usd numeric,
  p_budget_exempt boolean default false,
  p_key_source text default 'platform'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := private.genesis_ai_scope(p_tenant, p_person);
  v_budget genesis_ai.budgets;
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_platform boolean := coalesce(p_key_source, 'platform') = 'platform';
  v_spent numeric;
  v_reserved numeric;
  v_mine numeric;
  v_open integer;
  v_id uuid;
begin
  if p_person is null and p_tenant is null then
    raise exception 'genesis_ai.begin_call: a call needs a person or a tenant' using errcode = '22023';
  end if;
  if coalesce(p_estimate_usd, -1) < 0 then
    raise exception 'genesis_ai.begin_call: the estimate must be zero or more' using errcode = '22023';
  end if;

  if not coalesce(p_budget_exempt, false) then
    -- One admission at a time per scope, so two calls can't both take the last of a budget.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('genesis_ai:' || v_scope, 0));
    select * into v_budget from genesis_ai.budgets b where b.scope = v_scope;
    if not found then
      select * into v_budget from genesis_ai.budgets b where b.scope = 'default';
    end if;
    if v_budget.scope is not null then
      -- Spend and reservations count the platform's key only; the open-call limit counts every call.
      select coalesce(sum(c.cost_usd) filter (where c.finished_at is not null and c.key_source = 'platform'), 0),
             coalesce(sum(c.estimate_usd) filter (where c.finished_at is null and c.key_source = 'platform' and not c.budget_exempt), 0),
             coalesce(sum(case when c.finished_at is not null then c.cost_usd else c.estimate_usd end)
                        filter (where c.person_id = p_person and c.key_source = 'platform' and not c.budget_exempt), 0),
             count(*) filter (where c.finished_at is null and not c.budget_exempt)
        into v_spent, v_reserved, v_mine, v_open
        from genesis_ai.calls c
       where (case when p_tenant is not null then c.tenant_id = p_tenant else c.tenant_id is null and c.person_id = p_person end)
         and c.started_at >= v_month
         and (c.finished_at is not null or c.started_at > now() - interval '15 minutes');
      if v_budget.max_open_calls is not null and v_open >= v_budget.max_open_calls then
        return null;
      end if;
      if v_platform and v_budget.monthly_usd is not null and v_spent + v_reserved + p_estimate_usd > v_budget.monthly_usd then
        return null;
      end if;
      if v_platform and p_tenant is not null and v_budget.per_person_usd is not null and v_mine + p_estimate_usd > v_budget.per_person_usd then
        return null;
      end if;
    end if;
  end if;

  insert into genesis_ai.calls (tenant_id, person_id, task_id, task_version, vendor, requested_model, estimate_usd, budget_exempt, key_source)
  values (p_tenant, p_person, p_task, p_task_version, p_vendor, p_model, p_estimate_usd, coalesce(p_budget_exempt, false), coalesce(p_key_source, 'platform'))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function genesis_ai.begin_call(uuid, uuid, text, integer, text, text, numeric, boolean, text) from public, anon, authenticated;
grant execute on function genesis_ai.begin_call(uuid, uuid, text, integer, text, text, numeric, boolean, text) to service_role;

-- Closes a call with what happened. Raises if it isn't open.
create function genesis_ai.finish_call(
  p_call uuid,
  p_outcome text,
  p_model text,
  p_input_tokens integer,
  p_cache_read_tokens integer,
  p_cache_write_tokens integer,
  p_output_tokens integer,
  p_quantity numeric,
  p_cost_usd numeric,
  p_latency_ms integer,
  p_manifest jsonb,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_ai.calls c
     set outcome = p_outcome,
         model = p_model,
         input_tokens = p_input_tokens,
         cache_read_tokens = p_cache_read_tokens,
         cache_write_tokens = p_cache_write_tokens,
         output_tokens = p_output_tokens,
         quantity = p_quantity,
         cost_usd = coalesce(p_cost_usd, 0),
         latency_ms = p_latency_ms,
         manifest = coalesce(p_manifest, '[]'::jsonb),
         detail = p_detail,
         finished_at = now()
   where c.id = p_call and c.finished_at is null;
  if not found then
    raise exception 'genesis_ai.finish_call: no open call %', p_call using errcode = 'P0002';
  end if;
  return p_call;
end $$;
revoke execute on function genesis_ai.finish_call(uuid, text, text, integer, integer, integer, integer, numeric, numeric, integer, jsonb, text) from public, anon, authenticated;
grant execute on function genesis_ai.finish_call(uuid, text, text, integer, integer, integer, integer, numeric, numeric, integer, jsonb, text) to service_role;

-- Deletes calls older than the given age. Returns how many.
create function genesis_ai.prune(p_older_than interval default interval '400 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from genesis_ai.calls c where c.started_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function genesis_ai.prune(interval) from public, anon, authenticated;
grant execute on function genesis_ai.prune(interval) to service_role;
