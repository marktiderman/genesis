-- Genesis meetings: public.meeting_types, public.meetings, public.meeting_attendees and
-- public.meeting_links
--
-- A meeting type is a reusable format: a name, a length and an agenda (steps with minutes), such
-- as a weekly team meeting, a one-on-one, a workshop or a planning day. A meeting is one
-- occurrence: when it is, its calendar event, the agenda copied from its type when it starts (so
-- editing the type never rewrites history), which step it's on, who facilitates and takes notes,
-- and its notes, recording and transcript. Attendees are who's invited, who was there, and each
-- one's rating of the meeting (1 to 10) with a note. Links point a meeting at its pre-work, a
-- live worksheet, a resource or a collaboration space.
--
-- Tenants and owners: as in 0009_genesis_pursuits, every type and meeting belongs to one tenant
-- and has exactly one owner (a person, a team or the tenant). Attendees and links take their
-- meeting's tenant and owner. This file uses the same app hooks as 0009, failing closed:
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
--
-- Who may do what:
--   - read a meeting, its attendees and links: whoever may read its owner, and its attendees;
--   - schedule, run and edit a meeting, invite people, mark presence and add links: whoever may
--     write its owner;
--   - rate a meeting: each attendee, their own rating only.
--
-- Collaboration: private.genesis_meeting_members(meeting) lists a meeting's attendees, for an app
-- to register as a collaboration audience, so a pre-work or live worksheet space follows the
-- attendee list without copying it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0011. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0012_genesis_meetings.test.sql`).

create schema if not exists private;

-- Tables ---------------------------------------------------------------------------------------

create table public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  name text not null
    constraint meeting_types_name_length check (char_length(btrim(name)) between 1 and 200),
  description text,
  default_minutes integer
    constraint meeting_types_minutes check (default_minutes between 1 and 1440),
  -- The steps: [{ "key": "segue", "title": "Check-in", "minutes": 5 }, ...].
  agenda jsonb not null default '[]'::jsonb
    constraint meeting_types_agenda_array check (jsonb_typeof(agenda) = 'array'),
  active boolean not null default true,
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_types_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint meeting_types_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id)
);

comment on table public.meeting_types is
  'Reusable meeting formats with an agenda. Genesis meetings. @genesis {"label": "Meeting types", "labelField": "name"}';

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  meeting_type_id uuid references public.meeting_types (id) on delete set null,
  title text not null
    constraint meetings_title_length check (char_length(btrim(title)) between 1 and 300),
  scheduled_at timestamptz,
  duration_minutes integer
    constraint meetings_minutes check (duration_minutes between 1 and 1440),
  -- The calendar event this meeting is, in the calendar the app syncs with.
  calendar_event_id text
    constraint meetings_calendar_event_length check (calendar_event_id is null or char_length(calendar_event_id) <= 500),
  status text not null default 'scheduled'
    constraint meetings_status check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  -- Copied from the type when the meeting starts; never rewritten by editing the type.
  agenda jsonb not null default '[]'::jsonb
    constraint meetings_agenda_array check (jsonb_typeof(agenda) = 'array'),
  current_step integer
    constraint meetings_current_step check (current_step >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  facilitator_id uuid references auth.users (id) on delete set null,
  scribe_id uuid references auth.users (id) on delete set null,
  notes text,
  recording_url text,
  transcript_url text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint meetings_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint meetings_ended_after_start check (ended_at is null or started_at is null or ended_at >= started_at)
);

comment on table public.meetings is
  'Meetings: schedule, agenda, live step, notes and recordings. Genesis meetings. @genesis {"label": "Meetings", "labelField": "title"}';

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Copied from the meeting, for access; never written by the app.
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  present boolean,
  rating smallint
    constraint meeting_attendees_rating check (rating between 1 and 10),
  rating_note text
    constraint meeting_attendees_rating_note_length check (rating_note is null or char_length(rating_note) <= 2000),
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

comment on table public.meeting_attendees is
  'Who is invited, who was there, and each one''s rating. Genesis meetings.';

create table public.meeting_links (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  kind text not null
    constraint meeting_links_kind check (kind in ('prework', 'worksheet', 'resource', 'space', 'other')),
  -- What it points at, in the app's terms: a form id, a resource id, a collaboration space id.
  ref text not null
    constraint meeting_links_ref_length check (char_length(ref) between 1 and 500),
  title text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.meeting_links is
  'A meeting''s pre-work, worksheets, resources and collaboration spaces. Genesis meetings.';

create index meeting_types_tenant_owner_idx on public.meeting_types (tenant_id, coalesce(person_id, team_id, organization_id));
create index meeting_types_created_by_idx on public.meeting_types (created_by);
create index meetings_tenant_owner_idx on public.meetings (tenant_id, coalesce(person_id, team_id, organization_id));
create index meetings_scheduled_idx on public.meetings (tenant_id, scheduled_at);
create index meetings_type_idx on public.meetings (meeting_type_id);
create index meetings_facilitator_idx on public.meetings (facilitator_id);
create index meetings_scribe_idx on public.meetings (scribe_id);
create index meetings_created_by_idx on public.meetings (created_by);
create index meeting_attendees_user_idx on public.meeting_attendees (user_id);
create index meeting_attendees_tenant_owner_idx on public.meeting_attendees (tenant_id, coalesce(person_id, team_id, organization_id));
create index meeting_links_meeting_idx on public.meeting_links (meeting_id, position);
create index meeting_links_tenant_owner_idx on public.meeting_links (tenant_id, coalesce(person_id, team_id, organization_id));

-- Access helpers -------------------------------------------------------------------------------

create or replace function private.genesis_meetings_caller_is_person()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
$$;

create or replace function private.genesis_meetings_readable()
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
  return query execute 'select r.tenant_id::uuid, r.owner_id::uuid from private.genesis_readable_owners($1) r' using auth.uid();
exception when others then
  return;
end;
$$;

create or replace function private.genesis_meetings_can_write(tenant uuid, person uuid, team uuid, organization uuid)
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
  execute 'select (private.genesis_owner_can($1, $2, $3, $4, $5, ''write''))::boolean'
    into allowed using tenant, auth.uid(), person, team, organization;
  return coalesce(allowed, false);
exception when others then
  return false;
end;
$$;

-- Whether the signed-in person is an attendee of a meeting.
create or replace function private.genesis_meetings_attends(meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.meeting_attendees a where a.meeting_id = meeting and a.user_id = auth.uid())
$$;

-- A meeting's attendees, for a collaboration audience.
create or replace function private.genesis_meeting_members(meeting uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.meeting_attendees a where a.meeting_id = meeting
$$;

-- Guards ---------------------------------------------------------------------------------------

-- Types and meetings: the fixed tenant and owner for signed-in people, who made it, updated_at,
-- a type in the same tenant, the agenda copied at start, and the start and end times.
create or replace function private.genesis_meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_agenda jsonb;
begin
  -- Refuse a signed-in writer who may not write here before checking anything else, so errors
  -- reveal nothing about other tenants.
  if private.genesis_meetings_caller_is_person()
     and not private.genesis_meetings_can_write(new.tenant_id, new.person_id, new.team_id, new.organization_id) then
    raise exception 'permission denied for table %', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if private.genesis_meetings_caller_is_person() then
      new.created_by := auth.uid();
    end if;
  else
    if private.genesis_meetings_caller_is_person() then
      if new.tenant_id is distinct from old.tenant_id
         or new.person_id is distinct from old.person_id
         or new.team_id is distinct from old.team_id
         or new.organization_id is distinct from old.organization_id then
        raise exception 'A %''s tenant and owner never change', tg_table_name using errcode = '22023';
      end if;
      new.created_by := old.created_by;
    end if;
    new.updated_at := now();
  end if;

  if tg_table_name = 'meetings' then
    if new.meeting_type_id is not null
       and (tg_op = 'INSERT' or new.meeting_type_id is distinct from old.meeting_type_id) then
      select t.agenda into type_agenda from public.meeting_types t
       where t.id = new.meeting_type_id and t.tenant_id = new.tenant_id;
      if not found then
        raise exception 'A meeting''s type must be in the same tenant' using errcode = '22023';
      end if;
    end if;
    if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
      new.started_at := coalesce(new.started_at, now());
      new.current_step := coalesce(new.current_step, 0);
      if new.agenda = '[]'::jsonb and new.meeting_type_id is not null then
        select t.agenda into type_agenda from public.meeting_types t where t.id = new.meeting_type_id;
        new.agenda := coalesce(type_agenda, '[]'::jsonb);
      end if;
    end if;
    if new.status = 'ended' and (tg_op = 'INSERT' or old.status is distinct from 'ended') then
      new.ended_at := coalesce(new.ended_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger meeting_types_guard
  before insert or update on public.meeting_types
  for each row execute function private.genesis_meetings_guard();
create trigger meetings_guard
  before insert or update on public.meetings
  for each row execute function private.genesis_meetings_guard();

-- Attendees and links take their meeting's tenant and owner. A signed-in attendee who can't
-- write the meeting may change only their own rating and its note.
create or replace function private.genesis_meeting_parts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid; p uuid; tm uuid; o uuid;
begin
  if tg_op = 'UPDATE' and new.meeting_id is distinct from old.meeting_id then
    raise exception 'A meeting''s part never moves to another meeting' using errcode = '22023';
  end if;
  select m.tenant_id, m.person_id, m.team_id, m.organization_id into t, p, tm, o
    from public.meetings m where m.id = new.meeting_id;
  if private.genesis_meetings_caller_is_person() and t is null then
    raise exception 'permission denied for %', tg_table_name using errcode = '42501';
  end if;
  new.tenant_id := t; new.person_id := p; new.team_id := tm; new.organization_id := o;

  if tg_table_name = 'meeting_attendees' then
    if tg_op = 'UPDATE' and private.genesis_meetings_caller_is_person()
       and not private.genesis_meetings_can_write(t, p, tm, o) then
      if new.user_id is distinct from old.user_id or new.present is distinct from old.present then
        raise exception 'An attendee changes only their own rating' using errcode = '42501';
      end if;
    end if;
    if new.rating is distinct from (case when tg_op = 'UPDATE' then old.rating end)
       or new.rating_note is distinct from (case when tg_op = 'UPDATE' then old.rating_note end) then
      if private.genesis_meetings_caller_is_person() and new.user_id <> auth.uid() then
        raise exception 'Only the attendee rates the meeting' using errcode = '42501';
      end if;
      new.rated_at := case when new.rating is null then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

create trigger meeting_attendees_guard
  before insert or update on public.meeting_attendees
  for each row execute function private.genesis_meeting_parts_guard();
create trigger meeting_links_guard
  before insert or update on public.meeting_links
  for each row execute function private.genesis_meeting_parts_guard();

revoke execute on function private.genesis_meetings_guard() from public, anon, authenticated;
revoke execute on function private.genesis_meeting_parts_guard() from public, anon, authenticated;
revoke execute on function private.genesis_meetings_caller_is_person() from public, anon, authenticated;
revoke execute on function private.genesis_meeting_members(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_meetings_readable() from public, anon;
revoke execute on function private.genesis_meetings_can_write(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function private.genesis_meetings_attends(uuid) from public, anon;
grant execute on function private.genesis_meetings_readable() to authenticated;
grant execute on function private.genesis_meetings_can_write(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.genesis_meetings_attends(uuid) to authenticated;

-- Policies -------------------------------------------------------------------------------------

alter table public.meeting_types enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_links enable row level security;

create policy meeting_types_read on public.meeting_types for select to authenticated
  using (exists (select 1 from private.genesis_meetings_readable() r
                 where r.tenant_id = meeting_types.tenant_id
                   and r.owner_id = coalesce(meeting_types.person_id, meeting_types.team_id, meeting_types.organization_id)));
create policy meeting_types_write on public.meeting_types for all to authenticated
  using (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id));

create policy meetings_read on public.meetings for select to authenticated
  using (exists (select 1 from private.genesis_meetings_readable() r
                 where r.tenant_id = meetings.tenant_id
                   and r.owner_id = coalesce(meetings.person_id, meetings.team_id, meetings.organization_id))
         or private.genesis_meetings_attends(id));
create policy meetings_write on public.meetings for all to authenticated
  using (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id));

create policy meeting_attendees_read on public.meeting_attendees for select to authenticated
  using (exists (select 1 from private.genesis_meetings_readable() r
                 where r.tenant_id = meeting_attendees.tenant_id
                   and r.owner_id = coalesce(meeting_attendees.person_id, meeting_attendees.team_id, meeting_attendees.organization_id))
         or private.genesis_meetings_attends(meeting_id));
create policy meeting_attendees_manage on public.meeting_attendees for all to authenticated
  using (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id));
create policy meeting_attendees_rate on public.meeting_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy meeting_links_read on public.meeting_links for select to authenticated
  using (exists (select 1 from private.genesis_meetings_readable() r
                 where r.tenant_id = meeting_links.tenant_id
                   and r.owner_id = coalesce(meeting_links.person_id, meeting_links.team_id, meeting_links.organization_id))
         or private.genesis_meetings_attends(meeting_id));
create policy meeting_links_write on public.meeting_links for all to authenticated
  using (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id))
  with check (private.genesis_meetings_can_write(tenant_id, person_id, team_id, organization_id));

revoke all on public.meeting_types, public.meetings, public.meeting_attendees, public.meeting_links
  from public, anon, authenticated;
grant select, insert, update, delete on public.meeting_types, public.meetings, public.meeting_attendees, public.meeting_links
  to authenticated;
grant all on public.meeting_types, public.meetings, public.meeting_attendees, public.meeting_links to service_role;

-- Ratings ---------------------------------------------------------------------------------------

create view public.meeting_ratings
with (security_invoker = true) as
select a.meeting_id,
       count(a.rating)::int as ratings,
       round(avg(a.rating)::numeric, 1) as average,
       count(*) filter (where a.present)::int as present
from public.meeting_attendees a
group by a.meeting_id;

comment on view public.meeting_ratings is
  'Each meeting''s ratings count and average, and how many attended. Genesis meetings.';

revoke all on public.meeting_ratings from public, anon, authenticated;
grant select on public.meeting_ratings to authenticated, service_role;
