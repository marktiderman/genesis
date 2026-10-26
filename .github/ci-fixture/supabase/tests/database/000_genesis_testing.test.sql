-- genesis_testing: pgTAP helpers that check an app's own schema keeps the data contract.
--
-- TEST DATABASES ONLY. Never put this file in `supabase/migrations/` (the doctor's supabase pack
-- flags it there): it signs in as anyone and resets roles, which only a test may do.
--
-- Copy this file into your app's `supabase/tests/database/` as `000_genesis_testing.test.sql`. The
-- leading zeros make `supabase test db` run it first, and it commits the `genesis_testing` schema
-- (and nothing else) so the test files after it can call the helpers. It ends with a one-line plan
-- of its own, so pg_prove reports it as a passing test file. Re-running it is safe: everything is
-- `create or replace`.
--
-- Every check runs its statement in a savepoint that is always rolled back, so one check never
-- changes what the next one sees. Each returns one pgTAP line (`ok …` / `not ok …`), with a `diag`
-- explaining a failure. The `genesis_testing.probe_*` functions return the same verdict as jsonb
-- ({ "pass": bool, "detail": text }) for tests of your own helpers.
--
-- A check only passes on evidence. A refusal counts only when it is one (42501, or a guard's
-- `raise exception`, P0001); any other error fails the check, so a typo can't pass. "Changed no
-- row" and "value unchanged" count only when a control run (the system, or a user you name) can
-- make the same change, so a missing row or a wrong key can't pass either.
--
-- `user` arguments: a uuid acts as that signed-in user; null means the system: no signed-in user and
-- the test's own role, the way jobs, backfills and migrations run.
--
-- Roles and sign-in follow Supabase: `authenticated`/`anon`/`service_role`, and `auth.uid()` reads
-- `request.jwt.claims` (the legacy `request.jwt.claim.sub` is set too, for older images).
--
-- The contract it checks (Genesis data rules):
--   * refuses:        a write the user may not make is refused, or changes no row the control can.
--   * server_owned:   a client can't change columns only the server sets (status, kinds, totals…).
--   * allows / allows_with_setting / allows_system_paths:
--                     guards let system work through: no signed-in user (jobs, backfills), the
--                     app's bypass settings (e.g. `bt.hard_delete`), cascades and ON DELETE SET NULL.
--   * never_shows:    a private value never appears in what a user can read, reports included.
--   * sees:           a user reads exactly the rows they should.
--
-- Requires pgTAP (`create extension if not exists pgtap with schema extensions;`, or any schema).

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
-- The probes never call a genesis_testing function while acting as a user (they inline
-- set_config and `reset role`), so the API roles only need sign_out and user_id (see the end).

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

/** Back to the test's own role with no claims: the system, as jobs, backfills and migrations run. */
create or replace function genesis_testing.sign_out()
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.set_config('request.jwt.claims', '', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

/** Internal: act as `_user` (null: the system) without calling another genesis_testing function. */
create or replace function genesis_testing._act(_user uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if _user is null then
    perform pg_catalog.set_config('request.jwt.claims', '', true);
    perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
    execute 'reset role';
  else
    perform pg_catalog.set_config('request.jwt.claims',
      pg_catalog.json_build_object('sub', _user, 'role', 'authenticated')::text, true);
    perform pg_catalog.set_config('request.jwt.claim.sub', _user::text, true);
    perform pg_catalog.set_config('role', 'authenticated', true);
  end if;
end $$;

/** Whether an error is a refusal: 42501 (insufficient privilege) or P0001 (a guard's raise). */
create or replace function genesis_testing.is_refusal(_sqlstate text)
returns boolean language sql immutable set search_path = '' as $$
  select _sqlstate in ('42501', 'P0001')
$$;

-- Probes (verdicts as jsonb) ------------------------------------------------------------------

/**
 * Runs `_sql` as `_user` (null: the system) in a savepoint that is rolled back. Returns
 * { ok, rows, sqlstate, message }: `ok` is false when it raised.
 */
create or replace function genesis_testing.run_as(_sql text, _user uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _rows bigint := 0;
  _out jsonb;
begin
  begin
    perform genesis_testing._act(_user);
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

/**
 * `refuses` as a verdict. Passes when `_user` gets a refusal (42501/P0001), or changes no row while
 * the control (`_control_user`, null: the system) changes at least one with the same statement.
 */
create or replace function genesis_testing.probe_refuses(_sql text, _user uuid, _control_user uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _r jsonb := genesis_testing.run_as(_sql, _user);
  _c jsonb;
begin
  if not (_r ->> 'ok')::boolean then
    return pg_catalog.jsonb_build_object('pass', genesis_testing.is_refusal(_r ->> 'sqlstate'),
      'detail', case when genesis_testing.is_refusal(_r ->> 'sqlstate') then 'refused: ' || (_r ->> 'message')
        else pg_catalog.format('raised %s (%s), which isn''t a refusal (42501 or P0001)', _r ->> 'sqlstate', _r ->> 'message') end);
  end if;
  if (_r ->> 'rows')::bigint > 0 then
    return pg_catalog.jsonb_build_object('pass', false,
      'detail', pg_catalog.format('it ran and changed %s row(s)', _r ->> 'rows'));
  end if;
  _c := genesis_testing.run_as(_sql, _control_user);
  return pg_catalog.jsonb_build_object('pass', (_c ->> 'ok')::boolean and (_c ->> 'rows')::bigint > 0,
    'detail', case
      when not (_c ->> 'ok')::boolean then pg_catalog.format('the control raised %s (%s), so there was nothing to refuse', _c ->> 'sqlstate', _c ->> 'message')
      when (_c ->> 'rows')::bigint = 0 then 'the control changed no row either: nothing to refuse (check the statement and the row)'
      else 'changed no row; the control changed ' || (_c ->> 'rows') end);
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

/**
 * An SQL expression of `_type` that differs from `_current` (its text form), or null when the type
 * needs a value from the caller (arrays, ranges, composite and other types). Domains use their base
 * type; enums pick another label.
 */
create or replace function genesis_testing.other_value(_type regtype, _current text)
returns text language plpgsql stable set search_path = '' as $$
declare
  _base regtype := _type;
  _label text;
begin
  select coalesce(nullif(t.typbasetype, 0), t.oid)::regtype into _base from pg_catalog.pg_type t where t.oid = _type;
  if exists (select 1 from pg_catalog.pg_type t where t.oid = _base and t.typtype = 'e') then
    select e.enumlabel into _label from pg_catalog.pg_enum e
     where e.enumtypid = _base and e.enumlabel is distinct from _current
     order by e.enumsortorder limit 1;
    return case when _label is null then null else pg_catalog.quote_literal(_label) || '::' || _type::text end;
  end if;
  return case
    when _base = 'boolean'::regtype then pg_catalog.quote_literal(coalesce(not _current::boolean, true)::text)
    when _base in ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype, 'numeric'::regtype,
                   'real'::regtype, 'double precision'::regtype)
      then pg_catalog.quote_literal((coalesce(_current::numeric, 0) + 1)::text)
    when _base = 'uuid'::regtype then pg_catalog.quote_literal(gen_random_uuid()::text)
    when _base in ('timestamptz'::regtype, 'timestamp'::regtype)
      then pg_catalog.quote_literal((coalesce(_current::timestamptz, now()) + interval '1 day')::text)
    when _base = 'date'::regtype then pg_catalog.quote_literal((coalesce(_current::date, current_date) + 1)::text)
    when _base in ('jsonb'::regtype, 'json'::regtype) then pg_catalog.quote_literal('{"genesis_testing":true}')
    when (select t.typname from pg_catalog.pg_type t where t.oid = _base) in ('text', 'varchar', 'bpchar', 'citext')
      then pg_catalog.quote_literal('genesis_testing:' || coalesce(_current, ''))
    else null
  end || '::' || _type::text;
end $$;

/**
 * `server_owned` as a verdict for one column. A control run (the system) first sets `_column` of
 * the row `_key_column` = `_key` to a different value (`_value`, an SQL expression, or one chosen
 * for the type) and must change the stored value: that proves the row exists and the value is
 * writable at all. Then, as `_user`, the same update must leave the stored value as it was, whether
 * it was refused (42501/P0001), matched no row, or a trigger put the value back. Any other error
 * fails the check.
 */
create or replace function genesis_testing.probe_server_owned(
  _table regclass, _key_column text, _key text, _column text, _user uuid, _value text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _type regtype;
  _expr text;
  _update text;
  _read text;
  _before text;
  _control text;
  _after text;
  _state text;
  _err text;
begin
  select a.atttypid::regtype into _type
    from pg_catalog.pg_attribute a
   where a.attrelid = _table and a.attname = _column and a.attnum > 0 and not a.attisdropped;
  if _type is null then
    return pg_catalog.jsonb_build_object('pass', false, 'detail', pg_catalog.format('%s has no column %s', _table, _column));
  end if;
  _read := pg_catalog.format('select (%I)::text from %s where %I::text = %L', _column, _table, _key_column, _key);
  execute _read into _before;
  _expr := coalesce(_value, genesis_testing.other_value(_type, _before));
  if _expr is null then
    return pg_catalog.jsonb_build_object('pass', false,
      'detail', pg_catalog.format('pass a value for %s (type %s) to try', _column, _type));
  end if;
  _update := pg_catalog.format('update %s set %I = %s where %I::text = %L', _table, _column, _expr, _key_column, _key);

  -- Control: the system can make the change (the row exists and the new value differs).
  begin
    perform genesis_testing._act(null);
    begin
      execute _update;
      execute _read into _control;
    exception when others then
      _err := sqlstate || ' ' || sqlerrm;
    end;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  if _err is not null then
    return pg_catalog.jsonb_build_object('pass', false, 'detail', 'the control update raised ' || _err);
  end if;
  if _control is not distinct from _before then
    return pg_catalog.jsonb_build_object('pass', false, 'detail', pg_catalog.format(
      'the control couldn''t change %s either (no row with %s = %s, or the same value): nothing was tested',
      _column, _key_column, _key));
  end if;

  -- As the user.
  begin
    perform genesis_testing._act(_user);
    begin
      execute _update;
    exception when others then
      _state := sqlstate;
      _err := sqlstate || ' ' || sqlerrm;
    end;
    -- Back to the test's role inline: the API roles can't call genesis_testing._act.
    execute 'reset role';
    execute _read into _after;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  if _state is not null and not genesis_testing.is_refusal(_state) then
    return pg_catalog.jsonb_build_object('pass', false,
      'detail', 'raised ' || _err || ', which isn''t a refusal (42501 or P0001)');
  end if;
  return pg_catalog.jsonb_build_object('pass', _after is not distinct from _before,
    'detail', case
      when _after is not distinct from _before then coalesce('refused: ' || _err, 'unchanged')
      else pg_catalog.format('%s changed from %s to %s', _column, coalesce(_before, 'null'), coalesce(_after, 'null'))
    end);
end $$;

/**
 * `never_shows` as a verdict: runs `_query` as `_user` (null: the system; `_anon`: signed out with
 * the anon key) and passes when `_marker` appears nowhere in its rows. A refusal (42501/P0001)
 * counts as showing nothing; any other error fails the check.
 */
create or replace function genesis_testing.probe_never_shows(_query text, _marker text, _user uuid, _anon boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _text text;
  _state text;
  _err text;
begin
  begin
    if _anon then
      perform pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
      perform pg_catalog.set_config('role', 'anon', true);
    else
      perform genesis_testing._act(_user);
    end if;
    begin
      execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(q))::text, '''') from (%s) q', _query) into _text;
    exception when others then
      _state := sqlstate;
      _err := sqlstate || ' ' || sqlerrm;
    end;
    raise exception using errcode = 'GT000', message = 'genesis_testing rollback';
  exception when sqlstate 'GT000' then null;
  end;
  if _state is not null then
    return pg_catalog.jsonb_build_object('pass', genesis_testing.is_refusal(_state),
      'detail', case when genesis_testing.is_refusal(_state) then 'refused: ' || _err
        else 'raised ' || _err || ', which isn''t a refusal: fix the query' end);
  end if;
  return pg_catalog.jsonb_build_object('pass', pg_catalog.strpos(_text, _marker) = 0,
    'detail', case when pg_catalog.strpos(_text, _marker) = 0 then 'not shown'
                   else pg_catalog.format('%L appears in: %s', _marker, pg_catalog.left(_text, 300)) end);
end $$;

/** `sees` as a verdict: `_query` returns exactly `_expected` rows for `_user` (null: the system). */
create or replace function genesis_testing.probe_sees(_query text, _user uuid, _expected bigint)
returns jsonb language plpgsql set search_path = '' as $$
declare
  _n bigint;
  _err text;
begin
  begin
    perform genesis_testing._act(_user);
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

/**
 * One pgTAP line from a verdict, with the detail as a diagnostic when it failed. pgTAP's own
 * functions call each other unqualified, so this finds pgTAP's schema and runs with it on the path.
 */
create or replace function genesis_testing.tap(_verdict jsonb, _description text)
returns text language plpgsql set search_path = '' as $$
declare
  _schema text;
  _line text;
  _path text := pg_catalog.current_setting('search_path');
begin
  select n.nspname into _schema
    from pg_catalog.pg_extension x join pg_catalog.pg_namespace n on n.oid = x.extnamespace
   where x.extname = 'pgtap';
  if _schema is null then
    raise exception 'genesis_testing needs pgTAP: create extension pgtap';
  end if;
  perform pg_catalog.set_config('search_path', pg_catalog.quote_ident(_schema), true);
  execute 'select ok($1, $2)' into _line using (_verdict ->> 'pass')::boolean, _description;
  if not (_verdict ->> 'pass')::boolean then
    execute 'select $1 || E''\n'' || diag($2)' into _line using _line, _verdict ->> 'detail';
  end if;
  perform pg_catalog.set_config('search_path', _path, true);
  return _line;
end $$;

/**
 * `_user` may not do `_sql`: it's refused (42501/P0001), or changes no row while the control
 * (`_control_user`, null: the system) changes at least one.
 */
create or replace function genesis_testing.refuses(_sql text, _user uuid, _description text, _control_user uuid default null)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_refuses(_sql, _user, _control_user), _description)
$$;

/** `_user` (null: the system) can do `_sql` without an error, changing at least `_min_rows`. */
create or replace function genesis_testing.allows(_sql text, _user uuid, _description text, _min_rows bigint default 0)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_allows(_sql, _user, _min_rows), _description)
$$;

/**
 * `_sql` runs with the bypass setting `_setting` = `_value` (e.g. 'bt.hard_delete' = 'on'), as
 * `_user` (null: the system). The setting only lasts for this check.
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
 * Every system path can do `_sql`: the system (signed out) and each bypass setting in `_settings`
 * ('name=value'), as `_user` when one is given. One line per path.
 */
create or replace function genesis_testing.allows_system_paths(
  _sql text, _settings text[], _user uuid, _description text)
returns setof text language plpgsql set search_path = '' as $$
declare
  _s text;
begin
  return next genesis_testing.allows(_sql, null, _description || ' (the system, no signed-in user)');
  foreach _s in array coalesce(_settings, array[]::text[]) loop
    return next genesis_testing.allows_with_setting(_sql, pg_catalog.split_part(_s, '=', 1),
      pg_catalog.split_part(_s, '=', 2), _user, pg_catalog.format('%s (%s)', _description, _s));
  end loop;
end $$;

/**
 * A client can't change any of `_columns` on the row `_key_column` = `_key`: one line per column.
 * Use it for every column only the server sets (status the server derives, kinds, totals, owner
 * and audit columns, timestamps a trigger stamps). For an array, range or composite column, call
 * `probe_server_owned` with a `_value` to try.
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
      pg_catalog.format('%s.%s is server-owned for %s', _table, _c, coalesce(_user::text, 'the system')));
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

/** `_user` (null: the system) reads exactly `_expected` rows through `_query`. */
create or replace function genesis_testing.sees(_query text, _user uuid, _expected bigint, _description text)
returns text language sql set search_path = '' as $$
  select genesis_testing.tap(genesis_testing.probe_sees(_query, _user, _expected), _description)
$$;

-- Privileges: the API roles can't call any of this, except sign_out (a test calls it while acting
-- as a user to get back to its own role) and user_id (a fixed id, used in assertions made while
-- signed in). To switch users, sign_out first. Revoked by name (no blanket grants or revokes).
revoke usage on schema genesis_testing from public;
do $$
declare
  _f regprocedure;
begin
  for _f in
    select p.oid::regprocedure from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'genesis_testing'
  loop
    execute pg_catalog.format('revoke execute on function %s from public, anon, authenticated, service_role', _f);
  end loop;
end $$;
grant usage on schema genesis_testing to anon, authenticated;
grant execute on function genesis_testing.sign_out(), genesis_testing.user_id(text) to anon, authenticated;

-- When run as a test file of its own (000_genesis_testing.test.sql), report that it loaded.
select plan(1);
select has_schema('genesis_testing', 'genesis_testing helpers are loaded');
select * from finish();
