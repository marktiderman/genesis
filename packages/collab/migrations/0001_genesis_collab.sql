-- Genesis Collab: spaces, their members, and who sees whose contributions
--
-- The server half of `@marktiderman/genesis-collab`, in the app's own Supabase, in the
-- genesis_collab schema. A space is one place where some people work on one thing together
-- (a group's run of a worksheet, a cohort's lesson, a workshop, a feedback round):
--
--   audience_kinds  the kinds of audience the app uses besides one person (a group, a team,
--                   an organization), each with the app's function that lists its members
--   spaces          a subject (the app's record: subject_type + subject_id) in a tenant, with
--                   its policy (what participants see of each other, and when) and timing
--   members         who is in it, directly or through an audience, with a role:
--                   owner, facilitator, participant or viewer
--   contributions   what participants added, as pointers to the app's own rows (kind + ref_id),
--                   with an author, the person it's about, a period, sent and private
--   events          reveal, lock, reopen, policy and membership changes: who and when
--
-- The package never stores contents. The app keeps its rows (answers, posts) in its own
-- tables and lets this file decide who reads them, from its own row level security:
--
--   create function public.collab_answer_author(ref text) returns uuid
--   language sql stable security definer set search_path = '' as $$
--     select a.person_id from public.answers a where a.id::text = ref
--   $$;
--   revoke execute on function public.collab_answer_author(text) from public, anon, authenticated;
--   select genesis_collab.register_contribution_kind('answer', 'Answer', 'public.collab_answer_author(text)');
--
--   create policy "space members read shared answers" on public.answers for select
--   to authenticated using (
--     person_id = (select auth.uid())
--     or id::text in (select genesis_collab.visible_refs('answer'))
--   );
--
-- A contribution is always recorded for its row's author (the kind's author function), so
-- nobody can point a space at someone else's row. For one row, can_see_ref(kind, ref) answers
-- the same question; visible_refs works it out once per statement, for lists.
--
-- These rules only narrow what the app's own rules allow: an app that has a wider access
-- model (who may read a team's work at all) ANDs it with can_see, never ORs around it.
--
-- The policy (genesis-collab's policy.ts applies the same rules, and its tests match these):
--   visibility  hidden | whos_done | totals | totals_with_names | full
--   reveal      always | after_me | after_all (or at closes_at) | on_reveal (a facilitator)
--   anonymous   contents show without names; the facilitator still sees them
--   min_group   combined results (totals) and anonymous contents show only once at least
--               this many others have shared (never fewer than 3), so nobody's answer can be
--               worked out from an average and their own
--   private     per contribution: only its author reads it, at every level; at full, someone
--               whose own contribution for the period is private doesn't see the others'
--   Owners and facilitators see every sent contribution that isn't private.
--
-- Anonymous spaces: can_see says whether a row's contents may be read, not whether its
-- author may be. Read an anonymous space's contents through a function or view of yours that
-- leaves the author out unless genesis_collab.shows_names says yes.
--
-- Register the app's audiences in a migration of your own, after this one:
--
--   create function public.collab_group_members(audience uuid) returns setof uuid
--   language sql stable security definer set search_path = '' as $$
--     select gm.user_id from public.group_members gm where gm.group_id = audience
--   $$;
--   revoke execute on function public.collab_group_members(uuid) from public, anon, authenticated;
--   select genesis_collab.register_audience('group', 'Group', 'public.collab_group_members(uuid)');
--
-- Tenancy: a space belongs to one tenant, and this file doesn't know which tenant your groups
-- belong to. Only add audiences of that tenant (check it in the code that calls add_member), or
-- have your members function list only that tenant's people.
--
-- Who may start a space: a subject type the app registers with its create check, a function
-- (tenant uuid, subject_type text, subject_id text, person uuid) returns boolean. Without one
-- only the server (service role) creates spaces of that type.
--
-- Account deletion: a login's own membership rows and contributions go with it.
--
-- Use: copy this file into supabase/migrations under a new timestamped name. Never edit it
-- once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_collab.test.sql`).

create schema if not exists genesis_collab;

comment on schema genesis_collab is 'Genesis Collab: shared spaces, their members and who sees whose contributions. Reached through the functions in this schema.';

grant usage on schema genesis_collab to authenticated, service_role;

-- Internal helpers live in a schema of their own that the Data API never exposes (Supabase's
-- RLS guide: keep security definer helpers out of exposed schemas). Nobody but the owner and
-- the service role may use it.
create schema if not exists genesis_collab_private;
revoke all on schema genesis_collab_private from public, anon, authenticated;
grant usage on schema genesis_collab_private to service_role;

-- ── Registered kinds ──────────────────────────────────────────────────────────

create table genesis_collab.audience_kinds (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{0,39}$' and kind <> 'person'),
  label text not null check (char_length(label) between 1 and 80),
  members regprocedure not null
);

-- What a contribution points at (an answer, a post), with the app's function that says whose
-- row it is: (ref_id text) returns uuid. A contribution is always recorded for that person, so
-- nobody can point a space at someone else's row.
create table genesis_collab.contribution_kinds (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 80),
  author_of regprocedure not null
);

create table genesis_collab.subject_types (
  subject_type text primary key check (subject_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 80),
  create_check regprocedure
);

-- ── Spaces ────────────────────────────────────────────────────────────────────

create table genesis_collab.spaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subject_type text not null references genesis_collab.subject_types (subject_type),
  subject_id text not null check (char_length(subject_id) between 1 and 200),
  title text check (title is null or char_length(title) between 1 and 200),
  visibility text not null default 'full'
    check (visibility in ('hidden', 'whos_done', 'totals', 'totals_with_names', 'full')),
  reveal text not null default 'after_me'
    check (reveal in ('always', 'after_me', 'after_all', 'on_reveal')),
  anonymous boolean not null default false,
  min_group integer not null default 3 check (min_group between 3 and 1000),
  history boolean not null default false,
  live boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  revealed_at timestamptz,
  locked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);

create index spaces_subject on genesis_collab.spaces (subject_type, subject_id);
create index spaces_tenant on genesis_collab.spaces (tenant_id);

create table genesis_collab.members (
  space_id uuid not null references genesis_collab.spaces (id) on delete cascade,
  -- 'person' (member_id is a login) or a registered audience kind.
  member_kind text not null check (member_kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  member_id uuid not null,
  role text not null check (role in ('owner', 'facilitator', 'participant', 'viewer')),
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (space_id, member_kind, member_id)
);

create index members_person on genesis_collab.members (member_id) where member_kind = 'person';

create table genesis_collab.contributions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references genesis_collab.spaces (id) on delete cascade,
  kind text not null references genesis_collab.contribution_kinds (kind),
  ref_id text not null check (char_length(ref_id) between 1 and 200),
  author_id uuid not null references auth.users (id) on delete cascade,
  -- Who it's about: a manager's review of a report is the manager's, about the report.
  subject_person_id uuid references auth.users (id) on delete set null,
  period text not null default '' check (char_length(period) <= 40),
  private boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (space_id, kind, ref_id)
);

create index contributions_space_period on genesis_collab.contributions (space_id, period);
create index contributions_ref on genesis_collab.contributions (kind, ref_id);
create index contributions_author on genesis_collab.contributions (author_id, kind);

create table genesis_collab.events (
  id bigint generated always as identity primary key,
  space_id uuid not null references genesis_collab.spaces (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create index events_space on genesis_collab.events (space_id, at);

-- Everything goes through the functions below: row level security on, no policies, no grants.
alter table genesis_collab.audience_kinds enable row level security;
alter table genesis_collab.subject_types enable row level security;
alter table genesis_collab.contribution_kinds enable row level security;
alter table genesis_collab.spaces enable row level security;
alter table genesis_collab.members enable row level security;
alter table genesis_collab.contributions enable row level security;
alter table genesis_collab.events enable row level security;
revoke all on all tables in schema genesis_collab from public, anon, authenticated;
grant all on all tables in schema genesis_collab to service_role;

-- ── Registration (run from the app's own migrations) ──────────────────────────

create function genesis_collab.register_audience(p_kind text, p_label text, p_members regprocedure)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  select p.pronargs, p.proargtypes[0] as arg, p.prorettype, p.proretset into f
  from pg_catalog.pg_proc p where p.oid = p_members;
  if f.pronargs <> 1 or f.arg <> 'uuid'::regtype or f.prorettype <> 'uuid'::regtype or not f.proretset then
    raise exception 'an audience''s members function must be (uuid) returns setof uuid'
      using errcode = '22023';
  end if;
  if not has_function_privilege(p_members, 'execute') then
    raise exception 'the members function must be callable by whoever registers it' using errcode = '42501';
  end if;
  insert into genesis_collab.audience_kinds (kind, label, members) values (p_kind, p_label, p_members)
  on conflict (kind) do update set label = excluded.label, members = excluded.members;
end $$;

create function genesis_collab.register_subject(p_subject_type text, p_label text, p_create_check regprocedure default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  if p_create_check is not null and not has_function_privilege(p_create_check, 'execute') then
    raise exception 'the create check must be callable by whoever registers it' using errcode = '42501';
  end if;
  if p_create_check is not null then
    select pg_catalog.oidvectortypes(p.proargtypes) as args, p.prorettype into f
    from pg_catalog.pg_proc p where p.oid = p_create_check;
    if f.args <> 'uuid, text, text, uuid' or f.prorettype <> 'boolean'::regtype then
      raise exception 'a create check must be (uuid, text, text, uuid) returns boolean'
        using errcode = '22023';
    end if;
  end if;
  insert into genesis_collab.subject_types (subject_type, label, create_check)
  values (p_subject_type, p_label, p_create_check)
  on conflict (subject_type) do update set label = excluded.label, create_check = excluded.create_check;
end $$;

create function genesis_collab.register_contribution_kind(p_kind text, p_label text, p_author_of regprocedure)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  select pg_catalog.oidvectortypes(p.proargtypes) as args, p.prorettype, p.proretset into f
  from pg_catalog.pg_proc p where p.oid = p_author_of;
  if f.args <> 'text' or f.prorettype <> 'uuid'::regtype or f.proretset then
    raise exception 'a contribution kind''s author function must be (text) returns uuid'
      using errcode = '22023';
  end if;
  if not has_function_privilege(p_author_of, 'execute') then
    raise exception 'the author function must be callable by whoever registers it' using errcode = '42501';
  end if;
  insert into genesis_collab.contribution_kinds (kind, label, author_of) values (p_kind, p_label, p_author_of)
  on conflict (kind) do update set label = excluded.label, author_of = excluded.author_of;
end $$;

revoke execute on function genesis_collab.register_audience(text, text, regprocedure) from public, anon, authenticated;
revoke execute on function genesis_collab.register_contribution_kind(text, text, regprocedure) from public, anon, authenticated;
revoke execute on function genesis_collab.register_subject(text, text, regprocedure) from public, anon, authenticated;

-- ── Membership ────────────────────────────────────────────────────────────────

-- Everyone in a space with their strongest role, through audiences included. Internal.
create function genesis_collab_private.people(p_space uuid)
returns table (person_id uuid, role text) language plpgsql stable security definer set search_path = '' as $$
declare
  m record;
  ids uuid[] := '{}';
  roles text[] := '{}';
  found_ids uuid[];
begin
  for m in
    select mm.member_kind, mm.member_id, mm.role, a.members
    from genesis_collab.members mm
    left join genesis_collab.audience_kinds a on a.kind = mm.member_kind
    where mm.space_id = p_space
  loop
    if m.member_kind = 'person' then
      ids := ids || m.member_id;
      roles := roles || m.role;
    elsif m.members is not null then
      begin
        if not exists (select 1 from pg_catalog.pg_proc p where p.oid = m.members) then
          raise undefined_function;
        end if;
        execute format('select coalesce(array_agg(x), ''{}'') from %s($1) x', m.members::oid::regproc)
          into found_ids using m.member_id;
      exception when others then
        -- A dropped, replaced or failing hook: that audience lets nobody in, the rest still work.
        raise warning 'genesis_collab: audience hook % failed: %', m.members::oid, sqlerrm;
        found_ids := '{}';
      end;
      ids := ids || found_ids;
      roles := roles || array_fill(m.role, array[coalesce(array_length(found_ids, 1), 0)]);
    end if;
  end loop;
  return query
    select distinct on (u.pid) u.pid, u.r
    from unnest(ids, roles) as u (pid, r) where u.pid is not null
    order by u.pid,
      case u.r when 'owner' then 4 when 'facilitator' then 3 when 'participant' then 2 else 1 end desc;
end $$;

revoke execute on function genesis_collab_private.people(uuid) from public, anon, authenticated;

-- The server: no role switch (a direct connection, a migration, a trigger, a job), or a role
-- that bypasses row security (service_role, postgres). Any other role, a custom one that
-- inherits authenticated included, is not. Read from the session's role, never from the JWT
-- claims, which a direct SQL session can set to anything. Same rule as genesis-supabase 0014.
create function genesis_collab_private.is_server()
returns boolean language sql stable set search_path = '' as $$
  select r = 'none'
    or coalesce((select pr.rolbypassrls from pg_catalog.pg_roles pr where pr.rolname = r), false)
  from coalesce(nullif(current_setting('role', true), ''), 'none') as r
$$;
revoke execute on function genesis_collab_private.is_server() from public, anon, authenticated;

-- A signed-in person may ask the rules about themselves only, never probe someone else's
-- access. Only the server may ask about anyone. Fails closed.
create function genesis_collab_private.only_self(p_person uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_person is not distinct from auth.uid() and auth.uid() is not null then return; end if;
  if genesis_collab_private.is_server() then return; end if;
  raise exception 'you can only ask about yourself' using errcode = '42501';
end $$;
revoke execute on function genesis_collab_private.only_self(uuid) from public, anon, authenticated;

-- A person's role in a space (null: not in it). Internal: role_of below is the public one.
create function genesis_collab_private.role(p_space uuid, p_person uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  r text;
  m record;
  found_role text;
  rank_of constant jsonb := '{"owner":4,"facilitator":3,"participant":2,"viewer":1}';
begin
  if p_person is null then return null; end if;
  select mm.role into r from genesis_collab.members mm
  where mm.space_id = p_space and mm.member_kind = 'person' and mm.member_id = p_person;
  for m in
    select mm.member_id, mm.role, a.members
    from genesis_collab.members mm join genesis_collab.audience_kinds a on a.kind = mm.member_kind
    where mm.space_id = p_space
      and (r is null or (rank_of ->> mm.role)::int > (rank_of ->> r)::int)
  loop
    begin
      if not exists (select 1 from pg_catalog.pg_proc p where p.oid = m.members) then
        raise undefined_function;
      end if;
      execute format('select $3 where $2 in (select x from %s($1) x)', m.members::oid::regproc)
        into found_role using m.member_id, p_person, m.role;
    exception when others then
      raise warning 'genesis_collab: audience hook % failed: %', m.members::oid, sqlerrm;
      found_role := null;
    end;
    if found_role is not null and (r is null or (rank_of ->> found_role)::int > (rank_of ->> r)::int) then
      r := found_role;
    end if;
    found_role := null;
  end loop;
  return r;
end $$;

revoke execute on function genesis_collab_private.role(uuid, uuid) from public, anon, authenticated;

-- A person's role in a space (null: not in it). People may ask about themselves only.
create function genesis_collab.role_of(p_space uuid, p_person uuid default auth.uid())
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  perform genesis_collab_private.only_self(p_person);
  return genesis_collab_private.role(p_space, p_person);
end $$;

-- ── The rules ─────────────────────────────────────────────────────────────────

-- The gate for one person, one period: none | hidden | contribute_first | waiting_for_others
-- | waiting_for_reveal | share_first | too_few | open. Mirrors gateOf in policy.ts.
create function genesis_collab.gate(p_space uuid, p_period text default '', p_person uuid default auth.uid())
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  s genesis_collab.spaces;
  role_ text := genesis_collab.role_of(p_space, p_person);
  mine_sent boolean;
  mine_private boolean;
  expected int;
  sent int;
  others int;
begin
  if role_ is null then return 'none'; end if;
  if role_ in ('owner', 'facilitator') then return 'open'; end if;
  select * into s from genesis_collab.spaces where id = p_space;
  if s.visibility = 'hidden' then return 'hidden'; end if;

  select bool_or(c.sent_at is not null), bool_or(c.sent_at is not null and c.private)
  into mine_sent, mine_private
  from genesis_collab.contributions c
  where c.space_id = p_space and c.period = coalesce(p_period, '') and c.author_id = p_person;

  if s.reveal = 'after_me' and role_ = 'participant' and not coalesce(mine_sent, false) then
    return 'contribute_first';
  end if;
  if s.reveal = 'after_all' and (s.closes_at is null or s.closes_at > now()) then
    select count(*) into expected from genesis_collab_private.people(p_space) p where p.role = 'participant';
    select count(distinct c.author_id) into sent
    from genesis_collab.contributions c
    join genesis_collab_private.people(p_space) p on p.person_id = c.author_id and p.role = 'participant'
    where c.space_id = p_space and c.period = coalesce(p_period, '') and c.sent_at is not null;
    if sent < expected then return 'waiting_for_others'; end if;
  end if;
  if s.reveal = 'on_reveal' and s.revealed_at is null then return 'waiting_for_reveal'; end if;
  if s.visibility = 'full' and role_ = 'participant' and coalesce(mine_private, false) then
    return 'share_first';
  end if;
  if s.visibility = 'totals' or s.anonymous then
    select count(distinct c.author_id) into others
    from genesis_collab.contributions c
    where c.space_id = p_space and c.period = coalesce(p_period, '')
      and c.sent_at is not null and not c.private and c.author_id <> p_person;
    if others < greatest(s.min_group, 3) then return 'too_few'; end if;
  end if;
  return 'open';
end $$;

-- Whether a person may read one contribution's contents. For the app's row level security.
create function genesis_collab.can_see(p_contribution uuid, p_person uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  c genesis_collab.contributions;
  s genesis_collab.spaces;
  role_ text;
begin
  perform genesis_collab_private.only_self(p_person);
  select * into c from genesis_collab.contributions where id = p_contribution;
  if c.id is null or p_person is null then return false; end if;
  if c.author_id = p_person then return true; end if;
  if c.private or c.sent_at is null then return false; end if;
  role_ := genesis_collab.role_of(c.space_id, p_person);
  if role_ is null then return false; end if;
  if role_ in ('owner', 'facilitator') then return true; end if;
  select * into s from genesis_collab.spaces where id = c.space_id;
  return s.visibility = 'full' and genesis_collab.gate(c.space_id, c.period, p_person) = 'open';
end $$;

-- Whether the signed-in person may read the app's row `ref_id` of a contribution kind: theirs,
-- or shown to them in any space it was contributed to. For a single row; for a list, use
-- visible_refs, which works once per statement.
create function genesis_collab.can_see_ref(p_kind text, p_ref_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from genesis_collab.contributions c
    where c.kind = p_kind and c.ref_id = p_ref_id and genesis_collab.can_see(c.id)
  )
$$;

-- Every ref of a contribution kind the signed-in person may read, other people's included,
-- worked out once: their own, then per space they're in, per period whose gate is open.
-- Use it in row level security as `id::text in (select genesis_collab.visible_refs('answer'))`.
create function genesis_collab.visible_refs(p_kind text)
returns setof text language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  spaces_ uuid[];
  a record;
  sp record;
  per record;
  is_member boolean;
  role_ text;
begin
  if me is null then return; end if;
  return query select c.ref_id from genesis_collab.contributions c where c.author_id = me and c.kind = p_kind;

  select coalesce(array_agg(distinct m.space_id), '{}') into spaces_
  from genesis_collab.members m where m.member_kind = 'person' and m.member_id = me;
  -- Only the audiences of spaces that hold this kind of contribution and that the person
  -- isn't already in, so a read runs no hook it doesn't need.
  for a in
    select distinct m.member_kind, m.member_id, ak.members
    from genesis_collab.members m join genesis_collab.audience_kinds ak on ak.kind = m.member_kind
    where not (m.space_id = any (spaces_))
      and exists (select 1 from genesis_collab.contributions c where c.space_id = m.space_id and c.kind = p_kind)
  loop
    begin
      if not exists (select 1 from pg_catalog.pg_proc p where p.oid = a.members) then
        raise undefined_function;
      end if;
      execute format('select $2 in (select x from %s($1) x)', a.members::oid::regproc)
        into is_member using a.member_id, me;
    exception when others then
      -- A dropped, replaced or failing hook: that audience lets nobody in, the rest still work.
      raise warning 'genesis_collab: audience hook % failed: %', a.members::oid, sqlerrm;
      is_member := false;
    end;
    if is_member then
      spaces_ := spaces_ || array(select m.space_id from genesis_collab.members m
                                  where m.member_kind = a.member_kind and m.member_id = a.member_id);
    end if;
  end loop;

  for sp in
    select s.id, s.visibility from genesis_collab.spaces s
    where s.id = any (spaces_)
      and exists (select 1 from genesis_collab.contributions c where c.space_id = s.id and c.kind = p_kind)
  loop
    role_ := genesis_collab_private.role(sp.id, me);
    if role_ in ('owner', 'facilitator') then
      return query select c.ref_id from genesis_collab.contributions c
        where c.space_id = sp.id and c.kind = p_kind and c.author_id <> me
          and c.sent_at is not null and not c.private;
    elsif role_ is not null and sp.visibility = 'full' then
      for per in select distinct c.period from genesis_collab.contributions c where c.space_id = sp.id and c.kind = p_kind loop
        if genesis_collab.gate(sp.id, per.period, me) = 'open' then
          return query select c.ref_id from genesis_collab.contributions c
            where c.space_id = sp.id and c.kind = p_kind and c.period = per.period and c.author_id <> me
              and c.sent_at is not null and not c.private;
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- Whether a person may see combined results (counts, averages, spread) of a period.
create function genesis_collab.may_aggregate(p_space uuid, p_period text default '', p_person uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  role_ text := genesis_collab.role_of(p_space, p_person);
  s genesis_collab.spaces;
  others int;
begin
  if role_ in ('owner', 'facilitator') then return true; end if;
  select * into s from genesis_collab.spaces where id = p_space;
  if s.visibility not in ('totals', 'full') or genesis_collab.gate(p_space, p_period, p_person) <> 'open' then
    return false;
  end if;
  -- Combined results need the minimum group at every level, Full included: an average of
  -- two is the other person's answer.
  select count(distinct c.author_id) into others
  from genesis_collab.contributions c
  where c.space_id = p_space and c.period = coalesce(p_period, '')
    and c.sent_at is not null and not c.private and c.author_id <> p_person;
  return others >= greatest(s.min_group, 3);
end $$;

-- Whether a person sees who contributed (names on contents, the who's-done list).
create function genesis_collab.shows_names(p_space uuid, p_period text default '', p_person uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  role_ text := genesis_collab.role_of(p_space, p_person);
  s genesis_collab.spaces;
begin
  if role_ in ('owner', 'facilitator') then return true; end if;
  select * into s from genesis_collab.spaces where id = p_space;
  if s.anonymous then return false; end if;
  return s.visibility in ('whos_done', 'totals_with_names', 'full')
    and genesis_collab.gate(p_space, p_period, p_person) = 'open';
end $$;

-- ── Reads ─────────────────────────────────────────────────────────────────────

-- A space as its members see it: the policy, timing, the viewer's role and gate, and counts.
-- Counts (expected, sent) show to everyone in it except at hidden, where only those who run
-- it see them.
create function genesis_collab.space(p_space uuid, p_period text default '')
returns table (
  id uuid, tenant_id uuid, subject_type text, subject_id text, title text,
  visibility text, reveal text, anonymous boolean, min_group integer, history boolean, live boolean,
  opens_at timestamptz, closes_at timestamptz, revealed_at timestamptz, locked_at timestamptz,
  my_role text, gate text, expected integer, sent integer
) language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  role_ text := genesis_collab.role_of(p_space, me);
  s genesis_collab.spaces;
  n_expected int;
  n_sent int;
begin
  if role_ is null then return; end if;
  select * into s from genesis_collab.spaces sp where sp.id = p_space;
  if s.visibility <> 'hidden' or role_ in ('owner', 'facilitator') then
    select count(*) into n_expected from genesis_collab_private.people(p_space) p where p.role = 'participant';
    select count(distinct c.author_id) into n_sent
    from genesis_collab.contributions c
    join genesis_collab_private.people(p_space) p on p.person_id = c.author_id and p.role = 'participant'
    where c.space_id = p_space and c.period = coalesce(p_period, '') and c.sent_at is not null;
  end if;
  return query select s.id, s.tenant_id, s.subject_type, s.subject_id, s.title,
    s.visibility, s.reveal, s.anonymous, s.min_group, s.history, s.live,
    s.opens_at, s.closes_at, s.revealed_at, s.locked_at,
    role_, genesis_collab.gate(p_space, p_period, me), n_expected, n_sent;
end $$;

-- The spaces a person is in for one subject (a worksheet, a lesson), newest first.
create function genesis_collab.spaces_for(p_subject_type text, p_subject_id text)
returns table (id uuid, title text, my_role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, r.role, s.created_at
  from genesis_collab.spaces s
  cross join lateral (select genesis_collab.role_of(s.id, auth.uid()) as role) r
  where s.subject_type = p_subject_type and s.subject_id = p_subject_id and r.role is not null
  order by s.created_at desc
$$;

-- Who's in and who's done for a period, as the policy lets the person see it: everyone for
-- those who run it; the names of participants at whos_done, totals_with_names and full (not
-- anonymous) once the gate opens; nobody's otherwise. `sent` counts sent contributions.
create function genesis_collab.roster(p_space uuid, p_period text default '')
returns table (person_id uuid, role text, sent integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not genesis_collab.shows_names(p_space, p_period, me) then return; end if;
  return query
    select p.person_id, p.role,
      (select count(*)::int from genesis_collab.contributions c
       where c.space_id = p_space and c.period = coalesce(p_period, '')
         and c.author_id = p.person_id and c.sent_at is not null
         and (not c.private or genesis_collab.role_of(p_space, me) in ('owner', 'facilitator')))
    from genesis_collab_private.people(p_space) p
    where genesis_collab.role_of(p_space, me) in ('owner', 'facilitator') or p.role = 'participant'
    order by p.person_id;
end $$;

-- The contributions of a period a person may read, with the author left out where names
-- don't show (anonymous, or totals). `author_visible` says which, so a list shows or hides the
-- author column from the server's answer and never decides anonymity itself.
create function genesis_collab.contributions(p_space uuid, p_period text default '')
returns table (id uuid, kind text, ref_id text, author_id uuid, subject_person_id uuid,
  author_visible boolean, private boolean, sent_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  names boolean := genesis_collab.shows_names(p_space, p_period, me);
begin
  return query
    select c.id, c.kind, c.ref_id,
      case when names or c.author_id = me then c.author_id end,
      case when names or c.author_id = me then c.subject_person_id end,
      names or c.author_id = me,
      c.private, c.sent_at, c.author_id = me
    from genesis_collab.contributions c
    where c.space_id = p_space and c.period = coalesce(p_period, '')
      and genesis_collab.can_see(c.id, me)
    order by c.sent_at nulls last, c.created_at;
end $$;

-- ── Writes ────────────────────────────────────────────────────────────────────

create function genesis_collab_private.log(p_space uuid, p_action text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into genesis_collab.events (space_id, actor, action, detail) values (p_space, auth.uid(), p_action, p_detail)
$$;
revoke execute on function genesis_collab_private.log(uuid, text, jsonb) from public, anon, authenticated;

-- Whether the caller may change a space: its owner, or the server.
create function genesis_collab_private.may_run(p_space uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select genesis_collab_private.is_server()
    or (auth.uid() is not null and genesis_collab.role_of(p_space, auth.uid()) = any (p_roles))
$$;
revoke execute on function genesis_collab_private.may_run(uuid, text[]) from public, anon, authenticated;

-- Start a space. The creator becomes its owner. Refused (42501) unless the subject type's
-- create check says yes, or the caller is the server.
create function genesis_collab.create_space(
  p_tenant uuid, p_subject_type text, p_subject_id text, p_title text default null,
  p_visibility text default 'full', p_reveal text default 'after_me', p_anonymous boolean default false,
  p_min_group integer default 3, p_opens_at timestamptz default null, p_closes_at timestamptz default null,
  p_live boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t genesis_collab.subject_types;
  me uuid := auth.uid();
  allowed boolean := genesis_collab_private.is_server();
  new_id uuid;
begin
  select * into t from genesis_collab.subject_types where subject_type = p_subject_type;
  if t.subject_type is null then
    raise exception 'unknown subject type %', p_subject_type using errcode = '22023';
  end if;
  if not allowed and me is not null and t.create_check is not null then
    execute format('select %s($1, $2, $3, $4)', t.create_check::oid::regproc)
      into allowed using p_tenant, p_subject_type, p_subject_id, me;
  end if;
  if not coalesce(allowed, false) then
    raise exception 'you can''t start a space for this' using errcode = '42501';
  end if;
  insert into genesis_collab.spaces (tenant_id, subject_type, subject_id, title, visibility, reveal,
    anonymous, min_group, opens_at, closes_at, live, created_by)
  values (p_tenant, p_subject_type, p_subject_id, p_title, p_visibility, p_reveal,
    p_anonymous, greatest(p_min_group, 3), p_opens_at, p_closes_at, p_live, me)
  returning id into new_id;
  if me is not null then
    insert into genesis_collab.members (space_id, member_kind, member_id, role, added_by)
    values (new_id, 'person', me, 'owner', me);
  end if;
  perform genesis_collab_private.log(new_id, 'create');
  return new_id;
end $$;

-- Change the policy or timing (owner). Nulls leave a setting as it is.
create function genesis_collab.set_policy(
  p_space uuid, p_visibility text default null, p_reveal text default null, p_anonymous boolean default null,
  p_min_group integer default null, p_history boolean default null, p_live boolean default null,
  p_opens_at timestamptz default null, p_closes_at timestamptz default null, p_title text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not genesis_collab_private.may_run(p_space, array['owner']) then
    raise exception 'only the space''s owner can change how it''s shared' using errcode = '42501';
  end if;
  update genesis_collab.spaces set
    visibility = coalesce(p_visibility, visibility),
    reveal = coalesce(p_reveal, reveal),
    anonymous = coalesce(p_anonymous, anonymous),
    min_group = greatest(coalesce(p_min_group, min_group), 3),
    history = coalesce(p_history, history),
    live = coalesce(p_live, live),
    opens_at = coalesce(p_opens_at, opens_at),
    closes_at = coalesce(p_closes_at, closes_at),
    title = coalesce(p_title, title)
  where id = p_space;
  perform genesis_collab_private.log(p_space, 'policy', jsonb_strip_nulls(jsonb_build_object(
    'visibility', p_visibility, 'reveal', p_reveal, 'anonymous', p_anonymous, 'min_group', p_min_group,
    'history', p_history, 'live', p_live, 'opens_at', p_opens_at, 'closes_at', p_closes_at)));
end $$;

-- Add someone, or an audience, with a role (owner); a second call changes the role.
create function genesis_collab.add_member(p_space uuid, p_member_kind text, p_member_id uuid, p_role text default 'participant')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not genesis_collab_private.may_run(p_space, array['owner']) then
    raise exception 'only the space''s owner can add people' using errcode = '42501';
  end if;
  perform 1 from genesis_collab.spaces where id = p_space for update;
  if p_role <> 'owner'
     and exists (select 1 from genesis_collab.members m
                 where m.space_id = p_space and m.member_kind = p_member_kind and m.member_id = p_member_id and m.role = 'owner')
     and (select count(*) from genesis_collab.members m where m.space_id = p_space and m.role = 'owner') = 1 then
    raise exception 'a space keeps at least one owner' using errcode = '23514';
  end if;
  if p_member_kind <> 'person' and not exists (select 1 from genesis_collab.audience_kinds where kind = p_member_kind) then
    raise exception 'unknown audience kind %', p_member_kind using errcode = '22023';
  end if;
  insert into genesis_collab.members (space_id, member_kind, member_id, role, added_by)
  values (p_space, p_member_kind, p_member_id, p_role, auth.uid())
  on conflict (space_id, member_kind, member_id) do update set role = excluded.role;
  perform genesis_collab_private.log(p_space, 'add_member', jsonb_build_object('kind', p_member_kind, 'id', p_member_id, 'role', p_role));
end $$;

-- Remove someone or an audience (owner). The last owner stays.
create function genesis_collab.remove_member(p_space uuid, p_member_kind text, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not genesis_collab_private.may_run(p_space, array['owner']) then
    raise exception 'only the space''s owner can remove people' using errcode = '42501';
  end if;
  perform 1 from genesis_collab.spaces where id = p_space for update;
  if exists (select 1 from genesis_collab.members m
             where m.space_id = p_space and m.member_kind = p_member_kind and m.member_id = p_member_id and m.role = 'owner')
     and (select count(*) from genesis_collab.members m where m.space_id = p_space and m.role = 'owner') = 1 then
    raise exception 'a space keeps at least one owner' using errcode = '23514';
  end if;
  delete from genesis_collab.members m
  where m.space_id = p_space and m.member_kind = p_member_kind and m.member_id = p_member_id;
  perform genesis_collab_private.log(p_space, 'remove_member', jsonb_build_object('kind', p_member_kind, 'id', p_member_id));
end $$;

-- Reveal, or hide again (facilitator or owner).
create function genesis_collab.reveal(p_space uuid, p_revealed boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not genesis_collab_private.may_run(p_space, array['owner', 'facilitator']) then
    raise exception 'only the facilitator can reveal answers' using errcode = '42501';
  end if;
  update genesis_collab.spaces set revealed_at = case when p_revealed then now() end where id = p_space;
  perform genesis_collab_private.log(p_space, case when p_revealed then 'reveal' else 'unreveal' end);
end $$;

-- Lock (no more contributions) or reopen (facilitator or owner).
create function genesis_collab.lock(p_space uuid, p_locked boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not genesis_collab_private.may_run(p_space, array['owner', 'facilitator']) then
    raise exception 'only the facilitator can lock or reopen a space' using errcode = '42501';
  end if;
  update genesis_collab.spaces set locked_at = case when p_locked then now() end where id = p_space;
  perform genesis_collab_private.log(p_space, case when p_locked then 'lock' else 'reopen' end);
end $$;

-- Record (or update) a contribution: a pointer to the app's own row. It's recorded for the
-- row's author, as the contribution kind's author function says, never for the caller: a
-- signed-in person can record only their own rows, and the server (an app's trigger, a job)
-- records anyone's. The author must take part (participants and those who run the space;
-- viewers don't). Refused when the space is locked, not open yet, or closed.
create function genesis_collab.contribute(
  p_space uuid, p_kind text, p_ref_id text, p_period text default '', p_sent boolean default false,
  p_private boolean default false, p_subject_person uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  server boolean := genesis_collab_private.is_server();
  k genesis_collab.contribution_kinds;
  author uuid;
  s genesis_collab.spaces;
  c_id uuid;
begin
  select * into k from genesis_collab.contribution_kinds where kind = p_kind;
  if k.kind is null then
    raise exception 'unknown contribution kind %', p_kind using errcode = '22023';
  end if;
  execute format('select %s($1)', k.author_of::oid::regproc) into author using p_ref_id;
  if author is null or (not server and author is distinct from me) then
    raise exception 'that isn''t yours to add' using errcode = '42501';
  end if;
  if coalesce(genesis_collab_private.role(p_space, author), 'viewer') = 'viewer' then
    raise exception 'you can''t add to this space' using errcode = '42501';
  end if;
  select * into s from genesis_collab.spaces where id = p_space;
  if s.locked_at is not null or (s.opens_at is not null and now() < s.opens_at)
     or (s.closes_at is not null and now() >= s.closes_at) then
    raise exception 'this space isn''t taking answers right now' using errcode = '55000';
  end if;
  insert into genesis_collab.contributions as c (space_id, kind, ref_id, author_id, subject_person_id, period, private, sent_at)
  values (p_space, p_kind, p_ref_id, author, coalesce(p_subject_person, author), coalesce(p_period, ''), p_private,
    case when p_sent then now() end)
  on conflict (space_id, kind, ref_id) do update set
    private = excluded.private,
    period = excluded.period,
    sent_at = case when p_sent then coalesce(c.sent_at, now()) end,
    subject_person_id = coalesce(p_subject_person, c.subject_person_id)
  where c.author_id = author
  returning c.id into c_id;
  if c_id is null then
    raise exception 'that isn''t yours to add' using errcode = '42501';
  end if;
  return c_id;
end $$;

-- Keep a contribution private, or share it again (its author).
create function genesis_collab.set_private(p_contribution uuid, p_private boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update genesis_collab.contributions set private = p_private
  where id = p_contribution and author_id = auth.uid();
  if not found then
    raise exception 'that isn''t yours to change' using errcode = '42501';
  end if;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────────

revoke execute on all functions in schema genesis_collab from public, anon;
revoke execute on all functions in schema genesis_collab_private from public, anon, authenticated;
grant execute on function
  genesis_collab.role_of(uuid, uuid),
  genesis_collab.gate(uuid, text, uuid),
  genesis_collab.can_see(uuid, uuid),
  genesis_collab.can_see_ref(text, text),
  genesis_collab.visible_refs(text),
  genesis_collab.may_aggregate(uuid, text, uuid),
  genesis_collab.shows_names(uuid, text, uuid),
  genesis_collab.space(uuid, text),
  genesis_collab.spaces_for(text, text),
  genesis_collab.roster(uuid, text),
  genesis_collab.contributions(uuid, text),
  genesis_collab.create_space(uuid, text, text, text, text, text, boolean, integer, timestamptz, timestamptz, boolean),
  genesis_collab.set_policy(uuid, text, text, boolean, integer, boolean, boolean, timestamptz, timestamptz, text),
  genesis_collab.add_member(uuid, text, uuid, text),
  genesis_collab.remove_member(uuid, text, uuid),
  genesis_collab.reveal(uuid, boolean),
  genesis_collab.lock(uuid, boolean),
  genesis_collab.contribute(uuid, text, text, text, boolean, boolean, uuid),
  genesis_collab.set_private(uuid, boolean)
to authenticated, service_role;
grant execute on all functions in schema genesis_collab to service_role;

-- ── Account deletion ──────────────────────────────────────────────────────────

create function genesis_collab_private.on_user_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from genesis_collab.members where member_kind = 'person' and member_id = old.id;
  return old;
end $$;
revoke execute on function genesis_collab_private.on_user_deleted() from public, anon, authenticated;

create trigger genesis_collab_user_deleted after delete on auth.users
for each row execute function genesis_collab_private.on_user_deleted();
