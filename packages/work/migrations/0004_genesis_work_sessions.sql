-- Genesis sessions: genesis_work.session_types, genesis_work.sessions, genesis_work.session_attendees and
-- genesis_work.session_links
--
-- A session is any time people meet: a team meeting, a workshop, a presentation, a coaching
-- call, a one-on-one, a class or a planning day (its kind). A session type is a reusable format:
-- a kind, a name, a length and an agenda (steps with minutes). A session is one occurrence: when
-- it is, its calendar event, the agenda copied from its type when it starts (so editing the type
-- never rewrites history), which step it's on, who facilitates and takes notes, and its notes,
-- recording and transcript. Attendees are who's invited, who was there, and each one's rating of
-- the session (1 to 10) with a note. Links point a session at its pre-work, a live worksheet, a
-- resource or a collaboration space.
--
-- Tenants and owners: as in 0001_genesis_work_pursuits, every type and session belongs to one tenant
-- and has exactly one owner (a person, a team or the tenant). Attendees and links take their
-- session's tenant and owner. This file needs 0009 and uses its owner-access contract (genesis_owner_readable and
-- genesis_owner_allows) over the same app hooks, failing closed:
--   private.genesis_readable_owners(viewer uuid) returns table (tenant_id uuid, owner_id uuid)
--   private.genesis_owner_can(tenant uuid, viewer uuid, person_id uuid, team_id uuid,
--                             organization_id uuid, action text) returns boolean
--
-- Who may do what:
--   - read a session, its attendees and links: whoever may read its owner, and its attendees;
--   - schedule, run and edit a session, invite people, mark presence and add links: whoever may
--     write its owner;
--   - rate a session: each attendee, their own rating only, once it's live or ended;
--   - leave a session: each attendee, their own row.
-- An invitee who may not read the session's owner comes in only as a guest (set by a writer): a
-- guest sees the session and its links, and only their own attendee row. A facilitator or scribe
-- is an attendee or someone who may read the owner. A session type is used only by someone who
-- may read it, so a private type's agenda never leaks.
--
-- Collaboration: private.genesis_session_members(session) lists a session's attendees, for an app
-- to register as a collaboration audience, so a pre-work or live worksheet space follows the
-- attendee list without copying it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it), after 0011. Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0004_genesis_work_sessions.test.sql`).

create schema if not exists private;
create schema if not exists genesis_work;

-- Tables ---------------------------------------------------------------------------------------

create table genesis_work.session_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  kind text not null default 'meeting'
    constraint session_types_kind check (kind in ('meeting', 'workshop', 'presentation', 'coaching_call', 'one_on_one', 'class', 'planning', 'other')),
  name text not null
    constraint session_types_name_length check (char_length(btrim(name)) between 1 and 200),
  description text,
  default_minutes integer
    constraint session_types_minutes check (default_minutes between 1 and 1440),
  -- The steps: [{ "key": "segue", "title": "Check-in", "minutes": 5 }, ...].
  agenda jsonb not null default '[]'::jsonb
    constraint session_types_agenda_array check (jsonb_typeof(agenda) = 'array'),
  active boolean not null default true,
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_types_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint session_types_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id)
);

comment on table genesis_work.session_types is
  'Reusable session formats with an agenda. Genesis sessions. @genesis {"label": "Session types", "labelField": "name"}';

create table genesis_work.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  session_type_id uuid references genesis_work.session_types (id) on delete set null,
  -- Taken from the type when the session has one.
  kind text not null default 'meeting'
    constraint sessions_kind check (kind in ('meeting', 'workshop', 'presentation', 'coaching_call', 'one_on_one', 'class', 'planning', 'other')),
  title text not null
    constraint sessions_title_length check (char_length(btrim(title)) between 1 and 300),
  scheduled_at timestamptz,
  duration_minutes integer
    constraint sessions_minutes check (duration_minutes between 1 and 1440),
  -- The calendar event this session is, in the calendar the app syncs with.
  calendar_event_id text
    constraint sessions_calendar_event_length check (calendar_event_id is null or char_length(calendar_event_id) <= 500),
  status text not null default 'scheduled'
    constraint sessions_status check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  -- Copied from the type when the session starts; never rewritten by editing the type.
  agenda jsonb not null default '[]'::jsonb
    constraint sessions_agenda_array check (jsonb_typeof(agenda) = 'array'),
  current_step integer
    constraint sessions_current_step check (current_step >= 0),
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
  constraint sessions_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint sessions_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint sessions_ended_after_start check (ended_at is null or started_at is null or ended_at >= started_at)
);

comment on table genesis_work.sessions is
  'Sessions: schedule, agenda, live step, notes and recordings. Genesis sessions. @genesis {"label": "Sessions", "labelField": "title"}';

create table genesis_work.session_attendees (
  session_id uuid not null references genesis_work.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Copied from the session, for access; never written by the app.
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  -- Someone invited who may not otherwise read the session's owner (a workshop guest). Set only by
  -- whoever may write the session. A guest sees the session and its links, and only their own
  -- attendee row.
  guest boolean not null default false,
  present boolean,
  rating smallint
    constraint session_attendees_rating check (rating between 1 and 10),
  rating_note text
    constraint session_attendees_rating_note_length check (rating_note is null or char_length(rating_note) <= 2000),
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

comment on table genesis_work.session_attendees is
  'Who is invited, who was there, and each one''s rating. Genesis sessions.';

create table genesis_work.session_links (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references genesis_work.sessions (id) on delete cascade,
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  kind text not null
    constraint session_links_kind check (kind in ('prework', 'worksheet', 'resource', 'space', 'other')),
  -- What it points at, in the app's terms: a form id, a resource id, a collaboration space id.
  ref text not null
    constraint session_links_ref_length check (char_length(ref) between 1 and 500),
  title text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table genesis_work.session_links is
  'A session''s pre-work, worksheets, resources and collaboration spaces. Genesis sessions.';

create index session_types_tenant_owner_idx on genesis_work.session_types (tenant_id, coalesce(person_id, team_id, organization_id));
create index session_types_created_by_idx on genesis_work.session_types (created_by);
create index sessions_tenant_owner_idx on genesis_work.sessions (tenant_id, coalesce(person_id, team_id, organization_id));
create index sessions_scheduled_idx on genesis_work.sessions (tenant_id, scheduled_at);
create index sessions_kind_idx on genesis_work.sessions (tenant_id, kind);
create index sessions_type_idx on genesis_work.sessions (session_type_id);
create index sessions_facilitator_idx on genesis_work.sessions (facilitator_id);
create index sessions_scribe_idx on genesis_work.sessions (scribe_id);
create index sessions_created_by_idx on genesis_work.sessions (created_by);
create index session_attendees_user_idx on genesis_work.session_attendees (user_id);
create index session_attendees_tenant_owner_idx on genesis_work.session_attendees (tenant_id, coalesce(person_id, team_id, organization_id));
create index session_links_session_idx on genesis_work.session_links (session_id, position);
create index session_links_tenant_owner_idx on genesis_work.session_links (tenant_id, coalesce(person_id, team_id, organization_id));

-- Access helpers -------------------------------------------------------------------------------

create or replace function private.genesis_sessions_caller_is_person()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_setting('role', true) = 'authenticated'
$$;

-- The app's hook, asked about any person. No hook, or a hook that errors, means no.
create or replace function private.genesis_sessions_person_can(viewer uuid, tenant uuid, person uuid, team uuid, organization uuid, action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if viewer is null or tenant is null
     or to_regprocedure('private.genesis_owner_can(uuid,uuid,uuid,uuid,uuid,text)') is null then
    return false;
  end if;
  execute 'select (private.genesis_owner_can($1, $2, $3, $4, $5, $6))::boolean'
    into allowed using tenant, viewer, person, team, organization, action;
  return coalesce(allowed, false);
exception when others then
  return false;
end;
$$;

-- Whether the signed-in person is an attendee of a session.
create or replace function private.genesis_sessions_attends(session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from genesis_work.session_attendees a where a.session_id = session and a.user_id = auth.uid())
$$;

-- A session's attendees, for a collaboration audience.
create or replace function private.genesis_session_members(session uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from genesis_work.session_attendees a where a.session_id = session
$$;

-- Guards ---------------------------------------------------------------------------------------

-- Types and sessions: the fixed tenant and owner for signed-in people, who made it, updated_at,
-- a type in the same tenant, the agenda copied at start, and the start and end times.
create or replace function private.genesis_sessions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_agenda jsonb;
  type_kind text;
  tp uuid; ttm uuid; torg uuid;
begin
  -- Refuse a signed-in writer who may not write here before checking anything else, so errors
  -- reveal nothing about other tenants.
  if private.genesis_sessions_caller_is_person()
     and not private.genesis_owner_allows(new.tenant_id, new.person_id, new.team_id, new.organization_id, 'write') then
    raise exception 'permission denied for table %', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if private.genesis_sessions_caller_is_person() then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
  else
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'A %''s tenant never changes', tg_table_name using errcode = '22023';
    end if;
    if private.genesis_sessions_caller_is_person() then
      if new.person_id is distinct from old.person_id
         or new.team_id is distinct from old.team_id
         or new.organization_id is distinct from old.organization_id then
        raise exception 'A %''s tenant and owner never change', tg_table_name using errcode = '22023';
      end if;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
    new.updated_at := now();
  end if;

  if tg_table_name = 'sessions' then
    if new.session_type_id is not null
       and (tg_op = 'INSERT' or new.session_type_id is distinct from old.session_type_id) then
      select t.agenda, t.kind, t.person_id, t.team_id, t.organization_id
        into type_agenda, type_kind, tp, ttm, torg
        from genesis_work.session_types t
       where t.id = new.session_type_id and t.tenant_id = new.tenant_id;
      if not found
         or (private.genesis_sessions_caller_is_person()
             and not private.genesis_owner_allows(new.tenant_id, tp, ttm, torg, 'read')) then
        raise exception 'A session''s type must be one you can read, in the same tenant' using errcode = '22023';
      end if;
      new.kind := type_kind;
    end if;
    -- The facilitator and scribe are attendees, or people who may read the session's owner.
    if new.facilitator_id is not null
       and (tg_op = 'INSERT' or new.facilitator_id is distinct from old.facilitator_id)
       and not private.genesis_sessions_person_can(new.facilitator_id, new.tenant_id, new.person_id, new.team_id, new.organization_id, 'read')
       and not exists (select 1 from genesis_work.session_attendees a where a.session_id = new.id and a.user_id = new.facilitator_id) then
      raise exception 'The facilitator must be an attendee or someone who can read the session' using errcode = '22023';
    end if;
    if new.scribe_id is not null
       and (tg_op = 'INSERT' or new.scribe_id is distinct from old.scribe_id)
       and not private.genesis_sessions_person_can(new.scribe_id, new.tenant_id, new.person_id, new.team_id, new.organization_id, 'read')
       and not exists (select 1 from genesis_work.session_attendees a where a.session_id = new.id and a.user_id = new.scribe_id) then
      raise exception 'The scribe must be an attendee or someone who can read the session' using errcode = '22023';
    end if;
    if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
      new.started_at := coalesce(new.started_at, now());
      new.current_step := coalesce(new.current_step, 0);
      if new.agenda = '[]'::jsonb and new.session_type_id is not null then
        select t.agenda into type_agenda from genesis_work.session_types t where t.id = new.session_type_id;
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

create trigger session_types_guard
  before insert or update on genesis_work.session_types
  for each row execute function private.genesis_sessions_guard();
create trigger sessions_guard
  before insert or update on genesis_work.sessions
  for each row execute function private.genesis_sessions_guard();

-- Attendees and links take their session's tenant and owner. A signed-in attendee who can't
-- write the session may change only their own rating and its note.
create or replace function private.genesis_session_parts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid; p uuid; tm uuid; o uuid;
begin
  if tg_op = 'UPDATE' and new.session_id is distinct from old.session_id then
    raise exception 'A session''s part never moves to another session' using errcode = '22023';
  end if;
  select m.tenant_id, m.person_id, m.team_id, m.organization_id into t, p, tm, o
    from genesis_work.sessions m where m.id = new.session_id;
  if private.genesis_sessions_caller_is_person() and t is null then
    raise exception 'permission denied for %', tg_table_name using errcode = '42501';
  end if;
  new.tenant_id := t; new.person_id := p; new.team_id := tm; new.organization_id := o;

  if private.genesis_sessions_caller_is_person() then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;

  if tg_table_name = 'session_attendees' then
    if tg_op = 'UPDATE' and private.genesis_sessions_caller_is_person()
       and not private.genesis_owner_allows(t, p, tm, o, 'write') then
      if new.user_id is distinct from old.user_id or new.present is distinct from old.present
         or new.guest is distinct from old.guest then
        raise exception 'An attendee changes only their own rating' using errcode = '42501';
      end if;
    end if;
    -- An invitee who can't read the session's owner comes in only as a deliberate guest.
    if (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.guest is distinct from old.guest)
       and not new.guest
       and not private.genesis_sessions_person_can(new.user_id, t, p, tm, o, 'read') then
      raise exception 'Invite someone who can''t read this session as a guest' using errcode = '22023';
    end if;
    if new.rating is distinct from (case when tg_op = 'UPDATE' then old.rating end)
       or new.rating_note is distinct from (case when tg_op = 'UPDATE' then old.rating_note end) then
      if private.genesis_sessions_caller_is_person() and new.user_id <> auth.uid() then
        raise exception 'Only the attendee rates the session' using errcode = '42501';
      end if;
      if new.rating is not null
         and not exists (select 1 from genesis_work.sessions x where x.id = new.session_id and x.status in ('live', 'ended')) then
        raise exception 'A session is rated once it''s under way or over' using errcode = '22023';
      end if;
      new.rated_at := case when new.rating is null then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

create trigger session_attendees_guard
  before insert or update on genesis_work.session_attendees
  for each row execute function private.genesis_session_parts_guard();
create trigger session_links_guard
  before insert or update on genesis_work.session_links
  for each row execute function private.genesis_session_parts_guard();

revoke execute on function private.genesis_sessions_guard() from public, anon, authenticated;
revoke execute on function private.genesis_session_parts_guard() from public, anon, authenticated;
revoke execute on function private.genesis_sessions_person_can(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.genesis_sessions_caller_is_person() from public, anon, authenticated;
revoke execute on function private.genesis_session_members(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_sessions_attends(uuid) from public, anon;
grant execute on function private.genesis_sessions_attends(uuid) to authenticated;

-- Policies -------------------------------------------------------------------------------------

alter table genesis_work.session_types enable row level security;
alter table genesis_work.sessions enable row level security;
alter table genesis_work.session_attendees enable row level security;
alter table genesis_work.session_links enable row level security;

create policy session_types_read on genesis_work.session_types for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = session_types.tenant_id
                   and r.owner_id = coalesce(session_types.person_id, session_types.team_id, session_types.organization_id)));
create policy session_types_write on genesis_work.session_types for all to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

create policy sessions_read on genesis_work.sessions for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = sessions.tenant_id
                   and r.owner_id = coalesce(sessions.person_id, sessions.team_id, sessions.organization_id))
         or private.genesis_sessions_attends(id));
create policy sessions_write on genesis_work.sessions for all to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

create policy session_attendees_read on genesis_work.session_attendees for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from private.genesis_owner_readable() r
                    where r.tenant_id = session_attendees.tenant_id
                      and r.owner_id = coalesce(session_attendees.person_id, session_attendees.team_id, session_attendees.organization_id)));
create policy session_attendees_leave on genesis_work.session_attendees for delete to authenticated
  using (user_id = (select auth.uid()));
create policy session_attendees_manage on genesis_work.session_attendees for all to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy session_attendees_rate on genesis_work.session_attendees for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy session_links_read on genesis_work.session_links for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = session_links.tenant_id
                   and r.owner_id = coalesce(session_links.person_id, session_links.team_id, session_links.organization_id))
         or private.genesis_sessions_attends(session_id));
create policy session_links_write on genesis_work.session_links for all to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

revoke all on genesis_work.session_types, genesis_work.sessions, genesis_work.session_attendees, genesis_work.session_links
  from public, anon, authenticated;
grant select, insert, update, delete on genesis_work.session_types, genesis_work.sessions, genesis_work.session_attendees, genesis_work.session_links
  to authenticated;
grant all on genesis_work.session_types, genesis_work.sessions, genesis_work.session_attendees, genesis_work.session_links to service_role;

-- Ratings ---------------------------------------------------------------------------------------

create view genesis_work.session_ratings
with (security_invoker = true) as
select a.session_id,
       count(a.rating)::int as ratings,
       round(avg(a.rating)::numeric, 1) as average,
       count(*) filter (where a.present)::int as present
from genesis_work.session_attendees a
group by a.session_id;

comment on view genesis_work.session_ratings is
  'Each session''s ratings count and average, and how many attended. Genesis sessions.';

revoke all on genesis_work.session_ratings from public, anon, authenticated;
grant select on genesis_work.session_ratings to authenticated, service_role;
