-- @feat:support-feedback @feat:feature-voting
-- pgTAP test for 0006_genesis_support.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, reports, ideas and storage rows and rolls everything back.
-- If your app already has the staff hook (`private.genesis_support_staff`), it is dropped
-- and replaced inside this transaction only.
--
-- Signing in: auth.uid() reads request.jwt.claims (and the legacy
-- request.jwt.claim.sub on older images), so pg_temp.sign_in sets both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

-- People: a1 reports, b2 is someone else, c3 is staff (once the hook exists),
-- d4 is a Supabase anonymous sign-in, e5 never votes.
insert into auth.users (id, aud, role, email, instance_id, is_anonymous)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated',
       case when n = 'd4' then null else 'genesis-support-' || n || '@example.test' end,
       '00000000-0000-0000-0000-000000000000', n = 'd4'
from unnest(array['a1', 'b2', 'c3', 'd4', 'e5']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.person(n), 'role', 'authenticated', 'is_anonymous', n = 'd4')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
end $$;

-- Ids the test hands between roles, and the rows a statement touched.
create table pg_temp.ids (name text primary key, id uuid);
create function pg_temp.remember(name text, q text) returns void language plpgsql as $$
declare v uuid;
begin
  execute q into v;
  insert into pg_temp.ids values (name, v);
end $$;
create function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;
create function pg_temp.id(n text) returns uuid language sql stable as $$ select id from pg_temp.ids where name = n $$;
grant select, insert on pg_temp.ids to anon, authenticated;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.remember(text, text), pg_temp.affected(text), pg_temp.id(text)
  to anon, authenticated, service_role;

drop function if exists private.genesis_support_staff(uuid);

-- Shape -------------------------------------------------------------------------
select has_table('public', 'support_reports', 'support_reports exists');
select has_table('public', 'support_attachments', 'support_attachments exists');
select has_table('public', 'support_replies', 'support_replies exists');
select has_table('public', 'support_ideas', 'support_ideas exists');
select has_table('public', 'support_idea_votes', 'support_idea_votes exists');
select col_is_pk('public', 'support_idea_votes', array['idea_id', 'user_id'], 'one vote per person per idea');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.support_reports'::regclass, 'public.support_attachments'::regclass, 'public.support_attachment_purges'::regclass,
    'public.support_replies'::regclass, 'public.support_ideas'::regclass, 'public.support_idea_votes'::regclass)),
  'RLS is on for every support table'
);
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.support_attachment_purges'::regclass),
  0,
  'the purge queue has no policies: the service role only'
);
select ok(
  (select not public and file_size_limit = 5242880 and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
   from storage.buckets where id = 'genesis-support'),
  'the genesis-support bucket is private, images only, 5 MB each'
);
select is(
  (select count(*)::int from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'genesis_support_%' and polcmd in ('w', 'd', '*')),
  0,
  'no update or delete policy on the bucket: nothing is overwritten or removed by a person'
);

-- Privileges ------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.support_reports', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.support_replies', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.support_attachments', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.support_ideas', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.support_idea_votes', 'select,insert,update,delete'),
  'anon has no privilege on any support table'
);
select ok(
  not has_table_privilege('authenticated', 'public.support_attachment_purges', 'select,insert,update,delete'),
  'authenticated cannot reach the purge queue'
);
select ok(
  not has_column_privilege('authenticated', 'public.support_reports', 'status', 'insert')
  and not has_column_privilege('authenticated', 'public.support_reports', 'status', 'update')
  and not has_column_privilege('authenticated', 'public.support_reports', 'user_id', 'insert')
  and not has_column_privilege('authenticated', 'public.support_reports', 'feature_id', 'update')
  and not has_column_privilege('authenticated', 'public.support_reports', 'staff_read_at', 'update'),
  'a person cannot set a report''s status, owner, feature or read receipts'
);
select ok(
  not has_column_privilege('authenticated', 'public.support_ideas', 'status', 'update')
  and not has_column_privilege('authenticated', 'public.support_ideas', 'vote_count', 'update')
  and not has_column_privilege('authenticated', 'public.support_ideas', 'vote_count', 'insert')
  and not has_column_privilege('authenticated', 'public.support_idea_votes', 'user_id', 'insert')
  and not has_table_privilege('authenticated', 'public.support_idea_votes', 'update'),
  'nobody signed in sets an idea''s status or count, or votes as someone else'
);
select ok(
  not has_column_privilege('authenticated', 'public.support_replies', 'from_staff', 'insert')
  and not has_column_privilege('authenticated', 'public.support_replies', 'author_id', 'insert')
  and not has_table_privilege('authenticated', 'public.support_replies', 'update,delete'),
  'a reply''s author and staff flag are the server''s, and replies are never edited'
);
select ok(
  not has_function_privilege('anon', 'public.support_is_staff()', 'execute')
  and not has_function_privilege('anon', 'public.support_mark_read(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.support_set_report_status(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.support_set_idea_status(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.support_shipped_for_me(integer)', 'execute'),
  'anon can execute none of the functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.support_orphan_objects(interval, integer)', 'execute')
  and has_function_privilege('service_role', 'public.support_orphan_objects(interval, integer)', 'execute'),
  'only the service role lists orphaned objects'
);
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'private'::regnamespace and p.proname like 'genesis_support_%'
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE'
  ),
  'public, anon and authenticated execute no private support function'
);
select ok(
  (select bool_and(not p.prosecdef or p.proconfig @> array['search_path=""']) from pg_proc p
   where p.proname like 'support_%' or p.proname like 'genesis_support_%'),
  'every security definer function pins search_path'
);

-- Reports -----------------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select pg_temp.remember('r1', $$
  insert into public.support_reports (type, message, route, app_version, platform, device, context)
  values ('bug', 'The save button does nothing', '/settings/profile', '1.4.0 (37) · preview · 3f2a9c1b', 'ios', '{"model": "iPhone"}', '{}')
  returning id $$);
select is((select status from public.support_reports where id = pg_temp.id('r1')), 'open', 'a person sends a report, and it starts open');
select throws_ok(
  $$ insert into public.support_reports (message, status) values ('x', 'addressed') $$,
  '42501', null, 'a person cannot send a report with a status'
);
select throws_ok(
  $$ insert into public.support_reports (message, route) values ('x', '/reset?token=abc') $$,
  '23514', null, 'a route with a query string is refused'
);
select throws_ok(
  $$ insert into public.support_reports (message, device) values ('x', jsonb_build_object('blob', repeat(md5(random()::text), 300))) $$,
  '23514', null, 'device info over 4 KB is refused'
);
select is(
  pg_temp.affected($q$ update public.support_reports set message = 'The save button does nothing on iOS' where id = pg_temp.id('r1') $q$),
  1,
  'a person edits their open report'
);
select throws_ok(
  $$ update public.support_reports set status = 'addressed' $$,
  '42501', null, 'a person cannot change a status'
);
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is((select count(*)::int from public.support_reports), 0, 'someone else sees no one else''s report');
select is(pg_temp.affected($q$ update public.support_reports set message = 'mine now' $q$), 0, '... edits none');
select is(pg_temp.affected($q$ delete from public.support_reports $q$), 0, '... and deletes none');
select is(public.support_is_staff(), false, 'without the hook nobody is staff');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from public.support_reports), 0, 'staff see nothing before the app''s hook exists');
select throws_ok(
  $$ select public.support_set_report_status(pg_temp.id('r1'), 'in_progress') $$,
  '42501', null, '... and change nothing'
);
reset role;

-- The app's hook: c3 is staff.
create function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select person = '00000000-0000-4000-8000-0000000000c3'::uuid $$;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;

select pg_temp.sign_in('c3');
set local role authenticated;
select is(public.support_is_staff(), true, 'the hook makes c3 staff');
select is((select count(*)::int from public.support_reports), 1, 'staff read every report');
select lives_ok(
  $$ select public.support_set_report_status(pg_temp.id('r1'), 'in_progress', 'support-feedback') $$,
  'staff set a report''s status and feature'
);
select throws_ok(
  $$ select public.support_set_report_status(pg_temp.id('r1'), 'done') $$,
  '23514', null, 'an unknown status is refused'
);
select is(pg_temp.affected($q$ update public.support_reports set message = 'edited by staff' $q$), 0, 'staff don''t edit a person''s words');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is(public.support_is_staff(), false, 'the hook answers only for its staff');
select throws_ok(
  $$ select public.support_set_report_status(pg_temp.id('r1'), 'wont_fix') $$,
  '42501', null, 'someone else cannot set a status'
);
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select is(
  (select status || ':' || feature_id from public.support_reports where id = pg_temp.id('r1')),
  'in_progress:support-feedback',
  'the person sees the status and feature staff set'
);
select is(pg_temp.affected($q$ update public.support_reports set message = 'changed' $q$), 0, 'a report staff picked up is no longer editable');
select throws_ok(
  $$ select public.support_set_report_status(pg_temp.id('r1'), 'addressed') $$,
  '42501', null, 'the person cannot set the status either'
);

-- Replies and read receipts -------------------------------------------------------------
insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'It happens every time.');
select is(
  (select from_staff::text || ':' || (author_id = pg_temp.person('a1'))::text from public.support_replies),
  'false:true',
  'the person''s reply is theirs and not staff''s'
);
select ok(
  (select user_read_at is not null and last_user_reply_at is not null from public.support_reports where id = pg_temp.id('r1')),
  'replying marks the thread read for the person'
);
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select throws_ok(
  $$ insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'hi') $$,
  '42501', null, 'someone else cannot reply on the report'
);
select is((select count(*)::int from public.support_replies), 0, '... nor read its replies');
select throws_ok(
  $$ select public.support_mark_read(pg_temp.id('r1')) $$,
  '42501', null, '... nor mark it read'
);
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
insert into public.support_replies (report_id, body) values (pg_temp.id('r1'), 'Thanks, we are on it.');
select is((select count(*)::int from public.support_replies where from_staff), 1, 'a staff reply is marked as staff''s');
select ok(
  (select last_staff_reply_at is not null and staff_read_at is not null from public.support_reports where id = pg_temp.id('r1')),
  'a staff reply moves the thread on for the person'
);
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select ok(
  (select last_staff_reply_at > user_read_at from public.support_reports where id = pg_temp.id('r1')),
  'the person has an unread staff reply'
);
select lives_ok($$ select public.support_mark_read(pg_temp.id('r1')) $$, 'the person marks it read');
select ok(
  (select user_read_at >= last_staff_reply_at from public.support_reports where id = pg_temp.id('r1')),
  '... and it is read'
);
select is((select count(*)::int from public.support_replies), 2, 'the person reads both sides of the thread');

-- Screenshots ---------------------------------------------------------------------------
select pg_temp.remember('r2', $$ insert into public.support_reports (message) values ('Layout is off') returning id $$);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values ('genesis-support', '%s/%s/shot.png', '%s') $$,
    pg_temp.person('a1'), pg_temp.id('r2'), pg_temp.person('a1')),
  'a person uploads into their open report''s folder'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('genesis-support', '%s/%s/x.png') $$, pg_temp.person('b2'), pg_temp.id('r2')),
  '42501', null, 'not into someone else''s folder'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('genesis-support', '%s/%s/x.png') $$, pg_temp.person('a1'), pg_temp.id('r1')),
  '42501', null, 'not into a report staff already picked up'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('genesis-support', '%s/%s/x.png') $$, pg_temp.person('a1'), gen_random_uuid()),
  '42501', null, 'not into a report that isn''t there'
);
select is(
  pg_temp.affected($q$ update storage.objects set name = name || '.png' where bucket_id = 'genesis-support' $q$),
  0,
  'not over an existing file'
);
select lives_ok(
  format($$ insert into public.support_attachments (report_id, path, content_type, byte_size, width, height)
            values ('%s', '%s/%s/shot.png', 'image/png', 1024, 390, 844) $$,
    pg_temp.id('r2'), pg_temp.person('a1'), pg_temp.id('r2')),
  'the person records the screenshot they uploaded'
);
select throws_ok(
  format($$ insert into public.support_attachments (report_id, path, content_type) values ('%s', '%s/%s/missing.png', 'image/png') $$,
    pg_temp.id('r2'), pg_temp.person('a1'), pg_temp.id('r2')),
  '23503', null, 'an attachment must name an uploaded file'
);
select throws_ok(
  format($$ insert into public.support_attachments (report_id, path, content_type) values ('%s', '%s/%s/shot.png', 'image/png') $$,
    pg_temp.id('r1'), pg_temp.person('a1'), pg_temp.id('r2')),
  '42501', null, 'an attachment must live under its own report'
);
select throws_ok(
  format($$ insert into public.support_attachments (report_id, path, content_type) values ('%s', '%s/%s/shot.png', 'image/gif') $$,
    pg_temp.id('r2'), pg_temp.person('a1'), pg_temp.id('r2')),
  '23514', null, 'only png, jpeg and webp'
);
select is((select count(*)::int from storage.objects where bucket_id = 'genesis-support'), 1, 'the person sees their screenshot');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'genesis-support'), 0, 'someone else sees no screenshot');
select is((select count(*)::int from public.support_attachments), 0, '... and no attachment');
select throws_ok($$ delete from public.support_attachments $$, '42501', null, '... and deletes none');
reset role;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'genesis-support'), 0, 'anon sees no screenshot');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'genesis-support'), 1, 'staff see the screenshot');
select is((select count(*)::int from public.support_attachments), 1, '... and its attachment');
reset role;

-- Rate limits -------------------------------------------------------------------------
select pg_temp.sign_in('e5');
set local role authenticated;
insert into public.support_reports (message) select 'report ' || g from generate_series(1, 20) g;
select throws_ok($$ insert into public.support_reports (message) values ('one more') $$, 'GS429', null, 'the 21st report in an hour is refused');
reset role;

-- Ideas and votes ---------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select pg_temp.remember('i1', $$ insert into public.support_ideas (title, body) values ('Dark mode for charts', 'Please') returning id $$);
select is((select status || ':' || vote_count from public.support_ideas), 'open:0', 'a new idea is open with no votes');
select throws_ok($$ insert into public.support_ideas (title, status) values ('Ship it now', 'shipped') $$, '42501', null, 'a person cannot set an idea''s status');
select throws_ok($$ insert into public.support_ideas (title, vote_count) values ('Lots of votes', 999) $$, '42501', null, '... or its votes');
select throws_ok($$ update public.support_ideas set vote_count = 999 $$, '42501', null, '... or change its count');
reset role;

select pg_temp.sign_in('d4');
set local role authenticated;
select throws_ok($$ insert into public.support_ideas (title) values ('From a throwaway login') $$, '42501', null, 'an anonymous sign-in cannot suggest');
select throws_ok(
  $$ insert into public.support_idea_votes (idea_id) values (pg_temp.id('i1')) $$,
  '42501', null, '... or vote'
);
select is((select count(*)::int from public.support_ideas), 1, '... but reads the board');
reset role;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
select throws_ok($$ select count(*) from public.support_ideas $$, '42501', null, 'anon cannot read the board');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is((select count(*)::int from public.support_ideas), 1, 'every signed-in person reads the board');
select lives_ok($$ insert into public.support_idea_votes (idea_id) values (pg_temp.id('i1')) $$, 'a person votes');
select throws_ok(
  $$ insert into public.support_idea_votes (idea_id) values (pg_temp.id('i1')) $$,
  '23505', null, 'a second vote on the same idea is refused'
);
select throws_ok(
  format($$ insert into public.support_idea_votes (idea_id, user_id) values ('%s', '%s') $$, pg_temp.id('i1'), pg_temp.person('e5')),
  '42501', null, 'nobody votes as someone else'
);
select is((select vote_count from public.support_ideas where id = pg_temp.id('i1')), 1, 'the idea counts one vote');
select is(pg_temp.affected($q$ update public.support_ideas set title = 'Taken over' $q$), 0, 'someone else cannot edit the idea');
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select is((select count(*)::int from public.support_idea_votes), 0, 'votes are private: the author doesn''t see who voted');
select is(pg_temp.affected($q$ update public.support_ideas set title = 'Dark mode for every chart' $q$), 1, 'the author edits their open idea');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok(
  $$ select public.support_set_idea_status(pg_temp.id('i1'), 'shipped', 'charts-dark-mode') $$,
  'staff mark the idea shipped, with the FeatureId that delivered it'
);
select throws_ok(
  $$ select public.support_set_idea_status(pg_temp.id('i1'), 'shipped', 'Not A Feature Id') $$,
  '23514', null, 'a feature id must be a FeatureId'
);
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is(
  (select feature_id from public.support_shipped_for_me()),
  'charts-dark-mode',
  'you asked, we shipped: the voter sees it with its feature'
);
select lives_ok($$ delete from public.support_idea_votes where idea_id = pg_temp.id('i1') $$, 'a person withdraws their vote');
select is((select vote_count from public.support_ideas where id = pg_temp.id('i1')), 0, 'the count goes down');
select throws_ok(
  $$ insert into public.support_idea_votes (idea_id) values (pg_temp.id('i1')) $$,
  '42501', null, 'a shipped idea takes no new votes'
);
reset role;

select pg_temp.sign_in('a1');
set local role authenticated;
select is((select count(*)::int from public.support_shipped_for_me()), 1, 'the author sees it shipped too');
select is(pg_temp.affected($q$ update public.support_ideas set title = 'Changed after shipping' $q$), 0, 'a shipped idea is no longer editable');
reset role;

select pg_temp.sign_in('e5');
set local role authenticated;
select is((select count(*)::int from public.support_shipped_for_me()), 0, 'someone who neither asked nor voted doesn''t');
reset role;

select pg_temp.sign_in('c3');
set local role authenticated;
select lives_ok($$ select public.support_set_idea_status(pg_temp.id('i1'), 'hidden') $$, 'staff hide an idea');
select is((select shipped_at from public.support_ideas where id = pg_temp.id('i1')), null, 'leaving shipped clears shipped_at');
reset role;

select pg_temp.sign_in('b2');
set local role authenticated;
select is((select count(*)::int from public.support_ideas), 0, 'a hidden idea is off the board');
reset role;

-- Deleting ----------------------------------------------------------------------------
select pg_temp.sign_in('a1');
set local role authenticated;
select is(pg_temp.affected($q$ delete from public.support_reports where id = pg_temp.id('r2') $q$), 1, 'a person deletes their own report');
reset role;
select is(
  (select count(*)::int from public.support_attachment_purges where path like pg_temp.person('a1')::text || '/%'),
  1,
  'its screenshot is queued for removal from storage'
);
select is(
  (select count(*)::int from public.support_orphan_objects(interval '0 seconds') where path like pg_temp.person('a1')::text || '/%'),
  1,
  'and an object no attachment names is listed as orphaned'
);

-- Deleting the login takes every report, reply and vote with it, and keeps ideas without the person.
delete from auth.users where id = pg_temp.person('a1');
select is((select count(*)::int from public.support_reports where user_id = pg_temp.person('a1')), 0, 'a deleted login''s reports go');
select is(
  (select count(*)::int from public.support_ideas where id = pg_temp.id('i1') and author_id is null),
  1,
  'its ideas stay, without the person'
);

select * from finish();
rollback;
