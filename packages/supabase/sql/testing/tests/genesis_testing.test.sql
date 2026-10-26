-- Tests for genesis_testing.sql against a small sample schema with good and deliberately broken
-- rules, so each helper is shown both passing and catching a failure (through its probe_*).
-- Run: load genesis_testing.sql, then this file, in one database with pgTAP.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select genesis_testing.create_users();

-- A sample app: notes owned by a person, with a server-owned status, a guarded delete that
-- system work may bypass, a child table with ON DELETE SET NULL, and a private flag.
create type public.gt_mood as enum ('calm', 'busy');
create table public.gt_notes (
  id uuid primary key,
  owner uuid not null references auth.users (id),
  body text not null,
  status text not null default 'open',
  private boolean not null default false,
  mood public.gt_mood not null default 'calm',
  tags text[] not null default '{}',
  stage text not null default 'draft' check (stage in ('draft', 'sent'))
);
create table public.gt_links (
  id uuid primary key,
  note_id uuid references public.gt_notes (id) on delete set null
);
alter table public.gt_notes enable row level security;
alter table public.gt_links enable row level security;
create policy "own notes" on public.gt_notes for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "links" on public.gt_links for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.gt_notes, public.gt_links to authenticated;
grant select on public.gt_notes to anon;

-- status is server-owned: a trigger puts it back for signed-in users.
create function public.gt_notes_guard() returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and new.status is distinct from old.status then
    new.status := old.status;
  end if;
  return new;
end $$;
create trigger gt_notes_guard before update on public.gt_notes for each row execute function public.gt_notes_guard();

-- Deleting is refused unless system work (no user, or gt.hard_delete=on).
create function public.gt_notes_no_delete() returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('gt.hard_delete', true), '') <> 'on' then
    raise exception 'Bin it instead' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger gt_notes_no_delete before delete on public.gt_notes for each row execute function public.gt_notes_no_delete();

-- A report that respects the private flag, and a broken one that leaks it.
create function public.gt_report_good() returns table (owner uuid, body text)
language sql security definer set search_path = '' as $$
  select n.owner, n.body from public.gt_notes n where not n.private
$$;
create function public.gt_report_leaky() returns table (owner uuid, body text)
language sql security definer set search_path = '' as $$
  select n.owner, n.body from public.gt_notes n
$$;
grant execute on function public.gt_report_good(), public.gt_report_leaky() to authenticated;

insert into public.gt_notes (id, owner, body, private) values
  ('00000000-0000-4000-9000-000000000001', genesis_testing.user_id('client'), 'shared note', false),
  ('00000000-0000-4000-9000-000000000002', genesis_testing.user_id('client'), 'SECRET-DIARY', true),
  ('00000000-0000-4000-9000-000000000003', genesis_testing.user_id('owner'), 'owner note', false);
insert into public.gt_links values ('00000000-0000-4000-9100-000000000001', '00000000-0000-4000-9000-000000000001');

-- Fixtures and acting as someone ---------------------------------------------------------------
select is(genesis_testing.user_id('client'), '00000000-0000-4000-8000-000000000003'::uuid, 'fixture ids are fixed');
select is((select count(*) from auth.users where email like 'genesis-testing-%@example.test'), 4::bigint, 'four fixture logins');
select genesis_testing.sign_in('client');
select is((select auth.uid()), genesis_testing.user_id('client'), 'sign_in sets auth.uid()');
select is(current_user::text, 'authenticated', 'sign_in acts as authenticated');
select genesis_testing.sign_out();
select is((select auth.uid()), null, 'sign_out clears the user');

-- refuses ---------------------------------------------------------------------------------------
select genesis_testing.refuses(
  $$update public.gt_notes set body = 'x' where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('stranger'), 'a stranger changes no row of the client''s note');
select genesis_testing.refuses(
  $$delete from public.gt_notes where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('client'), 'the client can''t delete outright (42501)');
select is((genesis_testing.probe_refuses(
  $$update public.gt_notes set body = 'x' where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('client')) ->> 'pass')::boolean, false,
  'refuses fails when the user can make the change');
select is((select body from public.gt_notes where id = '00000000-0000-4000-9000-000000000001'), 'shared note',
  'a probe leaves no change behind');

-- server_owned ----------------------------------------------------------------------------------
select genesis_testing.server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  array['status'], genesis_testing.user_id('client'));
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'private', genesis_testing.user_id('client')) ->> 'pass')::boolean, false,
  'server_owned catches a column the client can change');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'nope', genesis_testing.user_id('client')) ->> 'pass')::boolean, false, 'server_owned fails on a missing column');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'body', genesis_testing.user_id('stranger')) ->> 'pass')::boolean, true,
  'a column RLS keeps the user away from passes too');

-- allows and the system paths ------------------------------------------------------------------
select genesis_testing.allows_system_paths(
  $$delete from public.gt_notes where id = '00000000-0000-4000-9000-000000000001'$$,
  array['gt.hard_delete=on'], genesis_testing.user_id('client'), 'the guard lets system deletes through');
select is((genesis_testing.probe_allows(
  $$delete from public.gt_notes where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('client')) ->> 'pass')::boolean, false, 'allows fails when the guard refuses');
select genesis_testing.allows(
  $$delete from public.gt_notes where id = '00000000-0000-4000-9000-000000000001'$$, null,
  'ON DELETE SET NULL on a child doesn''t trip a guard', 1);
select is((genesis_testing.probe_allows(
  $$update public.gt_notes set body = body where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('client'), 2) ->> 'pass')::boolean, false, 'allows checks the minimum rows changed');

-- never_shows and sees ---------------------------------------------------------------------------
select genesis_testing.never_shows('select * from public.gt_report_good()', 'SECRET-DIARY',
  genesis_testing.user_id('owner'), 'the good report hides private notes');
select is((genesis_testing.probe_never_shows('select * from public.gt_report_leaky()', 'SECRET-DIARY',
  genesis_testing.user_id('owner')) ->> 'pass')::boolean, false, 'never_shows catches a leaky report');
select genesis_testing.never_shows_anon('select * from public.gt_notes', 'SECRET-DIARY',
  'anon sees no notes (RLS, no anon policy)');
select genesis_testing.sees('select * from public.gt_notes', genesis_testing.user_id('client'), 2,
  'the client sees their two notes');
select is((genesis_testing.probe_sees('select * from public.gt_notes', genesis_testing.user_id('stranger'), 1)
  ->> 'pass')::boolean, false, 'sees fails on the wrong count');

-- No false passes ---------------------------------------------------------------------------------
select is((genesis_testing.probe_refuses(
  $$update public.gt_notes set body = 'x' where id = '00000000-0000-4000-9000-0000000000ff'$$,
  genesis_testing.user_id('stranger')) ->> 'pass')::boolean, false,
  'refuses fails when the control can''t change a row either (wrong id)');
select is((genesis_testing.probe_refuses(
  $$update public.gt_notse set body = 'x'$$, genesis_testing.user_id('stranger')) ->> 'pass')::boolean, false,
  'refuses fails on an error that isn''t a refusal (a typo)');
select is((genesis_testing.probe_refuses(
  $$update public.gt_notes set body = 'x' where id = '00000000-0000-4000-9000-000000000001'$$,
  genesis_testing.user_id('stranger'), genesis_testing.user_id('owner')) ->> 'pass')::boolean, false,
  'refuses fails when the named control can''t make the change either');
select is((genesis_testing.probe_never_shows('select * from public.gt_reprot_good()', 'SECRET-DIARY',
  genesis_testing.user_id('owner')) ->> 'pass')::boolean, false, 'never_shows fails on a typo, not passes');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-0000000000ff',
  'status', genesis_testing.user_id('client')) ->> 'pass')::boolean, false,
  'server_owned fails on a key that matches no row');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'mood', genesis_testing.user_id('client')) ->> 'pass')::boolean, false,
  'server_owned handles enums: a writable enum column fails');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'tags', genesis_testing.user_id('client')) ->> 'detail'), 'pass a value for tags (type text[]) to try',
  'server_owned asks for a value for an array column instead of passing');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'tags', genesis_testing.user_id('client'), $$array['x']$$) ->> 'pass')::boolean, false,
  'with a value, a writable array column fails');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'stage', genesis_testing.user_id('client')) ->> 'pass')::boolean, false,
  'server_owned fails when the tried value breaks a check (the control raises), not passes');
select is((genesis_testing.probe_server_owned('public.gt_notes', 'id', '00000000-0000-4000-9000-000000000001',
  'stage', genesis_testing.user_id('client'), $$'sent'$$) ->> 'pass')::boolean, false,
  'with a valid value, a writable checked column fails');

-- Privileges -------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'genesis_testing.run_as(text, uuid)', 'execute'),
  'API roles can''t run statements through the kit');
select ok(not has_function_privilege('anon', 'genesis_testing.sign_in(uuid)', 'execute'),
  'API roles can''t sign in as someone');
select ok(has_function_privilege('authenticated', 'genesis_testing.sign_out()', 'execute'),
  'a test acting as a user can sign out');

select * from finish();
rollback;
