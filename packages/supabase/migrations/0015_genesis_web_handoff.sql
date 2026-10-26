-- Genesis web handoff: continue on the web, already signed in
--
-- The database half of `@marktiderman/genesis-supabase/web-handoff/server`. A native app asks
-- the server for a link to a web page; the link opens that page signed in as the same person.
-- Each link is a row in private.genesis_web_handoffs, which keeps SHA-256 digests only, never a
-- token, so a copy of the table signs nobody in. A row moves through:
--
--   issued     the app asked (genesis_web_handoff_issue): person, path, a 60-second expiry, the
--              app session it came from. At most `max` a person per window (SQLSTATE GS429),
--              counted under a per-person lock.
--   claimed    the page opened it (genesis_web_handoff_claim), once and unexpired, and got a
--              continue nonce that lives 30 seconds. Nothing that signs anyone in exists yet.
--   continued  the person chose Continue (genesis_web_handoff_continue), once, within the
--              nonce's life; only now does the server ask Supabase Auth for a sign-in token.
--   discarded  the person chose Cancel (genesis_web_handoff_discard): the nonce is burnt.
--   bound      the page reported the session it made (genesis_web_handoff_bind_session), so
--              signing out of the app can end exactly that web session
--              (genesis_web_handoff_revoke_sessions, which deletes those auth.sessions rows:
--              Supabase documents a session as signed out when its row is gone; its access
--              token still works until it expires).
--
-- Rows are also the log of handoffs (who, which path, when), kept 30 days, or longer while the
-- web session they made still exists.
--
-- Access: only service_role, through the functions below, granted by name. anon and
-- authenticated reach nothing: the table is in `private`, has row level security with no
-- policies, and every function also refuses any role but service_role
-- (`current_setting('role')`, which is what PostgREST set, not a JWT claim).
--
-- Account deletion: a person's handoffs go with their login (on delete cascade).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name.
-- Never edit it once applied; change it with a new migration. It stands alone.
--
-- Verify: the pgTAP test beside this file (`tests/0015_genesis_web_handoff.test.sql`).

create schema if not exists private;

create table private.genesis_web_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  path text not null check (char_length(path) between 1 and 2048 and left(path, 1) = '/' and left(path, 2) <> '//'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  source_session_id uuid,
  nonce_digest text unique check (nonce_digest ~ '^[0-9a-f]{64}$'),
  nonce_expires_at timestamptz,
  continued_at timestamptz,
  discarded_at timestamptz,
  web_session_id uuid,
  check (expires_at > created_at)
);

comment on table private.genesis_web_handoffs is
  'Native-to-web sign-in handoffs (genesis-supabase web-handoff): digests, never tokens. Service role only.';

create index genesis_web_handoffs_user_recent on private.genesis_web_handoffs (user_id, created_at desc);
create index genesis_web_handoffs_created on private.genesis_web_handoffs (created_at);
create index genesis_web_handoffs_source on private.genesis_web_handoffs (user_id, source_session_id) where web_session_id is not null;

alter table private.genesis_web_handoffs enable row level security;
revoke all on table private.genesis_web_handoffs from public, anon, authenticated;

-- Issue ------------------------------------------------------------------------------

create or replace function public.genesis_web_handoff_issue(
  p_user_id uuid,
  p_digest text,
  p_path text,
  p_ttl_seconds integer default 60,
  p_max integer default 10,
  p_window_seconds integer default 60,
  p_source_session_id uuid default null
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  recent integer;
  expires timestamptz;
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_issue is for the server only' using errcode = '42501';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then
    raise exception 'p_ttl_seconds must be from 10 to 300' using errcode = '22023';
  end if;
  if p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'p_max and p_window_seconds must be positive' using errcode = '22023';
  end if;

  -- One person's issues one at a time, so the count below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('genesis_web_handoff:' || p_user_id::text, 0));

  select count(*) into recent
  from private.genesis_web_handoffs h
  where h.user_id = p_user_id and h.created_at > now() - make_interval(secs => p_window_seconds);
  if recent >= p_max then
    raise exception 'too many web handoffs; try again in a minute' using errcode = 'GS429';
  end if;

  expires := now() + make_interval(secs => p_ttl_seconds);
  insert into private.genesis_web_handoffs (user_id, token_digest, path, expires_at, source_session_id)
  values (p_user_id, p_digest, p_path, expires, p_source_session_id);

  -- The log keeps 30 days, and a row whose web session still exists until that session goes.
  delete from private.genesis_web_handoffs h
  where h.created_at < now() - interval '30 days'
    and (h.web_session_id is null or not exists (select 1 from auth.sessions s where s.id = h.web_session_id));
  return expires;
end;
$$;

revoke execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer, uuid) to service_role;

-- Claim: the page opened the link. Once, unexpired; hands out a short-lived continue nonce.

create or replace function public.genesis_web_handoff_claim(
  p_digest text,
  p_nonce_digest text,
  p_nonce_ttl_seconds integer default 30
)
returns table (user_id uuid, path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_claim is for the server only' using errcode = '42501';
  end if;
  if p_nonce_ttl_seconds is null or p_nonce_ttl_seconds not between 5 and 120 then
    raise exception 'p_nonce_ttl_seconds must be from 5 to 120' using errcode = '22023';
  end if;
  return query
    update private.genesis_web_handoffs h
    set used_at = now(), nonce_digest = p_nonce_digest, nonce_expires_at = now() + make_interval(secs => p_nonce_ttl_seconds)
    where h.token_digest = p_digest and h.used_at is null and h.expires_at > now()
    returning h.user_id, h.path;
end;
$$;

revoke execute on function public.genesis_web_handoff_claim(text, text, integer) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_claim(text, text, integer) to service_role;

-- Continue: the person chose Continue. Once, within the nonce's life, not after Cancel.

create or replace function public.genesis_web_handoff_continue(p_nonce_digest text)
returns table (user_id uuid, path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_continue is for the server only' using errcode = '42501';
  end if;
  return query
    update private.genesis_web_handoffs h
    set continued_at = now()
    where h.nonce_digest = p_nonce_digest and h.continued_at is null and h.discarded_at is null
      and h.nonce_expires_at > now()
    returning h.user_id, h.path;
end;
$$;

revoke execute on function public.genesis_web_handoff_continue(text) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_continue(text) to service_role;

-- Discard: the person chose Cancel. Burns the nonce, so Continue is refused afterwards.

create or replace function public.genesis_web_handoff_discard(p_nonce_digest text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_discard is for the server only' using errcode = '42501';
  end if;
  update private.genesis_web_handoffs h
  set discarded_at = now()
  where h.nonce_digest = p_nonce_digest and h.continued_at is null and h.discarded_at is null;
  return found;
end;
$$;

revoke execute on function public.genesis_web_handoff_discard(text) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_discard(text) to service_role;

-- Bind: the page reports the session Continue made (its id from the verified access token),
-- once, within two minutes of Continue, for the handoff's own person.

create or replace function public.genesis_web_handoff_bind_session(p_nonce_digest text, p_user_id uuid, p_session_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_bind_session is for the server only' using errcode = '42501';
  end if;
  update private.genesis_web_handoffs h
  set web_session_id = p_session_id
  where h.nonce_digest = p_nonce_digest and h.user_id = p_user_id and h.web_session_id is null
    and h.continued_at > now() - interval '2 minutes'
    and h.source_session_id is distinct from p_session_id;
  return found;
end;
$$;

revoke execute on function public.genesis_web_handoff_bind_session(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_bind_session(text, uuid, uuid) to service_role;

-- Revoke: the app signs out. Ends exactly the web sessions handed off from that app session
-- (never the person's other devices), by deleting their auth.sessions rows.

create or replace function public.genesis_web_handoff_revoke_sessions(p_user_id uuid, p_source_session_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ended integer;
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_revoke_sessions is for the server only' using errcode = '42501';
  end if;
  if p_user_id is null or p_source_session_id is null then
    return 0;
  end if;
  with targets as (
    select h.id, h.web_session_id
    from private.genesis_web_handoffs h
    where h.user_id = p_user_id and h.source_session_id = p_source_session_id
      and h.web_session_id is not null and h.web_session_id <> p_source_session_id
    for update
  ), gone as (
    delete from auth.sessions s
    using targets t
    where s.id = t.web_session_id and s.user_id = p_user_id
    returning s.id
  ), cleared as (
    update private.genesis_web_handoffs h
    set web_session_id = null
    from targets t
    where h.id = t.id
    returning h.id
  )
  select count(*) into ended from gone;
  return ended;
end;
$$;

revoke execute on function public.genesis_web_handoff_revoke_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_revoke_sessions(uuid, uuid) to service_role;
