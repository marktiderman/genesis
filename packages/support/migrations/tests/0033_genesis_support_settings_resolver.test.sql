-- @feat:support-feedback
-- pgTAP test for 0033_genesis_support_settings_resolver.sql (with genesis-supabase 0020 to 0023): the
-- old readers ask genesis-supabase's private.genesis_setting, 0020's own resolver is gone, and
-- support.verifyPrompt turns the verify prompt on, as the deprecated hook still does. Rolls
-- everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000033' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text) to authenticated;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-support-resolver-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'c3']) n;

drop function if exists private.genesis_support_staff(uuid);
create function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000033c3'::uuid $$;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;
drop function if exists private.genesis_support_verify_prompt_enabled();

-- 1. One resolver ----------------------------------------------------------------------------------

select hasnt_function('private', 'genesis_support_setting_value', array['text', 'jsonb', 'integer', 'integer'], '0020''s own resolver is gone');
select hasnt_function('private', 'genesis_support_setting_layers', array['text'], '... with its layers reader');
select is(private.genesis_support_setting_bool('support.verifyPrompt', false), false, 'nothing synced: the fallback');

insert into public.genesis_app_manifest (app_id, preset, catalogue) values ('resolver-test', 'min', '{
  "support.verifyPrompt": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": false, "standard": false, "min": false}},
  "support.agentListScan": {"type": "boolean", "applies": "runtime", "scope": "app", "defaults": {"max": true, "standard": true, "min": false}}
}');
select is(private.genesis_support_setting_bool('support.agentListScan', true), false, 'the preset''s default from the synced catalogue, which 0020 never read');
insert into public.genesis_settings (key, value) values ('support.agentListScan', '"yes"');
select is(private.genesis_support_setting_bool('support.agentListScan', true), false, 'a value of the wrong type is skipped, as resolveSettings skips it');

-- 2. The verify prompt -----------------------------------------------------------------------------

select pg_temp.sign_in('a1');
set local role authenticated;
insert into public.tickets (type, message) values ('bug', 'It crashes');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select public.support_set_report_status((select id from public.tickets where user_id = pg_temp.person('a1')), 'addressed');
reset role;
select is((select count(*)::int from public.support_replies where prompt = 'verify'), 0, 'support.verifyPrompt off (its default): nobody is asked');

insert into public.genesis_settings (key, value) values ('support.verifyPrompt', 'true');
select pg_temp.sign_in('c3');
set local role authenticated;
select public.support_set_report_status((select id from public.tickets where user_id = pg_temp.person('a1')), 'in_progress');
select public.support_set_report_status((select id from public.tickets where user_id = pg_temp.person('a1')), 'addressed');
reset role;
select is((select count(*)::int from public.support_replies where prompt = 'verify'), 1, 'support.verifyPrompt on: the person is asked to check the fix');

delete from public.support_replies where prompt = 'verify';
update public.genesis_settings set value = 'false' where key = 'support.verifyPrompt';
create function private.genesis_support_verify_prompt_enabled() returns boolean
language sql stable set search_path = '' as $$ select true $$;
revoke execute on function private.genesis_support_verify_prompt_enabled() from public, anon, authenticated;
select pg_temp.sign_in('c3');
set local role authenticated;
select public.support_set_report_status((select id from public.tickets where user_id = pg_temp.person('a1')), 'in_progress');
select public.support_set_report_status((select id from public.tickets where user_id = pg_temp.person('a1')), 'addressed');
reset role;
select is((select count(*)::int from public.support_replies where prompt = 'verify'), 1, 'the deprecated hook still turns it on, for one release');

select ok(not has_function_privilege('authenticated', 'private.genesis_support_setting_bool(text, boolean)', 'execute'), 'people can''t call the readers');
select ok(not has_function_privilege('authenticated', 'private.genesis_setting(text, uuid)', 'execute'), '... nor the resolver');

select * from finish();
rollback;
