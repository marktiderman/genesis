-- After support 0020-0023 over an existing install (support-upgrade-2b suite): the app's own
-- functions and hooks are untouched and still answer, and the new functions are there.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok((select prosrc from pg_proc where oid = 'public.support_reporters(uuid[])'::regprocedure) like '%app-own%', 'the app''s own support_reporters is untouched');
select ok(to_regprocedure('public.support_ticket_requesters(uuid[])') is not null, 'Genesis''s requester names are under their own name');
select is(private.genesis_support_default_tenant_id(), '00000000-0000-4000-8000-00000000000f'::uuid, 'the app''s own default tenant is kept');
select unalike(coalesce(obj_description('private.genesis_support_default_tenant()'::regprocedure, 'pg_proc'), ''), 'Genesis default:%', 'and 0021 created no stand-in over it');
select is(private.genesis_support_staff_hook('00000000-0000-4000-8000-0000000025b2'), true, 'the app''s staff hook, with its own parameter name, still answers');
select is(private.genesis_support_staff_hook('00000000-0000-4000-8000-0000000025a1'), false, 'and only for its staff');
select is((select tenant_id from public.tickets where message = 'filed before the upgrade'), '00000000-0000-4000-8000-00000000000f'::uuid, 'an old ticket keeps its tenant');
select is(private.genesis_support_setting_int('diagnostics.perHour', 10, 1, 100), 10, 'no settings yet: the dump limits are as before');
select is(to_regprocedure('private.genesis_viewer_people(uuid)'), null, 'no viewer-people hook appeared');

select * from finish();
rollback;
