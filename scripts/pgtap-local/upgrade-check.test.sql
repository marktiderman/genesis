-- The helpdesk-upgrade suite: what the upgrade did to the rows upgrade-seed.sql left before it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is((select tenant_id from public.tickets where title = 'From before tickets'), '00000000-0000-4000-8000-00000000000f'::uuid,
          'an old report is a ticket in the app''s own tenant');
select is((select count(*)::int from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text
            where t.title = 'From before tickets' and c.kind = 'support'), 1, 'it keeps one conversation');
select is((select c.tenant_id from genesis_chat.conversations c join public.tickets t on c.subject_id = t.id::text
            where t.title = 'From before tickets'), '00000000-0000-4000-8000-00000000000f'::uuid, 'in its ticket''s tenant');
select is((select count(*)::int from genesis_chat.messages m join genesis_chat.conversations c on c.id = m.conversation_id join public.tickets t on c.subject_id = t.id::text
            where t.title = 'From before tickets' and m.body = 'A reply from before'), 1, 'its reply is one message');
-- As the person who sent it, under row security.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000009a1', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000009a1', true);
set local role authenticated;
select is((select count(*)::int from public.support_reports where title = 'From before tickets'), 1, 'its reporter still reads it, by the old name');
reset role;

select * from finish();
rollback;
