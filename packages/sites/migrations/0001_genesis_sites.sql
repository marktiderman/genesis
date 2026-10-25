-- Genesis Sites: the genesis_sites schema (sites, pages, releases, assets)
--
-- A site is a draft site document plus one draft per page. A publish freezes
-- them into an immutable release, and the live site points at it; a rollback
-- moves the pointer back. The client half is `createSupabaseSiteStore` in
-- @marktiderman/genesis-sites/supabase, which runs the publish checks
-- (accessibility, contrast, content) before it calls publish_site.
--
-- Everything lives in the genesis_sites schema. Expose it to the API: add it
-- to `schemas` under [api] in supabase/config.toml, and to Exposed schemas
-- in the dashboard.
--
-- Who may edit is yours. This file names no table of yours; it asks two hooks:
--
--   genesis_sites.can_edit(site_id uuid) returns boolean
--     May the signed-in person change this site (drafts, pages, assets,
--     publish, rollback)? Ships as a stub that answers false, so a fresh
--     install fails closed.
--   genesis_sites.can_view(site_id uuid) returns boolean
--     May they read its drafts and releases (an editor's preview, a
--     colleague who reviews)? Ships as a stub that asks can_edit.
--
-- Replace them in a migration of your own, after this one, with the same
-- signature. `create or replace` keeps the grants this file gives; keep
-- `stable`, and use `security definer set search_path = ''` when the hook
-- reads tables with row level security of their own.
--
-- Name the person in the hook (`auth.uid()`); never rely on your tables'
-- row level security to filter for you. The write functions below are
-- security definer, so the hook runs as their owner there, where your RLS
-- doesn't apply: a hook that asks "is any membership row visible?" would
-- answer yes for everyone. For example:
--
--   create or replace function genesis_sites.can_edit(site_id uuid) returns boolean
--   language sql stable security definer set search_path = '' as $$
--     select exists (select 1 from public.brand_members m
--                    join public.brand_sites b on b.brand_id = m.brand_id
--                    where b.site_id = can_edit.site_id and m.user_id = auth.uid() and m.role in ('owner', 'editor'))
--   $$;
--
-- This file (and every later genesis-sites migration) creates a hook only
-- when it is missing or still exactly the stub, through
-- genesis_sites.ensure_hook_stubs(), so running it again never overwrites
-- your version. The same goes for genesis_sites.reserved_paths(): the page
-- paths a site can't use because it shares its hostname with your app.
--
-- Public reads: anon reads only a live site's live release, through
-- genesis_sites.live_release(site_id). Drafts are never readable by anon;
-- signed-in people read drafts and releases where can_view says so.
--
-- Writes go through the security definer functions below, each asking
-- can_edit. The tables have row level security on and no write grants to
-- anon or authenticated, except inserting and deleting asset rows (an
-- upload's record), under can_edit. Sites are created by the service role
-- (create_site), from a server job or your own function.
--
-- Assets: store files under `sites/<site_id>/...` in your bucket, so your
-- storage policies can scope by site with can_edit, for example:
--
--   create policy "site editors upload" on storage.objects for insert to authenticated
--     with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'sites'
--                 and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'pdf')
--                 and genesis_sites.can_edit(((storage.foldername(name))[2])::uuid));
--
-- and set the bucket's allowed_mime_types to the same image types and PDF:
-- never SVG or HTML, which a browser runs as a page.
--
-- Audit: add your own triggers on these tables if you keep an audit trail;
-- nothing here depends on one. Every change to what a site serves (publish,
-- rollback, archive, unarchive) sends `pg_notify('genesis_sites',
-- {"site_id", "release_id", "status", "action"})`, from a trigger on sites,
-- for a listener that purges the CDN (or purge from the server that made it).
--
-- Checks: publish_site checks shape, size, paths and revisions. The
-- accessibility and content checks run in TypeScript (`prepareRelease`, in
-- the stores) before it is called, so they are a guard for editors, not a
-- security boundary: an editor calling the function directly can skip them,
-- and `brand_hash` is what the caller reports. Access rules can't be skipped.
-- A hidden section is left out of the release, so it is never public.
--
-- Use: `genesis add sites` copies this file into supabase/migrations under a
-- new timestamped name. Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_sites.test.sql`).

create schema if not exists genesis_sites;

comment on schema genesis_sites is 'Genesis Sites: sites, pages, releases and assets. Reached through RLS and the functions in this schema.';

grant usage on schema genesis_sites to anon, authenticated, service_role;

-- ── Hooks ─────────────────────────────────────────────────────────────────────

-- Creates each hook only when it is missing or still exactly the stub this
-- package ships, so a re-run (or a later genesis-sites migration) never
-- overwrites the app's own version.
create or replace function genesis_sites.ensure_hook_stubs()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  stubs constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'name', 'can_edit',
      'returns', 'boolean',
      'body', E'\n  -- genesis-sites stub: nobody may edit until the app replaces this function.\n  select false\n'
    ),
    jsonb_build_object(
      'name', 'can_view',
      'returns', 'boolean',
      'body', E'\n  -- genesis-sites stub: whoever may edit may view.\n  select genesis_sites.can_edit(site_id)\n'
    )
  );
  reserved_body constant text := E'\n  -- genesis-sites stub: the app\'s paths a site page can\'t use.\n  select array[''/api'', ''/_server'', ''/auth'', ''/_gs'']::text[]\n';
  stub jsonb;
  current_body text;
begin
  for stub in select * from jsonb_array_elements(stubs) loop
    select p.prosrc into current_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'genesis_sites' and p.proname = stub ->> 'name'
      and pg_get_function_identity_arguments(p.oid) = 'site_id uuid';
    if current_body is null or current_body = stub ->> 'body' then
      execute format(
        'create or replace function genesis_sites.%I(site_id uuid) returns %s language sql stable set search_path = '''' as %L',
        stub ->> 'name', stub ->> 'returns', stub ->> 'body'
      );
      -- By name, each time it writes a stub, so a hook this step had to create again
      -- never keeps Postgres's default (execute for public).
      execute format('revoke execute on function genesis_sites.%I(uuid) from public, anon', stub ->> 'name');
      execute format('grant execute on function genesis_sites.%I(uuid) to authenticated, service_role', stub ->> 'name');
    end if;
    current_body := null;
  end loop;

  select p.prosrc into current_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'genesis_sites' and p.proname = 'reserved_paths' and pg_get_function_identity_arguments(p.oid) = '';
  if current_body is null or current_body = reserved_body then
    execute format('create or replace function genesis_sites.reserved_paths() returns text[] language sql stable set search_path = '''' as %L', reserved_body);
    revoke execute on function genesis_sites.reserved_paths() from public, anon;
    grant execute on function genesis_sites.reserved_paths() to authenticated, service_role;
  end if;
end;
$fn$;

revoke execute on function genesis_sites.ensure_hook_stubs() from public, anon, authenticated;

select genesis_sites.ensure_hook_stubs();

comment on function genesis_sites.can_edit(uuid) is
  'May the signed-in person edit this site? Replace it in your own migration (same signature). The stub answers false. Genesis Sites.';
comment on function genesis_sites.can_view(uuid) is
  'May the signed-in person read this site''s drafts and releases? Replace it in your own migration (same signature). The stub asks can_edit. Genesis Sites.';
comment on function genesis_sites.reserved_paths() is
  'Path prefixes a page can''t use, because the site shares its hostname with the app. Replace it to add yours. Genesis Sites.';

-- ── Tables ────────────────────────────────────────────────────────────────────

create table genesis_sites.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint sites_name_length check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique constraint sites_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 63),
  -- The site document (SiteDoc): theme, header, menu, footer, SEO defaults, redirects.
  draft jsonb not null constraint sites_draft_shape check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_rev integer not null default 1,
  live_release_id uuid,
  status text not null default 'draft' constraint sites_status check (status in ('draft', 'live', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table genesis_sites.sites is 'A site: its draft site document and the release it serves. Genesis Sites.';

create table genesis_sites.site_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references genesis_sites.sites (id) on delete cascade,
  path text not null constraint site_pages_path_format check (
    char_length(path) <= 200 and path ~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,7})?$'
  ),
  kind text not null default 'page' constraint site_pages_kind check (kind in ('page', 'landing')),
  -- The page document (PageDoc): its sections and SEO.
  draft jsonb not null constraint site_pages_draft_shape check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 524288),
  draft_rev integer not null default 1,
  sort integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index site_pages_one_per_path on genesis_sites.site_pages (site_id, path) where deleted_at is null;
create index site_pages_site on genesis_sites.site_pages (site_id, sort);

comment on table genesis_sites.site_pages is 'A site''s pages and their drafts. A deleted page keeps its row (deleted_at). Genesis Sites.';

create table genesis_sites.site_releases (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references genesis_sites.sites (id) on delete cascade,
  number integer not null constraint site_releases_number check (number >= 1),
  -- Everything the release serves: { schemaVersion, site, pages: [{ id, path, kind, doc }] }.
  snapshot jsonb not null,
  note text constraint site_releases_note_length check (char_length(note) <= 500),
  brand_hash text constraint site_releases_brand_hash check (brand_hash ~ '^[0-9a-f]{1,64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (site_id, number),
  unique (id, site_id)
);

comment on table genesis_sites.site_releases is 'Immutable published snapshots of a site. The live site points at one. Genesis Sites.';

-- The live release is one of the site's own releases.
alter table genesis_sites.sites
  add constraint sites_live_release foreign key (live_release_id, id) references genesis_sites.site_releases (id, site_id);

create table genesis_sites.site_assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references genesis_sites.sites (id) on delete cascade,
  -- The storage key: always under sites/<site_id>/.
  path text not null unique constraint site_assets_path check (
    char_length(path) <= 512 and starts_with(path, 'sites/' || site_id::text || '/') and path !~ '(^|/)\.\.?(/|$)' and path !~ '[\\[:cntrl:]]'
  ),
  -- Images and PDFs. No SVG: an SVG can carry script.
  mime text not null constraint site_assets_mime check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'application/pdf')),
  width integer constraint site_assets_width check (width between 1 and 20000),
  height integer constraint site_assets_height check (height between 1 and 20000),
  alt text constraint site_assets_alt check (char_length(alt) <= 300),
  blurhash text constraint site_assets_blurhash check (char_length(blurhash) <= 100),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index site_assets_site on genesis_sites.site_assets (site_id);

comment on table genesis_sites.site_assets is 'Files a site uses (the record of an upload under sites/<site_id>/). Genesis Sites.';

create or replace function genesis_sites.touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger genesis_touch before update on genesis_sites.sites for each row execute function genesis_sites.touch();
create trigger genesis_touch before update on genesis_sites.site_pages for each row execute function genesis_sites.touch();

-- A release never changes once written (rollback moves the site's pointer instead).
create or replace function genesis_sites.release_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'genesis_sites: a release can''t be changed; publish a new one' using errcode = '42501';
end;
$$;

create trigger genesis_immutable before update on genesis_sites.site_releases for each row execute function genesis_sites.release_is_immutable();

-- What a site serves changed (publish, rollback, archive, unarchive): tell a listener to purge its cache.
create or replace function genesis_sites.notify_served_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify('genesis_sites', jsonb_build_object(
    'site_id', new.id,
    'release_id', new.live_release_id,
    'status', new.status,
    'action', case
      when new.status = 'archived' then 'archive'
      when old.status = 'archived' then 'unarchive'
      when new.live_release_id is distinct from old.live_release_id
        and (select r.number from genesis_sites.site_releases r where r.id = new.live_release_id)
          < coalesce((select r.number from genesis_sites.site_releases r where r.id = old.live_release_id), 0)
        then 'rollback'
      else 'publish'
    end
  )::text);
  return new;
end;
$$;

create trigger genesis_notify_served after update of status, live_release_id on genesis_sites.sites
  for each row when (old.status is distinct from new.status or old.live_release_id is distinct from new.live_release_id)
  execute function genesis_sites.notify_served_change();

-- ── Row level security ────────────────────────────────────────────────────────

alter table genesis_sites.sites enable row level security;
alter table genesis_sites.site_pages enable row level security;
alter table genesis_sites.site_releases enable row level security;
alter table genesis_sites.site_assets enable row level security;

create policy "viewers read the site" on genesis_sites.sites
  for select to authenticated using (genesis_sites.can_view(id));
create policy "viewers read its pages" on genesis_sites.site_pages
  for select to authenticated using (deleted_at is null and genesis_sites.can_view(site_id));
create policy "viewers read its releases" on genesis_sites.site_releases
  for select to authenticated using (genesis_sites.can_view(site_id));
create policy "viewers read its assets" on genesis_sites.site_assets
  for select to authenticated using (genesis_sites.can_view(site_id));
create policy "editors record uploads" on genesis_sites.site_assets
  for insert to authenticated with check (genesis_sites.can_edit(site_id));
create policy "editors remove uploads" on genesis_sites.site_assets
  for delete to authenticated using (genesis_sites.can_edit(site_id));

-- ── Helpers ───────────────────────────────────────────────────────────────────

create or replace function genesis_sites.assert_can_edit(site uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'genesis_sites: not signed in' using errcode = '42501';
  end if;
  if site is null or not coalesce(genesis_sites.can_edit(site), false) then
    raise exception 'genesis_sites: you can''t edit this site' using errcode = '42501',
      hint = 'genesis_sites.can_edit(uuid) decides; replace its stub in your own migration.';
  end if;
end;
$$;

-- Not one of the app's reserved paths (the path itself or anything under it).
create or replace function genesis_sites.assert_not_reserved(path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefix text;
  probe text := lower(rtrim(split_part(split_part(path, '?', 1), '#', 1), '/'));
begin
  if probe = '' then
    return;
  end if;
  foreach prefix in array coalesce(genesis_sites.reserved_paths(), '{}'::text[]) loop
    prefix := lower(rtrim(prefix, '/'));
    if prefix <> '' and (probe = prefix or starts_with(probe, prefix || '/')) then
      raise exception 'genesis_sites: "%" is reserved for the app', path using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- A page path's shape, and not one of the app's reserved paths.
create or replace function genesis_sites.assert_page_path(path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if path is null or char_length(path) > 200 or path !~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,7})?$' then
    raise exception 'genesis_sites: "%" isn''t a page path (lowercase segments, like /about)', path using errcode = '22023';
  end if;
  perform genesis_sites.assert_not_reserved(path);
end;
$$;

-- Every redirect's `from` is a site path (an old address, any case) that isn't one of the app's
-- reserved paths: a redirect from /auth or a reserved prefix would take over the app's own route.
create or replace function genesis_sites.assert_redirects(doc jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
  from_path text;
begin
  if doc -> 'redirects' is null or jsonb_typeof(doc -> 'redirects') = 'null' then
    return;
  end if;
  if jsonb_typeof(doc -> 'redirects') <> 'array' then
    raise exception 'genesis_sites: redirects must be a list' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(doc -> 'redirects') loop
    from_path := r ->> 'from';
    if from_path is null or char_length(from_path) > 500 or left(from_path, 1) <> '/' or left(from_path, 2) = '//' or from_path ~ '[[:space:][:cntrl:]\\]' then
      raise exception 'genesis_sites: "%" isn''t a redirect source (a site path starting with /)', from_path using errcode = '22023';
    end if;
    perform genesis_sites.assert_not_reserved(from_path);
  end loop;
end;
$$;

create or replace function genesis_sites.assert_doc(doc jsonb, what text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 524288 then
    raise exception 'genesis_sites: the % document must be a JSON object of at most 512 KiB', what using errcode = '22023';
  end if;
  if doc -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'genesis_sites: the % document needs schemaVersion 1', what using errcode = '22023';
  end if;
  if what = 'page' and (jsonb_typeof(doc -> 'content') is distinct from 'array' or jsonb_typeof(doc #> '{root,props,title}') is distinct from 'string') then
    raise exception 'genesis_sites: a page document needs root.props.title and a content list' using errcode = '22023';
  end if;
  if what = 'site' and jsonb_typeof(doc -> 'name') is distinct from 'string' then
    raise exception 'genesis_sites: a site document needs a name' using errcode = '22023';
  end if;
end;
$$;

create or replace function genesis_sites.release_json(r genesis_sites.site_releases, with_snapshot boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'siteId', r.site_id, 'number', r.number, 'note', r.note,
    'createdAt', r.created_at, 'publishedAt', r.published_at, 'brandHash', r.brand_hash
  ) || case when with_snapshot then jsonb_build_object('snapshot', r.snapshot) else '{}'::jsonb end
$$;

-- ── Writes (security definer, each asking can_edit) ───────────────────────────

-- Save a page's draft if nobody saved since `expected_rev`. Returns the new
-- revision; raises GS409 (with the current revision in DETAIL) when someone did.
create or replace function genesis_sites.save_page_draft(page_id uuid, expected_rev integer, doc jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  page genesis_sites.site_pages;
begin
  -- can_edit first, then the row lock: someone who can't edit learns nothing and locks nothing.
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_pages p where p.id = page_id));
  select * into page from genesis_sites.site_pages p where p.id = page_id and p.deleted_at is null for update;
  if not found then
    raise exception 'genesis_sites: no page %', page_id using errcode = 'P0002';
  end if;
  -- The app may have reserved this page's path since the page was made (genesis_sites.reserved_paths()).
  perform genesis_sites.assert_page_path(page.path);
  perform genesis_sites.assert_doc(doc, 'page');
  if page.draft_rev is distinct from expected_rev then
    raise exception 'genesis_sites: someone saved this page first' using errcode = 'GS409', detail = page.draft_rev::text;
  end if;
  update genesis_sites.site_pages p set draft = doc, draft_rev = p.draft_rev + 1 where p.id = page_id;
  return page.draft_rev + 1;
end;
$$;

create or replace function genesis_sites.save_site_draft(site_id uuid, expected_rev integer, doc jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  site genesis_sites.sites;
begin
  perform genesis_sites.assert_can_edit(site_id);
  select * into site from genesis_sites.sites s where s.id = save_site_draft.site_id for update;
  if not found then
    raise exception 'genesis_sites: no site %', site_id using errcode = 'P0002';
  end if;
  perform genesis_sites.assert_doc(doc, 'site');
  perform genesis_sites.assert_redirects(doc);
  if site.draft_rev is distinct from expected_rev then
    raise exception 'genesis_sites: someone saved this site first' using errcode = 'GS409', detail = site.draft_rev::text;
  end if;
  update genesis_sites.sites s set draft = doc, draft_rev = s.draft_rev + 1 where s.id = save_site_draft.site_id;
  return site.draft_rev + 1;
end;
$$;

-- Drop the redirect away from `path` (a page lives there now), bumping the draft's revision if there was one.
create or replace function genesis_sites.drop_redirect_from(site uuid, path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_sites.sites s
  set draft = jsonb_set(s.draft, '{redirects}', coalesce((
        select jsonb_agg(r order by i) from jsonb_array_elements(coalesce(s.draft -> 'redirects', '[]'::jsonb)) with ordinality as e(r, i)
        where r ->> 'from' is distinct from path), '[]'::jsonb)),
      draft_rev = s.draft_rev + 1
  where s.id = site and exists (select 1 from jsonb_array_elements(coalesce(s.draft -> 'redirects', '[]'::jsonb)) r where r ->> 'from' = path);
end;
$$;

create or replace function genesis_sites.create_page(site_id uuid, path text, kind text, doc jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform genesis_sites.assert_can_edit(site_id);
  perform genesis_sites.assert_page_path(path);
  perform genesis_sites.assert_doc(doc, 'page');
  perform 1 from genesis_sites.sites s where s.id = create_page.site_id for update;
  if not found then
    raise exception 'genesis_sites: no site %', site_id using errcode = 'P0002';
  end if;
  if exists (select 1 from genesis_sites.site_pages p where p.site_id = create_page.site_id and p.path = create_page.path and p.deleted_at is null) then
    raise exception 'genesis_sites: a page is already at %', path using errcode = '23505';
  end if;
  insert into genesis_sites.site_pages (site_id, path, kind, draft, sort)
  values (site_id, path, coalesce(kind, 'page'), doc,
          coalesce((select max(p.sort) + 1 from genesis_sites.site_pages p where p.site_id = create_page.site_id and p.deleted_at is null), 0))
  returning id into new_id;
  perform genesis_sites.drop_redirect_from(site_id, path);
  return new_id;
end;
$$;

-- Move a page; the old path redirects to the new one (301), with no chains.
create or replace function genesis_sites.move_page(page_id uuid, new_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  page genesis_sites.site_pages;
begin
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_pages p where p.id = page_id));
  -- The site's row first, then the page's: the order publish_site locks them in, so the two never deadlock.
  perform 1 from genesis_sites.sites s where s.id = (select p.site_id from genesis_sites.site_pages p where p.id = page_id) for update;
  select * into page from genesis_sites.site_pages p where p.id = page_id and p.deleted_at is null for update;
  if not found then
    raise exception 'genesis_sites: no page %', page_id using errcode = 'P0002';
  end if;
  perform genesis_sites.assert_page_path(new_path);
  if page.path = '/' then
    raise exception 'genesis_sites: the home page stays at /' using errcode = '22023';
  end if;
  if page.path = new_path then
    return;
  end if;
  if exists (select 1 from genesis_sites.site_pages p where p.site_id = page.site_id and p.path = new_path and p.deleted_at is null) then
    raise exception 'genesis_sites: a page is already at %', new_path using errcode = '23505';
  end if;
  update genesis_sites.site_pages p set path = new_path, draft_rev = p.draft_rev + 1 where p.id = page_id;
  update genesis_sites.sites s
  set draft = jsonb_set(s.draft, '{redirects}', coalesce((
        select jsonb_agg(r order by i) from (
          select case when e.r ->> 'to' = page.path then jsonb_set(e.r, '{to}', to_jsonb(new_path)) else e.r end as r, e.i
          from jsonb_array_elements(coalesce(s.draft -> 'redirects', '[]'::jsonb)) with ordinality as e(r, i)
          where e.r ->> 'from' is distinct from new_path and e.r ->> 'from' is distinct from page.path
        ) m
        where m.r ->> 'from' is distinct from m.r ->> 'to'), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('from', page.path, 'to', new_path, 'status', 301))),
      draft_rev = s.draft_rev + 1
  where s.id = page.site_id;
end;
$$;

create or replace function genesis_sites.delete_page(page_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  page genesis_sites.site_pages;
begin
  perform genesis_sites.assert_can_edit((select p.site_id from genesis_sites.site_pages p where p.id = page_id));
  select * into page from genesis_sites.site_pages p where p.id = page_id and p.deleted_at is null for update;
  if not found then
    return;
  end if;
  if page.path = '/' then
    raise exception 'genesis_sites: the home page can''t be deleted' using errcode = '22023';
  end if;
  update genesis_sites.site_pages p set deleted_at = now() where p.id = page_id;
end;
$$;

-- A list of section nodes without the hidden ones: a release never carries a hidden section.
create or replace function genesis_sites.visible_nodes(nodes jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(n order by i), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(nodes) = 'array' then nodes else '[]'::jsonb end) with ordinality as e(n, i)
  where coalesce(n ->> 'hidden', 'false') <> 'true'
$$;

-- Publish: the drafts exactly as the caller checked them (`expected_site_rev`
-- and `expected_pages`, `{ "<page id>": rev }` for every page) become a new
-- release, and the live site points at it. Raises GS409 if anything changed
-- since the check, so what goes live is what was checked.
create or replace function genesis_sites.publish_site(site_id uuid, expected_site_rev integer, expected_pages jsonb, note text default null, brand_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  site genesis_sites.sites;
  release genesis_sites.site_releases;
  page record;
  page_count integer := 0;
begin
  perform genesis_sites.assert_can_edit(site_id);
  select * into site from genesis_sites.sites s where s.id = publish_site.site_id for update;
  if not found then
    raise exception 'genesis_sites: no site %', site_id using errcode = 'P0002';
  end if;
  if site.status = 'archived' then
    raise exception 'genesis_sites: an archived site can''t be published' using errcode = '22023';
  end if;
  perform genesis_sites.assert_doc(site.draft, 'site');
  perform genesis_sites.assert_redirects(site.draft);
  if site.draft_rev is distinct from expected_site_rev then
    raise exception 'genesis_sites: the site changed since it was checked' using errcode = 'GS409', detail = site.draft_rev::text;
  end if;
  if expected_pages is null or jsonb_typeof(expected_pages) <> 'object' then
    raise exception 'genesis_sites: expected_pages is { "<page id>": rev } for every page' using errcode = '22023';
  end if;
  for page in select p.id, p.path, p.draft, p.draft_rev from genesis_sites.site_pages p where p.site_id = publish_site.site_id and p.deleted_at is null for update loop
    page_count := page_count + 1;
    if (expected_pages ->> page.id::text) is distinct from page.draft_rev::text then
      raise exception 'genesis_sites: the page at % changed since it was checked', page.path using errcode = 'GS409';
    end if;
    perform genesis_sites.assert_page_path(page.path);
    perform genesis_sites.assert_doc(page.draft, 'page');
  end loop;
  if page_count <> (select count(*) from jsonb_object_keys(expected_pages)) then
    raise exception 'genesis_sites: the pages changed since they were checked' using errcode = 'GS409';
  end if;
  if not exists (select 1 from genesis_sites.site_pages p where p.site_id = publish_site.site_id and p.path = '/' and p.deleted_at is null) then
    raise exception 'genesis_sites: the site has no home page (/)' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'genesis_sites: a release note has at most 500 characters' using errcode = '22023';
  end if;

  insert into genesis_sites.site_releases (site_id, number, snapshot, note, brand_hash, created_by, published_at)
  values (
    site_id,
    coalesce((select max(r.number) from genesis_sites.site_releases r where r.site_id = publish_site.site_id), 0) + 1,
    jsonb_build_object(
      'schemaVersion', 1,
      'site', site.draft
        || jsonb_build_object('header', genesis_sites.visible_nodes(site.draft -> 'header'), 'footer', genesis_sites.visible_nodes(site.draft -> 'footer')),
      'pages', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'kind', p.kind,
                         'doc', p.draft || jsonb_build_object('content', genesis_sites.visible_nodes(p.draft -> 'content')))
                         order by p.sort, p.path)
        from genesis_sites.site_pages p where p.site_id = publish_site.site_id and p.deleted_at is null), '[]'::jsonb)
    ),
    nullif(btrim(note), ''),
    brand_hash,
    (select u.id from auth.users u where u.id = auth.uid()),
    now()
  )
  returning * into release;
  update genesis_sites.sites s set live_release_id = release.id, status = 'live' where s.id = publish_site.site_id;
  return genesis_sites.release_json(release, false);
end;
$$;

-- Point the live site at an earlier release.
create or replace function genesis_sites.rollback_site(site_id uuid, release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  release genesis_sites.site_releases;
  current_status text;
begin
  perform genesis_sites.assert_can_edit(site_id);
  select s.status into current_status from genesis_sites.sites s where s.id = rollback_site.site_id for update;
  if not found then
    raise exception 'genesis_sites: no site %', site_id using errcode = 'P0002';
  end if;
  -- Archiving is a takedown: an editor can't bring the site back by rolling back.
  if current_status = 'archived' then
    raise exception 'genesis_sites: an archived site can''t be rolled back' using errcode = '22023';
  end if;
  select * into release from genesis_sites.site_releases r where r.id = release_id and r.site_id = rollback_site.site_id;
  if not found then
    raise exception 'genesis_sites: release % isn''t one of this site''s', release_id using errcode = 'P0002';
  end if;
  update genesis_sites.sites s set live_release_id = release.id, status = 'live' where s.id = rollback_site.site_id;
  return genesis_sites.release_json(release, false);
end;
$$;

-- Create a site with its pages (the service role: a seed, a server job, your own function).
create or replace function genesis_sites.create_site(name text, slug text, draft jsonb, pages jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  page jsonb;
  i integer := 0;
begin
  perform genesis_sites.assert_doc(draft, 'site');
  if pages is null or jsonb_typeof(pages) <> 'array' or not exists (select 1 from jsonb_array_elements(pages) p where p ->> 'path' = '/') then
    raise exception 'genesis_sites: a site starts with its pages, including / ' using errcode = '22023';
  end if;
  insert into genesis_sites.sites (name, slug, draft) values (name, slug, draft) returning id into new_id;
  for page in select * from jsonb_array_elements(pages) loop
    perform genesis_sites.assert_page_path(page ->> 'path');
    perform genesis_sites.assert_doc(page -> 'doc', 'page');
    insert into genesis_sites.site_pages (site_id, path, kind, draft, sort)
    values (new_id, page ->> 'path', coalesce(page ->> 'kind', 'page'), page -> 'doc', i);
    i := i + 1;
  end loop;
  return new_id;
end;
$$;

-- ── The public read ───────────────────────────────────────────────────────────

-- A live site's live release, for anyone (no session needed). Drafts never,
-- and not the release note, which is for the site's editors.
create or replace function genesis_sites.live_release(site_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select genesis_sites.release_json(r, true) || jsonb_build_object('note', null)
  from genesis_sites.sites s
  join genesis_sites.site_releases r on r.id = s.live_release_id and r.site_id = s.id
  where s.id = live_release.site_id and s.status = 'live'
$$;

comment on function genesis_sites.live_release(uuid) is
  'The live release of a live site (its snapshot), or null. Public: anon may call it. Never returns drafts. Genesis Sites.';

-- ── Privileges, by name ───────────────────────────────────────────────────────

revoke all on table genesis_sites.sites, genesis_sites.site_pages, genesis_sites.site_releases, genesis_sites.site_assets from public, anon, authenticated;
grant select on table genesis_sites.sites, genesis_sites.site_pages, genesis_sites.site_releases, genesis_sites.site_assets to authenticated;
grant insert (site_id, path, mime, width, height, alt, blurhash), delete on table genesis_sites.site_assets to authenticated;
revoke all on table genesis_sites.sites, genesis_sites.site_pages, genesis_sites.site_releases, genesis_sites.site_assets from service_role;
grant select, insert, update, delete on table genesis_sites.sites, genesis_sites.site_pages, genesis_sites.site_assets to service_role;
-- Releases: the service role reads and purges them (a live one is protected by its foreign key), never rewrites them.
grant select, insert, delete on table genesis_sites.site_releases to service_role;

-- The hooks: the policies ask them as the signed-in person.
revoke execute on function genesis_sites.can_edit(uuid) from public, anon;
grant execute on function genesis_sites.can_edit(uuid) to authenticated, service_role;
revoke execute on function genesis_sites.can_view(uuid) from public, anon;
grant execute on function genesis_sites.can_view(uuid) to authenticated, service_role;
revoke execute on function genesis_sites.reserved_paths() from public, anon;
grant execute on function genesis_sites.reserved_paths() to authenticated, service_role;

revoke execute on function genesis_sites.save_page_draft(uuid, integer, jsonb) from public, anon;
grant execute on function genesis_sites.save_page_draft(uuid, integer, jsonb) to authenticated;
revoke execute on function genesis_sites.save_site_draft(uuid, integer, jsonb) from public, anon;
grant execute on function genesis_sites.save_site_draft(uuid, integer, jsonb) to authenticated;
revoke execute on function genesis_sites.create_page(uuid, text, text, jsonb) from public, anon;
grant execute on function genesis_sites.create_page(uuid, text, text, jsonb) to authenticated;
revoke execute on function genesis_sites.move_page(uuid, text) from public, anon;
grant execute on function genesis_sites.move_page(uuid, text) to authenticated;
revoke execute on function genesis_sites.delete_page(uuid) from public, anon;
grant execute on function genesis_sites.delete_page(uuid) to authenticated;
revoke execute on function genesis_sites.publish_site(uuid, integer, jsonb, text, text) from public, anon;
grant execute on function genesis_sites.publish_site(uuid, integer, jsonb, text, text) to authenticated;
revoke execute on function genesis_sites.rollback_site(uuid, uuid) from public, anon;
grant execute on function genesis_sites.rollback_site(uuid, uuid) to authenticated;
revoke execute on function genesis_sites.create_site(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function genesis_sites.create_site(text, text, jsonb, jsonb) to service_role;
revoke execute on function genesis_sites.live_release(uuid) from public;
grant execute on function genesis_sites.live_release(uuid) to anon, authenticated, service_role;

-- Internal: only the functions above call these.
revoke execute on function genesis_sites.assert_can_edit(uuid) from public, anon, authenticated;
revoke execute on function genesis_sites.assert_page_path(text) from public, anon, authenticated;
revoke execute on function genesis_sites.assert_not_reserved(text) from public, anon, authenticated;
revoke execute on function genesis_sites.assert_redirects(jsonb) from public, anon, authenticated;
revoke execute on function genesis_sites.assert_doc(jsonb, text) from public, anon, authenticated;
revoke execute on function genesis_sites.drop_redirect_from(uuid, text) from public, anon, authenticated;
revoke execute on function genesis_sites.release_json(genesis_sites.site_releases, boolean) from public, anon, authenticated;
revoke execute on function genesis_sites.touch() from public, anon, authenticated;
revoke execute on function genesis_sites.release_is_immutable() from public, anon, authenticated;
revoke execute on function genesis_sites.notify_served_change() from public, anon, authenticated;
revoke execute on function genesis_sites.visible_nodes(jsonb) from public, anon, authenticated;
