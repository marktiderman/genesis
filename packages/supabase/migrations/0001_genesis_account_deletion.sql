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
-- Your data: deleting from auth.users removes rows whose foreign keys to
-- auth.users(id) say `on delete cascade`, and fails (23503) on any that
-- don't, so the person keeps their account rather than half of it. Give each
-- such key `on delete cascade` (or `set null` for rows that must outlive the
-- person), or delete those rows here before the login. Storage objects are
-- not tied by a foreign key: remove a person's files through the Storage API
-- before calling this, or with a job afterwards.
--
-- Sessions: the person's refresh tokens go with the login. An access token
-- already issued stays valid until it expires (the JWT expiry, one hour by
-- default); `deleteMyAccount` signs this device out straight after.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_account_deletion.test.sql`)
-- checks that a signed-in person deletes only themselves, that `anon` and
-- `public` can't call it, and that a call with no signed-in person is refused.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'delete_my_account: not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the signed-in person''s login (auth.users) and, through on delete cascade, their data. Genesis account block.';

-- By name, never with a blanket grant: a later `grant ... on all functions`
-- would silently hand this back to anon.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
