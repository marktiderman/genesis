-- Genesis sessions, part 2: attendees by person record, RSVPs, capacity and bookings with a
-- waitlist, check-in, and recurring series (genesis_work.session_series).
--
-- Attendees. An attendee is a login (user_id) or one of the app's person records
-- (attendee_person_id), exactly one: a member booked by staff, or a client invited before they
-- signed up, attends before they have a login. A person attendee is "me" when the person record is
-- one of the signed-in person's, through genesis-supabase's private.genesis_viewer_person_ids()
-- (0016). Attendee rows now have an id.
--
-- RSVPs and bookings, two answers on the same attendee row:
--   rsvp:           the attendee's answer to an invitation: going, maybe or declined. Any session.
--   booking_status: a place in a session with a capacity: booked, waitlisted, cancelled,
--                   late_cancelled or no_show. Null means invited, not booked. Whether someone
--                   came is `present`, as before; there is no "attended" status.
-- Places are taken and given back only through genesis_work.book_session and
-- genesis_work.cancel_booking, which lock the session, so two people can't both take the last
-- place. Cancelling a booked place, or raising the capacity, promotes the first on the waitlist.
-- A session's rsvp_closes_at ends RSVPs from attendees (writers still change them).
--
-- Your app may refuse a booking (no active membership, a used-up visit limit) through an optional
-- hook. Genesis never defines it:
--   private.genesis_booking_allowed(session uuid, attendee uuid) returns text
--     attendee is the session_attendees row's id. Null allows; any text refuses, and is the reason
--     shown. No hook allows every booking; a hook that errors refuses.
-- book_session asks it after taking the lock, check_in asks it too, and a waitlist promotion skips
-- anyone it refuses. A session type can set when
-- booking opens and when cancelling turns late (minutes before the start).
-- genesis_work.settle_session_bookings(session), for server code after a session ends, marks a
-- booked attendee who wasn't present as a no-show.
--
-- Check-in: checked_in_at and check_in_source (kiosk, qr, staff, app, door, other). Checking in
-- marks the attendee present. An attendee checks themselves in with genesis_work.check_in from an
-- hour before the start until the session ends.
--
-- Series: a recurring schedule (weekdays, a time of day in a time zone, a start and end date,
-- skipped dates) that makes dated sessions ahead of time. genesis_work.extend_series(series, days)
-- creates the missing ones (a job calls it; running it again creates nothing twice, thanks to a
-- unique (series_id, scheduled_at)). Editing a series changes its future sessions that haven't
-- started and that nobody edited by hand (`detached`). Changing the schedule removes those future
-- sessions that nobody has joined, marks the rest detached, and makes the new ones.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0004 (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
-- Add your own foreign key for attendee_person_id. It's required: without it, someone who may
-- write a session can book any uuid as a person. For example
--   alter table genesis_work.session_attendees add foreign key (attendee_person_id) references public.people (id) on delete cascade;
--
-- Verify: the pgTAP test beside this file (`tests/0007_genesis_work_bookings.test.sql`).

-- Attendees by person record ---------------------------------------------------------------------

alter table genesis_work.session_attendees add column id uuid not null default gen_random_uuid();
alter table genesis_work.session_attendees drop constraint session_attendees_pkey;
alter table genesis_work.session_attendees add primary key (id);
alter table genesis_work.session_attendees alter column user_id drop not null;
alter table genesis_work.session_attendees add column attendee_person_id uuid;
alter table genesis_work.session_attendees
  add constraint session_attendees_one_attendee check (num_nonnulls(user_id, attendee_person_id) = 1),
  add constraint session_attendees_one_per_login unique (session_id, user_id),
  add constraint session_attendees_one_per_person unique (session_id, attendee_person_id);
create index session_attendees_person_idx on genesis_work.session_attendees (attendee_person_id);

-- RSVPs, bookings and check-in.
alter table genesis_work.session_attendees
  add column rsvp text constraint session_attendees_rsvp check (rsvp in ('going', 'maybe', 'declined')),
  add column rsvp_at timestamptz,
  add column booking_status text
    constraint session_attendees_booking_status check (booking_status in ('booked', 'waitlisted', 'cancelled', 'late_cancelled', 'no_show')),
  add column booked_at timestamptz,
  add column checked_in_at timestamptz,
  add column check_in_source text
    constraint session_attendees_check_in_source check (check_in_source in ('kiosk', 'qr', 'staff', 'app', 'door', 'other'));
create index session_attendees_booking_idx on genesis_work.session_attendees (session_id, booking_status, booked_at);

alter table genesis_work.sessions
  add column capacity integer constraint sessions_capacity check (capacity > 0),
  add column rsvp_closes_at timestamptz;
alter table genesis_work.session_types
  add column default_capacity integer constraint session_types_capacity check (default_capacity > 0),
  add column booking_opens_minutes integer constraint session_types_booking_opens check (booking_opens_minutes > 0),
  add column cancel_cutoff_minutes integer constraint session_types_cancel_cutoff check (cancel_cutoff_minutes >= 0);

-- Series -------------------------------------------------------------------------------------------

create table genesis_work.session_series (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid,
  team_id uuid,
  organization_id uuid,
  session_type_id uuid references genesis_work.session_types (id) on delete set null,
  kind text not null default 'meeting'
    constraint session_series_kind check (kind in ('meeting', 'workshop', 'presentation', 'coaching_call', 'one_on_one', 'class', 'planning', 'other')),
  title text not null
    constraint session_series_title_length check (char_length(btrim(title)) between 1 and 300),
  -- ISO weekdays: 1 is Monday, 7 is Sunday.
  weekdays smallint[] not null
    constraint session_series_weekdays check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  time_of_day time not null,
  time_zone text not null default 'UTC',
  starts_on date not null,
  ends_on date,
  skip_dates date[] not null default '{}',
  duration_minutes integer
    constraint session_series_minutes check (duration_minutes between 1 and 1440),
  capacity integer constraint session_series_capacity check (capacity > 0),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_series_one_owner check (num_nonnulls(person_id, team_id, organization_id) = 1),
  constraint session_series_org_owner_is_tenant check (organization_id is null or organization_id = tenant_id),
  constraint session_series_dates check (ends_on is null or ends_on >= starts_on)
);

comment on table genesis_work.session_series is
  'A recurring schedule that makes dated sessions ahead of time. Genesis sessions. @genesis {"label": "Session series", "labelField": "title"}';

create index session_series_tenant_owner_idx on genesis_work.session_series (tenant_id, coalesce(person_id, team_id, organization_id));
create index session_series_type_idx on genesis_work.session_series (session_type_id);
create index session_series_created_by_idx on genesis_work.session_series (created_by);

alter table genesis_work.sessions
  add column series_id uuid references genesis_work.session_series (id) on delete set null,
  add column detached boolean not null default false,
  add constraint sessions_one_per_series_time unique (series_id, scheduled_at);

-- Checks the time zone a series names.
create or replace function private.genesis_series_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'Unknown time zone %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- The owner checks for series are the same as for types and sessions (0004's guard).
create trigger session_series_guard
  before insert or update on genesis_work.session_series
  for each row execute function private.genesis_sessions_guard();
create trigger session_series_time_zone
  before insert or update of time_zone on genesis_work.session_series
  for each row execute function private.genesis_series_guard();

-- Who is "me" ------------------------------------------------------------------------------------

-- Whether an attendee row is the signed-in person: their login, or one of their person records in
-- the session's tenant.
create or replace function private.genesis_sessions_is_me(login uuid, tenant uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (login is not null and login = auth.uid())
      or (person is not null and exists (
            select 1 from private.genesis_viewer_person_ids() v where v.tenant_id = tenant and v.person_id = person))
$$;

create or replace function private.genesis_sessions_attends(session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from genesis_work.session_attendees a
                  where a.session_id = session
                    and private.genesis_sessions_is_me(a.user_id, a.tenant_id, a.attendee_person_id))
$$;

-- A session's attendees with a login, for a collaboration audience.
create or replace function private.genesis_session_members(session uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from genesis_work.session_attendees a where a.session_id = session and a.user_id is not null
$$;

-- Attendee rows: guard ----------------------------------------------------------------------------

-- 0004's guard for attendees, links and details, now for person attendees, RSVPs, bookings and
-- check-in. A signed-in attendee who can't write the session may change only their own rating,
-- RSVP and check-in fields; places change only through book_session and cancel_booking.
create or replace function private.genesis_session_parts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid; p uuid; tm uuid; o uuid;
  writer boolean;
  through_booking boolean := coalesce(current_setting('genesis_work.booking', true), '') = 'on';
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

  if private.genesis_sessions_caller_is_person() and tg_table_name <> 'session_details' then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  if tg_table_name = 'session_details' then
    if private.genesis_sessions_caller_is_person() and not private.genesis_owner_allows(t, p, tm, o, 'write') then
      raise exception 'permission denied for table session_details' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;

  if tg_table_name = 'session_attendees' then
    writer := not private.genesis_sessions_caller_is_person() or private.genesis_owner_allows(t, p, tm, o, 'write');
    if tg_op = 'UPDATE' then
      new.id := old.id;
      if not writer and not through_booking
         and (new.user_id is distinct from old.user_id
              or new.attendee_person_id is distinct from old.attendee_person_id
              or new.present is distinct from old.present
              or new.guest is distinct from old.guest) then
        raise exception 'An attendee changes only their own rating, RSVP and check-in' using errcode = '42501';
      end if;
    end if;
    if not writer and not through_booking
       and (new.booking_status is distinct from (case when tg_op = 'UPDATE' then old.booking_status end)
            or new.booked_at is distinct from (case when tg_op = 'UPDATE' then old.booked_at end)
            or new.check_in_source is distinct from (case when tg_op = 'UPDATE' then old.check_in_source end)) then
      raise exception 'A place is booked, cancelled and checked in through book_session, cancel_booking and check_in' using errcode = '42501';
    end if;
    -- A login invitee who can't read the session's owner comes in only as a deliberate guest. A
    -- person record has no login to ask about, so it attends as it is.
    if new.user_id is not null
       and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.guest is distinct from old.guest)
       and not new.guest
       and not private.genesis_sessions_person_can(new.user_id, t, p, tm, o, 'read') then
      raise exception 'Invite someone who can''t read this session as a guest' using errcode = '22023';
    end if;
    if new.rating is distinct from (case when tg_op = 'UPDATE' then old.rating end)
       or new.rating_note is distinct from (case when tg_op = 'UPDATE' then old.rating_note end) then
      if private.genesis_sessions_caller_is_person()
         and not private.genesis_sessions_is_me(new.user_id, t, new.attendee_person_id) then
        raise exception 'Only the attendee rates the session' using errcode = '42501';
      end if;
      if new.rating is not null
         and not exists (select 1 from genesis_work.sessions x where x.id = new.session_id and x.status in ('live', 'ended')) then
        raise exception 'A session is rated once it''s under way or over' using errcode = '22023';
      end if;
      new.rated_at := case when new.rating is null then null else now() end;
    end if;
    if new.rsvp is distinct from (case when tg_op = 'UPDATE' then old.rsvp end) then
      if private.genesis_sessions_caller_is_person() and not writer
         and not private.genesis_sessions_is_me(new.user_id, t, new.attendee_person_id) then
        raise exception 'Only the attendee answers their invitation' using errcode = '42501';
      end if;
      if private.genesis_sessions_caller_is_person() and not writer
         and exists (select 1 from genesis_work.sessions x where x.id = new.session_id and x.rsvp_closes_at <= now()) then
        raise exception 'RSVPs for this session have closed' using errcode = '22023';
      end if;
      new.rsvp_at := case when new.rsvp is null then null else now() end;
    end if;
    if new.checked_in_at is distinct from (case when tg_op = 'UPDATE' then old.checked_in_at end) then
      if private.genesis_sessions_caller_is_person() and not writer and not through_booking then
        raise exception 'Check in through check_in' using errcode = '42501';
      end if;
      if new.checked_in_at is not null then
        new.present := true;
        new.check_in_source := coalesce(new.check_in_source, 'staff');
      end if;
    end if;
    if new.booking_status is distinct from (case when tg_op = 'UPDATE' then old.booking_status end)
       and new.booking_status in ('booked', 'waitlisted')
       and (tg_op = 'INSERT' or old.booking_status is null or old.booking_status not in ('booked', 'waitlisted')) then
      new.booked_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Sessions edited by hand leave their series -------------------------------------------------------

create or replace function private.genesis_sessions_detach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is not null and not new.detached
     and coalesce(current_setting('genesis_work.series', true), '') <> 'on'
     and (new.scheduled_at is distinct from old.scheduled_at or new.title is distinct from old.title
          or new.duration_minutes is distinct from old.duration_minutes
          or new.capacity is distinct from old.capacity
          or new.session_type_id is distinct from old.session_type_id) then
    new.detached := true;
  end if;
  return new;
end;
$$;

create trigger sessions_detach
  before update on genesis_work.sessions
  for each row execute function private.genesis_sessions_detach();

-- Bookings -----------------------------------------------------------------------------------------

-- The attendee row a booking acts on: the caller's own (by login, or by a person record of theirs
-- in the session's tenant), or, for someone who may write the session, the person record given.
create or replace function private.genesis_booking_target(s genesis_work.sessions, person uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me_person uuid;
  row_id uuid;
begin
  if person is not null then
    if not private.genesis_owner_allows(s.tenant_id, s.person_id, s.team_id, s.organization_id, 'write')
       and not exists (select 1 from private.genesis_viewer_person_ids() v where v.tenant_id = s.tenant_id and v.person_id = person) then
      raise exception 'You book only yourself' using errcode = '42501';
    end if;
    select a.id into row_id from genesis_work.session_attendees a where a.session_id = s.id and a.attendee_person_id = person;
    if row_id is null then
      insert into genesis_work.session_attendees (session_id, attendee_person_id, guest)
      values (s.id, person, false) returning id into row_id;
    end if;
    return row_id;
  end if;
  select a.id into row_id from genesis_work.session_attendees a
   where a.session_id = s.id and private.genesis_sessions_is_me(a.user_id, a.tenant_id, a.attendee_person_id)
   order by (a.user_id is not null) desc limit 1;
  if row_id is not null then
    return row_id;
  end if;
  -- Not invited: booking needs the session to be readable through its owner, then books the
  -- caller's person record in that tenant when they have one, else their login.
  if not exists (select 1 from private.genesis_owner_readable() r
                  where r.tenant_id = s.tenant_id and r.owner_id = coalesce(s.person_id, s.team_id, s.organization_id)) then
    raise exception 'permission denied for session' using errcode = '42501';
  end if;
  select v.person_id into me_person from private.genesis_viewer_person_ids() v where v.tenant_id = s.tenant_id limit 1;
  if me_person is not null then
    insert into genesis_work.session_attendees (session_id, attendee_person_id, guest)
    values (s.id, me_person, false) returning id into row_id;
  else
    insert into genesis_work.session_attendees (session_id, user_id, guest)
    values (s.id, auth.uid(), false) returning id into row_id;
  end if;
  return row_id;
end;
$$;

-- The app's booking hook: null allows, text refuses with that reason. No hook allows; a hook that
-- errors refuses.
create or replace function private.genesis_booking_refusal(session uuid, attendee uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reason text;
begin
  if to_regprocedure('private.genesis_booking_allowed(uuid,uuid)') is null then
    return null;
  end if;
  execute 'select (private.genesis_booking_allowed($1, $2))::text' into reason using session, attendee;
  return reason;
exception when others then
  return 'This booking can''t be checked right now';
end;
$$;

-- Fills a session's free places from its waitlist, first come first served, skipping anyone the
-- app's hook refuses. The caller holds the session's lock.
create or replace function private.genesis_booking_promote(session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer;
  taken integer;
  w record;
begin
  select s.capacity into cap from genesis_work.sessions s where s.id = session and s.status = 'scheduled';
  if not found then
    return;
  end if;
  select count(*) into taken from genesis_work.session_attendees a where a.session_id = session and a.booking_status = 'booked';
  perform set_config('genesis_work.booking', 'on', true);
  for w in select a.id from genesis_work.session_attendees a
            where a.session_id = session and a.booking_status = 'waitlisted'
            order by a.booked_at, a.id loop
    exit when cap is not null and taken >= cap;
    if private.genesis_booking_refusal(session, w.id) is null then
      update genesis_work.session_attendees set booking_status = 'booked' where id = w.id;
      taken := taken + 1;
    end if;
  end loop;
  perform set_config('genesis_work.booking', '', true);
end;
$$;

-- Raising a session's capacity fills the new places from the waitlist.
create or replace function private.genesis_sessions_capacity_grew()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.genesis_booking_promote(new.id);
  return null;
end;
$$;

create trigger sessions_capacity_grew
  after update of capacity on genesis_work.sessions
  for each row when (new.capacity is null or (old.capacity is not null and new.capacity > old.capacity))
  execute function private.genesis_sessions_capacity_grew();

-- Takes a place in a session: booked while there's room, waitlisted when it's full. Returns the
-- attendee's booking status. `person` books one of the caller's person records, or, for someone
-- who may write the session, anyone's.
create or replace function genesis_work.book_session(session uuid, person uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s genesis_work.sessions;
  opens integer;
  row_id uuid;
  current_status text;
  taken integer;
  result text;
  refusal text;
begin
  if auth.uid() is null and private.genesis_sessions_caller_is_person() then
    raise exception 'Sign in to book' using errcode = '42501';
  end if;
  select * into s from genesis_work.sessions x where x.id = session for update;
  if not found then
    raise exception 'permission denied for session' using errcode = '42501';
  end if;
  if s.status <> 'scheduled' then
    raise exception 'Only a scheduled session takes bookings' using errcode = '22023';
  end if;
  select t.booking_opens_minutes into opens from genesis_work.session_types t where t.id = s.session_type_id;
  if opens is not null and s.scheduled_at is not null and now() < s.scheduled_at - make_interval(mins => opens) then
    raise exception 'Booking opens % minutes before the start', opens using errcode = '22023';
  end if;
  perform set_config('genesis_work.booking', 'on', true);
  row_id := private.genesis_booking_target(s, person);
  select a.booking_status into current_status from genesis_work.session_attendees a where a.id = row_id;
  if current_status in ('booked', 'waitlisted') then
    perform set_config('genesis_work.booking', '', true);
    return current_status;
  end if;
  refusal := private.genesis_booking_refusal(s.id, row_id);
  if refusal is not null then
    raise exception '%', refusal using errcode = 'P0001', hint = 'genesis_booking_allowed';
  end if;
  select count(*) into taken from genesis_work.session_attendees a
   where a.session_id = s.id and a.booking_status = 'booked';
  result := case when s.capacity is null or taken < s.capacity then 'booked' else 'waitlisted' end;
  update genesis_work.session_attendees set booking_status = result where id = row_id;
  perform set_config('genesis_work.booking', '', true);
  return result;
end;
$$;

-- Gives a place back: cancelled, or late_cancelled inside the type's cancel cut-off. A booked
-- place that frees up goes to the first on the waitlist. Returns the new status.
create or replace function genesis_work.cancel_booking(session uuid, person uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s genesis_work.sessions;
  cutoff integer;
  row_id uuid;
  was text;
  result text;
begin
  select * into s from genesis_work.sessions x where x.id = session for update;
  if not found then
    raise exception 'permission denied for session' using errcode = '42501';
  end if;
  if person is not null then
    if not private.genesis_owner_allows(s.tenant_id, s.person_id, s.team_id, s.organization_id, 'write')
       and not exists (select 1 from private.genesis_viewer_person_ids() v where v.tenant_id = s.tenant_id and v.person_id = person) then
      raise exception 'You cancel only your own place' using errcode = '42501';
    end if;
    select a.id, a.booking_status into row_id, was from genesis_work.session_attendees a
     where a.session_id = s.id and a.attendee_person_id = person;
  else
    select a.id, a.booking_status into row_id, was from genesis_work.session_attendees a
     where a.session_id = s.id and private.genesis_sessions_is_me(a.user_id, a.tenant_id, a.attendee_person_id)
       and a.booking_status in ('booked', 'waitlisted')
     limit 1;
  end if;
  if row_id is null or was is null or was not in ('booked', 'waitlisted') then
    raise exception 'There''s no place to cancel' using errcode = '22023';
  end if;
  select t.cancel_cutoff_minutes into cutoff from genesis_work.session_types t where t.id = s.session_type_id;
  result := case when was = 'booked' and cutoff is not null and s.scheduled_at is not null
                      and now() > s.scheduled_at - make_interval(mins => cutoff)
                 then 'late_cancelled' else 'cancelled' end;
  perform set_config('genesis_work.booking', 'on', true);
  update genesis_work.session_attendees set booking_status = result where id = row_id;
  perform set_config('genesis_work.booking', '', true);
  if was = 'booked' then
    perform private.genesis_booking_promote(s.id);
  end if;
  return result;
end;
$$;

-- After a session ends: a booked attendee who wasn't present is a no-show. Server code only.
-- Returns how many it marked.
create or replace function genesis_work.settle_session_bookings(session uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked integer;
begin
  update genesis_work.session_attendees a set booking_status = 'no_show'
    from genesis_work.sessions s
   where s.id = session and a.session_id = s.id and s.status = 'ended'
     and a.booking_status = 'booked' and a.present is not true;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

-- An attendee checks themselves in, from an hour before the start until the session ends.
create or replace function genesis_work.check_in(session uuid, source text default 'app')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s genesis_work.sessions;
  row_id uuid;
  refusal text;
begin
  select * into s from genesis_work.sessions x where x.id = session;
  select a.id into row_id from genesis_work.session_attendees a
   where a.session_id = session and private.genesis_sessions_is_me(a.user_id, a.tenant_id, a.attendee_person_id)
     and (a.booking_status is null or a.booking_status = 'booked')
   limit 1;
  if row_id is null then
    raise exception 'You''re not on this session' using errcode = '42501';
  end if;
  if s.status in ('ended', 'cancelled')
     or (s.status = 'scheduled' and s.scheduled_at is not null and now() < s.scheduled_at - interval '1 hour') then
    raise exception 'Check-in opens an hour before the start and closes when the session ends' using errcode = '22023';
  end if;
  refusal := private.genesis_booking_refusal(session, row_id);
  if refusal is not null then
    raise exception '%', refusal using errcode = 'P0001', hint = 'genesis_booking_allowed';
  end if;
  perform set_config('genesis_work.booking', 'on', true);
  update genesis_work.session_attendees
     set checked_in_at = coalesce(checked_in_at, now()), check_in_source = coalesce(check_in_source, source)
   where id = row_id;
  perform set_config('genesis_work.booking', '', true);
end;
$$;

-- Series: making sessions ----------------------------------------------------------------------------

-- Creates the series' missing sessions from today (or its start) for `days` days, and returns how
-- many it made. Whoever may write the series, or server code (a job).
create or replace function genesis_work.extend_series(series uuid, days integer default 28)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r genesis_work.session_series;
  made integer;
  type_capacity integer;
begin
  select * into r from genesis_work.session_series x where x.id = series;
  if not found
     or (private.genesis_sessions_caller_is_person()
         and not private.genesis_owner_allows(r.tenant_id, r.person_id, r.team_id, r.organization_id, 'write')) then
    raise exception 'permission denied for session series' using errcode = '42501';
  end if;
  if not r.active then
    return 0;
  end if;
  select t.default_capacity into type_capacity from genesis_work.session_types t where t.id = r.session_type_id;
  perform set_config('genesis_work.series', 'on', true);
  insert into genesis_work.sessions (tenant_id, person_id, team_id, organization_id, session_type_id, kind,
                                     title, scheduled_at, duration_minutes, capacity, series_id)
  select r.tenant_id, r.person_id, r.team_id, r.organization_id, r.session_type_id, r.kind,
         r.title, (d::date + r.time_of_day) at time zone r.time_zone, r.duration_minutes,
         coalesce(r.capacity, type_capacity), r.id
    from generate_series(greatest(r.starts_on, (now() at time zone r.time_zone)::date)::timestamp,
                         least(coalesce(r.ends_on, 'infinity'::date), (now() at time zone r.time_zone)::date + least(greatest(days, 1), 366))::timestamp,
                         interval '1 day') d
   where extract(isodow from d)::smallint = any (r.weekdays)
     and not (d::date = any (r.skip_dates))
     and (d::date + r.time_of_day) at time zone r.time_zone > now()
  on conflict (series_id, scheduled_at) do nothing;
  get diagnostics made = row_count;
  perform set_config('genesis_work.series', '', true);
  return made;
end;
$$;

-- Editing a series changes its future sessions that haven't started and that nobody edited by hand.
create or replace function private.genesis_series_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('genesis_work.series', 'on', true);
  if (new.weekdays, new.time_of_day, new.time_zone, new.starts_on, new.ends_on, new.skip_dates, new.active)
     is distinct from (old.weekdays, old.time_of_day, old.time_zone, old.starts_on, old.ends_on, old.skip_dates, old.active) then
    -- A new schedule: future sessions nobody joined go; the others stay, apart from the series.
    delete from genesis_work.sessions s
     where s.series_id = new.id and not s.detached and s.status = 'scheduled' and s.scheduled_at > now()
       and not exists (select 1 from genesis_work.session_attendees a where a.session_id = s.id);
    update genesis_work.sessions s set detached = true
     where s.series_id = new.id and not s.detached and s.status = 'scheduled' and s.scheduled_at > now();
  else
    update genesis_work.sessions s
       set title = new.title, duration_minutes = new.duration_minutes, session_type_id = new.session_type_id,
           capacity = coalesce(new.capacity, s.capacity)
     where s.series_id = new.id and not s.detached and s.status = 'scheduled' and s.scheduled_at > now();
  end if;
  perform set_config('genesis_work.series', '', true);
  return null;
end;
$$;

create trigger session_series_changed
  after update on genesis_work.session_series
  for each row execute function private.genesis_series_changed();

-- Privileges and policies ------------------------------------------------------------------------------

revoke execute on function private.genesis_series_guard() from public, anon, authenticated;
revoke execute on function private.genesis_booking_refusal(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_booking_promote(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_sessions_capacity_grew() from public, anon, authenticated;
revoke execute on function private.genesis_series_changed() from public, anon, authenticated;
revoke execute on function private.genesis_sessions_detach() from public, anon, authenticated;
revoke execute on function private.genesis_booking_target(genesis_work.sessions, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_sessions_is_me(uuid, uuid, uuid) from public, anon;
grant execute on function private.genesis_sessions_is_me(uuid, uuid, uuid) to authenticated;
revoke execute on function private.genesis_session_members(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_sessions_attends(uuid) from public, anon;
grant execute on function private.genesis_sessions_attends(uuid) to authenticated;
revoke execute on function genesis_work.book_session(uuid, uuid) from public, anon;
grant execute on function genesis_work.book_session(uuid, uuid) to authenticated, service_role;
revoke execute on function genesis_work.cancel_booking(uuid, uuid) from public, anon;
grant execute on function genesis_work.cancel_booking(uuid, uuid) to authenticated, service_role;
revoke execute on function genesis_work.check_in(uuid, text) from public, anon;
grant execute on function genesis_work.check_in(uuid, text) to authenticated;
revoke execute on function genesis_work.extend_series(uuid, integer) from public, anon;
grant execute on function genesis_work.extend_series(uuid, integer) to authenticated, service_role;
revoke execute on function genesis_work.settle_session_bookings(uuid) from public, anon, authenticated;
grant execute on function genesis_work.settle_session_bookings(uuid) to service_role;

-- Attendees: a person attendee reads, rates, answers and leaves their own row, like a login.
drop policy session_attendees_read on genesis_work.session_attendees;
create policy session_attendees_read on genesis_work.session_attendees for select to authenticated
  using (private.genesis_sessions_is_me(user_id, tenant_id, attendee_person_id)
         or exists (select 1 from private.genesis_owner_readable() r
                    where r.tenant_id = session_attendees.tenant_id
                      and r.owner_id = coalesce(session_attendees.person_id, session_attendees.team_id, session_attendees.organization_id)));
drop policy session_attendees_leave on genesis_work.session_attendees;
create policy session_attendees_leave on genesis_work.session_attendees for delete to authenticated
  using (private.genesis_sessions_is_me(user_id, tenant_id, attendee_person_id));
drop policy session_attendees_rate on genesis_work.session_attendees;
create policy session_attendees_rate on genesis_work.session_attendees for update to authenticated
  using (private.genesis_sessions_is_me(user_id, tenant_id, attendee_person_id))
  with check (private.genesis_sessions_is_me(user_id, tenant_id, attendee_person_id));

alter table genesis_work.session_series enable row level security;
create policy session_series_read on genesis_work.session_series for select to authenticated
  using (exists (select 1 from private.genesis_owner_readable() r
                 where r.tenant_id = session_series.tenant_id
                   and r.owner_id = coalesce(session_series.person_id, session_series.team_id, session_series.organization_id)));
create policy session_series_insert on genesis_work.session_series for insert to authenticated
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy session_series_update on genesis_work.session_series for update to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'))
  with check (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));
create policy session_series_delete on genesis_work.session_series for delete to authenticated
  using (private.genesis_owner_allows(tenant_id, person_id, team_id, organization_id, 'write'));

revoke all on genesis_work.session_series from public, anon, authenticated;
grant select, insert, update, delete on genesis_work.session_series to authenticated;
grant all on genesis_work.session_series to service_role;

-- A session's places: its capacity, how many are booked, waitlisted and checked in, how many said
-- they're going, and the places left. Counts every attendee, so a member who sees only their own
-- row still sees how full the class is. For whoever can read the session; empty otherwise.
create or replace function genesis_work.session_places(session uuid)
returns table (capacity integer, booked integer, waitlisted integer, checked_in integer, going integer, places_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.capacity,
         count(a.id) filter (where a.booking_status = 'booked')::int,
         count(a.id) filter (where a.booking_status = 'waitlisted')::int,
         count(a.id) filter (where a.checked_in_at is not null)::int,
         count(a.id) filter (where a.rsvp = 'going')::int,
         case when s.capacity is null then null
              else greatest(s.capacity - count(a.id) filter (where a.booking_status = 'booked'), 0)::int end
    from genesis_work.sessions s
    left join genesis_work.session_attendees a on a.session_id = s.id
   where s.id = session
     and (not private.genesis_sessions_caller_is_person()
          or private.genesis_sessions_attends(s.id)
          or exists (select 1 from private.genesis_owner_readable() r
                      where r.tenant_id = s.tenant_id and r.owner_id = coalesce(s.person_id, s.team_id, s.organization_id)))
   group by s.id, s.capacity
$$;

revoke execute on function genesis_work.session_places(uuid) from public, anon;
grant execute on function genesis_work.session_places(uuid) to authenticated, service_role;
