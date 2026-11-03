-- @feat:support-email
-- pgTAP test for 0008_genesis_support_email_tenants.sql (after 0004 and 0002). Copy into your
-- app's `supabase/tests/database/` and run `supabase test db`. Rolls everything back; the app's
-- hooks are replaced inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-tickets-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5', 'f6', 'd7', 'c9']) n;

-- The app's hooks, for this transaction.
create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000004c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004c9', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004e5', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004d7', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004d7', '00000000-0000-4000-8000-0000000000b0')
  ) as t(login, tenant_id) where t.login = viewer $$;
create or replace function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select person = '00000000-0000-4000-8000-0000000004c9'::uuid and tenant = '00000000-0000-4000-8000-0000000000a0'::uuid $$;
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000004f6'::uuid $$;
drop function if exists private.genesis_support_report_handler(uuid, uuid);
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

insert into public.ticket_agents (tenant_id, person_id, role) values
  (pg_temp.tenant('ta'), pg_temp.person('c3'), 'agent'),
  (pg_temp.tenant('tb'), pg_temp.person('e5'), 'agent');

create table if not exists public.tenant_features (
  tenant_id uuid not null, feature_id text not null, enabled boolean not null, reason text not null,
  primary key (tenant_id, feature_id));
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values
  (pg_temp.tenant('ta'), 'support-helpdesk', true, 'test'),
  (pg_temp.tenant('tb'), 'support-helpdesk', true, 'test')
on conflict (tenant_id, feature_id) do update set enabled = true;

select pg_temp.sign_out();
-- The app routes mail sent to ta's address to ta.
create function private.genesis_support_email_tenant(recipients text[]) returns uuid
language sql stable set search_path = '' as $$
  select case when 'help@ta.example.test' = any(recipients) then '00000000-0000-4000-8000-0000000000a0'::uuid end $$;
revoke execute on function private.genesis_support_email_tenant(text[]) from public, anon, authenticated;

set local role service_role;
select public.support_receive_email(jsonb_build_object(
  'messageId', 'm1@example.test', 'from', jsonb_build_object('email', 'pat@example.test'),
  'to', jsonb_build_array('help@ta.example.test'), 'subject', 'Mail to ta', 'text', 'Hello ta'));
select public.support_receive_email(jsonb_build_object(
  'messageId', 'm2@example.test', 'from', jsonb_build_object('email', 'lee@example.test'),
  'to', jsonb_build_array('help@app.example.test'), 'subject', 'Mail to the app', 'text', 'Hello app'));
reset role;

select is((select tenant_id from public.tickets where title = 'Mail to ta'), pg_temp.tenant('ta'),
          'an email to a business''s address becomes that business''s ticket');
select is((select tenant_id from public.tickets where title = 'Mail to the app'), pg_temp.tenant('d'),
          'any other email, the app''s own');

select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_email_messages m join public.tickets t on t.id = m.report_id where t.title = 'Mail to ta'), 1,
          'an agent of the business reads the ticket''s email');
select is((select count(*)::int from public.support_email_messages m join public.tickets t on t.id = m.report_id where t.title = 'Mail to the app'), 0,
          '... and not the app''s');
reset role;
select pg_temp.sign_in('f6');
set local role authenticated;
select is((select count(*)::int from public.support_email_messages m join public.tickets t on t.id = m.report_id where t.title = 'Mail to ta'), 0,
          'the app''s staff read no business''s email');
reset role;

-- An agent of ta links ta's email ticket only to someone in ta.
select pg_temp.sign_in('c3');
set local role authenticated;
select throws_ok($$ select public.support_link_requester((select id from public.tickets where title = 'Mail to ta'), '00000000-0000-4000-8000-0000000004b2') $$,
                 '42501', null, 'a business''s agent cannot link its ticket to someone outside it');
reset role;

-- A reply naming ta's thread but sent to the app's address doesn't join ta's ticket.
set local role service_role;
select public.support_receive_email(jsonb_build_object(
  'messageId', 'm3@example.test', 'inReplyTo', 'm1@example.test', 'from', jsonb_build_object('email', 'eve@example.test'),
  'to', jsonb_build_array('help@app.example.test'), 'subject', 'Re: Mail to ta', 'text', 'Hijack'));
reset role;
select is((select count(*)::int from public.support_email_messages m join public.tickets t on t.id = m.report_id
            where t.title = 'Mail to ta'), 1, 'a reply from another tenant''s address never joins the thread');

-- A business with the help desk off gets no email: it goes to the app's own support.
select pg_temp.sign_out();
update public.tenant_features set enabled = false where tenant_id = pg_temp.tenant('ta') and feature_id = 'support-helpdesk';
set local role service_role;
select public.support_receive_email(jsonb_build_object(
  'messageId', 'm4@example.test', 'from', jsonb_build_object('email', 'sam@example.test'),
  'to', jsonb_build_array('help@ta.example.test'), 'subject', 'Mail while off', 'text', 'Hello'));
reset role;
select is((select tenant_id from public.tickets where title = 'Mail while off'), pg_temp.tenant('d'),
          'with the help desk off, a business''s email goes to the app''s own support');

select * from finish();
rollback;
