-- Genesis web handoff: continue on the web, already signed in
--
-- The database half of `@marktiderman/genesis-supabase/web-handoff/server`. A native app asks
-- the server for a link to a web page; the link opens that page signed in as the same person.
-- Each link is a row here:
--
--   private.genesis_web_handoffs  who it is for, which path, when it was issued, when it
--                                 expires (60 seconds by default) and when it was used. Only a
--                                 SHA-256 digest of the link's random token is kept, never the
--                                 token, so a copy of this table signs nobody in.
--
-- Rows are also the log of handoffs (who, which path, when), kept 30 days.
--
-- Access: only service_role, through the two functions below, granted by name. anon and
-- authenticated reach nothing: the table is in `private`, has row level security with no
-- policies, and the functions also refuse any role but service_role
-- (`current_setting('role')`, which is what PostgREST set, not a JWT claim).
--
--   genesis_web_handoff_issue(user, digest, path, ttl, max, window)
--       records a handoff; refuses (SQLSTATE GS429) once the person has `max` in the last
--       `window` seconds, counted under a per-person lock so parallel calls can't slip past.
--   genesis_web_handoff_redeem(digest)
--       marks the handoff used and returns its person and path, in one statement, only if it
--       is unused and unexpired: single use and the lifetime hold however many tabs race.
--
-- Supabase's own sign-in token is minted only after a redeem succeeds (the server calls
-- `auth.admin.generateLink`) and is exchanged by the page at once.
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
  check (expires_at > created_at)
);

comment on table private.genesis_web_handoffs is
  'Native-to-web sign-in handoffs (genesis-supabase web-handoff): a token digest, never the token. Service role only.';

create index genesis_web_handoffs_user_recent on private.genesis_web_handoffs (user_id, created_at desc);
create index genesis_web_handoffs_created on private.genesis_web_handoffs (created_at);

alter table private.genesis_web_handoffs enable row level security;
revoke all on table private.genesis_web_handoffs from public, anon, authenticated;

-- Issue ------------------------------------------------------------------------------

create or replace function public.genesis_web_handoff_issue(
  p_user_id uuid,
  p_digest text,
  p_path text,
  p_ttl_seconds integer default 60,
  p_max integer default 10,
  p_window_seconds integer default 60
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
  insert into private.genesis_web_handoffs (user_id, token_digest, path, expires_at)
  values (p_user_id, p_digest, p_path, expires);

  -- The log keeps 30 days.
  delete from private.genesis_web_handoffs h where h.created_at < now() - interval '30 days';
  return expires;
end;
$$;

revoke execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_issue(uuid, text, text, integer, integer, integer) to service_role;

-- Redeem -----------------------------------------------------------------------------

create or replace function public.genesis_web_handoff_redeem(p_digest text)
returns table (user_id uuid, path text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('role', true), ''), 'none') <> 'service_role' then
    raise exception 'genesis_web_handoff_redeem is for the server only' using errcode = '42501';
  end if;
  return query
    update private.genesis_web_handoffs h
    set used_at = now()
    where h.token_digest = p_digest and h.used_at is null and h.expires_at > now()
    returning h.user_id, h.path;
end;
$$;

revoke execute on function public.genesis_web_handoff_redeem(text) from public, anon, authenticated;
grant execute on function public.genesis_web_handoff_redeem(text) to service_role;
