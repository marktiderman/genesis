-- @feat:support-chat
-- pgTAP test for 0014: mentions in internal notes and the app's hook, saved replies, and reports,
-- each only for the tenant's agents. Copy into your app's `supabase/tests/database/` and run
-- `supabase test db`. Rolls everything back; the app's hooks are replaced inside this transaction.
--
-- Tenants: d (the app's own), ta and tb. People: a1 a client of ta; c3 and c4 agents of ta; e5 an
-- agent of tb.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000014' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function pg_temp.conv(n text) returns uuid language sql stable as $$
  select c.id from genesis_chat.conversations c where c.kind = 'support' and c.subject_id = pg_temp.id(n)::text $$;
create function pg_temp.mention(n text) returns text language sql immutable as $$
  select '@[' || n || '](user:' || pg_temp.person(n) || ')' $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-tools-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'c3', 'c4', 'e5']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000014a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000014c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000014c4', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000014e5', '00000000-0000-4000-8000-0000000000b0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;
drop function if exists private.genesis_support_report_handler(uuid, uuid);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

-- The app's hooks: who was told of a mention, and whom a requester is with.
create temp table told (report uuid, agent uuid, author uuid, message uuid);
grant select, insert on told to public;
create or replace function private.genesis_support_agent_mentioned(report uuid, agent uuid, author uuid, message uuid) returns void
language sql security definer set search_path = '' as $$ insert into pg_temp.told values (report, agent, author, message) $$;
create or replace function private.genesis_support_requester_label(report uuid) returns text
language sql stable set search_path = '' as $$ select 'Acme' $$;
revoke execute on function private.genesis_support_agent_mentioned(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_requester_label(uuid) from public, anon, authenticated;

insert into public.ticket_agents (tenant_id, person_id, role) values
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('ta'), pg_temp.person('c4'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.person('e5'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta1', 'First', pg_temp.tenant('ta'));
insert into public.tickets (type, title, message, tenant_id) values ('question', 'ta2', 'Second', pg_temp.tenant('ta'));
reset role;
insert into ids select title, id from public.tickets where title in ('ta1', 'ta2');

-- Who may call -------------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.support_saved_replies(uuid)', 'execute'), 'anon lists no saved replies');
select ok(not has_function_privilege('anon', 'public.support_save_reply(uuid, uuid, text, text)', 'execute'), '... saves none');
select ok(not has_function_privilege('anon', 'public.support_delete_saved_reply(uuid)', 'execute'), '... deletes none');
select ok(not has_function_privilege('anon', 'public.support_agent_report(uuid, timestamptz, timestamptz)', 'execute'), '... and reads no report');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_note_mentions()', 'execute'), 'the mention trigger is private');
select ok(not has_table_privilege('authenticated', 'public.support_saved_replies', 'select'), 'nobody reads saved replies directly');
select ok(not has_table_privilege('authenticated', 'public.ticket_mentions', 'insert'), '... nor writes a mention');

set local role authenticated;

-- Mentions -------------------------------------------------------------------------------------

select pg_temp.sign_in('c3');
select lives_ok(format($$ select genesis_chat.send_message(%L, gen_random_uuid(), %L, '[]', null, null, null, '{}', 'observers') $$,
                       pg_temp.conv('ta1'), 'Can you look, ' || pg_temp.mention('c4') || '? Not ' || pg_temp.mention('e5') || ', ' || pg_temp.mention('a1') || ' or ' || pg_temp.mention('c3')),
                'an agent mentions people in a note');
reset role;
select is((select array_agg(m.agent_id) from public.ticket_mentions m), array[pg_temp.person('c4')], 'only another agent of the ticket''s tenant is mentioned');
select is((select array_agg(t.agent) from pg_temp.told t), array[pg_temp.person('c4')], 'the app''s hook is told');
select is((select t.author from pg_temp.told t), pg_temp.person('c3'), '... by whom');
select is((select t.report from pg_temp.told t), pg_temp.id('ta1'), '... on which ticket');
set local role authenticated;
select lives_ok(format($$ select genesis_chat.send_message(%L, gen_random_uuid(), %L, '[]', null, null, null, '{}', 'everyone') $$,
                       pg_temp.conv('ta1'), 'Hi ' || pg_temp.mention('c4')),
                'a reply everyone sees');
reset role;
select is((select count(*)::int from public.ticket_mentions), 1, 'mentions nobody: only notes do');
create or replace function private.genesis_support_agent_mentioned(report uuid, agent uuid, author uuid, message uuid) returns void
language plpgsql set search_path = '' as $$ begin raise exception 'the bell is down'; end $$;
set local role authenticated;
select lives_ok(format($$ select genesis_chat.send_message(%L, gen_random_uuid(), %L, '[]', null, null, null, '{}', 'observers') $$,
                       pg_temp.conv('ta2'), 'Again ' || pg_temp.mention('c4')),
                'a hook that fails costs no note');
select pg_temp.sign_in('c4');
select is((select count(*)::int from public.ticket_mentions), 2, 'the mentioned agent reads their mentions');
select pg_temp.sign_in('c3');
select is((select count(*)::int from public.ticket_mentions), 0, '... and nobody else does');

-- Saved replies ------------------------------------------------------------------------------

select pg_temp.sign_in('c3');
select lives_ok($$ insert into ids select 'saved', public.support_save_reply(null, '00000000-0000-4000-8000-0000000000a0', ' Refund ', 'Hi {first_name}, done.') $$,
                'an agent saves a reply');
select is((select array_agg(s.title) from public.support_saved_replies('00000000-0000-4000-8000-0000000000a0') s), array['Refund'], 'their tenant''s agents list it, trimmed');
select throws_ok($$ select public.support_save_reply(null, '00000000-0000-4000-8000-0000000000a0', 'refund', 'Twice') $$, '23505', null,
                 'a title is unique in its tenant');
select throws_ok($$ select public.support_save_reply(null, '00000000-0000-4000-8000-0000000000a0', 'Blank', '  ') $$, '22023', null,
                 'a reply has words');
select pg_temp.sign_in('c4');
select lives_ok($$ select public.support_save_reply(pg_temp.id('saved'), null, 'Refund', 'Hello {first_name}, refunded.') $$, 'another agent edits it');
select is((select s.body from public.support_saved_replies('00000000-0000-4000-8000-0000000000a0') s), 'Hello {first_name}, refunded.', 'the words changed');
select pg_temp.sign_in('e5');
select throws_ok($$ select * from public.support_saved_replies('00000000-0000-4000-8000-0000000000a0') $$, '42501', null, 'another tenant''s agent lists none');
select throws_ok($$ select public.support_save_reply(pg_temp.id('saved'), null, 'Mine', 'Mine') $$, '42501', null, '... changes none');
select throws_ok($$ select public.support_delete_saved_reply(pg_temp.id('saved')) $$, '42501', null, '... deletes none');
select pg_temp.sign_in('a1');
select throws_ok($$ select public.support_save_reply(null, '00000000-0000-4000-8000-0000000000a0', 'Mine', 'Mine') $$, '42501', null, 'a client saves none');
select pg_temp.sign_in('c3');
select lives_ok($$ select public.support_delete_saved_reply(pg_temp.id('saved')) $$, 'an agent deletes it');

-- Reports --------------------------------------------------------------------------------------

reset role;
update public.tickets set created_at = now() - interval '2 hours' where id = pg_temp.id('ta2');
update genesis_chat.messages set created_at = now() - interval '1 hour'
 where conversation_id = pg_temp.conv('ta2') and visibility = 'observers';
set local role authenticated;
select pg_temp.sign_in('c3');
select lives_ok($$ select genesis_chat.send_message(pg_temp.conv('ta2'), gen_random_uuid(), 'Sorted', '[]', null, null, null, '{}', 'everyone') $$, 'an agent answers ta2');
select lives_ok($$ select public.support_set_report_status(pg_temp.id('ta2'), 'addressed') $$, 'and closes it');
select is((public.support_agent_report('00000000-0000-4000-8000-0000000000a0', now() - interval '1 day', now() + interval '1 minute') - 'from_at' - 'to_at'),
          jsonb_build_object('opened', 2, 'closed', 1, 'open_now', 1,
                             'median_first_response_seconds', 3600, 'median_close_seconds', 7200,
                             'by_requester', jsonb_build_array(jsonb_build_object('label', 'Acme', 'open', 1))),
          'opened, closed, the medians (a note is no response) and open by requester');
select throws_ok($$ select public.support_agent_report('00000000-0000-4000-8000-0000000000a0', now(), now() - interval '1 day') $$, '22023', null,
                 'a range runs forward');
select pg_temp.sign_in('e5');
select throws_ok($$ select public.support_agent_report('00000000-0000-4000-8000-0000000000a0') $$, '42501', null, 'another tenant''s agent reads no report');

reset role;
select * from finish();
rollback;
