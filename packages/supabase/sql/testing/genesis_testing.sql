-- genesis_testing: pgTAP helpers that check an app's own schema keeps the data contract.
--
-- Copy this file into your app's `supabase/tests/database/` as `000_genesis_testing.test.sql`. The
-- leading zeros make `supabase test db` run it first, and it commits the `genesis_testing` schema
-- (and nothing else) so the test files after it can call the helpers. It ends with a one-line plan
-- of its own, so pg_prove reports it as a passing test file. Re-running it is safe: everything is
-- `create or replace`.
--
-- Every assertion runs its statement in a savepoint that is always rolled back, so one check never
-- changes what the next one sees. Each returns one pgTAP line (`ok …` / `not ok …`), with a
-- `diag` explaining a failure. The `genesis_testing.probe_*` functions return the same verdict as
-- jsonb ({ "pass": bool, "detail": text }) for tests of your own helpers.
--
-- Roles and sign-in follow Supabase: `authenticated`/`anon`/`service_role`, and `auth.uid()` reads
-- `request.jwt.claims` (the legacy `request.jwt.claim.sub` is set too, for older images).
--
-- The contract it checks (Genesis data rules):
--   * refuses:        a write the user may not make raises 42501 or changes no row.
--   * server_owned:   a client can't change columns only the server sets (status, kinds, totals…).
--   * allows / allows_with_setting / allows_system_paths:
--                     guards let system work through: no signed-in user (jobs, backfills), the
--                     app's bypass settings (e.g. `bt.hard_delete`), cascades and ON DELETE SET NULL.
--   * never_shows:    a private value never appears in what a user can read, reports included.
--   * sees:           a user reads exactly the rows they should.
--
-- Requires pgTAP (`create extension if not exists pgtap with schema extensions;`, or in public).

create schema if not exists genesis_testing;

-- Fixture people ----------------------------------------------------------------------------

/**
 * The shared fixture ids, the same ones `@marktiderman/genesis-core/testing` uses:
 * owner, staff, client, stranger.
 */
create or replace function genesis_testing.user_id(_who text)
returns uuid language sql immutable set search_path = '' as $$
  select case _who
    when 'owner' then '00000000-0000-4000-8000-000000000001'::uuid
    when 'staff' then '00000000-0000-4000-8000-000000000002'::uuid
    when 'client' then '00000000-0000-4000-8000-000000000003'::uuid
    when 'stranger' then '00000000-0000-4000-8000-000000000004'::uuid
  end
$$;

/** Creates the four fixture logins in auth.users (skips any that already exist). */
create or replace function genesis_testing.create_users()
returns void language sql set search_path = '' as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select genesis_testing.user_id(w), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'genesis-testing-' || w || '@example.test', '{}'::jsonb, jsonb_build_object('full_name', initcap(w)), now(), now()
    from unnest(array['owner', 'staff', 'client', 'stranger']) w
  on conflict (id) do nothing
$$;

-- Acting as someone ---------------------------------------------------------------------------

/** Acts as a signed-in user for the rest of the transaction (or the enclosing savepoint). */
create or replace function genesis_testing.sign_in(_user uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', _user, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', _user::text, true);
  perform pg_catalog.set_config('role', 'authenticated', true);
end $$;

/** Acts as a fixture person: 'owner', 'staff', 'client' or 'stranger'. */
create or replace function genesis_testing.sign_in(_who text)
returns void language sql set search_path = '' as $$
  select genesis_testing.sign_in(genesis_testing.user_id(_who))
$$;

/** Acts as someone signed out (the anon key). */
create or replace function genesis_testing.sign_in_anon()
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('role', 'anon', true);
end $$;

/** Back to the test's own role with no claims: how jobs, backfills and migrations run. */
create or replace function genesis_testing.sign_out()
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('request.jwt.claims', '', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

-- Probes (verdicts as jsonb) ------------------------------------------------------------------

/**
 * Runs `_sql` as `_user` (null: signed out, as system work runs) in a savepoint that is rolled
 * back. Returns { ok, rows, sqlstate, message }: `ok` is false when it raised.
 */
create or replace function genesis_testing.run_as(_sql text, _user uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _rows bigint := 0;
  _out jsonb;
begin
  begin
    if _user is null then
      perform genesis_testing.sign_out();
    else
      perform genesis_testing.sign_in(_user);
    end if;
    execute _sql;
    get diagnostics _rows = row_count;
    _out := pg_catalog.jsonb_build_object('ok', true, 'rows', _rows);
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception
    when sqlstate 'GT000' then null;
    when others then
      _out := pg_catalog.jsonb_build_object('ok', false, 'rows', 0, 'sqlstate', sqlstate, 'message', sqlerrm);
  end;
  return _out;
end $$;

/** `refuses` as a verdict: raised 42501, or changed no row. */
create or replace function genesis_testing.probe_refuses(_sql text, _user uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _r jsonb := genesis_testing.run_as(_sql, _user);
begin
  if not (_r ->> 'ok')::boolean then
    return pg_catalog.jsonb_build_object('pass', _r ->> 'sqlstate' = '42501',
      'detail', pg_catalog.format('raised %s (%s), expected 42501 or no row changed', _r ->> 'sqlstate', _r ->> 'message'));
  end if;
  return pg_catalog.jsonb_build_object('pass', (_r ->> 'rows')::bigint = 0,
    'detail', pg_catalog.format('it ran and changed %s row(s)', _r ->> 'rows'));
end $$;

/** `allows` as a verdict: ran without an error (optionally changing at least `_min_rows`). */
create or replace function genesis_testing.probe_allows(_sql text, _user uuid, _min_rows bigint default 0)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _r jsonb := genesis_testing.run_as(_sql, _user);
begin
  if not (_r ->> 'ok')::boolean then
    return pg_catalog.jsonb_build_object('pass', false,
      'detail', pg_catalog.format('raised %s: %s', _r ->> 'sqlstate', _r ->> 'message'));
  end if;
  return pg_catalog.jsonb_build_object('pass', (_r ->> 'rows')::bigint >= _min_rows,
    'detail', pg_catalog.format('changed %s row(s), expected at least %s', _r ->> 'rows', _min_rows));
end $$;

/** A value of `_type` that differs from `_current` (text form), for trying to overwrite a column. */
create or replace function genesis_testing.other_value(_type regtype, _current text)
returns text language plpgsql stable set search_path = '' as $$
begin
  return case
    when _type in ('boolean'::regtype) then pg_catalog.quote_literal(coalesce(not _current::boolean, true)::text)
    when _type in ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype, 'numeric'::regtype,
                   'real'::regtype, 'double precision'::regtype)
      then pg_catalog.quote_literal((coalesce(_current::numeric, 0) + 1)::text)
    when _type = 'uuid'::regtype then pg_catalog.quote_literal(gen_random_uuid()::text)
    when _type in ('timestamptz'::regtype, 'timestamp'::regtype)
      then pg_catalog.quote_literal((coalesce(_current::timestamptz, now()) + interval '1 day')::text)
    when _type = 'date'::regtype then pg_catalog.quote_literal((coalesce(_current::date, current_date) + 1)::text)
    when _type = 'jsonb'::regtype or _type = 'json'::regtype then pg_catalog.quote_literal('{"genesis_testing":true}')
    else pg_catalog.quote_literal('genesis_testing:' || coalesce(_current, ''))
  end || '::' || _type::text;
end $$;

/**
 * `server_owned` as a verdict for one column: as `_user`, set `_column` of the row whose
 * `_key_column` is `_key` to a different value (or `_value`, an SQL expression), then read it back
 * as the test's own role. Passes when the stored value didn't change, whether the update raised,
 * changed no row, or a trigger put the value back.
 */
create or replace function genesis_testing.probe_server_owned(
  _table regclass, _key_column text, _key text, _column text, _user uuid, _value text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _type regtype;
  _before text;
  _after text;
  _err text;
  _read text;
begin
  select a.atttypid::regtype into _type
    from pg_catalog.pg_attribute a
   where a.attrelid = _table and a.attname = _column and not a.attisdropped;
  if _type is null then
    return pg_catalog.jsonb_build_object('pass', false, 'detail', pg_catalog.format('%s has no column %s', _table, _column));
  end if;
  _read := pg_catalog.format('select (%I)::text from %s where %I::text = %L', _column, _table, _key_column, _key);
  execute _read into _before;
  begin
    perform genesis_testing.sign_in(_user);
    begin
      execute pg_catalog.format('update %s set %I = %s where %I::text = %L', _table, _column,
        coalesce(_value, genesis_testing.other_value(_type, _before)), _key_column, _key);
    exception when others then
      _err := sqlstate || ' ' || sqlerrm;
    end;
    perform genesis_testing.sign_out();
    execute _read into _after;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  return pg_catalog.jsonb_build_object('pass', _after is not distinct from _before,
    'detail', case
      when _after is not distinct from _before then coalesce('refused: ' || _err, 'unchanged')
      else pg_catalog.format('%s changed from %s to %s', _column, coalesce(_before, 'null'), coalesce(_after, 'null'))
    end);
end $$;

/**
 * `never_shows` as a verdict: runs `_query` as `_user` (null: signed out of nothing, anon if
 * `_anon`) and passes when `_marker` appears nowhere in its rows, column names included.
 */
create or replace function genesis_testing.probe_never_shows(_query text, _marker text, _user uuid, _anon boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _text text;
  _err text;
begin
  begin
    if _anon then
      perform genesis_testing.sign_in_anon();
    else
      perform genesis_testing.sign_in(_user);
    end if;
    begin
      execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(q))::text, '''') from (%s) q', _query) into _text;
    exception when others then
      _err := sqlstate || ' ' || sqlerrm;
    end;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  if _err is not null then
    -- Refused outright: nothing was shown.
    return pg_catalog.jsonb_build_object('pass', true, 'detail', 'refused: ' || _err);
  end if;
  return pg_catalog.jsonb_build_object('pass', pg_catalog.strpos(_text, _marker) = 0,
    'detail', case when pg_catalog.strpos(_text, _marker) = 0 then 'not shown'
                   else pg_catalog.format('%L appears in: %s', _marker, pg_catalog.left(_text, 300)) end);
end $$;

/** `sees` as a verdict: `_query` returns exactly `_expected` rows for `_user`. */
create or replace function genesis_testing.probe_sees(_query text, _user uuid, _expected bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _n bigint;
  _err text;
begin
  begin
    perform genesis_testing.sign_in(_user);
    begin
      execute pg_catalog.format('select count(*) from (%s) q', _query) into _n;
    exception when others then
      _err := sqlstate || ' ' || sqlerrm;
    end;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  if _err is not null then
    return pg_catalog.jsonb_build_object('pass', false, 'detail', 'raised ' || _err);
  end if;
  return pg_catalog.jsonb_build_object('pass', _n = _expected,
    'detail', pg_catalog.format('saw %s row(s), expected %s', _n, _expected));
end $$;

-- Assertions (pgTAP lines) --------------------------------------------------------------------

/** One pgTAP line from a verdict, with the detail as a diagnostic when it failed. */
-- pgTAP's own functions call each other unqualified, so this one runs with pgTAP's schema on the
-- path (Supabase installs it in `extensions`; `public` covers a plain install).
create or replace function genesis_testing.tap(_verdict jsonb, _description text)
returns text language plpgsql set search_path = extensions, public as $$
declare
  _line text := ok((_verdict ->> 'pass')::boolean, _description);
begin
  if not (_verdict ->> 'pass')::boolean then
    return _line || E'\n' || diag(_verdict ->> 'detail');
  end if;
  return _line;
end $$;

/** `_user` may not do `_sql`: it raises 42501 or changes no row. */
create or replace function genesis_testing.refuses(_sql text, _user uuid, _description text)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_refuses(_sql, _user), _description)
$$;

/** `_user` (null: signed out, as jobs and backfills run) can do `_sql` without an error. */
create or replace function genesis_testing.allows(_sql text, _user uuid, _description text, _min_rows bigint default 0)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_allows(_sql, _user, _min_rows), _description)
$$;

/**
 * `_sql` runs with the bypass setting `_setting` = `_value` (e.g. 'bt.hard_delete' = 'on'), as
 * `_user` (null: signed out). The setting only lasts for this check.
 */
create or replace function genesis_testing.allows_with_setting(
  _sql text, _setting text, _value text, _user uuid, _description text)
returns text language plpgsql set search_path = '' as $$
declare
  _verdict jsonb;
begin
  begin
    perform pg_catalog.set_config(_setting, _value, true);
    _verdict := genesis_testing.probe_allows(_sql, _user);
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  return genesis_testing.tap(_verdict, _description);
end $$;

/**
 * Every system path can do `_sql`: signed out (jobs, backfills, migrations) and each bypass
 * setting in `_settings` ('name=value'), as `_user` when one is given. One line per path.
 */
create or replace function genesis_testing.allows_system_paths(
  _sql text, _settings text[], _user uuid, _description text)
returns setof text language plpgsql set search_path = '' as $$
declare
  _s text;
begin
  return next genesis_testing.allows(_sql, null, _description || ' (no signed-in user)');
  foreach _s in array coalesce(_settings, array[]::text[]) loop
    return next genesis_testing.allows_with_setting(_sql, pg_catalog.split_part(_s, '=', 1),
      pg_catalog.split_part(_s, '=', 2), _user, pg_catalog.format('%s (%s)', _description, _s));
  end loop;
end $$;

/**
 * A client can't change any of `_columns` on the row `_key_column` = `_key`: one line per column.
 * Use it for every column only the server sets (status the server derives, kinds, totals, owner
 * and audit columns, timestamps a trigger stamps).
 */
create or replace function genesis_testing.server_owned(
  _table regclass, _key_column text, _key text, _columns text[], _user uuid)
returns setof text language plpgsql set search_path = '' as $$
declare
  _c text;
begin
  foreach _c in array _columns loop
    return next genesis_testing.tap(
      genesis_testing.probe_server_owned(_table, _key_column, _key, _c, _user),
      pg_catalog.format('%s.%s is server-owned for %s', _table, _c, _user));
  end loop;
end $$;

/**
 * `_marker` (a value only a private row holds) never appears in what `_user` reads through
 * `_query`: a table, a view, or a report function (`select * from report_fn(…)`). Use it for
 * every security-definer function that reads a table with a privacy flag.
 */
create or replace function genesis_testing.never_shows(_query text, _marker text, _user uuid, _description text)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_never_shows(_query, _marker, _user), _description)
$$;

/** Like never_shows, signed out with the anon key. */
create or replace function genesis_testing.never_shows_anon(_query text, _marker text, _description text)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_never_shows(_query, _marker, null, true), _description)
$$;

/** `_user` reads exactly `_expected` rows through `_query`. */
create or replace function genesis_testing.sees(_query text, _user uuid, _expected bigint, _description text)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_sees(_query, _user, _expected), _description)
$$;

-- The checks switch to the API roles mid-test, so those roles call these functions too. Granted by
-- name (no blanket grants); the schema isn't exposed through PostgREST unless an app adds it.
grant usage on schema genesis_testing to authenticated, anon, service_role;
do $$
declare
  _f regprocedure;
begin
  for _f in
    select p.oid::regprocedure from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'genesis_testing'
  loop
    execute pg_catalog.format('grant execute on function %s to authenticated, anon, service_role', _f);
  end loop;
end $$;

-- When run as a test file of its own (000_genesis_testing.test.sql), report that it loaded.
select plan(1);
select has_schema('genesis_testing', 'genesis_testing helpers are loaded');
select * from finish();
