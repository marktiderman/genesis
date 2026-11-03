-- @feat:chat
-- pgTAP test for 20261025000070_starter_tenancy.sql: every login is in the starter's one tenant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is((select count(*)::integer from private.genesis_viewer_people('00000000-0000-4000-8000-0000000000aa')), 1,
          'a login is in one tenant');
select is((select tenant_id from private.genesis_viewer_people('00000000-0000-4000-8000-0000000000aa')),
          (select tenant_id from private.genesis_viewer_people('00000000-0000-4000-8000-0000000000bb')),
          'everyone''s is the same one');
select is((select person_id from private.genesis_viewer_people('00000000-0000-4000-8000-0000000000aa')),
          '00000000-0000-4000-8000-0000000000aa'::uuid, 'and is their own person record');
select ok(not has_function_privilege('authenticated', 'private.genesis_viewer_people(uuid)', 'execute')
          and not has_function_privilege('anon', 'private.genesis_viewer_people(uuid)', 'execute'),
          'nobody calls the hook directly');

select * from finish();
rollback;
