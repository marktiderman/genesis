# @marktiderman/genesis-sites

Sites and landing pages for Genesis apps. A site is a set of pages made of
sections. It is drawn from your brand, served as cached HTML with no
hydration, and published as immutable releases you can roll back.

- **Core** (`.`): zod 4 documents (`SiteDoc`, `PageDoc`, `SectionNode`, SEO,
  menus, redirects) in Puck's `{ root, content }` shape, the section registry
  (`defineSection`), props migrations, SEO, the publish checks, the theme from
  your brand, templates and the `SiteStore` contract.
- **Sections** (`/sections`): 20 server-rendered sections on Genesis UI.
- **Web** (`/web`): `handleSiteRequest`, the renderer and request handler.
- **Supabase** (`/supabase`): `createSupabaseSiteStore`, over the
  `genesis_sites` schema in `migrations/`.
- **Import** (`/import`, Node): `importAssets`, which re-hosts an old site's
  images and PDFs behind a guard against server-side request forgery, and
  `rewriteUrls`.
- **Editor** (`/editor`): `<SiteEditor>`, the visual editor (on Puck).
- **Block** (`/blocks`): `sitesBlock`, so `genesis add sites` installs the
  migration.
- **Templates** (`/templates`): industry template content, as data on the
  neutral sections (see [A neutral core](#a-neutral-core-and-industry-templates)).

Status: beta. The design and its reasoning are in
[docs/SITES.md](../../docs/SITES.md).

## Install

```bash
genesis add sites        # copies the migrations (0001, 0002) and their pgTAP tests into supabase/
pnpm add @marktiderman/genesis-sites zod@^4
```

Peers: `react` and `react-dom` 19, `zod` 4, `@marktiderman/genesis-ui`,
`@marktiderman/genesis-design-system`, `@marktiderman/genesis-forms` and
`-forms-web` (the form embed), `lucide-react`, `@supabase/supabase-js` for
the Supabase store, and `@puckeditor/core` 0.23 for the editor. The last two
are optional: install them only if you use the Supabase store or `/editor`.

Then:

1. Expose the `genesis_sites` schema to the API: add it to `schemas` under
   `[api]` in `supabase/config.toml`, and to Exposed schemas in the dashboard.
2. Decide who edits a site (see [Who may edit](#who-may-edit)).
3. Mount `handleSiteRequest` on your server, before your app's routes.

## A landing page in one call

```ts
import { createMemorySiteStore, landingPage } from "@marktiderman/genesis-sites";
import { handleSiteRequest } from "@marktiderman/genesis-sites/web";

const brand = {
  name: "Riverside Works",
  colors: { primary: "#0f766e", primaryDark: "#2dd4bf" },
  fonts: { heading: "space-grotesk", body: "inter" },
};
const { site, pages } = landingPage({
  brand,
  message: {
    headline: "Make things with people who know your name",
    subhead: "Small groups and real teaching by the river.",
    benefits: [{ title: "Guided sessions", body: "A host in every session." }],
  },
  form: { slug: "free-class", heading: "Book a free visit" },
  contact: { email: "hello@riverside.example" },
});

const store = createMemorySiteStore();
await store.createSite({ id: "riverside", site, pages });
// The template's sample quotes are placeholders: replace them (or hide the
// section) and publish. A placeholder still showing blocks the publish.
await store.publish("riverside", { brand });
```

`starterSite` makes a three-page site (home, about, contact) from the same
input. `onePageSite({ name, logo, message, colors, fonts })` seeds a site from
the least a brand can give.

## Serving a site

```ts
import { DEFAULT_RESERVED_PATHS } from "@marktiderman/genesis-sites";
import { handleSiteRequest } from "@marktiderman/genesis-sites/web";

export async function handle(request: Request) {
  const siteId = await siteForHost(request.headers.get("host")); // your hostname table
  const res = siteId
    ? await handleSiteRequest(request, {
        store,                                  // a store signed in as nobody: getLive is public
        brand: { getBrand: (id) => brandFor(id) },
        siteId,
        origin: "https://riverside.example",    // the primary hostname, for canonical URLs
        reserved: [...DEFAULT_RESERVED_PATHS, "/admin"],
        forms: (slug) => formFor(slug),         // see Forms
      })
    : null;
  return res ?? app(request);                   // null: not the site's path, so your app answers
}
```

`handleSiteRequest` answers `GET` and `HEAD` and returns `null` for anything it
doesn't own: another method, a reserved path (`/api`, `/_server`, `/auth`, and
`/_gs`, where it serves its own assets), an unknown path (or the site's 404 page
with `unknownPath: "not-found"`), or a site that isn't published. In order, it
serves:

1. its own content-hashed assets under `/_gs/` (immutable);
2. `robots.txt` and `sitemap.xml`;
3. the site's redirects, then a 308 to the one address of a page (lowercase, no
   trailing slash);
4. the page: streamed HTML from `renderToReadableStream`, with no hydration, an
   inline theme `<style>`, a Content-Security-Policy, `Cache-Control: public,
   max-age=0, s-maxage=31536000, stale-while-revalidate=86400` and
   `Vercel-Cache-Tag: site:<id>` (plus `form:<slug>` for each form the page
   embeds: purge that tag when you change the form, since the page cached the
   form it was rendered with).

The page loads one script, the islands loader (2.3 KB), and only when it has a
phone menu or a form. Pass `basePath` to mount a site under a path.

### Everything from the site itself

A published page loads its fonts, styles and scripts from the site, never from
a third party. No visitor's address goes to a font host, and the
Content-Security-Policy says so: `font-src 'self'`, `script-src 'self'`, and a
`style-src` that names only the site and the hash of the page's one inline
style.

**Fonts.** Every font choice but `system` is served from `/_gs/`: the latin
subset, one woff2 per weight the choice lists, content-hashed and immutable.
The page's inline style declares an `@font-face` for each weight, with
`font-display: swap`, and the page preloads the heading font's bold file. A
face with one weight (Bebas Neue) is declared for every weight, so a bold
heading draws it as it is, without a faux bold. Pass `fonts: false` to load no
files; the page then uses an installed font or the stack's fallback.

The choices (`FONT_CHOICES`): System, Inter, DM Sans, Work Sans, Montserrat,
Poppins, Space Grotesk, Source Serif, Merriweather, Playfair Display, Lora,
Barlow, Barlow Condensed, Oswald, Roboto Condensed and Bebas Neue. Bebas Neue
has one weight, so it is a heading font only (`BodyFontChoice` leaves it out).

The files come from the `@fontsource/*` packages at build time. All are under
the SIL Open Font License 1.1; their licences ship in
`dist/assets/fonts/LICENSES.txt`. They cost about 840 KB of woff2 (1.1 MB as
the base64 chunk the server holds). The handler loads that chunk on the first
font request only, never to render a page, and a visitor downloads only the
weights a page uses (about 20 KB each).

**Images.** A page's images and files should live on the site too: uploaded
with `putAsset`, or copied from an old site with `importAssets` (see
[Importing a site](#importing-a-site)). The publish check warns about one that loads from another
host. A site that sets `images: "own"` in its site document makes that an
error, and its page's policy narrows `img-src` to `'self' data:` plus the
store's asset origin (`SiteStore.assetOrigin`; the Supabase store's is its
storage origin). Other origins go in the publish's `assetOrigins` and, the
same list, in `handleSiteRequest`'s `assetOrigins`. Without it, `img-src` allows any https host, so existing
sites keep working.

**Publishing and the cache.** Wrap the editor's store with
`withCacheInvalidation` so publish and rollback purge `site:<id>`. Mind what
the purge does: on Vercel, `invalidateByTag` serves each cached page once more
while it regenerates, and `dangerouslyDeleteByTag` drops it. Use the delete
for a rollback that takes something down:

```ts
import { dangerouslyDeleteByTag, invalidateByTag } from "@vercel/functions";

const editorStore = withCacheInvalidation(store, (tags, { action }) =>
  action === "rollback" ? dangerouslyDeleteByTag(tags) : invalidateByTag(tags),
);
```

Archiving a site, or editing its brand, doesn't go through the store: purge
the tag there too (the database sends a `genesis_sites` notification on every
publish, rollback and archive, for a listener). A page rendered with a brand
that changed since the release was checked is served with a 5-minute cache
and a warning until you publish again. A failed purge is logged and rethrown.

A hidden section stays in the draft and is left out of the release, so it is
never public. A stored page that no longer parses is left out of the site
(and logged) rather than taking the whole site down.

**Preview.** `mode: "preview"` renders the drafts, with `noindex` and
`Cache-Control: private, no-store`, through a store signed in as the viewer,
so the database's `can_view` decides who sees them. Pass the signed-in
viewer's user id as `viewer`: without one, preview answers null before it
reads a draft (anon has no grant on them), and the host shows its sign-in
page or a 404. A failed read of the published posts on the live site logs and
renders an empty list (or, for one post, not found) instead of failing the page.

## Sections

| Type | Variants | Presets |
|---|---|---|
| `nav` | simple, centered, minimal | Header with menu; Centred header; Landing page header |
| `hero` | centered, split, image-bg | Centred hero; Hero with image |
| `features` | grid, list, alternating | Three features; Feature list |
| `cta` | banner, card, split | Banner; Card |
| `testimonials` | grid, single | Quotes; One quote |
| `faq` | accordion, list | FAQ |
| `pricing` | cards, compact | Three plans |
| `logos` | row, grid | Logo row |
| `stats` | row, cards | Three numbers |
| `gallery` | grid, masonry | Photo grid |
| `rich-text` | narrow, wide | Text |
| `form-embed` | card, split | Contact form; Form card |
| `footer` | simple, columns, minimal | Footer; Footer with columns |
| `schedule` | grid, agenda | Weekly timetable; Day by day |
| `team` | cards, list | Team cards; Team list |
| `blog-list` | grid, list | Blog index; Latest three |
| `post-body` | article, cover | Article; Title over the cover |
| `map` | split, stacked | Find us; Map and address |
| `timeline` | vertical, cards | Week by week; Steps as cards |
| `file` | list, cards | Downloads; File cards |

And inside the MVP sections: `features` has a `steps` variant (numbered,
a button and a note per step) and `numbered`; `pricing` takes plan `groups`
(each with its heading, anchor and up to 12 plans) beside or instead of
`tiers`; `logos` has a `trust-bar` variant (a short claim and badges), and an
item without an image is a text badge.

- **`schedule`**: the week's sessions by time and day, with a host ("with …";
  documents saved before version 2 keep an older key for it, which still
  renders and moves into `host`), place, a note and a booking link per
  session, and chips per session type in the brand's colours (`types`, with a legend). On
  wider screens it is a table (a caption, a header cell per day and per time,
  an empty slot said as `emptyText`, default "Nothing scheduled"); on a phone a day picker: radio buttons and the stylesheet's
  `:has()` show one day's sessions, with no script (every day shows where
  `:has()` isn't supported).
- **`team`**: photo, role, credentials, a long bio, a quote, a button and a
  link to the person's page (`profile`). The cards open each bio in place
  (`<details>`); the list shows it all. Each person can have an `anchor`.
- **`map`**: the address as text, a picture (`image`) and a link to the
  provider. No map frame is in the HTML: the islands loader shows a "Show
  the map" button, and only a click puts the OpenStreetMap or Google Maps
  frame on the page, so nothing loads from the provider before the visitor
  asks. The frame's URL is built from the address or the coordinates, never
  typed, and the page's Content-Security-Policy frames only that provider
  (`frameOrigins` on the definition).
- **`timeline`**: an ordered list of steps, each with a label (a date,
  "Week 1"), a title, copy, a picture and a button.
- **`file`**: downloads that say their type and size before anyone clicks
  ("PDF, 1.2 MB"). Upload a PDF with `putAsset`: it is stored under
  `sites/<site_id>/files/`.

### Links

Every button and link prop is a `Link`: `{ label, href, target?, external?,
event? }`. `external: true` marks an outbound link (a booking or
membership system): it must be an http(s) URL (checked when parsed, and
inert when rendered if a document skipped the check), and it renders with
`rel="noopener noreferrer"` and `data-gs-outbound`. `target: "_blank"` opens
an http(s) link in a new tab (never a site path), with a visually hidden
"(opens in a new tab)". `event` names the click for your analytics
(`data-gs-event`, `cta` by default on buttons).

Every section is server-safe React on Genesis UI (`Band`, `Display`,
`BandLead`, `Button`), sits on a surface (`base`, `muted`, `accent`,
`inverse`), takes its heading level from the page (one `h1`, from the first
hero), and passes axe's WCAG 2.2 A and AA rules in the tests. Stored links are
checked again when they render: only site paths, `#fragments`, `http(s)`,
`mailto` and `tel` links print; anything else renders as an inert link and is
logged. Rich text is sanitised by Genesis UI's `RichText`, and JSON-LD is
escaped so stored text can't close its `<script>`.

### Your own sections

```ts
import { defineSection, registerSection, Line } from "@marktiderman/genesis-sites";
import { z } from "zod";

registerSection(
  defineSection({
    type: "class-times",
    version: 1,
    label: "Class times",
    category: "content",
    schema: z.object({ heading: Line(90), rows: z.array(z.object({ day: Line(20), time: Line(20) })).max(14) }),
    variants: [{ id: "table", label: "Table" }],
    defaultVariant: "table",
    presets: [{ name: "Weekly times", variant: "table", props: { heading: "Class times", rows: [{ day: "Monday", time: "6 pm" }] } }],
    render: ({ props, ctx }) => <ClassTimes {...props} level={ctx.headingLevel} />,
  }),
);
```

`defineSection` checks the definition (every preset against the schema, a
migration for every version step) and freezes it. A built-in type is replaced
only with `registerSection(def, { replace: true })`. When props change shape,
raise `version` and add `migrations[n]`, a pure function from version `n - 1`
props; `migrateNode` runs the steps on read and a publish writes the result
into the release. `sectionJsonSchema(type)` gives the props' JSON Schema (for
editor fields and AI output) and `sectionManifests()` the editor's catalog.

## A neutral core, and industry templates

The core never names an industry: its schemas, sections, presets, defaults,
examples and docs read naturally for any business (a person and their role,
a session and its host). Industry flavour is template content, in
`src/templates/` and exported from `/templates`: per-section presets on the
sections' own preset shape, plus a sample brand and message for
`landingPage`, `onePageSite` and `starterSite`. A template never adds a code
path; a section renders the same whichever template its props came from.
The businesses in templates are made up.

```ts
import { industryTemplates } from "@marktiderman/genesis-sites/templates";

for (const template of Object.values(industryTemplates)) {
  template.presets.team; // SectionPreset[]: offer them beside the built-in ones
}
```

CI (`scripts/check-industry-words.mjs`, word list in
`scripts/industry-words.mjs`) fails on industry words anywhere in this
package but `src/templates/`.

## Publish checks

`store.publish` runs `prepareRelease`, which migrates every node and refuses
to publish (`PublishBlockedError`, with `issues`) when:

- a heading would break the outline: the renderer gives every page exactly
  one `h1` (the first hero's title, or the page title, visually hidden), so
  rich text may not hold another `h1` or skip a level, and a page has at most
  one hero;
- a brand colour pair the sections draw is under 4.5:1 (3:1 for the focus
  ring), in each colour scheme the site uses, or the publish wasn't given the
  brand to check;
- an image has no alt text and isn't marked decorative;
- a section is unknown, has invalid props or was saved by newer code;
- a template placeholder is still visible;
- a page path is malformed or reserved, or the site has no home page;
- on a site with `images: "own"`, an image, a file or the brand's logo loads
  from a host other than the site and the store's asset origin.

Warnings (an unknown variant, a page with no hero, a missing description, an
image from another host on any other site) don't block. An image from another
host says how to fix it: upload it again, or copy the old site's files with
`importAssets`.
`checkRelease`, `checkPage`, `checkContrast`, `checkAssetHosts` and
`checkHtmlOutline` are exported for an editor's lint panel. `checkPost` takes
the same `{ images, assetOrigins }` as its third argument; the stores pass the
site's setting when they publish a post.

## SEO

Each page gets a title from the site's template (`%s · Riverside Works`), a
description, `robots`, a canonical URL from `origin`, and Open Graph and
Twitter tags. The home page carries `Organization` and `WebSite` JSON-LD, and
every page below it a `BreadcrumbList`. `sitemap.xml` lists the indexable
pages; `robots.txt` points at it, or disallows everything for a `noindex` site
and in preview. Moving a page (`store.movePage`) leaves a 301 from the old
path and rewrites older redirects to point at the new one, so there are no
chains.

## Forms

A `form-embed` section names a form by slug. Your `forms` resolver says what
the slug is:

```ts
forms: (slug) =>
  slug === "free-class"
    ? { kind: "definition", definition: freeClass.definition, submitUrl: "/api/forms/free-class" } // your endpoint
    : slug === "crm"
      ? { kind: "definition", definition: enquiry.definition, submitUrl: "https://crm.example/hooks/riverside" } // another service's
      : slug === "write-to-us"
        ? { kind: "mailto", email: "hello@riverside.example", subject: "A question" } // no endpoint yet
        : slug === "waitlist"
          ? { kind: "embed", url: "https://forms.example/waitlist", title: "Join the waitlist" }
          : null,
```

- `submitUrl` is a site path or an https URL. An https endpoint's origin is
  added to the page's `connect-src` and `form-action`.
- `mailto` is the fallback for a site with no endpoint: a button that opens
  the visitor's email, with the subject you give (line breaks removed). No
  form is drawn, nothing is posted or stored, and a page never posts a form
  to `mailto:`.
- A genesis-forms definition with no logic, pages, recall or hidden inputs
  (most contact and sign-up forms) renders as a plain HTML form. The islands
  loader sends `{ form, answers }` as JSON, with answers keyed by field id as
  genesis-forms' `answers()` gives them. Without script, the browser posts the
  same fields as an ordinary form.
- A definition that needs the engine renders with forms-web's `<Form>`, and
  the form bundle loads on that page only.
- `embed` shows an https URL in a sandboxed iframe.

Either way, your endpoint checks the answers again (`validateSubmission` from
genesis-forms). An unknown slug renders nothing and logs.

## The blog

A site's posts live beside its pages, each with a draft and a published
copy (`site_posts`, migration `0002_genesis_sites_posts.sql`). A post goes
live on its own: `publishPost` checks the draft (`checkPost`: alt text on
its images, no `h1` and no skipped heading level in its text) and makes it
the published copy, without a new release of the site. `unpublishPost`
takes it down; `deletePost` removes it. A site's rollback doesn't touch its
posts.

```ts
const { id, rev } = await store.savePost(siteId, { slug: "first-class-tips", doc: { schemaVersion: 1, title: "Five tips for your first class", excerpt: "…", body } });
await store.savePost(siteId, { id, rev, slug: "first-class-tips", doc: edited }); // compare-and-swap: { conflict, rev } if someone saved first
await store.publishPost(id); // PublishBlockedError with `issues` when a check fails
```

The site's post page is a page of kind `post` (at most one, never `/`): the
template every post renders in. At its own path (`/blog`) it is the blog's
index; at `/blog/<slug>` it shows that post in its `post-body` section,
with the post's title as the page's `h1`, `og:type` article, `Article`
JSON-LD and a breadcrumb through the blog. A `blog-list` section lists the
published posts, newest first, in pages (`?page=2`, plain links), anywhere
on the site; on a post it leaves that post out. The sitemap lists every
published post, `/rss.xml` is the feed, and every page links to it.

Moving a blog in: `importPosts(siteId, posts)` takes up to 500 posts once,
each with its slug and its old `publishedAt`. A slug the site already has is
skipped, and a post that fails a check comes in as a draft with its
`issues`, so nothing goes live unchecked. Re-host its pictures first (see
Importing a site) and run `rewriteUrls` over each document.

Anon reads posts only through `genesis_sites.live_posts(site_id)` (the
published posts of a live site, without bodies) and `live_post(site_id,
slug)`; drafts are never public. `withCacheInvalidation` purges
`site:<id>` after a post goes up, comes down, is deleted or imported, and
the database sends a `genesis_sites` notification with `action: "post"`.

## Importing a site

```ts
import { importAssets, rewriteUrls } from "@marktiderman/genesis-sites/import";

const { map, assets, failed } = await importAssets(editorStore, siteId, oldImageAndPdfUrls, { alt: (url) => oldAlt[url] });
const page = rewriteUrls(importedPage, map); // image sources and file links now point at the copies
```

Each URL is fetched on your server, checked, and stored through the
store's `putAsset` (which records it in `site_assets`, with the image's
width and height) under `sites/<site_id>/` (a PDF under `files/`). An image
with no alt text yet is `needsAlt`; the publish check asks for it before
the page goes live. The fetch is guarded against server-side request
forgery:

- http and https only, ports 80 and 443, no user name or password in the URL;
- only public addresses: loopback, private, link-local (cloud metadata),
  carrier-grade NAT, documentation, benchmark, multicast and reserved
  ranges are refused, and so are their IPv6 forms (IPv4-mapped, NAT64,
  6to4, unique local, site-local);
- the address is checked on every address a name resolves to, when the
  socket connects (the request's own DNS lookup), so DNS rebinding can't
  slip past it, and the request uses a fresh agent, never a pooled socket
  or a proxy from the environment;
- every redirect is checked the same way, and at most three are followed;
- a size cap (15 MiB by default, by `Content-Length` and while reading)
  and a time limit (20 s);
- the type comes from the bytes: PNG, JPEG, GIF, WebP, AVIF or PDF. SVG,
  HTML and anything else are refused, whatever the name or `Content-Type`
  says; an image over 20000 pixels a side is refused too.

A URL that fails is listed in `failed` with the reason, and the rest go on.

## Who may edit

The migration asks two hooks, which ship as stubs that fail closed:

- `genesis_sites.can_edit(site_id uuid)` answers false;
- `genesis_sites.can_view(site_id uuid)`, for draft and release reads, asks
  `can_edit`.

Replace them in a migration of your own, after this one, with the same
signature:

```sql
create or replace function genesis_sites.can_edit(site_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.brand_members m
                 join public.brand_sites b on b.brand_id = m.brand_id
                 where b.site_id = can_edit.site_id and m.user_id = auth.uid() and m.role in ('owner', 'editor'))
$$;
```

`create or replace` keeps the grants. Name the person (`auth.uid()`) in the
hook: the write functions are security definer, so your tables' row level
security doesn't filter inside them. Genesis writes the stubs only through
`genesis_sites.ensure_hook_stubs()`, over a missing hook or the untouched
stub, so neither `genesis migrate` nor a later genesis-sites migration ever
overwrites your version. `genesis_sites.reserved_paths()` works the same way
for the page paths your app keeps.

`reserved_paths()` covers redirects too: `save_site_draft` and `publish_site`
refuse a redirect whose `from` is a reserved path (any case, with or without a
query string), so a site can't take over `/auth` or your app's other routes.
`handleSiteRequest` checks `reserved` before redirects and returns `null` for
a reserved path. Anon can't execute `reserved_paths()`, so the renderer never
reads it: pass the same list to `handleSiteRequest({ reserved })` yourself.

The accessibility and content checks run in the stores (`prepareRelease`)
before `publish_site`; the database checks shape, paths and revisions. So the
checks guide editors but are not a security boundary: an editor calling the
function directly can skip them (and reports its own `brand_hash`). Access
rules can't be skipped, and the renderer checks every link again. An archived
site stays down: an editor can't publish or roll it back.

Anon reads only `genesis_sites.live_release(site_id)`: the published snapshot
of a live site. Drafts, page rows and release notes are never readable by
anon. Sites are created with the service role (`genesis_sites.create_site`).
Store uploads under `sites/<site_id>/...` so your storage policies can scope
by site with `can_edit`; the migration's header has an example policy. Limit
the bucket's `allowed_mime_types` to images and PDF: never SVG or HTML, which
a browser runs as a page. `putAsset` refuses other types before it uploads.
A public bucket serves any file to whoever has its URL, so give uploads random
names (`putAsset` does) and never put anything there that isn't meant for the
published site.

## The editor

```bash
pnpm add @puckeditor/core@^0.23   # only where the editor runs
```

```tsx
import { SiteEditor } from "@marktiderman/genesis-sites/editor";

<div style={{ height: "100dvh" }}>
  <SiteEditor siteId={siteId} store={store} brand={brand} forms={forms} onPublish={(release) => purge(release)} />
</div>;
```

`SiteEditor` fills its parent, so give the parent a height. Props:

| Prop | |
|---|---|
| `siteId`, `store` | Any `SiteStore`: the Supabase store signed in as the editor, or the memory store. |
| `brand` | The site's brand: the canvas theme, and what publishing checks contrast against. |
| `forms?` | Your `FormsResolver`, so form embeds draw on the canvas and in preview. |
| `assets?` | `{ list?, upload?, maxBytes? }`: the image library, and an upload of your own instead of the store's `putAsset`. |
| `onPublish?` | Called with each new release. |
| `onDirtyChange?` | Called with whether anything isn't saved yet. Block your app's own navigation while it's true; closing the tab is guarded already. |
| `siteStylesheet?` | The site stylesheet's URL (`@marktiderman/genesis-sites/sites.css`, say through Vite's `?url`). Without it the canvas loads the renderer's bundled assets, a much larger download. |
| `reserved?` | Paths pages can't use (default: the store's rule, `DEFAULT_RESERVED_PATHS`). |
| `previewUrl?` | A link to your own preview route for a page path, shown in the Publish panel. |
| `readOnly?` | View only: the canvas, fields and SEO can't be changed; there is no Add picker, no page actions, no Publish and no Roll back; no autosaver is made, so nothing is saved. A "View only" note says so. |
| `autosaveDelay?`, `initialPageId?`, `className?` | |

What it does:

- **Generated from the registry.** Each section becomes one Add-picker entry
  per preset, grouped by category, with fields made from its JSON Schema:
  text and textareas, a select for its layout (variants) and for enums, the
  image picker for images, the Genesis rich text editor, objects (links),
  lists, one-per-line string lists, and Puck slots for props marked
  `x-genesis-kind: "slot"`. A section at its `limit` can't be added again. A
  prop the editor can't map shows as "can't be edited here" and warns in the
  console; it is kept as it is. Register a section and it appears; nothing in
  the editor changes.
- **The canvas** is an iframe drawn by each section's own renderer, with the
  site stylesheet and your brand's theme, and the site's header and footer
  as editable slots above and below the page. **Preview** runs the real
  `/web` handler on the drafts (and **View it live** on the live release)
  in a sandboxed frame with no scripts.
- **Autosave** saves a moment after each change by compare-and-swap. If
  someone else saved first, it stops, keeps your edits, and asks: load their
  version, or keep yours. Closing the tab with unsaved changes asks first;
  for a route change in your app, use `onDirtyChange` to ask. When the editor
  unmounts with changes still waiting it saves them on the way out, but it
  can't wait for that save, so a host that must not lose them asks first.
  Undo and redo are Puck's history (the toolbar, or Ctrl+Z and Ctrl+Shift+Z).
- **Pages**: open, add (blank, the landing page from your brand, or a starter
  site page), change an address (the old one redirects with a 301; reserved
  paths are refused), delete, and edit the header menu. Reordering pages
  needs a store with `reorderPages(siteId, pageIds)`; without it the list is
  in the store's order.
- **Publish**: the publish checks run on the saved drafts and errors block
  the button. While a publish runs the canvas is read-only and autosave
  waits, so no edit races the store's own re-saves; afterwards the editor
  takes the new revisions and saves anything that waited; "Show" selects the section a check is about. Publish with a
  note, see the release history, and roll back. Per-page SEO (search title,
  description, share image, noindex) is in the same panel.
- **Images** come from an upload, the library, or a link; every one needs alt
  text unless it is marked decorative. SVG isn't accepted.
- **Accessible**: every field has a label; nothing needs dragging (each
  Add-picker entry has an Add button, and the selected section's Up, Down
  and Remove buttons sit above its fields); actions are announced; and the
  panels are Genesis UI tabs and dialogs. Puck's canvas and outline still
  move sections only by dragging.

Puck is an optional peer dependency (`@puckeditor/core`): an app that only
serves sites never installs it, and the root, `/web` and `/sections` never
import it. It stays inside `/editor`: import everything from here (it re-exports `usePuck`, `createUsePuck` and the
`PuckConfig`, `PuckData` and `PuckOverrides` types for extensions), and
never from `@puckeditor/core`. `/web` never imports the editor, so published
pages carry no Puck code. The lower-level pieces are exported too:
`createEditorConfig`, `sectionFields`, `toEditorData` and `fromEditorData`,
`Autosaver`, and `checkSite`, `publishSite`, `renamePage` and
`pageTemplates`.

The sample app's `/sites-editor` route is a working demo on the memory store.

## Stores

`createSupabaseSiteStore(client)` uses the `genesis_sites` functions: pass a
client signed in as the editor for drafts and publishing, or an anonymous one
for `getLive`. `createMemorySiteStore()` keeps the same rules in memory, for
tests, demos and local previews. Draft saves compare and swap a revision: a
save from an old revision returns `{ conflict, rev }` with the current
document instead of overwriting it.

## Hostnames

The package keeps no hostname table. Resolve the request's host to a site id
yourself (strip any inbound tenant header), pass it as `siteId`, and pass the
site's primary hostname as `origin`. The design note covers custom domains on
Vercel.

## License

MIT. The font files it serves are under the SIL Open Font License 1.1 (see
`dist/assets/fonts/LICENSES.txt`).
