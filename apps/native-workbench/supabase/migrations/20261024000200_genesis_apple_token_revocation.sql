-- Genesis Sign in with Apple token revocation: where Apple's refresh tokens live,
-- and the queue that revokes them when an account is deleted.
--
-- App Store Review Guideline 5.1.1(v): an app that offers Sign in with Apple
-- revokes the person's Apple tokens (https://appleid.apple.com/auth/revoke)
-- when they delete their account. Supabase doesn't: a native id-token sign-in
-- never hands Supabase an Apple refresh token, and Auth doesn't keep the
-- provider tokens it does see. So the app sends the sign-in's authorization
-- code to the `genesis-apple-revoke` Edge Function (shipped beside this file
-- in @marktiderman/genesis-supabase), which exchanges it for a refresh token
-- and keeps it here; deleting the login queues it, and the function revokes it.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name, and the function folder into `supabase/functions/`.
-- Never edit it once applied; change it with a new migration. It stands
-- alone (it doesn't need 0001), and covers every way a login is deleted:
-- delete_my_account, the dashboard, and the admin API.
--
-- Who can see a token: nobody but this file's functions. The tables are in
-- `private` (not exposed through the Data API) with row level security on, no
-- policies and every table privilege revoked from anon and authenticated. The
-- Edge Function reaches them only through the four `public` functions below,
-- executable by service_role alone (granted and revoked by name).
--
-- Not encrypted in the column: an Apple refresh token is useless without a
-- client secret signed with your .p8 key, which lives in the function's
-- secrets, not the database; encrypting it with a key from those same secrets
-- would add a secret without closing a gap.
--
-- Failure policy: deletion never waits for Apple. The delete trigger moves
-- the person's tokens into `private.genesis_apple_revocations` in the same
-- transaction as the delete (so a refused delete queues nothing, and a
-- committed one can't lose its token), and the function revokes them after:
-- straight away when the app asks, then on a schedule, with backoff (five
-- minutes, doubling, at most a day apart). A revoked token's row is deleted.
-- After 30 failed attempts (about four weeks) the token is dropped and the
-- row kept, with `last_error` starting `gave_up`, as the record that it
-- wasn't revoked. A deleted login that signed in with Apple but has no stored
-- token (the store step failed, or it predates this) leaves a row with no
-- token and `last_error` starting `no_token`. Any row still here is one to
-- look at.
--
-- Verify: the pgTAP test beside this file (`tests/0003_genesis_apple_token_revocation.test.sql`).

create schema if not exists private;

-- One refresh token per login and client id (bundle id or Services ID): each
-- sign-in replaces the last.
create table private.genesis_apple_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null check (client_id ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$'),
  refresh_token text not null check (length(refresh_token) between 1 and 4096),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- Tokens of deleted logins, until Apple confirms the revocation. `user_id` has
-- no foreign key: the login is gone. A row without a token is a record (no
-- token was ever stored, or the retries gave up), never handed out.
create table private.genesis_apple_revocations (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  client_id text,
  refresh_token text,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  check (refresh_token is null or client_id is not null)
);
create index genesis_apple_revocations_due on private.genesis_apple_revocations (next_attempt_at) where refresh_token is not null;

alter table private.genesis_apple_tokens enable row level security;
alter table private.genesis_apple_revocations enable row level security;
revoke all on table private.genesis_apple_tokens from public, anon, authenticated;
revoke all on table private.genesis_apple_revocations from public, anon, authenticated;

comment on table private.genesis_apple_tokens is
  'Sign in with Apple refresh tokens, server-only; written by genesis-apple-revoke. Genesis account block.';
comment on table private.genesis_apple_revocations is
  'Apple refresh tokens of deleted logins, until /auth/revoke succeeds; rows without a token are records to look at. Genesis account block.';

-- Deleting a login (any way) queues its Apple tokens before the cascade
-- removes them, or records that an Apple login had none to queue.
create function private.genesis_apple_queue_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.genesis_apple_revocations (user_id, client_id, refresh_token)
  select t.user_id, t.client_id, t.refresh_token
  from private.genesis_apple_tokens t
  where t.user_id = old.id;
  if not found and exists (select 1 from auth.identities i where i.user_id = old.id and i.provider = 'apple') then
    insert into private.genesis_apple_revocations (user_id, last_error)
    values (old.id, 'no_token: signed in with Apple, but no refresh token was stored, so none was revoked');
  end if;
  return old;
end;
$$;

create trigger genesis_apple_queue_revocation
  before delete on auth.users
  for each row execute function private.genesis_apple_queue_revocation();

-- Keeps the refresh token from a sign-in. If the login is already gone (it was
-- deleted while the code was being exchanged), the token goes straight to the
-- queue instead, so it is still revoked. Returns 'stored' or 'queued'.
create function public.genesis_apple_token_save(p_user_id uuid, p_client_id text, p_refresh_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.genesis_apple_tokens as t (user_id, client_id, refresh_token)
  values (p_user_id, p_client_id, p_refresh_token)
  on conflict (user_id, client_id) do update
    set refresh_token = excluded.refresh_token, updated_at = now();
  return 'stored';
exception
  when foreign_key_violation then
    insert into private.genesis_apple_revocations (user_id, client_id, refresh_token)
    values (p_user_id, p_client_id, p_refresh_token);
    return 'queued';
  when check_violation then
    -- Raised afresh so the error (and the server log) never carries the failing row, token and all.
    raise exception 'genesis_apple_token_save: malformed client id or token' using errcode = '23514';
end;
$$;

-- Hands out up to p_limit due revocations and pushes each one's next attempt
-- back (5 minutes, doubling per attempt, at most a day): the lease outlasts a
-- batch, so a function that dies mid-batch retries later and two runs never
-- take the same row.
create function public.genesis_apple_revocations_claim(p_limit integer default 20)
returns table (id bigint, client_id text, refresh_token text, attempts integer)
language sql
security definer
set search_path = ''
as $$
  update private.genesis_apple_revocations r
  set attempts = r.attempts + 1,
      next_attempt_at = now() + least(interval '5 minutes' * power(2, least(r.attempts, 20)), interval '1 day')
  where r.id in (
    select q.id from private.genesis_apple_revocations q
    where q.refresh_token is not null and q.next_attempt_at <= now()
    order by q.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  returning r.id, r.client_id, r.refresh_token, r.attempts;
$$;

-- Apple confirmed (or the token was already dead): forget the token.
create function public.genesis_apple_revocation_done(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.genesis_apple_revocations where id = p_id and refresh_token is not null;
$$;

-- Apple refused or didn't answer: keep the row for its next attempt, with why.
-- After the 30th attempt, drop the token and keep the row as the record.
-- Returns 'retry' or 'gave_up'.
create function public.genesis_apple_revocation_failed(p_id bigint, p_error text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  tries integer;
begin
  update private.genesis_apple_revocations
  set last_error = left(coalesce(p_error, ''), 200)
  where id = p_id and refresh_token is not null
  returning attempts into tries;
  if tries >= 30 then
    update private.genesis_apple_revocations
    set refresh_token = null, last_error = left('gave_up after ' || tries || ' attempts: ' || coalesce(p_error, ''), 200)
    where id = p_id;
    return 'gave_up';
  end if;
  return 'retry';
end;
$$;

-- Privileges by name. Supabase's default privileges grant execute on a new
-- public function to anon and authenticated, so each is revoked here; a later
-- blanket `grant … on all functions` would hand them back, so such a grant
-- must exclude them.
revoke execute on function private.genesis_apple_queue_revocation() from public, anon, authenticated;
revoke execute on function public.genesis_apple_token_save(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_apple_revocations_claim(integer) from public, anon, authenticated;
revoke execute on function public.genesis_apple_revocation_done(bigint) from public, anon, authenticated;
revoke execute on function public.genesis_apple_revocation_failed(bigint, text) from public, anon, authenticated;
grant execute on function public.genesis_apple_token_save(uuid, text, text) to service_role;
grant execute on function public.genesis_apple_revocations_claim(integer) to service_role;
grant execute on function public.genesis_apple_revocation_done(bigint) to service_role;
grant execute on function public.genesis_apple_revocation_failed(bigint, text) to service_role;
