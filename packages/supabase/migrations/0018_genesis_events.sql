-- Genesis events: the app's own product events (ADR 0010).
--
--   public.genesis_events
--     One row per product event: when it happened, who (the login and, in a tenant, their person
--     record), where (the tenant), what (a short name and the feature id it belongs to), small
--     flat properties, the flags that were on, the platform and the app version. Properties are
--     labels and counts: no content someone typed, and identifiers only (the login and person
--     ids). Row security is on with no policies: only the service role reads it, and only the
--     functions below write it. Deleting a login (0001) clears its user_id.
--
--   public.genesis_track_events(events jsonb) returns integer
--     For a signed-in person. Takes a JSON array of at most 100 events and returns how many it
--     kept. An event naming a tenant the person has no record in (private.genesis_viewer_person_ids,
--     0016) is dropped, as is one with a bad name or oversized properties; the person record is
--     filled in from the tenant. A client clock more than five minutes ahead or seven days behind
--     is replaced by now(). A person keeps at most 2,000 events an hour (SQLSTATE GS429 past it)
--     and a call is at most 512 KB; a client can't claim the `server` platform.
--
--   public.genesis_track_server_events(events jsonb) returns integer
--     For server code (service role only): the same shape, plus user_id and person_id, trusted as
--     given.
--
--   public.genesis_feature_usage(tenant uuid, since timestamptz) returns table
--     Per feature in a tenant since a time: events, distinct people, the last one. Service role
--     only; the product hub reads usage through it.
--
--   public.genesis_prune_events(older_than interval default '400 days', max_rows integer default 50000) returns bigint
--     Deletes up to max_rows older events and returns how many (call again until 0). Service role
--     only; run it from a schedule.
--
-- Needs 0016 (its private.genesis_viewer_person_ids, which reads the app's people hook).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis add events` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: tests/0018_genesis_events.test.sql.

create table public.genesis_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- The login, when there was one; null for an event server code raised for nobody in particular.
  user_id uuid references auth.users (id) on delete set null,
  tenant_id uuid,
  person_id uuid,
  name text not null
    constraint genesis_events_name_format check (name ~ '^[a-z][a-z0-9]*([._:-][a-z0-9]+)*$' and char_length(name) <= 100),
  -- The FeatureId it belongs to. No foreign key: an app's registry mirror may lag a deploy.
  feature_id text
    constraint genesis_events_feature_format check (feature_id is null or (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100)),
  -- Flat: { "count": 3, "view": "grid" }, no nested objects or lists.
  properties jsonb not null default '{}'
    constraint genesis_events_properties_object check (jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 4096
      and not jsonb_path_exists(properties, '$.* ? (@.type() == "object" || @.type() == "array")')),
  -- The flags that were on, { "flag-id": value }, so a reader can split by them.
  flags jsonb not null default '{}'
    constraint genesis_events_flags_object check (jsonb_typeof(flags) = 'object' and octet_length(flags::text) <= 2048),
  platform text not null default 'web'
    constraint genesis_events_platform check (platform in ('web', 'native', 'server')),
  app_version text constraint genesis_events_app_version_length check (char_length(app_version) <= 40),
  session_id text constraint genesis_events_session_length check (char_length(session_id) <= 64)
);

comment on table public.genesis_events is
  'Product events: who, where, which feature, when, small flat properties and the flags that were on. No content; identifiers only. Written through genesis_track_events and genesis_track_server_events; read by the service role. Genesis events.';

create index genesis_events_tenant_time on public.genesis_events (tenant_id, occurred_at desc);
create index genesis_events_feature_time on public.genesis_events (feature_id, occurred_at desc) where feature_id is not null;
create index genesis_events_name_time on public.genesis_events (name, occurred_at desc);
-- Append-only by time: a BRIN index keeps pruning old events cheap at any size.
create index genesis_events_occurred_brin on public.genesis_events using brin (occurred_at);
create index genesis_events_user_received on public.genesis_events (user_id, received_at desc) where user_id is not null;

alter table public.genesis_events enable row level security;
revoke all on table public.genesis_events from public, anon, authenticated;

-- One event from a JSON object, checked, or null when it can't be kept. Shared by both writers.
create or replace function private.genesis_event_row(e jsonb, trusted boolean)
returns public.genesis_events
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.genesis_events;
  at timestamptz;
begin
  if jsonb_typeof(e) is distinct from 'object' then
    return null;
  end if;
  r.name := e ->> 'name';
  r.feature_id := nullif(e ->> 'feature', '');
  r.properties := coalesce(e -> 'properties', '{}');
  r.flags := coalesce(e -> 'flags', '{}');
  r.platform := coalesce(nullif(e ->> 'platform', ''), case when trusted then 'server' else 'web' end);
  r.app_version := nullif(e ->> 'appVersion', '');
  r.session_id := nullif(e ->> 'sessionId', '');
  if r.name is null or r.name !~ '^[a-z][a-z0-9]*([._:-][a-z0-9]+)*$' or char_length(r.name) > 100
     or (r.feature_id is not null and (r.feature_id !~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' or char_length(r.feature_id) > 100))
     or jsonb_typeof(r.properties) <> 'object' or octet_length(r.properties::text) > 4096
     or jsonb_path_exists(r.properties, '$.* ? (@.type() == "object" || @.type() == "array")')
     or jsonb_typeof(r.flags) <> 'object' or octet_length(r.flags::text) > 2048
     or r.platform not in ('web', 'native', 'server') or (r.platform = 'server' and not trusted)
     or char_length(r.app_version) > 40 or char_length(r.session_id) > 64 then
    return null;
  end if;
  begin
    at := (e ->> 'occurredAt')::timestamptz;
  exception when others then
    at := null;
  end;
  r.occurred_at := case when at is null or at > now() + interval '5 minutes' or at < now() - interval '7 days' then now() else at end;
  r.received_at := now();
  begin
    r.tenant_id := nullif(e ->> 'tenantId', '')::uuid;
    if trusted then
      r.user_id := nullif(e ->> 'userId', '')::uuid;
      r.person_id := nullif(e ->> 'personId', '')::uuid;
    end if;
  exception when others then
    return null;
  end;
  return r;
end;
$$;

revoke execute on function private.genesis_event_row(jsonb, boolean) from public, anon, authenticated;

create or replace function public.genesis_track_events(events jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  r public.genesis_events;
  kept integer := 0;
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'genesis_track_events: sign in first' using errcode = '42501';
  end if;
  -- One login's calls take turns, so two at once can't both pass the hourly limit.
  perform pg_advisory_xact_lock(hashtextextended('genesis_events:' || viewer::text, 0));
  if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) > 100 or octet_length(events::text) > 524288 then
    raise exception 'genesis_track_events: send a JSON array of at most 100 events and 512 KB' using errcode = '22023';
  end if;
  -- At most 2,000 kept events per login per hour, so one login can't fill the table.
  if (select count(*) from public.genesis_events g where g.user_id = viewer and g.received_at > now() - interval '1 hour') + jsonb_array_length(events) > 2000 then
    raise exception 'genesis_track_events: too many events this hour' using errcode = 'GS429';
  end if;
  for e in select value from jsonb_array_elements(events) loop
    r := private.genesis_event_row(e, false);
    continue when r is null;
    r.user_id := viewer;
    if r.tenant_id is not null then
      -- Only a tenant the person has a record in, and that record is who they were there.
      select v.person_id into r.person_id from private.genesis_viewer_person_ids() v where v.tenant_id = r.tenant_id order by v.person_id limit 1;
      continue when r.person_id is null;
    end if;
    insert into public.genesis_events (occurred_at, received_at, user_id, tenant_id, person_id, name, feature_id, properties, flags, platform, app_version, session_id)
    values (r.occurred_at, r.received_at, r.user_id, r.tenant_id, r.person_id, r.name, r.feature_id, r.properties, r.flags, r.platform, r.app_version, r.session_id);
    kept := kept + 1;
  end loop;
  return kept;
end;
$$;

comment on function public.genesis_track_events(jsonb) is
  'Records a signed-in person''s product events (a JSON array of at most 100); returns how many were kept. Events in a tenant the person has no record in, or that fail the checks, are dropped. Genesis events.';

revoke execute on function public.genesis_track_events(jsonb) from public, anon;
grant execute on function public.genesis_track_events(jsonb) to authenticated;

create or replace function public.genesis_track_server_events(events jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  r public.genesis_events;
  kept integer := 0;
begin
  if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) > 1000 or octet_length(events::text) > 4194304 then
    raise exception 'genesis_track_server_events: send a JSON array of at most 1000 events' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(events) loop
    r := private.genesis_event_row(e, true);
    continue when r is null;
    -- A login that no longer exists (or never did) is kept as no login, not an error for the batch.
    if r.user_id is not null and not exists (select 1 from auth.users u where u.id = r.user_id) then
      r.user_id := null;
    end if;
    insert into public.genesis_events (occurred_at, received_at, user_id, tenant_id, person_id, name, feature_id, properties, flags, platform, app_version, session_id)
    values (r.occurred_at, r.received_at, r.user_id, r.tenant_id, r.person_id, r.name, r.feature_id, r.properties, r.flags, r.platform, r.app_version, r.session_id);
    kept := kept + 1;
  end loop;
  return kept;
end;
$$;

comment on function public.genesis_track_server_events(jsonb) is
  'Records product events from server code (service role): userId, tenantId and personId are trusted as given. Returns how many were kept. Genesis events.';

revoke execute on function public.genesis_track_server_events(jsonb) from public, anon, authenticated;
grant execute on function public.genesis_track_server_events(jsonb) to service_role;

create or replace function public.genesis_feature_usage(tenant uuid, since timestamptz)
returns table (feature_id text, events bigint, people bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- Two branches so each uses genesis_events_tenant_time: one tenant, or the events with none.
  select e.feature_id, count(*), count(distinct coalesce(e.person_id, e.user_id)), max(e.occurred_at)
  from public.genesis_events e
  where tenant is not null and e.tenant_id = tenant and e.occurred_at >= since and e.feature_id is not null
  group by e.feature_id
  union all
  select e.feature_id, count(*), count(distinct coalesce(e.person_id, e.user_id)), max(e.occurred_at)
  from public.genesis_events e
  where tenant is null and e.tenant_id is null and e.occurred_at >= since and e.feature_id is not null
  group by e.feature_id
  order by 2 desc
$$;

comment on function public.genesis_feature_usage(uuid, timestamptz) is
  'Per feature in a tenant since a time: events, distinct people and the last event. Service role only. Genesis events.';

revoke execute on function public.genesis_feature_usage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.genesis_feature_usage(uuid, timestamptz) to service_role;

create or replace function public.genesis_prune_events(older_than interval default '400 days', max_rows integer default 50000)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  -- At most max_rows per call, so one run never holds a long lock; call again until it returns 0.
  with gone as (
    delete from public.genesis_events
     where id in (select e.id from public.genesis_events e
                   where older_than > interval '0' and e.occurred_at < now() - older_than
                   limit greatest(1, least(max_rows, 500000)))
    returning 1)
  select count(*) from gone
$$;

comment on function public.genesis_prune_events(interval, integer) is
  'Deletes up to max_rows (default 50,000) events older than older_than (default 400 days) and returns how many; call again until 0. Service role only; run it from a schedule. Genesis events.';

revoke execute on function public.genesis_prune_events(interval, integer) from public, anon, authenticated;
grant execute on function public.genesis_prune_events(interval, integer) to service_role;
