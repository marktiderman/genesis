-- @feat:support-helpdesk
-- pgTAP test for 0010_genesis_support_help_center.sql. Copy into your app's
-- `supabase/tests/database/` and run `supabase test db`. Rolls everything back; the app's hooks
-- are replaced inside this transaction only.
--
-- Tenants: d (the app's own), ta and tb (help desks on), tc (off). People: a1 a client of ta; b2 a
-- client of tb; c3 an agent of ta; e5 an agent of tb; f6 the app's staff; g7 a client of tc.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

create function pg_temp.tenant(n text) returns uuid language sql immutable as $$
  select case n when 'd' then '00000000-0000-4000-8000-00000000000f'::uuid
                when 'ta' then '00000000-0000-4000-8000-0000000000a0'::uuid
                when 'tc' then '00000000-0000-4000-8000-0000000000c0'::uuid
                else '00000000-0000-4000-8000-0000000000b0'::uuid end $$;
create function pg_temp.person(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000004' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;

insert into auth.users (id, aud, role, email, instance_id)
select pg_temp.person(n), 'authenticated', 'authenticated', 'genesis-help-' || n || '@example.test',
       '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2', 'c3', 'e5', 'f6', 'a7']) n;

create or replace function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select '00000000-0000-4000-8000-00000000000f'::uuid $$;
create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid) language sql stable set search_path = '' as $$
  select t.tenant_id, viewer from (values
    ('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000000a0'::uuid),
    ('00000000-0000-4000-8000-0000000004c3', '00000000-0000-4000-8000-0000000000a0'),
    ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004e5', '00000000-0000-4000-8000-0000000000b0'),
    ('00000000-0000-4000-8000-0000000004a7', '00000000-0000-4000-8000-0000000000c0')
  ) as t(login, tenant_id) where t.login = viewer $$;
drop function if exists private.genesis_tenant_admin(uuid, uuid);
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000004f6'::uuid $$;
revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;
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

-- Shape and access ----------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.help_articles'::regclass), 'RLS is on for articles');
select ok((select relrowsecurity from pg_class where oid = 'public.help_collections'::regclass), 'RLS is on for collections');
select ok((select relrowsecurity from pg_class where oid = 'public.help_questions'::regclass), 'RLS is on for questions');
select ok(not has_table_privilege('anon', 'public.help_articles', 'select'), 'anon reads no article');
select ok(not has_table_privilege('authenticated', 'public.help_articles', 'insert,update,delete'), 'nobody signed in writes an article directly');
select ok(not has_table_privilege('authenticated', 'public.help_questions', 'insert,update,delete'), '... nor a question');
select ok(not has_function_privilege('anon', 'public.support_search_articles(uuid, text, integer)', 'execute'), 'anon can''t search');
select ok(not has_function_privilege('anon', 'public.support_ask(uuid, text)', 'execute'), 'anon can''t ask');
select ok(not has_function_privilege('authenticated', 'private.genesis_support_ai_on(uuid)', 'execute'), 'the AI switch''s check is private');

-- Writing ---------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.sign_in('a1');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'nope', 'Nope', null, 'Words', 'published') $$, '42501', null,
                 'a client of a business writes no article');
select pg_temp.sign_in('e5');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'nope', 'Nope', null, 'Words', 'published') $$, '42501', null,
                 'an agent of another business writes none there');
select pg_temp.sign_in('f6');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'nope', 'Nope', null, 'Words', 'published') $$, '42501', null,
                 'the app''s staff write none in a business');

select pg_temp.sign_in('c3');
insert into ids select 'col', public.support_save_collection(null, pg_temp.tenant('ta'), 'Billing', 'Money', 1);
insert into ids select 'pub', public.support_save_article(null, pg_temp.tenant('ta'), pg_temp.id('col'), 'reset-password', 'Reset your password', 'How to get back in', 'Open Settings and press Reset. An email arrives.', 'published');
insert into ids select 'draft', public.support_save_article(null, pg_temp.tenant('ta'), null, 'secret-plan', 'Secret plan', null, 'Password rules we have not announced.', 'draft');
select isnt(pg_temp.id('pub'), null, 'an agent writes an article');
select ok((select published_at is not null from public.help_articles where id = pg_temp.id('pub')), 'publishing dates it');
select ok((select published_at is null from public.help_articles where id = pg_temp.id('draft')), 'a draft has no date');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'reset-password', 'Again', null, 'Words', 'draft') $$, '23505', null,
                 'a slug is one per tenant');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'Bad Slug', 'Bad', null, 'Words', 'draft') $$, '23514', null,
                 'a slug has a shape');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'empty', 'Empty', null, '  ', 'published') $$, '23514', null,
                 'nothing is published with no words');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, 'empty', 'Empty', null, E'\n\t\n', 'published') $$, '23514', null,
                 '... whitespace of any kind isn''t words');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000a0', null, '11111111-1111-4111-8111-111111111111', 'Id', null, 'Words', 'draft') $$, '23514', null,
                 'a slug can''t be an id');
select throws_ok($$ select public.support_save_article(pg_temp.id('pub'), null, null, 'reset-password', 'Stale', null, 'Words', 'published', '2000-01-01') $$, '40001', null,
                 'a save that started from an older copy is refused');

select pg_temp.sign_in('e5');
insert into ids select 'tb-art', public.support_save_article(null, pg_temp.tenant('tb'), null, 'reset-password', 'Reset in tb', null, 'Password help for the other business.', 'published');
select isnt(pg_temp.id('tb-art'), null, 'another tenant has the same slug');
select throws_ok($$ select public.support_save_article(pg_temp.id('pub'), null, null, 'reset-password', 'Taken over', null, 'Words', 'published') $$, '42501', null,
                 'an agent changes no other tenant''s article');
select throws_ok($$ select public.support_delete_article(pg_temp.id('pub')) $$, '42501', null, '... nor deletes it');
select throws_ok($$ select public.support_delete_collection(pg_temp.id('col')) $$, '42501', null, '... nor its collection');
select throws_ok($$ select public.support_save_article(null, '00000000-0000-4000-8000-0000000000b0', pg_temp.id('col'), 'cross', 'Cross', null, 'Words', 'draft') $$, '23503', null,
                 'an article can''t join another tenant''s collection');

select pg_temp.sign_in('f6');
insert into ids select 'own', public.support_save_article(null, null, null, 'app-password', 'The app''s password help', null, 'Password help for everyone.', 'published');
select isnt(pg_temp.id('own'), null, 'a null tenant is the app''s own, which its staff write');

-- Reading ---------------------------------------------------------------------------------------

select pg_temp.sign_in('a1');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('ta'))), 1, 'a client reads their business''s published articles');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('ta'), null, true)), 1, '... and asking for drafts shows them none');
select is((select count(*)::int from public.help_articles where id = pg_temp.id('draft')), 0, '... nor does the table');
select is((select count(*)::int from public.support_help_article(pg_temp.tenant('ta'), 'secret-plan')), 0, '... nor a draft by its slug');
select is((select count(*)::int from public.support_help_article(pg_temp.tenant('ta'), pg_temp.id('draft')::text)), 0, '... nor by its id');
select is((select count(*)::int from public.support_help_article(pg_temp.tenant('tb'), pg_temp.id('tb-art')::text)), 0, 'nor any article of another business');
select is((select title from public.support_help_article(pg_temp.tenant('ta'), pg_temp.id('pub')::text)), 'Reset your password', 'one by id');
select is((select count(*)::int from public.help_articles where tenant_id = pg_temp.tenant('tb')), 0, 'a client reads no other business''s article');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('tb'))), 0, '... through the function either');
select is((select count(*)::int from public.support_help_collections(pg_temp.tenant('ta'))), 1, 'a client reads the collections');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('ta'), pg_temp.id('col'))), 1, 'an article is in its collection');
select is((select title from public.support_help_articles()), 'The app''s password help', 'anyone signed in reads the app''s own');

select pg_temp.sign_in('c3');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('ta'), null, true)), 2, 'an agent lists drafts too');
select is((select count(*)::int from public.support_search_articles(pg_temp.tenant('ta'), 'password')), 1, '... but search finds only what''s published');

-- A tenant with its help desk off: its people read nothing, even with rows there.
reset role;
insert into public.help_articles (tenant_id, slug, title, body, status) values (pg_temp.tenant('tc'), 'off', 'Off', 'Password words', 'published');
set local role authenticated;
select pg_temp.sign_in('a7');
select is((select count(*)::int from public.support_help_articles(pg_temp.tenant('tc'))), 0, 'a help desk that''s off shows its people nothing');

-- Search --------------------------------------------------------------------------------------

select pg_temp.sign_in('a1');
select is((select title from public.support_search_articles(pg_temp.tenant('ta'), 'How do I reset my password?')), 'Reset your password', 'a whole question finds its article');
select is((select title from public.support_search_articles(pg_temp.tenant('ta'), 'passw')), 'Reset your password', 'so does the start of a word');
select lives_ok($$ select * from public.support_search_articles(pg_temp.tenant('ta'), 'a'':* & !''b | ( <-> \') $$, 'punctuation is only words, never query syntax');
select is((select count(*)::int from public.support_search_articles(pg_temp.tenant('ta'), '   ')), 0, 'nothing typed finds nothing');
select is((select count(*)::int from public.support_search_articles(pg_temp.tenant('ta'), 'is it the of to and an')), 0, 'common words find nothing');
select is((select count(*)::int from public.support_search_articles(pg_temp.tenant('ta'), 'pass word')), 0, 'only the last word matches by its start');
select is((select count(*)::int from public.support_search_articles(pg_temp.tenant('tb'), 'password')), 0, 'search stays in the reader''s tenants');

-- AI answers ------------------------------------------------------------------------------------

select ok(not public.support_ai_enabled(pg_temp.tenant('ta')), 'AI answers are off until a tenant opts in');
select throws_ok($$ select public.support_ask('00000000-0000-4000-8000-0000000000a0', 'How do I reset it?') $$, '42501', null, 'so nobody can ask');
select ok(not public.support_ai_enabled(), '... the app''s own tenant included');
reset role;
insert into public.tenant_features (tenant_id, feature_id, enabled, reason) values (pg_temp.tenant('ta'), 'support-helpdesk-ai', true, 'test');
set local role authenticated;
select ok(public.support_ai_enabled(pg_temp.tenant('ta')), 'a tenant opts in');
select pg_temp.sign_in('b2');
select throws_ok($$ select public.support_ask('00000000-0000-4000-8000-0000000000a0', 'Let me in') $$, '42501', null, 'someone of another tenant can''t ask there');
select pg_temp.sign_in('a1');
insert into ids select 'q1', public.support_ask(pg_temp.tenant('ta'), 'How do I reset my password?');
insert into ids select 'q2', public.support_ask(pg_temp.tenant('ta'), 'Something else');
select ok(not has_function_privilege('authenticated', 'public.support_record_answer(uuid, text, text, uuid[])', 'execute'), 'nobody signed in records an answer: only the server does');
select throws_ok($$ select public.support_close_question(pg_temp.id('q1'), 'resolved') $$, '22023', null, 'nothing resolves before it''s answered');
select pg_temp.sign_in('b2');
select throws_ok($$ select public.support_claim_question(pg_temp.id('q1')) $$, '42501', null, 'someone else can''t take a question');
select pg_temp.sign_in('a1');
select lives_ok($$ select public.support_claim_question(pg_temp.id('q1')) $$, 'the task takes it');
select throws_ok($$ select public.support_claim_question(pg_temp.id('q1')) $$, '22023', null, 'once: the same id can''t run the model twice');
reset role;
select throws_ok($$ select public.support_record_answer(pg_temp.id('q1'), 'answered', 'Elsewhere', array[pg_temp.id('tb-art')]) $$, '22023', null, 'an answer can''t cite another tenant''s article');
select throws_ok($$ select public.support_record_answer(pg_temp.id('q1'), 'answered', 'Unpublished', array[pg_temp.id('draft')]) $$, '22023', null, '... nor a draft');
select is(public.support_record_answer(pg_temp.id('q1'), 'answered', 'Open Settings.', array[pg_temp.id('pub')]), 'answered', 'an answer that cites its article is kept');
select throws_ok($$ select public.support_record_answer(pg_temp.id('q1'), 'answered', 'Again', array[pg_temp.id('pub')]) $$, '22023', null, 'a kept answer stays');
select is(public.support_record_answer(pg_temp.id('q2'), 'answered', 'A guess', '{}'), 'no_answer', 'an answer with no citation isn''t kept');
insert into public.help_questions (tenant_id, user_id, question) values (pg_temp.tenant('ta'), pg_temp.person('a1'), 'Something hard to read');
insert into ids select 'q3', id from public.help_questions where question = 'Something hard to read';
select is(public.support_record_answer(pg_temp.id('q3'), 'safety_routed'), 'safety_routed', 'a safety route is recorded');
select is((select question from public.help_questions where id = pg_temp.id('q3')), '(not kept)', '... without what they wrote');
set local role authenticated;
select pg_temp.sign_in('a1');
select lives_ok($$ select public.support_close_question(pg_temp.id('q1'), 'resolved') $$, 'it helped');
select is((select outcome from public.help_questions where id = pg_temp.id('q1')), 'resolved', 'a resolution is recorded');
select pg_temp.sign_in('b2');
select is((select count(*)::int from public.help_questions), 0, 'someone else reads no question');
select pg_temp.sign_in('c3');
select is((select count(*)::int from public.help_questions), 3, 'the tenant''s agents read its questions');

reset role;
select * from finish();
rollback;
