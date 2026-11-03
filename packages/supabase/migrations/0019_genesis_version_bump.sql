-- Genesis version bump: a trigger that advances a row's version on every update
--
-- The Supabase data provider checks updates and deletes against the version the client read the
-- row at (a resource's `version: { field, kind: "integer" }` rule), so an edit made on a stale
-- copy is refused as a conflict instead of overwriting someone else's. That only works when the
-- database advances the version on every update, whoever makes it (the app, a function, the SQL
-- editor). This trigger does that:
--
--   alter table public.tasks add column version bigint not null default 1;
--   create trigger tasks_version_bump before update on public.tasks
--     for each row execute function public.genesis_version_bump('version');
--
-- The argument names the column (default `version`), an integer column (bigint, say); any other
-- type is an error (a `kind: "timestamp"` version uses a `moddatetime`-style trigger instead).
-- On every update it sets the column to the old value plus one, whatever the update wrote there,
-- so a client can neither hold the version back nor jump it ahead. An update that changes nothing still advances it: Postgres can't tell an
-- unchanged row from a changed one cheaply, and a spare bump only makes a stale copy conflict,
-- which is the safe side.
--
-- It is a plain trigger function (security invoker, search_path ''); it reads and writes only the
-- row being updated. Nobody calls it directly, so execute is revoked from everyone.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.

create or replace function public.genesis_version_bump()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text := coalesce(nullif(tg_argv[0], ''), 'version');
  previous bigint;
begin
  if tg_op <> 'UPDATE' or tg_level <> 'ROW' or tg_when <> 'BEFORE' then
    raise exception 'genesis_version_bump runs as a BEFORE UPDATE FOR EACH ROW trigger'
      using errcode = '39P01';
  end if;
  if not (to_jsonb(old) ? col) then
    raise exception 'genesis_version_bump: % has no column "%"', tg_table_name, col
      using errcode = '42703';
  end if;
  if jsonb_typeof(to_jsonb(old) -> col) not in ('number', 'null') then
    raise exception 'genesis_version_bump: %.% is not an integer column', tg_table_name, col
      using errcode = '42804';
  end if;
  previous := coalesce((to_jsonb(old) ->> col)::bigint, 0);
  new := jsonb_populate_record(new, jsonb_build_object(col, previous + 1));
  return new;
end;
$$;

revoke execute on function public.genesis_version_bump() from public, anon, authenticated;
