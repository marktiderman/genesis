-- @feat:support-helpdesk
-- pgTAP test for 0012_genesis_support_help_answers.sql: a question routed elsewhere, or asked
-- without consent, keeps no answer and no cited articles. Copy into your app's
-- `supabase/tests/database/` and run `supabase test db`. Rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-0000000004a1', 'authenticated', 'authenticated', 'genesis-answers-a1@example.test', '00000000-0000-0000-0000-000000000000');

-- Rows as they stand before the fix: answered, then routed (their words gone, the answer kept).
insert into public.help_questions (tenant_id, user_id, question, answer, article_ids, outcome)
values ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000004a1', 'Kept by mistake', 'An answer', array['00000000-0000-4000-8000-0000000000e1'::uuid], 'answered');

select ok(not has_function_privilege('authenticated', 'public.support_record_answer(uuid, text, text, uuid[])', 'execute'), 'only the server records what came of a question');

select is(public.support_record_answer((select id from public.help_questions where question = 'Kept by mistake'), 'safety_routed'), 'safety_routed', 'a safety route after an answer');
select is((select answer from public.help_questions where question = '(not kept)' and outcome = 'answered'), null, '... clears the answer');
select is((select cardinality(article_ids) from public.help_questions where question = '(not kept)' and outcome = 'answered'), 0, '... and the articles it cited');

insert into public.help_questions (tenant_id, user_id, question, answer, article_ids, outcome)
values ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000004a1', 'No consent yet', null, '{}', 'asked');
select is(public.support_record_answer((select id from public.help_questions where question = 'No consent yet'), 'no_consent'), 'no_consent', 'a question asked before agreeing');
select is((select count(*)::int from public.help_questions where question = 'No consent yet'), 0, '... keeps nothing of it');

select * from finish();
rollback;
