-- @feat:sites-blog
-- pgTAP test for 0002_genesis_sites_posts.sql (after 0001).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users, sites and hook versions, and rolls everything
-- back. If your app already replaced the hooks (genesis_sites.can_edit,
-- can_view), they are replaced again inside this transaction only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- People: e1 edits site A, b2 may view it, c3 is nobody's.
insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000002' || n)::uuid, 'authenticated', 'authenticated', 'genesis-sites-posts-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['e1', 'b2', 'c3']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000002' || n)::uuid $$;
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
create function pg_temp.post(title text) returns jsonb language sql immutable as $$
  select jsonb_build_object('schemaVersion', 1, 'title', title, 'excerpt', 'About ' || title,
    'body', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', title || ' body'))))))
$$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.page(text), pg_temp.post(text) to anon, authenticated, service_role;

create temp table t (k text primary key, v uuid);
grant select, insert on t to anon, authenticated;
insert into t select 'a', genesis_sites.create_site('Hilltop Collective', 'hilltop-posts-test',
  '{"schemaVersion":1,"name":"Hilltop Collective","redirects":[]}'::jsonb,
  jsonb_build_array(jsonb_build_object('path', '/', 'doc', pg_temp.page('Home'))));
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t where t.k = id.k $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

-- The app's hooks: e1 edits site A, b2 views it.
create table public.genesis_test_post_roles (site_id uuid, user_id uuid, role text);
insert into public.genesis_test_post_roles values (pg_temp.id('a'), pg_temp.person('e1'), 'editor'), (pg_temp.id('a'), pg_temp.person('b2'), 'viewer');
create or replace function genesis_sites.can_edit(site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.genesis_test_post_roles r where r.site_id = can_edit.site_id and r.user_id = auth.uid() and r.role = 'editor')
$$;
create or replace function genesis_sites.can_view(site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.genesis_test_post_roles r where r.site_id = can_view.site_id and r.user_id = auth.uid())
$$;

-- Shape ---------------------------------------------------------------------------
select has_table('genesis_sites', 'site_posts', 'site_posts exists');
select ok((select relrowsecurity from pg_class where oid = 'genesis_sites.site_posts'::regclass), 'RLS is on for site_posts');
select has_trigger('genesis_sites', 'site_posts', 'genesis_notify_post', 'a change to what a post serves notifies a cache purger');
select ok(
  not has_table_privilege('anon', 'genesis_sites.site_posts', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'genesis_sites.site_posts', 'insert,update,delete'),
  'anon has no privilege on site_posts, and authenticated writes only through the functions'
);
select ok(
  has_function_privilege('anon', 'genesis_sites.live_posts(uuid)', 'execute')
  and has_function_privilege('anon', 'genesis_sites.live_post(uuid, text)', 'execute'),
  'anon may read published posts'
);
select ok(
  not has_function_privilege('anon', 'genesis_sites.save_post(uuid, uuid, text, integer, jsonb)', 'execute')
  and not has_function_privilege('anon', 'genesis_sites.publish_post(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'genesis_sites.import_posts(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'genesis_sites.assert_post(text, jsonb)', 'execute'),
  'anon calls no post write, and the helpers are granted to nobody'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'genesis_sites' and a.grantee = 0
  ),
  'public may execute no function in the schema'
);
select ok(
  (select prosrc from pg_proc where oid = 'genesis_sites.can_edit(uuid)'::regprocedure) like '%genesis_test_post_roles%',
  'the migration left the app''s can_edit alone'
);

-- The post page --------------------------------------------------------------------
select pg_temp.sign_in('e1');
select lives_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/blog', 'post', pg_temp.page('Blog')), 'an editor makes the post page');
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/news', 'post', pg_temp.page('News')), '23505', null, 'a site has one post page');
select throws_ok(format('select genesis_sites.create_page(%L, %L, %L, %L)', pg_temp.id('a'), '/kinds', 'feed', pg_temp.page('X')), '23514', null, 'an unknown page kind is refused');
reset role;
select throws_ok(
  format('update genesis_sites.site_pages set path = %L where site_id = %L and kind = %L', '/', pg_temp.id('a'), 'post'),
  '23514', null, 'the post page is never the home page'
);

-- Drafts ---------------------------------------------------------------------------
select pg_temp.sign_in('e1');
insert into t select 'p1', (genesis_sites.save_post(pg_temp.id('a'), null, 'first-post', null, pg_temp.post('First post')) ->> 'id')::uuid;
select is((select status from genesis_sites.site_posts where id = pg_temp.id('p1')), 'draft', 'a new post is a draft');
select throws_ok(
  format('select genesis_sites.save_post(%L, null, %L, null, %L)', pg_temp.id('a'), 'first-post', pg_temp.post('Again')),
  '23505', null, 'two posts can''t share a slug'
);
select throws_ok(
  format('select genesis_sites.save_post(%L, null, %L, null, %L)', pg_temp.id('a'), 'Bad Slug', pg_temp.post('X')),
  '22023', null, 'a slug with capitals or spaces is refused'
);
select throws_ok(
  format('select genesis_sites.save_post(%L, null, %L, null, %L)', pg_temp.id('a'), 'no-body', '{"schemaVersion":1,"title":"No body"}'),
  '22023', null, 'a post with no rich text body is refused'
);
select is((genesis_sites.save_post(pg_temp.id('a'), pg_temp.id('p1'), 'first-post', 1, pg_temp.post('First post, edited')) ->> 'rev')::int, 2, 'a save gets the next revision');
select throws_ok(
  format('select genesis_sites.save_post(%L, %L, %L, 1, %L)', pg_temp.id('a'), pg_temp.id('p1'), 'first-post', pg_temp.post('Stale')),
  'GS409', 'genesis_sites: someone saved this post first', 'a save from an old revision is a conflict'
);
select lives_ok(
  format('select genesis_sites.save_post(%L, %L, %L, 2, %L)', pg_temp.id('a'), pg_temp.id('p1'), 'first-steps', pg_temp.post('First post, edited')),
  'a draft that was never published may change its slug'
);

-- Publishing -----------------------------------------------------------------------
select throws_ok(format('select genesis_sites.publish_post(%L, 1)', pg_temp.id('p1')), 'GS409', null, 'publishing a revision other than the one checked is refused');
select is((genesis_sites.publish_post(pg_temp.id('p1'), 3)) ->> 'status', 'published', 'an editor publishes the post');
select isnt((select published_at from genesis_sites.site_posts where id = pg_temp.id('p1')), null, '... and it has a publish date');
select throws_ok(
  format('select genesis_sites.save_post(%L, %L, %L, 3, %L)', pg_temp.id('a'), pg_temp.id('p1'), 'renamed', pg_temp.post('X')),
  '22023', null, 'a published post keeps its slug'
);
select genesis_sites.save_post(pg_temp.id('a'), pg_temp.id('p1'), 'first-steps', 3, pg_temp.post('Draft only edit'));
insert into t select 'p2', (genesis_sites.save_post(pg_temp.id('a'), null, 'secret-draft', null, pg_temp.post('Secret draft')) ->> 'id')::uuid;
reset role;

-- The public read: nothing until the site is live -----------------------------------
select pg_temp.as_anon();
select is(genesis_sites.live_posts(pg_temp.id('a')), '[]'::jsonb, 'a site that isn''t live shows no posts');
reset role;
select pg_temp.sign_in('e1');
select genesis_sites.publish_site(pg_temp.id('a'), (select draft_rev from genesis_sites.sites where id = pg_temp.id('a')),
  (select jsonb_object_agg(id::text, draft_rev) from genesis_sites.site_pages where site_id = pg_temp.id('a') and deleted_at is null));
reset role;
select pg_temp.as_anon();
select is(jsonb_array_length(genesis_sites.live_posts(pg_temp.id('a'))), 1, 'anon lists the one published post of a live site');
select is((genesis_sites.live_posts(pg_temp.id('a'))) #>> '{0,title}', 'First post, edited', '... as it was published');
select ok((genesis_sites.live_posts(pg_temp.id('a')))::text not like '%Draft only edit%' and (genesis_sites.live_posts(pg_temp.id('a')))::text not like '%Secret draft%', '... never a draft, or a draft edit since');
select ok((genesis_sites.live_posts(pg_temp.id('a'))) -> 0 -> 'body' is null, '... and the list carries no bodies');
select is((genesis_sites.live_post(pg_temp.id('a'), 'first-steps')) #>> '{doc,title}', 'First post, edited', 'anon reads one published post');
select is(genesis_sites.live_post(pg_temp.id('a'), 'secret-draft'), null, 'a draft post isn''t readable by anon');
select throws_ok('select * from genesis_sites.site_posts', '42501', null, 'anon can''t read the posts table');
reset role;

-- Viewers and outsiders --------------------------------------------------------------
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_sites.site_posts), 2, 'a viewer (the app''s can_view) reads the drafts');
select throws_ok(format('select genesis_sites.publish_post(%L, 4)', pg_temp.id('p2')), '42501', null, '... but can''t publish');
reset role;
select pg_temp.sign_in('c3');
select is((select count(*)::int from genesis_sites.site_posts), 0, 'an outsider reads no post');
select throws_ok(
  format('select genesis_sites.save_post(%L, null, %L, null, %L)', pg_temp.id('a'), 'mine', pg_temp.post('Mine')),
  '42501', null, 'an outsider can''t write a post'
);
select throws_ok(
  format('select genesis_sites.save_post(%L, %L, %L, 1, %L)', gen_random_uuid(), pg_temp.id('p1'), 'first-steps', pg_temp.post('X')),
  '42501', null, 'naming another site doesn''t reach its posts'
);
select throws_ok(format('select genesis_sites.import_posts(%L, %L)', pg_temp.id('a'), '[]'), '42501', null, 'an outsider can''t import');
reset role;

-- Taking a post down -----------------------------------------------------------------
select pg_temp.sign_in('e1');
select is((genesis_sites.unpublish_post(pg_temp.id('p1'))) ->> 'status', 'draft', 'an editor takes a post down');
reset role;
select pg_temp.as_anon();
select is(genesis_sites.live_post(pg_temp.id('a'), 'first-steps'), null, '... and anon can''t read it any more');
reset role;
select pg_temp.sign_in('e1');
select genesis_sites.publish_post(pg_temp.id('p1'), (select draft_rev from genesis_sites.site_posts where id = pg_temp.id('p1')));
select lives_ok(format('select genesis_sites.delete_post(%L)', pg_temp.id('p1')), 'an editor deletes a post');
reset role;
select pg_temp.as_anon();
select is(jsonb_array_length(genesis_sites.live_posts(pg_temp.id('a'))), 0, 'a deleted post is gone from the public read');
reset role;

-- Import -----------------------------------------------------------------------------
select pg_temp.sign_in('e1');
select is(
  jsonb_array_length((genesis_sites.import_posts(pg_temp.id('a'), jsonb_build_array(
    jsonb_build_object('slug', 'old-news', 'doc', pg_temp.post('Old news'), 'status', 'published', 'publishedAt', '2023-03-14T09:00:00Z'),
    jsonb_build_object('slug', 'later', 'doc', pg_temp.post('Later'), 'status', 'draft'),
    jsonb_build_object('slug', 'secret-draft', 'doc', pg_temp.post('Clash')),
    jsonb_build_object('slug', 'Bad Slug', 'doc', pg_temp.post('Bad')),
    jsonb_build_object('slug', 'bad-date', 'doc', pg_temp.post('Bad date'), 'publishedAt', 'yesterday-ish')
  ))) -> 'imported'),
  2,
  'an import brings in the posts that fit'
);
select is(
  (select published_at from genesis_sites.site_posts where site_id = pg_temp.id('a') and slug = 'old-news'),
  '2023-03-14T09:00:00Z'::timestamptz,
  '... keeping the old site''s date'
);
select is((select status from genesis_sites.site_posts where site_id = pg_temp.id('a') and slug = 'later'), 'draft', '... a draft when asked');
select is(
  (genesis_sites.import_posts(pg_temp.id('a'), jsonb_build_array(jsonb_build_object('slug', 'no-status', 'doc', pg_temp.post('No status')))) #>> '{imported,0,status}'),
  'draft',
  '... and a draft when it doesn''t say: an import publishes only when asked'
);
select is((select count(*)::int from genesis_sites.site_posts where site_id = pg_temp.id('a') and slug in ('bad-date', 'Bad Slug')), 0, '... and skips the ones that don''t');
select is(
  (genesis_sites.import_posts(pg_temp.id('a'), jsonb_build_array(
    jsonb_build_object('slug', 'never', 'doc', pg_temp.post('Never'), 'publishedAt', '-infinity'),
    jsonb_build_object('slug', 'ancient', 'doc', pg_temp.post('Ancient'), 'publishedAt', '0044-03-15T00:00:00Z BC')
  ))) -> 'skipped' @> '[{"slug": "never"}, {"slug": "ancient"}]'::jsonb,
  true,
  'an import refuses infinity and dates before 1970'
);
select is(
  (genesis_sites.import_posts(pg_temp.id('a'), jsonb_build_array(jsonb_build_object('slug', 'future', 'doc', pg_temp.post('Future'), 'status', 'published', 'publishedAt', '2999-01-01T00:00:00Z'))) #>> '{imported,0,status}'),
  'published',
  'a post dated in the future is imported'
);
select ok((select published_at <= now() from genesis_sites.site_posts where site_id = pg_temp.id('a') and slug = 'future'), '... dated no later than now');
reset role;

-- Archived sites serve no posts -------------------------------------------------------
update genesis_sites.sites set status = 'archived' where id = pg_temp.id('a');
select pg_temp.as_anon();
select is(genesis_sites.live_posts(pg_temp.id('a')), '[]'::jsonb, 'an archived site shows no posts');
reset role;
select pg_temp.sign_in('e1');
select throws_ok(format('select genesis_sites.publish_post(%L, 1)', pg_temp.id('p2')), '22023', null, 'an editor can''t publish a post on an archived site');
reset role;

select * from finish();
rollback;
