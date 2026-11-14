-- The helpdesk-upgrade suite: an app with reports, a reply and their conversations from before
-- tickets (support 0004), so the upgrade's backfills have rows to move. They stay in the database,
-- under addresses of their own; a test that counts rows counts within its own.
insert into auth.users (id, aud, role, email, instance_id) values
  ('00000000-0000-4000-8000-0000000009a1', 'authenticated', 'authenticated', 'upgrade-a1@example.test', '00000000-0000-0000-0000-000000000000');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000009a1', 'role', 'authenticated')::text, false);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000009a1', false);
set role authenticated;
insert into public.support_reports (type, title, message) values ('bug', 'From before tickets', 'Broken');
insert into public.support_replies (report_id, body) select id, 'A reply from before' from public.support_reports where title = 'From before tickets';
reset role;
select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', '', false);

-- A dev database that ran an earlier draft of support 0018, whose support_agent_queue took
-- (uuid, text, integer, integer): 0018 drops that overload, so a call by name stays unambiguous.
create function public.support_agent_queue(tenant uuid, inbox_view text, page_limit integer, page_offset integer)
returns integer language sql as $$ select 1 $$;
