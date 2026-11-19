-- @feat:support-feedback
-- pgTAP test for 0019_genesis_support_diagnostics.sql: a person's dumps are their own, staff read
-- them, a dump links only to the sender's own ticket, 10 an hour, the size check, and retention.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`. Rolls everything
-- back; the app's hooks are replaced inside this transaction.
--
-- People: a1 and b2 send dumps; c3 is staff (the staff hook). Tenants: d (the app's own), tb
-- (a1 belongs, its help desk on), tc (a1 belongs, its help desk off), tz (nobody's).
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000019' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.dump() returns jsonb language sql immutable as $$
  select '{"schema": "genesis.diagnostics/1", "trigger": "manual", "logs": {"errors": [], "breadcrumbs": [], "console": []}}'::jsonb $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-diag-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select '00000000-0000-4000-8000-00000000000f'::uuid, viewer
  union all
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000019a1'::uuid, '00000000-0000-4000-8000-0000000000b0'::uuid),
    ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000000000c0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  ('00000000-0000-4000-8000-0000000000b0', 'support-helpdesk', true, 'test'),
  ('00000000-0000-4000-8000-0000000000c0', 'support-helpdesk', false, 'test')
on conflict (tenant_id, feature_id) do update set enabled = excluded.enabled;
-- The staff hook: c3 only.
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000019c3'::uuid $$;
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

-- A ticket each for a1 and b2.
insert into public.tickets (id, user_id, type, message) values
  ('00000000-0000-4000-8000-0000000019f1', pg_temp.person('a1'), 'bug', 'a1''s report'),
  ('00000000-0000-4000-8000-0000000019f2', pg_temp.person('b2'), 'bug', 'b2''s report');

-- 1. Shape and privileges -----------------------------------------------------------------------

select has_table('public', 'support_diagnostics', 'the table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.support_diagnostics'::regclass), 'row level security is on');
select ok(not has_table_privilege('anon', 'public.support_diagnostics', 'select'), 'anon reads nothing');
select ok(not has_table_privilege('authenticated', 'public.support_diagnostics', 'update'), 'nobody updates a dump');
select ok(not has_function_privilege('authenticated', 'public.support_purge_diagnostics(interval, integer)', 'execute'), 'only the service role purges');
select ok(not has_function_privilege('authenticated', 'public.support_ticket_tenant_allowed(uuid, uuid)', 'execute'), 'only the service role asks about tenants');

-- 2. A person's own -----------------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;

select lives_ok(
  $$insert into public.support_diagnostics (id, feedback_id, trigger, report)
    values ('3f2a9c1b-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000019f1', 'feedback', pg_temp.dump())$$,
  'a person stores a dump linked to their own ticket');
select is((select short_id from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-000000000001'), '3F2A9C1B', 'the short id is the first 8 hex digits');
select is((select user_id from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-000000000001'), pg_temp.person('a1'), 'the dump is the session''s person''s');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, feedback_id, report) values ('manual', '00000000-0000-4000-8000-0000000019f2', pg_temp.dump())$$,
  '42501', null, 'a dump can''t link to someone else''s ticket');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('boot', pg_temp.dump())$$,
  '23514', null, 'an unknown trigger is refused');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('manual', '{"schema": "other"}')$$,
  '23514', null, 'a report in another format is refused');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('manual', pg_temp.dump() || jsonb_build_object('blob', repeat('x', 530000)))$$,
  '23514', null, 'a report over 512 KB is refused');

reset role;
select pg_temp.sign_in('b2');
set local role authenticated;
select is((select count(*)::int from public.support_diagnostics), 0, 'another person sees none of them');
select lives_ok($$delete from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-000000000001'$$, 'deleting someone else''s dump does nothing');
select is((select count(*)::int from public.support_diagnostics_by_short_id('3F2A9C1B')), 0, 'a person can''t look dumps up by short id');
reset role;
select is((select count(*)::int from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-000000000001'), 1, '…and it is still there');
select pg_temp.sign_in('b2');
set local role authenticated;

reset role;
select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_diagnostics), 1, 'staff read every dump');
select is((select user_id from public.support_diagnostics_by_short_id('3f2a9c1b')), pg_temp.person('a1'), 'staff look a dump up by short id, with its owner');

-- 3. Rate limit ---------------------------------------------------------------------------------

reset role;
select pg_temp.sign_in('b2');
set local role authenticated;
select lives_ok(
  $$insert into public.support_diagnostics (trigger, report) select 'shake', pg_temp.dump() from generate_series(1, 10)$$,
  'ten dumps an hour are fine');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('shake', pg_temp.dump())$$,
  'GS429', null, 'the eleventh is refused');

-- 4. The service role (genesis-support/server's Supabase store) -------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$insert into public.support_diagnostics (id, user_id, feedback_id, trigger, report)
    values ('3f2a9c1b-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000000019f1', 'feedback', pg_temp.dump())$$,
  'the server stores a dump for the person it authenticated');
select throws_ok(
  $$insert into public.support_diagnostics (user_id, feedback_id, trigger, report)
    values ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000000019f2', 'feedback', pg_temp.dump())$$,
  '42501', null, 'even the server can''t link a dump to someone else''s ticket');
select throws_ok(
  $$insert into public.support_diagnostics (trigger, report) values ('manual', pg_temp.dump())$$,
  '42501', null, 'a dump with no person is refused');

-- A screenshot recorded by the server: the attachment names its person, as the store now sends.
insert into storage.buckets (id, name, public) values ('genesis-support', 'genesis-support', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values ('genesis-support', '00000000-0000-4000-8000-0000000019a1/00000000-0000-4000-8000-0000000019f1/shot.png');
select lives_ok(
  $$insert into public.ticket_attachments (user_id, report_id, path, content_type, byte_size)
    values ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000000019f1',
            '00000000-0000-4000-8000-0000000019a1/00000000-0000-4000-8000-0000000019f1/shot.png', 'image/png', 12)$$,
  'the server records a screenshot when it names the person');
select throws_ok(
  $$insert into public.ticket_attachments (report_id, path, content_type, byte_size)
    values ('00000000-0000-4000-8000-0000000019f1',
            '00000000-0000-4000-8000-0000000019a1/00000000-0000-4000-8000-0000000019f1/shot.png', 'image/png', 12)$$,
  '42501', null, 'without the person (no session) it is refused');

select ok(public.support_ticket_tenant_allowed(pg_temp.person('a1'), null), 'no tenant is the app''s own');
select ok(public.support_ticket_tenant_allowed(pg_temp.person('b2'), '00000000-0000-4000-8000-00000000000f'), 'the app''s own tenant is anyone''s');
select ok(public.support_ticket_tenant_allowed(pg_temp.person('a1'), '00000000-0000-4000-8000-0000000000b0'), 'a tenant the person belongs to, with its help desk on');
select ok(not public.support_ticket_tenant_allowed(pg_temp.person('a1'), '00000000-0000-4000-8000-0000000000c0'), 'not one whose help desk is off');
select ok(not public.support_ticket_tenant_allowed(pg_temp.person('b2'), '00000000-0000-4000-8000-0000000000b0'), 'not a tenant the person isn''t in');

-- The owner deletes their own.
select pg_temp.sign_in('a1');
set local role authenticated;
select lives_ok($$delete from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-0000000000aa'$$, 'a person deletes their own dump');
reset role;
select is((select count(*)::int from public.support_diagnostics where id = '3f2a9c1b-0000-4000-8000-0000000000aa'), 0, '…and it is gone');

-- 5. Retention ----------------------------------------------------------------------------------

reset role;
update public.support_diagnostics set created_at = now() - interval '91 days' where user_id = pg_temp.person('b2');
select is(public.support_purge_diagnostics(), 10, 'dumps older than 90 days are purged');
select is((select count(*)::int from public.support_diagnostics), 1, 'newer ones stay');

select * from finish();
rollback;
