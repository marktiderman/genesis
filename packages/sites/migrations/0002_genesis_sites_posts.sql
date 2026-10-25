-- Genesis Sites 0002: blog posts (site_posts) and the post page
--
-- A post is its own document beside the pages, with a draft and a published
-- copy. publish_post copies the draft (at the revision the editor checked)
-- to the published copy; that copy is what visitors read, through
-- genesis_sites.live_posts and live_post, so a post goes live (and comes
-- down) on its own, without a new release of the site. A site's rollback
-- doesn't touch its posts.
--
-- The site's `post` page (a new page kind, at most one per site and never
-- the home page) is the template every post renders in: at its own path it
-- is the blog's index, at <path>/<slug> it shows that post.
--
-- Access is the same seam as 0001: reads where genesis_sites.can_view says
-- so, writes through the security definer functions below, each asking
-- genesis_sites.can_edit. Anon reads only published posts of a live site.
-- The checks a post passes before it is published (alt text, headings) run
-- in TypeScript (`checkPost`, in the stores); the database checks shape,
-- size, slugs and revisions.
--
-- This migration needs 0001. It creates no hook; it runs
-- genesis_sites.ensure_hook_stubs() so a hook is there, and never replaces
-- an app's own version.
--
-- Use: `genesis add sites` copies this file into supabase/migrations under a
-- new timestamped name. Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0002_genesis_sites_posts.test.sql`).

select genesis_sites.ensure_hook_stubs();

-- ── The post page ─────────────────────────────────────────────────────────────

alter table genesis_sites.site_pages drop constraint site_pages_kind;
alter table genesis_sites.site_pages
  add constraint site_pages_kind check (kind in ('page', 'landing', 'post')),
  -- Posts live under the post page's path; at / they would take over the site's paths.
  add constraint site_pages_post_not_home check (kind <> 'post' or path <> '/');

-- One post page per site: it is where every post renders.
create unique index site_pages_one_post_page on genesis_sites.site_pages (site_id) where kind = 'post' and deleted_at is null;

-- ── Posts ─────────────────────────────────────────────────────────────────────

create table genesis_sites.site_posts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references genesis_sites.sites (id) on delete cascade,
  slug text not null constraint site_posts_slug_format check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- The post document (PostDoc): title, excerpt, body, cover, author, SEO.
  draft jsonb not null constraint site_posts_draft_shape check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_rev integer not null default 1,
  -- What visitors read: a copy of the draft at its last publish.
  published jsonb constraint site_posts_published_shape check (published is null or (jsonb_typeof(published) = 'object' and octet_length(published::text) <= 524288)),
  status text not null default 'draft' constraint site_posts_status check (status in ('draft', 'published')),
  -- When it was first published, kept when it is published again (an import keeps the old site's date).
  published_at timestamptz,
  -- When the published copy last changed.
  published_updated_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint site_posts_published_state check (
    (status = 'published' and published is not null and published_at is not null and published_updated_at is not null)
    or (status = 'draft' and published is null)
  )
);

create unique index site_posts_one_per_slug on genesis_sites.site_posts (site_id, slug) where deleted_at is null;
create index site_posts_live on genesis_sites.site_posts (site_id, published_at desc) where status = 'published' and deleted_at is null;

comment on table genesis_sites.site_posts is 'A site''s blog posts: a draft and the published copy visitors read. A deleted post keeps its row (deleted_at). Genesis Sites.';

create trigger genesis_touch before update on genesis_sites.site_posts for each row execute function genesis_sites.touch();

-- What a post serves changed (published, taken down, deleted): tell a listener to purge the site's cache.
create or replace function genesis_sites.notify_post_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify('genesis_sites', jsonb_build_object(
    'site_id', new.site_id,
    'post_id', new.id,
    'slug', new.slug,
    'status', new.status,
    'action', 'post'
  )::text);
  return new;
end;
$$;

create trigger genesis_notify_post after update of status, published on genesis_sites.site_posts
  for each row when (old.status is distinct from new.status or old.published is distinct from new.published)
  execute function genesis_sites.notify_post_change();
create trigger genesis_notify_post_insert after insert on genesis_sites.site_posts
  for each row when (new.status = 'published')
  execute function genesis_sites.notify_post_change();

alter table genesis_sites.site_posts enable row level security;

create policy "viewers read its posts" on genesis_sites.site_posts
  for select to authenticated using (deleted_at is null and genesis_sites.can_view(site_id));

-- ── Helpers ───────────────────────────────────────────────────────────────────

create or replace function genesis_sites.assert_post(slug text, doc jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if slug is null or char_length(slug) > 80 or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'genesis_sites: "%" isn''t a post slug (lowercase letters, digits and single hyphens)', slug using errcode = '22023';
  end if;
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 524288 then
    raise exception 'genesis_sites: the post document must be a JSON object of at most 512 KiB' using errcode = '22023';
  end if;
  if doc -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'genesis_sites: the post document needs schemaVersion 1' using errcode = '22023';
  end if;
  if jsonb_typeof(doc -> 'title') is distinct from 'string' or jsonb_typeof(doc -> 'body') is distinct from 'object' or doc #>> '{body,type}' is distinct from 'doc' then
    raise exception 'genesis_sites: a post document needs a title and a rich text body' using errcode = '22023';
  end if;
end;
$$;

create or replace function genesis_sites.post_json(p genesis_sites.site_posts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'siteId', p.site_id, 'slug', p.slug, 'title', p.draft ->> 'title', 'status', p.status,
    'rev', p.draft_rev, 'publishedAt', p.published_at, 'updatedAt', p.updated_at
  )
$$;

-- ── Writes (security definer, each asking can_edit) ───────────────────────────

-- Create a post (post_id null) or save its draft if nobody saved since
-- `expected_rev`. Returns { id, rev }; raises GS409 (with the current
-- revision in DETAIL) when someone saved first. A post keeps its slug once
-- it has been published.
create or replace function genesis_sites.save_post(site_id uuid, post_id uuid, slug text, expected_rev integer, doc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  post genesis_sites.site_posts;
  new_id uuid;
begin
  -- can_edit first, then any lock: someone who can't edit learns nothing and locks nothing.
  perform genesis_sites.assert_can_edit(site_id);
  perform genesis_sites.assert_post(slug, doc);
  perform 1 from genesis_sites.sites s where s.id = save_post.site_id for update;
  if not found then
    raise exception 'genesis_sites: no site %', site_id using errcode = 'P0002';
  end if;
  if post_id is null then
    if exists (select 1 from genesis_sites.site_posts p where p.site_id = save_post.site_id and p.slug = save_post.slug and p.deleted_at is null) then
      raise exception 'genesis_sites: a post is already at %', slug using errcode = '23505';
    end if;
    insert into genesis_sites.site_posts (site_id, slug, draft) values (site_id, slug, doc) returning id into new_id;
    return jsonb_build_object('id', new_id, 'rev', 1);
  end if;
  select * into post from genesis_sites.site_posts p where p.id = post_id and p.site_id = save_post.site_id and p.deleted_at is null for update;
  if not found then
    raise exception 'genesis_sites: no post %', post_id using errcode = 'P0002';
  end if;
  if post.draft_rev is distinct from expected_rev then
    raise exception 'genesis_sites: someone saved this post first' using errcode = 'GS409', detail = post.draft_rev::text;
  end if;
  if post.slug <> slug then
    if post.published_at is not null then
      raise exception 'genesis_sites: a post keeps its slug once it has been published' using errcode = '22023';
    end if;
    if exists (select 1 from genesis_sites.site_posts p where p.site_id = save_post.site_id and p.slug = save_post.slug and p.deleted_at is null and p.id <> post_id) then
      raise exception 'genesis_sites: a post is already at %', slug using errcode = '23505';
    end if;
  end if;
  update genesis_sites.site_posts p set slug = save_post.slug, draft = doc, draft_rev = p.draft_rev + 1 where p.id = post_id;
  return jsonb_build_object('id', post_id, 'rev', post.draft_rev + 1);
end;
$$;

-- Publish a post: the draft exactly as the caller checked it (`expected_rev`)
-- becomes the published copy. Raises GS409 if the draft changed since.
create or replace function genesis_sites.publish_post(post_id uuid, expected_rev integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  post genesis_sites.site_posts;
  site_status text;
begin
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_posts p where p.id = post_id));
  select s.status into site_status from genesis_sites.sites s where s.id = (select p.site_id from genesis_sites.site_posts p where p.id = post_id) for update;
  -- Archiving is a takedown: an editor can't put posts back up.
  if site_status = 'archived' then
    raise exception 'genesis_sites: an archived site can''t publish posts' using errcode = '22023';
  end if;
  select * into post from genesis_sites.site_posts p where p.id = post_id and p.deleted_at is null for update;
  if not found then
    raise exception 'genesis_sites: no post %', post_id using errcode = 'P0002';
  end if;
  if post.draft_rev is distinct from expected_rev then
    raise exception 'genesis_sites: the post changed since it was checked' using errcode = 'GS409', detail = post.draft_rev::text;
  end if;
  perform genesis_sites.assert_post(post.slug, post.draft);
  update genesis_sites.site_posts p
  set published = p.draft, status = 'published', published_at = coalesce(p.published_at, now()), published_updated_at = now()
  where p.id = post_id
  returning * into post;
  return genesis_sites.post_json(post);
end;
$$;

-- Take a post down. Its draft stays; its first publish date stays, for when it goes back up.
create or replace function genesis_sites.unpublish_post(post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  post genesis_sites.site_posts;
begin
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_posts p where p.id = post_id));
  update genesis_sites.site_posts p set status = 'draft', published = null, published_updated_at = null
  where p.id = post_id and p.deleted_at is null
  returning * into post;
  if not found then
    raise exception 'genesis_sites: no post %', post_id using errcode = 'P0002';
  end if;
  return genesis_sites.post_json(post);
end;
$$;

create or replace function genesis_sites.delete_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_posts p where p.id = post_id));
  update genesis_sites.site_posts p set deleted_at = now(), status = 'draft', published = null, published_updated_at = null
  where p.id = post_id and p.deleted_at is null;
end;
$$;

-- A one-time import (a move from another site): `posts` is
-- [{ slug, doc, status, publishedAt }], at most 500. Each keeps its slug and
-- its date (never later than now); a slug the site already has, or a post
-- that isn't one, is skipped and reported. Returns { imported: [{ slug, id,
-- status }], skipped: [{ slug, reason }] }. The client runs the checks first
-- and asks for `draft` on a post that fails them.
create or replace function genesis_sites.import_posts(site_id uuid, posts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_slug text;
  item_status text;
  item_at timestamptz;
  new_id uuid;
  imported jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  perform genesis_sites.assert_can_edit(site_id);
  if posts is null or jsonb_typeof(posts) <> 'array' or jsonb_array_length(posts) > 500 then
    raise exception 'genesis_sites: posts is an array of at most 500 posts' using errcode = '22023';
  end if;
  perform 1 from genesis_sites.sites s where s.id = import_posts.site_id and s.status <> 'archived' for update;
  if not found then
    raise exception 'genesis_sites: no site % to import into', site_id using errcode = 'P0002';
  end if;
  for item in select * from jsonb_array_elements(posts) loop
    item_slug := item ->> 'slug';
    begin
      perform genesis_sites.assert_post(item_slug, item -> 'doc');
      if exists (select 1 from genesis_sites.site_posts p where p.site_id = import_posts.site_id and p.slug = item_slug and p.deleted_at is null) then
        skipped := skipped || jsonb_build_array(jsonb_build_object('slug', item_slug, 'reason', 'The site already has a post at this slug.'));
        continue;
      end if;
      item_status := case when item ->> 'status' = 'draft' then 'draft' else 'published' end;
      item_at := least(coalesce((item ->> 'publishedAt')::timestamptz, now()), now());
      -- A real date: not infinity, not before 1970 (the feeds and the sitemap print it).
      if not isfinite(item_at) or item_at < '1970-01-01T00:00:00Z'::timestamptz then
        raise exception 'genesis_sites: "%" isn''t a usable publish date', item ->> 'publishedAt' using errcode = '22008';
      end if;
      insert into genesis_sites.site_posts (site_id, slug, draft, published, status, published_at, published_updated_at)
      values (
        site_id, item_slug, item -> 'doc',
        case when item_status = 'published' then item -> 'doc' end,
        item_status,
        case when item_status = 'published' then item_at end,
        case when item_status = 'published' then item_at end
      )
      returning id into new_id;
      imported := imported || jsonb_build_array(jsonb_build_object('slug', item_slug, 'id', new_id, 'status', item_status));
    exception when sqlstate '22023' or sqlstate '22007' or sqlstate '22008' or sqlstate '23514' or sqlstate '23505' then
      skipped := skipped || jsonb_build_array(jsonb_build_object('slug', coalesce(item_slug, '?'), 'reason', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('imported', imported, 'skipped', skipped);
end;
$$;

-- ── The public read ───────────────────────────────────────────────────────────

-- A live site's published posts, newest first, without their bodies (at
-- most 500): for the blog's index, the sitemap and the feed. Never drafts.
create or replace function genesis_sites.live_posts(site_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by at desc, slug), '[]'::jsonb)
  from (
    select p.published_at as at, p.slug,
      jsonb_strip_nulls(jsonb_build_object(
        'slug', p.slug,
        'title', p.published ->> 'title',
        'excerpt', p.published -> 'excerpt',
        'cover', p.published -> 'cover',
        'author', p.published -> 'author',
        'category', p.published -> 'category',
        'noindex', case when coalesce((p.published #>> '{seo,noindex}')::boolean, false) or p.published #> '{seo,canonical}' is not null then true end,
        'publishedAt', p.published_at,
        'updatedAt', p.published_updated_at
      )) as item
    from genesis_sites.sites s
    join genesis_sites.site_posts p on p.site_id = s.id
    where s.id = live_posts.site_id and s.status = 'live' and s.live_release_id is not null
      and p.status = 'published' and p.deleted_at is null
    order by p.published_at desc, p.slug
    limit 500
  ) latest
$$;

comment on function genesis_sites.live_posts(uuid) is
  'The published posts of a live site, newest first, without bodies (at most 500). Public: anon may call it. Never returns drafts. Genesis Sites.';

-- One published post of a live site: { slug, publishedAt, updatedAt, doc }, or null.
create or replace function genesis_sites.live_post(site_id uuid, slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('slug', p.slug, 'publishedAt', p.published_at, 'updatedAt', p.published_updated_at, 'doc', p.published)
  from genesis_sites.sites s
  join genesis_sites.site_posts p on p.site_id = s.id
  where s.id = live_post.site_id and s.status = 'live' and s.live_release_id is not null
    and p.slug = live_post.slug and p.status = 'published' and p.deleted_at is null
$$;

comment on function genesis_sites.live_post(uuid, text) is
  'One published post of a live site, or null. Public: anon may call it. Never returns a draft. Genesis Sites.';

-- ── Privileges, by name ───────────────────────────────────────────────────────

revoke all on table genesis_sites.site_posts from public, anon, authenticated;
grant select on table genesis_sites.site_posts to authenticated;
revoke all on table genesis_sites.site_posts from service_role;
grant select, insert, update, delete on table genesis_sites.site_posts to service_role;

revoke execute on function genesis_sites.save_post(uuid, uuid, text, integer, jsonb) from public, anon;
grant execute on function genesis_sites.save_post(uuid, uuid, text, integer, jsonb) to authenticated;
revoke execute on function genesis_sites.publish_post(uuid, integer) from public, anon;
grant execute on function genesis_sites.publish_post(uuid, integer) to authenticated;
revoke execute on function genesis_sites.unpublish_post(uuid) from public, anon;
grant execute on function genesis_sites.unpublish_post(uuid) to authenticated;
revoke execute on function genesis_sites.delete_post(uuid) from public, anon;
grant execute on function genesis_sites.delete_post(uuid) to authenticated;
revoke execute on function genesis_sites.import_posts(uuid, jsonb) from public, anon;
grant execute on function genesis_sites.import_posts(uuid, jsonb) to authenticated;
revoke execute on function genesis_sites.live_posts(uuid) from public;
grant execute on function genesis_sites.live_posts(uuid) to anon, authenticated, service_role;
revoke execute on function genesis_sites.live_post(uuid, text) from public;
grant execute on function genesis_sites.live_post(uuid, text) to anon, authenticated, service_role;

-- Internal: only the functions above call these.
revoke execute on function genesis_sites.assert_post(text, jsonb) from public, anon, authenticated;
revoke execute on function genesis_sites.post_json(genesis_sites.site_posts) from public, anon, authenticated;
revoke execute on function genesis_sites.notify_post_change() from public, anon, authenticated;
