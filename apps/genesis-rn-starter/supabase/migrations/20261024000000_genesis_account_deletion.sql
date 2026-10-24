-- Genesis account deletion: public.delete_my_account()
--
-- App Store Review Guideline 5.1.1(v) requires an app that lets people make
-- an account to let them delete it from inside the app. This function deletes
-- the signed-in person's login; the client half is `deleteMyAccount(client)`
-- in @marktiderman/genesis-supabase.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new
-- timestamped name (e.g. `20261024000000_genesis_account_deletion.sql`).
-- Never edit it once applied; change it with a new migration.
--
-- What it refuses, by SQLSTATE (the client sees it as `SupabaseQueryError.code`):
--   42501  nobody is signed in, or the person has a verified MFA factor and
--          this session isn't aal2 (verify the second factor first)
--   GA001  refused by the app's hook (below), e.g. the sole owner of something
--   GA002  the app requires a recent sign-in and this one isn't (below)
--   23503  a row still references the login (see "Your data")
--
-- Your data: deleting from auth.users removes rows whose foreign keys to
-- auth.users(id) say `on delete cascade`, and fails (23503) on any that
-- don't, so the person keeps their whole account rather than half of it. Give
-- every user-owned table a foreign key to auth.users with `on delete cascade`
-- (or `set null` for rows that must outlive the person): a table keyed on
-- auth.uid() with no foreign key keeps orphans, and accepts new ones while an
-- old access token is still valid (below).
--
-- Storage: Supabase documents that a user who owns objects in Storage can't
-- be deleted, so this fails (23503) while they have files. Remove a person's
-- files through the Storage API (not SQL) before calling it. (Documented by
-- Supabase; not verified against a full stack in Genesis's own tests.)
--
-- Sign in with Apple: Apple requires apps to revoke the person's Apple tokens
-- (https://appleid.apple.com/auth/revoke) when the account is deleted. That
-- needs your Apple client secret, so it is a server step this file can't do;
-- see the package README ("Not covered yet").
--
-- Sessions: the person's refresh tokens go with the login. An access token
-- already issued stays valid until it expires (the JWT expiry, one hour by
-- default); `deleteMyAccount` signs this device out straight after.
--
-- The app hook: if `private.genesis_before_account_delete(uuid)` exists, it
-- runs first, in the same transaction, with this function's (the owner's)
-- rights and the person's id. Use it to scrub data, set flags, or refuse. Any
-- error it raises refuses the delete and nothing is deleted; it reaches the
-- client as GA001 (or as the hook's own code when that starts with GA), e.g.
--
--   create function private.genesis_before_account_delete(person uuid) returns void
--   language plpgsql set search_path = '' as $$
--   begin
--     if exists (select 1 from public.teams t where t.sole_owner = person) then
--       raise exception 'Hand over your teams before deleting your account';
--     end if;
--     -- Optional: require a sign-in in the last 10 minutes (GA002 otherwise).
--     perform private.genesis_require_recent_sign_in(interval '10 minutes');
--   end $$;
--   revoke execute on function private.genesis_before_account_delete(uuid) from public, anon, authenticated;
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_account_deletion.test.sql`).

create schema if not exists private;

-- Raises GA002 unless the person authenticated (password, OTP, OAuth, MFA…)
-- within `max_age`. Reads the newest `amr` timestamp in the JWT, which records
-- when they actually signed in and survives token refreshes; falls back to
-- `iat` (when this token was issued, which a refresh renews) without one.
-- Not called by default: an app turns it on from its hook.
create or replace function private.genesis_require_recent_sign_in(max_age interval)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  signed_in bigint;
begin
  select max((m ->> 'timestamp')::bigint) into signed_in
  from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) m
  where m ->> 'timestamp' ~ '^\d+$';
  signed_in := coalesce(signed_in, nullif(claims ->> 'iat', '')::bigint);
  if signed_in is null or to_timestamp(signed_in) < now() - max_age then
    raise exception 'delete_my_account: sign in again to delete your account'
      using errcode = 'GA002', hint = 'Ask the person to sign in again, then retry.';
  end if;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  if me is null then
    raise exception 'delete_my_account: not signed in' using errcode = '42501';
  end if;

  -- MFA step-up: with a verified second factor, only an aal2 session may delete.
  if exists (select 1 from auth.mfa_factors f where f.user_id = me and f.status = 'verified')
     and coalesce(claims ->> 'aal', '') <> 'aal2' then
    raise exception 'delete_my_account: verify your second factor first'
      using errcode = '42501', hint = 'Complete MFA (aal2), then retry.';
  end if;

  if to_regprocedure('private.genesis_before_account_delete(uuid)') is not null then
    begin
      perform private.genesis_before_account_delete(me);
    exception when others then
      if left(sqlstate, 2) = 'GA' then
        raise;
      end if;
      raise exception '%', sqlerrm
        using errcode = 'GA001', detail = format('Refused by private.genesis_before_account_delete (SQLSTATE %s).', sqlstate);
    end;
  end if;

  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the signed-in person''s login (auth.users) and, through on delete cascade, their data. Genesis account block.';

-- Privileges by name. Revoking here doesn't survive a later blanket grant
-- (`grant execute on all functions in schema public to anon` hands this back
-- to anon), so a blanket grant must exclude these functions.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function private.genesis_require_recent_sign_in(interval) from public, anon, authenticated;
