-- @feat:sites-store
-- pgTAP test for 0001_genesis_sites.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, sites and hook versions, and rolls everything
-- back. If your app already replaced the hooks (genesis_sites.can_edit,
-- can_view), they are replaced again inside this transaction only.
--
-- Signing in: auth.uid() reads request.jwt.claims (and the legacy
-- request.jwt.claim.sub on older images), so pg_temp.sign_in sets both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

-- People: e1 edits site A, b2 may view site A, c3 is nobody's.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'genesis-sites-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['e1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.page(title text) returns jsonb language sql immutable as $$
  select jsonb_build_object('schemaVersion', 1, 'root', jsonb_build_object('props', jsonb_build_object('title', title)), 'content', '[]'::jsonb)
$$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.page(text) to anon, authenticated, service_role;

-- A site to work on, made the way a host's server job makes one.
create temp table t (k text primary key, v uuid);
grant select on t to anon, authenticated;
grant insert on t to authenticated;
insert into t select 'a', genesis_sites.create_site('Riverside Gym', 'riverside-test',
  '{"schemaVersion":1,"name":"Riverside Gym","redirects":[]}'::jsonb,
  jsonb_build_array(jsonb_build_object('path', '/', 'doc', pg_temp.page('Home')), jsonb_build_object('path', '/about', 'doc', pg_temp.page('About'))));
insert into t select 'home', id from genesis_sites.site_pages where site_id = (select v from t where k = 'a') and path = '/';
insert into t select 'about', id from genesis_sites.site_pages where site_id = (select v from t where k = 'a') and path = '/about';
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t where t.k = id.k $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

-- Shape ---------------------------------------------------------------------------
select has_schema('genesis_sites', 'the genesis_sites schema exists');
select has_table('genesis_sites', 'sites', 'sites exists');
select has_table('genesis_sites', 'site_pages', 'site_pages exists');
select has_table('genesis_sites', 'site_releases', 'site_releases exists');
select has_table('genesis_sites', 'site_assets', 'site_assets exists');
select has_trigger('genesis_sites', 'sites', 'genesis_notify_served', 'a change to what a site serves notifies a cache purger');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('genesis_sites.sites'::regclass, 'genesis_sites.site_pages'::regclass, 'genesis_sites.site_releases'::regclass, 'genesis_sites.site_assets'::regclass)), 'RLS is on for every table');

-- Privileges ----------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'genesis_sites.sites', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'genesis_sites.site_pages', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'genesis_sites.site_releases', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'genesis_sites.site_assets', 'select,insert,update,delete'),
  'anon has no privilege on any table'
);
select ok(
  not has_table_privilege('authenticated', 'genesis_sites.sites', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'genesis_sites.site_pages', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'genesis_sites.site_releases', 'insert,update,delete'),
  'authenticated writes sites, pages and releases only through the functions'
);
select ok(not has_table_privilege('service_role', 'genesis_sites.site_releases', 'update'), 'nobody rewrites a release, not even the service role');
select ok(has_function_privilege('anon', 'genesis_sites.live_release(uuid)', 'execute'), 'anon may read a live release');
select ok(
  not has_function_privilege('anon', 'genesis_sites.save_page_draft(uuid, integer, jsonb)', 'execute')
  and not has_function_privilege('anon', 'genesis_sites.publish_site(uuid, integer, jsonb, text, text)', 'execute')
  and not has_function_privilege('anon', 'genesis_sites.rollback_site(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'genesis_sites.can_edit(uuid)', 'execute'),
  'anon may call no write function and no hook'
);
select ok(
  not has_function_privilege('authenticated', 'genesis_sites.create_site(text, text, jsonb, jsonb)', 'execute')
  and has_function_privilege('service_role', 'genesis_sites.create_site(text, text, jsonb, jsonb)', 'execute'),
  'only the service role creates sites'
);
select ok(
  not has_function_privilege('authenticated', 'genesis_sites.ensure_hook_stubs()', 'execute')
  and not has_function_privilege('authenticated', 'genesis_sites.assert_can_edit(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'genesis_sites.drop_redirect_from(uuid, text)', 'execute'),
  'the internal helpers are granted to nobody'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'genesis_sites' and a.grantee = 0
  ),
  'public may execute no function in the schema'
);

-- The stubs fail closed -----------------------------------------------------------
select pg_temp.sign_in('e1');
select is(genesis_sites.can_edit(pg_temp.id('a')), false, 'the can_edit stub answers false');
select is(genesis_sites.can_view(pg_temp.id('a')), false, 'the can_view stub asks can_edit');
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 1, %L)', pg_temp.id('home'), pg_temp.page('Mine')),
  '42501', null, 'with the stub, nobody saves a draft'
);
select is((select count(*)::int from genesis_sites.sites), 0, 'with the stub, nobody reads a site');
reset role;

-- The app's own hooks: an overridden can_edit is respected ------------------------
create table public.genesis_test_site_roles (site_id uuid, user_id uuid, role text);
insert into public.genesis_test_site_roles values (pg_temp.id('a'), pg_temp.person('e1'), 'editor'), (pg_temp.id('a'), pg_temp.person('b2'), 'viewer');
create or replace function genesis_sites.can_edit(site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.genesis_test_site_roles r where r.site_id = can_edit.site_id and r.user_id = auth.uid() and r.role = 'editor')
$$;
create or replace function genesis_sites.can_view(site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.genesis_test_site_roles r where r.site_id = can_view.site_id and r.user_id = auth.uid())
$$;
select ok(has_function_privilege('authenticated', 'genesis_sites.can_edit(uuid)', 'execute'), 'create or replace keeps the hook''s grant');
select genesis_sites.ensure_hook_stubs();
select ok(
  (select prosrc from pg_proc where oid = 'genesis_sites.can_edit(uuid)'::regprocedure) like '%genesis_test_site_roles%',
  'running the migration''s stub step again leaves the app''s can_edit alone'
);
select ok(
  (select prosrc from pg_proc where oid = 'genesis_sites.can_view(uuid)'::regprocedure) like '%genesis_test_site_roles%',
  '... and its can_view'
);

-- Drafts: compare-and-swap ---------------------------------------------------------
select pg_temp.sign_in('e1');
select is(genesis_sites.save_page_draft(pg_temp.id('home'), 1, pg_temp.page('Welcome')), 2, 'an editor saves a draft and gets the next revision');
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 1, %L)', pg_temp.id('home'), pg_temp.page('Stale')),
  'GS409', 'genesis_sites: someone saved this page first', 'a save from an old revision is a conflict'
);
select is((select draft #>> '{root,props,title}' from genesis_sites.site_pages where id = pg_temp.id('home')), 'Welcome', '... and changes nothing');
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 2, %L)', pg_temp.id('home'), '{"schemaVersion":2}'),
  '22023', null, 'a document that isn''t a page is refused'
);
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 2, %L::jsonb)', pg_temp.id('home'), jsonb_build_object('schemaVersion', 1, 'root', jsonb_build_object('props', jsonb_build_object('title', repeat('x', 600000))), 'content', '[]'::jsonb)),
  '22023', null, 'a page over 512 KiB is refused'
);
select is((select count(*)::int from genesis_sites.site_pages), 2, 'an editor reads the site''s pages');

-- Paths ------------------------------------------------------------------------------
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/api/hooks', 'page', pg_temp.page('X')), '22023', null, 'a reserved path is refused');
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/auth', 'page', pg_temp.page('X')), '22023', null, '... the reserved prefix itself too');
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/About/', 'page', pg_temp.page('X')), '22023', null, 'a path with capitals or a trailing slash is refused');
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/about', 'page', pg_temp.page('X')), '23505', null, 'two pages can''t share a path');
select lives_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/apiary', 'page', pg_temp.page('Bees')), 'a path that only starts like a reserved one is fine');
insert into t select 'apiary', id from genesis_sites.site_pages where site_id = pg_temp.id('a') and path = '/apiary';
reset role;

-- The app reserves a path later: its own reserved_paths(), which the stub step leaves alone.
create or replace function genesis_sites.reserved_paths() returns text[] language sql stable set search_path = '' as $$
  select array['/api', '/_server', '/auth', '/_gs', '/apiary']::text[]
$$;
select genesis_sites.ensure_hook_stubs();
select ok(
  (select prosrc from pg_proc where oid = 'genesis_sites.reserved_paths()'::regprocedure) like '%/apiary%',
  'running the stub step again leaves the app''s reserved_paths alone'
);
select pg_temp.sign_in('e1');
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 1, %L)', pg_temp.id('apiary'), pg_temp.page('Bees')),
  '22023', null, 'a draft save checks the page''s path against the app''s reserved paths again'
);
reset role;

-- A hook the stub step has to create again gets its grants by name, never Postgres's default.
drop function genesis_sites.reserved_paths();
select genesis_sites.ensure_hook_stubs();
select ok(
  not has_function_privilege('anon', 'genesis_sites.reserved_paths()', 'execute')
  and has_function_privilege('authenticated', 'genesis_sites.reserved_paths()', 'execute')
  and not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'genesis_sites.reserved_paths()'::regprocedure and a.grantee = 0
  ),
  'a re-created hook is granted to authenticated by name, not to public or anon'
);
select pg_temp.sign_in('e1');
select lives_ok(
  format('select genesis_sites.save_page_draft(%L, 1, %L)', pg_temp.id('apiary'), pg_temp.page('Bees')),
  '... and with the default list back, the page saves again'
);

-- Moving a page leaves a redirect ------------------------------------------------------
select lives_ok(format('select genesis_sites.move_page(%L, %L)', pg_temp.id('about'), '/our-story'), 'an editor moves a page');
select is(
  (select draft -> 'redirects' from genesis_sites.sites where id = pg_temp.id('a')),
  '[{"to": "/our-story", "from": "/about", "status": 301}]'::jsonb,
  'the old path redirects to the new one'
);
select lives_ok(format('select genesis_sites.move_page(%L, %L)', pg_temp.id('about'), '/story'), 'and moves it again');
select is(
  (select draft -> 'redirects' from genesis_sites.sites where id = pg_temp.id('a')),
  '[{"to": "/story", "from": "/about", "status": 301}, {"to": "/story", "from": "/our-story", "status": 301}]'::jsonb,
  'earlier redirects point straight at the new path: no chains'
);
select lives_ok(format('select genesis_sites.move_page(%L, %L)', pg_temp.id('about'), '/about'), 'moving it back');
select is(
  (select draft -> 'redirects' from genesis_sites.sites where id = pg_temp.id('a')),
  '[{"to": "/about", "from": "/our-story", "status": 301}, {"to": "/about", "from": "/story", "status": 301}]'::jsonb,
  '... drops the redirect away from the page''s path'
);
select throws_ok(format('select genesis_sites.move_page(%L, %L)', pg_temp.id('home'), '/home'), '22023', null, 'the home page stays at /');
select throws_ok(format('select genesis_sites.delete_page(%L)', pg_temp.id('home')), '22023', null, 'the home page can''t be deleted');

-- Publishing -------------------------------------------------------------------------
create function pg_temp.revs() returns jsonb language sql stable as $$
  select jsonb_object_agg(id::text, draft_rev) from genesis_sites.site_pages where site_id = pg_temp.id('a') and deleted_at is null
$$;
create function pg_temp.site_rev() returns integer language sql stable as $$ select draft_rev from genesis_sites.sites where id = pg_temp.id('a') $$;
grant execute on function pg_temp.revs(), pg_temp.site_rev() to authenticated;

select throws_ok(
  format('select genesis_sites.publish_site(%L, %s, %L)', pg_temp.id('a'), pg_temp.site_rev() - 1, pg_temp.revs()),
  'GS409', null, 'a publish of an older site draft than was checked is refused'
);
select throws_ok(
  format('select genesis_sites.publish_site(%L, %s, %L)', pg_temp.id('a'), pg_temp.site_rev(), '{}'),
  'GS409', null, 'a publish that missed a page is refused'
);
select is(
  (genesis_sites.publish_site(pg_temp.id('a'), pg_temp.site_rev(), pg_temp.revs(), 'First release', 'abc123')) ->> 'number',
  '1',
  'an editor publishes release 1'
);
insert into t select 'r1', id from genesis_sites.site_releases where site_id = pg_temp.id('a') and number = 1;
select is((select status from genesis_sites.sites where id = pg_temp.id('a')), 'live', 'the site is live');
select is((select created_by from genesis_sites.site_releases where id = pg_temp.id('r1')), pg_temp.person('e1'), 'the release records who published it');
select throws_ok(format('update genesis_sites.site_releases set note = %L where id = %L', 'changed', pg_temp.id('r1')), '42501', null, 'a release can''t be edited');

-- Drafts keep changing; the live site doesn't.
select genesis_sites.save_page_draft(pg_temp.id('home'), (select draft_rev from genesis_sites.site_pages where id = pg_temp.id('home')), pg_temp.page('Draft only'));
reset role;

-- The public read --------------------------------------------------------------------
select pg_temp.as_anon();
select is((genesis_sites.live_release(pg_temp.id('a'))) ->> 'number', '1', 'anon reads the live release with no session');
select is((genesis_sites.live_release(pg_temp.id('a'))) #>> '{snapshot,pages,0,doc,root,props,title}', 'Welcome', '... which is what was published');
select ok((genesis_sites.live_release(pg_temp.id('a')))::text not like '%Draft only%', '... never the draft saved since');
select is((genesis_sites.live_release(pg_temp.id('a'))) ->> 'note', null, '... and not the editors'' release note');
select throws_ok('select * from genesis_sites.site_pages', '42501', null, 'anon can''t read drafts');
select throws_ok('select * from genesis_sites.site_releases', '42501', null, 'anon can''t list releases');
select throws_ok(format('select genesis_sites.save_page_draft(%L, 1, %L)', pg_temp.id('home'), pg_temp.page('X')), '42501', null, 'anon can''t save');
reset role;

-- Viewers and outsiders --------------------------------------------------------------
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_sites.site_pages), 3, 'a viewer (the app''s can_view) reads the drafts');
select throws_ok(format('select genesis_sites.save_page_draft(%L, 99, %L)', pg_temp.id('home'), pg_temp.page('X')), '42501', null, '... but can''t save');
select throws_ok(format('select genesis_sites.rollback_site(%L, %L)', pg_temp.id('a'), pg_temp.id('r1')), '42501', null, '... or roll back');
reset role;
select pg_temp.sign_in('c3');
select is((select count(*)::int from genesis_sites.sites) + (select count(*)::int from genesis_sites.site_releases), 0, 'an outsider reads no site and no release');
select throws_ok(format('select genesis_sites.publish_site(%L, 1, %L)', pg_temp.id('a'), '{}'), '42501', null, 'an outsider can''t publish');
select throws_ok(
  format('select genesis_sites.save_page_draft(%L, 1, %L)', gen_random_uuid(), pg_temp.page('X')),
  '42501', null, 'a page that doesn''t exist looks the same as one you can''t edit'
);
select throws_ok(
  format('insert into genesis_sites.site_assets (site_id, path, mime) values (%L, %L, %L)', pg_temp.id('a'), 'sites/' || pg_temp.id('a') || '/x.png', 'image/png'),
  '42501', null, 'an outsider can''t record an upload'
);
reset role;

-- Rollback ---------------------------------------------------------------------------
select pg_temp.sign_in('e1');
select genesis_sites.save_page_draft(pg_temp.id('home'), (select draft_rev from genesis_sites.site_pages where id = pg_temp.id('home')),
  jsonb_build_object('schemaVersion', 1, 'root', jsonb_build_object('props', jsonb_build_object('title', 'Welcome')),
    'content', jsonb_build_array(jsonb_build_object('id', 'secret', 'type', 'hero', 'v', 1, 'hidden', true, 'props', jsonb_build_object('heading', 'Hidden plans')))));
select is((genesis_sites.publish_site(pg_temp.id('a'), pg_temp.site_rev(), pg_temp.revs())) ->> 'number', '2', 'a second publish is release 2');
select ok(
  (select snapshot::text from genesis_sites.site_releases where site_id = pg_temp.id('a') and number = 2) not like '%Hidden plans%',
  'a hidden section is left out of the release, so it is never public'
);
select is((genesis_sites.rollback_site(pg_temp.id('a'), pg_temp.id('r1'))) ->> 'number', '1', 'rolling back points the site at release 1');
reset role;
select pg_temp.as_anon();
select is((genesis_sites.live_release(pg_temp.id('a'))) #>> '{snapshot,pages,0,doc,root,props,title}', 'Welcome', 'the public read serves release 1 again');
reset role;

-- Assets -----------------------------------------------------------------------------
select pg_temp.sign_in('e1');
select lives_ok(
  format('insert into genesis_sites.site_assets (site_id, path, mime, alt) values (%L, %L, %L, %L)', pg_temp.id('a'), 'sites/' || pg_temp.id('a') || '/hero.jpg', 'image/jpeg', 'The gym floor'),
  'an editor records an upload under sites/<site_id>/'
);
select throws_ok(
  format('insert into genesis_sites.site_assets (site_id, path, mime) values (%L, %L, %L)', pg_temp.id('a'), 'sites/other/x.png', 'image/png'),
  '23514', null, 'an asset outside its site''s folder is refused'
);
select throws_ok(
  format('insert into genesis_sites.site_assets (site_id, path, mime) values (%L, %L, %L)', pg_temp.id('a'), 'sites/' || pg_temp.id('a') || '/x.svg', 'image/svg+xml'),
  '23514', null, 'an SVG is refused'
);
reset role;

-- Archived sites serve nothing ---------------------------------------------------------
update genesis_sites.sites set status = 'archived' where id = pg_temp.id('a');
select pg_temp.as_anon();
select is(genesis_sites.live_release(pg_temp.id('a')), null, 'an archived site has no public release');
reset role;
select pg_temp.sign_in('e1');
select throws_ok(
  format('select genesis_sites.rollback_site(%L, %L)', pg_temp.id('a'), pg_temp.id('r1')),
  '22023', null, 'an editor can''t bring an archived site back by rolling back'
);
reset role;

reset role;
select pg_temp.sign_in('e1');
-- A redirect can't start on one of the app's paths: it would take over the app's own route.
create function pg_temp.site_with_redirect(from_path text) returns jsonb language sql immutable as $$
  select jsonb_build_object('schemaVersion', 1, 'name', 'Riverside Gym', 'redirects', jsonb_build_array(jsonb_build_object('from', from_path, 'to', '/', 'status', 301)))
$$;
grant execute on function pg_temp.site_with_redirect(text) to authenticated;
select throws_like(
  format('select genesis_sites.save_site_draft(%L, (select draft_rev from genesis_sites.sites where id = %L), %L)', pg_temp.id('a'), pg_temp.id('a'), pg_temp.site_with_redirect('/auth/sign-in')),
  '%reserved for the app%', 'a redirect from a reserved path is refused'
);
select throws_like(
  format('select genesis_sites.save_site_draft(%L, (select draft_rev from genesis_sites.sites where id = %L), %L)', pg_temp.id('a'), pg_temp.id('a'), pg_temp.site_with_redirect('/API?x=1')),
  '%reserved for the app%', '... in any case, and with a query string'
);
select lives_ok(
  format('select genesis_sites.save_site_draft(%L, (select draft_rev from genesis_sites.sites where id = %L), %L)', pg_temp.id('a'), pg_temp.id('a'), pg_temp.site_with_redirect('/Old_Page.html')),
  'a redirect from an old address that isn''t reserved is fine'
);
reset role;

select * from finish();
rollback;
