-- Genesis metrics: public.metrics, public.metric_values and public.metric_goal_changes
--
-- A metric is a number someone tracks over time: a weekly sales count, a monthly profit margin,
-- a daily yes or no for a habit, a quarterly score. It has an owner, a unit, a cadence, a goal
-- with a direction, and a source (typed in by hand, worked out by a formula, or filled by a
-- sync job). Each period gets at most one value. Values over periods are the trend.
--
-- Tenants and owners: as in 0009_genesis_pursuits, every metric belongs to one tenant and has
-- exactly one owner, a person (person_id), a team (team_id) or the tenant (organization_id, equal
-- to tenant_id). A value copies its metric's tenant and owner. Add your foreign keys in a later
-- migration.
--
-- The app hooks are the same two 0009 uses, and this file needs them the same way:
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
-- Without them nobody signed in reads or writes. The service role (a sync job) isn't limited.
--
-- Periods: a value's period_start is the first day of its period (a day, the week's first day,
-- the month's, the quarter's or the year's). Which day starts a week is the app's choice (see
-- genesis-core/dates); this file doesn't check it, it only keeps one value per metric and period.
--
-- Goals change over time. Changing a metric's goal records the old one in metric_goal_changes,
-- and metric_values_with_goal shows each value against the goal in effect for its period: the
-- value's own override, else the goal recorded for that period, else the metric's current goal.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0009. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0010_genesis_metrics.test.sql`).

create schema if not exists private;

-- Metrics --------------------------------------------------------------------------------------

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  name text not null
    constraint metrics_name_length check (char_length(btrim(name)) between 1 and 200),
  description text,
  unit_type text not null default 'number'
    constraint metrics_unit_type check (unit_type in ('number', 'currency', 'percent', 'yes_no', 'duration')),
  -- What to show beside the number, such as '$', 'calls' or 'kg'. Display only.
  unit text
    constraint metrics_unit_length check (unit is null or char_length(unit) <= 20),
  cadence text not null default 'weekly'
    constraint metrics_cadence check (cadence in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  goal_direction text not null default 'at_least'
    constraint metrics_goal_direction check (goal_direction in ('at_least', 'at_most', 'between', 'none')),
  goal_value numeric,
  goal_max numeric,
  -- A leading (input) or lagging (result) measure, when the team says which.
  measure_kind text
    constraint metrics_measure_kind check (measure_kind in ('leading', 'lagging')),
  -- How the same metric across child teams adds up in a parent's view.
  rollup text not null default 'sum'
    constraint metrics_rollup check (rollup in ('sum', 'average', 'latest', 'none')),
  -- Metrics with the same key across teams are "the same number", for rollups and templates.
  template_key text
    constraint metrics_template_key_format check (template_key is null or template_key ~ '^[a-z][a-z0-9_-]{0,59}$'),
  source text not null default 'manual'
    constraint metrics_source check (source in ('manual', 'formula', 'sheet', 'quickbooks', 'hubspot', 'query')),
  -- A synced source's connected account, so many metrics share one connection and revoking it
  -- stops them all. No foreign key here: the connected-accounts table comes in a later migration.
  connection_id uuid,
  -- Where a synced value comes from (a sheet and range, a report): ids and options only, never a
  -- secret.
  source_config jsonb not null default '{}'::jsonb
    constraint metrics_source_config_object check (jsonb_typeof(source_config) = 'object'),
  -- The last sync's outcome, so a failing source shows instead of going quietly stale.
  last_synced_at timestamptz,
  last_error text
    constraint metrics_last_error_length check (last_error is null or char_length(last_error) <= 1000),
  -- A formula over other metrics: { "op": "-", "args": [{ "metric": "<uuid>" }, { "number": 7 }] }.
  formula jsonb,
  -- Shown only to those the app trusts with it (money, for example). Display rule only:
  -- who may read the row is still the hooks.
  sensitive boolean not null default false,
  position integer not null default 0,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metrics_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint metrics_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint metrics_between_bounds check (
    goal_direction <> 'between' or (goal_value is not null and goal_max is not null and goal_max >= goal_value)),
  constraint metrics_max_only_between check (goal_direction = 'between' or goal_max is null),
  constraint metrics_formula_source check ((source = 'formula') = (formula is not null)),
  constraint metrics_formula_object check (formula is null or jsonb_typeof(formula) = 'object'),
  constraint metrics_synced_names_connection check (
    (source in ('sheet', 'quickbooks', 'hubspot')) = (connection_id is not null))
);

comment on table public.metrics is
  'Numbers tracked over time, owned by a person, a team or the tenant. Genesis metrics. @genesis {"label": "Metrics", "labelField": "name"}';
comment on column public.metrics.measure_kind is 'Leading (input) or lagging (result). @genesis {"label": "Leading or lagging"}';
comment on column public.metrics.template_key is 'The same number across teams, for rollups. @genesis {"label": "Template key"}';

create index metrics_tenant_owner_idx on public.metrics (tenant_id, coalesce(person_id, team_id, organization_id));
create index metrics_template_idx on public.metrics (tenant_id, template_key) where template_key is not null;
create index metrics_created_by_idx on public.metrics (created_by);
create index metrics_connection_idx on public.metrics (connection_id) where connection_id is not null;

-- Values ---------------------------------------------------------------------------------------

create table public.metric_values (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.metrics (id) on delete cascade,
  -- Copied from the metric, for access; never written by the app.
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  period_start date not null,
  value numeric,
  -- A goal for this period only (a holiday week), or a forecast for a future one.
  goal_override numeric,
  goal_max_override numeric,
  note text,
  source text not null default 'manual'
    constraint metric_values_source check (source in ('manual', 'formula', 'sheet', 'quickbooks', 'hubspot', 'query', 'worksheet')),
  -- What the value came from, so the writer can update its own value and a screen can link back:
  -- for a worksheet answer, the entry's id; for a sync, the row or cell it read.
  source_ref text
    constraint metric_values_source_ref_length check (source_ref is null or char_length(source_ref) <= 200),
  entered_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- When a sync last wrote this value.
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_values_one_per_period unique (metric_id, period_start)
);

comment on table public.metric_values is
  'One value per metric and period. Genesis metrics. @genesis {"label": "Metric values", "labelField": "period_start"}';

create index metric_values_tenant_owner_idx on public.metric_values (tenant_id, coalesce(person_id, team_id, organization_id));
create index metric_values_period_idx on public.metric_values (metric_id, period_start desc);
create index metric_values_entered_by_idx on public.metric_values (entered_by);

-- Goal history ---------------------------------------------------------------------------------

create table public.metric_goal_changes (
  id bigint generated always as identity primary key,
  metric_id uuid not null references public.metrics (id) on delete cascade,
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  -- The goal that applied to periods before `until_period`.
  until_period date not null,
  goal_direction text not null,
  goal_value numeric,
  goal_max numeric,
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table public.metric_goal_changes is
  'Earlier goals of a metric, each with the period it applied until. Written by the database. Genesis metrics.';

create index metric_goal_changes_metric_idx on public.metric_goal_changes (metric_id, until_period);
create index metric_goal_changes_changed_by_idx on public.metric_goal_changes (changed_by);

-- Guards ---------------------------------------------------------------------------------------

-- Security definer so the goal history is written whoever changes the goal (the history table
-- takes no direct writes).
create or replace function private.genesis_metrics_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.person_id is distinct from old.person_id
       or new.team_id is distinct from old.team_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'A metric''s tenant and owner never change' using errcode = '22023';
    end if;
    if new.unit_type is distinct from old.unit_type
       and exists (select 1 from public.metric_values v where v.metric_id = old.id and v.value is not null) then
      raise exception 'A metric''s unit type is fixed once it has values' using errcode = '22023';
    end if;
    if (new.goal_direction, new.goal_value, new.goal_max) is distinct from (old.goal_direction, old.goal_value, old.goal_max) then
      insert into public.metric_goal_changes (metric_id, tenant_id, person_id, team_id, organization_id,
                                              until_period, goal_direction, goal_value, goal_max)
      values (old.id, old.tenant_id, old.person_id, old.team_id, old.organization_id,
              current_date, old.goal_direction, old.goal_value, old.goal_max);
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger metrics_guard
  before update on public.metrics
  for each row execute function private.genesis_metrics_guard();

-- A value's tenant and owner come from its metric, always.
create or replace function private.genesis_metric_values_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  if tg_op = 'UPDATE' and new.metric_id is distinct from old.metric_id then
    raise exception 'A value never moves to another metric' using errcode = '22023';
  end if;
  select mt.tenant_id, mt.person_id, mt.team_id, mt.organization_id, mt.unit_type
    into m from public.metrics mt where mt.id = new.metric_id;
  new.tenant_id := m.tenant_id;
  new.person_id := m.person_id;
  new.team_id := m.team_id;
  new.organization_id := m.organization_id;
  if m.unit_type = 'yes_no' and new.value is not null and new.value not in (0, 1) then
    raise exception 'A yes or no metric takes 1 (yes) or 0 (no)' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger metric_values_guard
  before insert or update on public.metric_values
  for each row execute function private.genesis_metric_values_guard();

-- Access ---------------------------------------------------------------------------------------

-- Same answers as 0009's, under this file's own names so either file stands without the other.
create or replace function private.genesis_metrics_readable()
returns table (tenant_id uuid, owner_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regprocedure('private.genesis_readable_owners(uuid)') is null then
    return;
  end if;
  return query execute 'select r.tenant_id, r.owner_id from private.genesis_readable_owners($1) r' using auth.uid();
end;
$$;

create or replace function private.genesis_metrics_can_write(tenant uuid, person uuid, team uuid, organization uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null or tenant is null
     or to_regprocedure('private.genesis_owner_can(uuid,uuid,uuid,uuid,uuid,text)') is null then
    return false;
  end if;
  execute 'select private.genesis_owner_can($1, $2, $3, $4, $5, ''write'')'
    into allowed using tenant, auth.uid(), person, team, organization;
  return coalesce(allowed, false);
end;
$$;

revoke execute on function private.genesis_metrics_guard() from public, anon, authenticated;
revoke execute on function private.genesis_metric_values_guard() from public, anon, authenticated;
revoke execute on function private.genesis_metrics_readable() from public, anon;
revoke execute on function private.genesis_metrics_can_write(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.genesis_metrics_readable() to authenticated;
grant execute on function private.genesis_metrics_can_write(uuid, uuid, uuid, uuid) to authenticated;

alter table public.metrics enable row level security;
alter table public.metric_values enable row level security;
alter table public.metric_goal_changes enable row level security;

create policy metrics_read on public.metrics for select to authenticated
  using ((tenant_id, coalesce(person_id, team_id, organization_id)) in (select r.tenant_id, r.owner_id from private.genesis_metrics_readable() r));
create policy metrics_insert on public.metrics for insert to authenticated
  with check (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));
create policy metrics_update on public.metrics for update to authenticated
  using (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));
create policy metrics_delete on public.metrics for delete to authenticated
  using (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));

create policy metric_values_read on public.metric_values for select to authenticated
  using ((tenant_id, coalesce(person_id, team_id, organization_id)) in (select r.tenant_id, r.owner_id from private.genesis_metrics_readable() r));
-- The values' owner columns are filled by the guard before the check runs.
create policy metric_values_insert on public.metric_values for insert to authenticated
  with check (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));
create policy metric_values_update on public.metric_values for update to authenticated
  using (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));
create policy metric_values_delete on public.metric_values for delete to authenticated
  using (private.genesis_metrics_can_write(tenant_id, person_id, team_id, organization_id));

create policy metric_goal_changes_read on public.metric_goal_changes for select to authenticated
  using ((tenant_id, coalesce(person_id, team_id, organization_id)) in (select r.tenant_id, r.owner_id from private.genesis_metrics_readable() r));

revoke all on public.metrics, public.metric_values, public.metric_goal_changes from public, anon, authenticated;
grant select, insert, update, delete on public.metrics, public.metric_values to authenticated;
grant select on public.metric_goal_changes to authenticated;
grant all on public.metrics, public.metric_values, public.metric_goal_changes to service_role;

-- Each value against the goal in effect for its period ----------------------------------------

create view public.metric_values_with_goal
with (security_invoker = true) as
select
  v.id,
  v.metric_id,
  v.tenant_id,
  v.period_start,
  v.value,
  v.note,
  v.source,
  v.source_ref,
  v.entered_by,
  coalesce(g.goal_direction, m.goal_direction) as goal_direction,
  coalesce(v.goal_override, g.goal_value, m.goal_value) as goal_value,
  coalesce(v.goal_max_override, g.goal_max, m.goal_max) as goal_max,
  case
    when v.value is null then null
    when coalesce(g.goal_direction, m.goal_direction) = 'none' then null
    when coalesce(g.goal_direction, m.goal_direction) = 'at_least'
      then v.value >= coalesce(v.goal_override, g.goal_value, m.goal_value)
    when coalesce(g.goal_direction, m.goal_direction) = 'at_most'
      then v.value <= coalesce(v.goal_override, g.goal_value, m.goal_value)
    else v.value between coalesce(v.goal_override, g.goal_value, m.goal_value)
                     and coalesce(v.goal_max_override, g.goal_max, m.goal_max)
  end as on_goal
from public.metric_values v
join public.metrics m on m.id = v.metric_id
left join lateral (
  select c.goal_direction, c.goal_value, c.goal_max
  from public.metric_goal_changes c
  where c.metric_id = v.metric_id and c.until_period > v.period_start
  order by c.until_period asc, c.id asc
  limit 1
) g on true;

comment on view public.metric_values_with_goal is
  'Each value with the goal in effect for its period and whether it met it. Genesis metrics.';

revoke all on public.metric_values_with_goal from public, anon, authenticated;
grant select on public.metric_values_with_goal to authenticated, service_role;
