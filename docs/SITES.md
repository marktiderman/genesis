# Genesis Sites: design

Status: the landing-page and multi-page MVP is built in `packages/sites`
(`@marktiderman/genesis-sites`, October 2026), and so is the editor
(`/editor`, on Puck 0.23).
This document records the design and why it was chosen. The package's
[README](../packages/sites/README.md) is the reference for using it.

Genesis Sites covers multi-page sites and single landing pages, both built from
a brand.

## Decisions

1. **Engine: Puck (`@puckeditor/core`) for the editor only.** Genesis keeps its
   own document format, section registry and renderer. Puck is MIT and active
   (v0.23.0, 7 Aug 2026; 13.5k stars). It supports React 18 and 19, and its
   rich-text field is built on TipTap, which genesis-ui already uses at 3.31.
   Published pages never load Puck. The renderer is a small Genesis map from
   section type to component, so Puck can be replaced later without touching
   stored data.
2. **MVP scope: one site, its pages, and a one-click landing page from the
   brand.** 13 sections; the theme from brand tokens; nav and footer; per-page
   SEO plus sitemap.xml and robots.txt; draft, preview, publish and rollback; a
   form embed through genesis-forms; publish-time accessibility checks; and
   static-like rendering with no client JS beyond a small loader. Autosave and
   undo arrive with the editor. Out of scope: free-form positioning, A/B
   testing, localisation, blog collections and AI.
3. **Data model:** `site → pages → sections → (blocks via slots)`. Site-wide
   parts (theme overrides, navigation, header, footer, SEO defaults, redirects)
   live in a site draft document. Each page has its own draft. A publish writes
   one immutable **release** of the whole site, and the live site points at it.
   Rollback moves that pointer. Every section node carries a props version, and
   migrations are pure functions registered with the section.
4. **One package**, `@marktiderman/genesis-sites`, with subpaths `.` (schemas,
   registry, migrations, SEO, a11y, theme, templates, the store contract),
   `/sections`, `/web` (renderer and request handler), `/supabase` (the store),
   `/blocks` and `/editor` (the Puck adapter). Its migrations live
   in the package's `migrations/`, and `sitesBlock` (from `defineBlock`, also
   declared under `genesis.blocks` in its package.json) names them, so
   `genesis add sites` installs them.
5. **Build plan:** five phases (spike, landing MVP, multi-page and SEO, growth
   V1, later); see the end of this document. The MVP covers phases 2 and 3.

## 1. What the leaders do

| Product | What users love | Data model | Copy | Avoid |
|---|---|---|---|---|
| **Shopify OS 2.0** | Sections everywhere; presets in the Add picker; theme settings | JSON template: `sections{id:{type,settings,blocks,block_order,disabled}}` plus `order`. Limits: 25 sections, 50 blocks. A section schema declares `settings`, `blocks`, `max_blocks`, `presets`, `limit`, `enabled_on` | **Almost all of it.** Id-keyed sections, an `order` array, `presets`, `limit`, `enabled_on`, a `disabled` flag | Liquid; split-file schemas |
| **WordPress Gutenberg** | Patterns (synced and unsynced); `theme.json` global styles | Block tree serialised in HTML comments; `theme.json` holds tokens | Patterns as starter content; synced patterns become "global sections"; low-specificity global styles | Markup as storage; plugin sprawl |
| **Squarespace 7.1 / Fluid Engine** | Beautiful defaults; section templates; separate mobile layout | Section → grid of blocks, with a desktop layout and a mobile layout | Curated section designs; mobile reorder | Two hand-kept layouts that drift apart |
| **Webflow** | Design power; CMS; page branching; staging; backups | DOM tree plus classes; collections | Staging URL; backups and restore; single-page publish | Box-model complexity for non-designers |
| **Framer** | Speed; motion; built-in CMS, locales and A/B (up to 5 variants, cookieless) | Canvas of components | Built-in experiments that cause no layout shift; localised paths | Free positioning |
| **Wix Studio** | Responsive AI; team handoff | Proprietary | Roles; AI layout fixes | Lock-in; heavy runtime JS |
| **Carrd** | One page, minutes, cheap | Flat element list | **One page from one form.** Zero-config publish | Flat model that cannot grow |
| **Unbounce / Leadpages / Instapage** | Landing templates; A/B; Smart Traffic (automatic per-visitor routing) | Page plus variants | Variants as copies of one page with a traffic split | Weak multi-page support |
| **Notion Sites / Super** | Write in a doc and get a site | Doc blocks | A rich-text section for long copy | Thin design control |
| **Relume** | Sitemap → wireframe → style guide, AI copy in 1,000+ components | Sitemap of section lists | **The AI flow**: plan pages, pick sections, write copy, then style | It stops at export |

Sources: [Shopify JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates), [Shopify section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema), [WP global styles engine](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-global-styles-engine/), [Fluid Engine](https://support.squarespace.com/hc/articles/6421525446541), [Webflow page branching](https://help.webflow.com/hc/en-us/articles/46651751861139-Page-branching), [Webflow backups](https://help.webflow.com/hc/en-us/articles/33961244069395-Save-and-restore-backups), [Framer A/B](https://www.framer.com/help/articles/how-to-run-an-a-b-test-on-your-framer-site/), [Framer pricing](https://www.framer.com/pricing), [Unbounce Smart Traffic](https://unbounce.com/marketing-ai/smarter-approach-to-conversion-optimization/), [Relume](https://relume.io/).

**Takeaway:** copy Shopify's sections with presets, rendered through
Squarespace-grade defaults. Relume's flow drives the AI, and Carrd's single
form drives the landing page. Free positioning (Webflow, Framer, Fluid Engine)
is what makes those tools hard to learn and hard to keep on brand. It conflicts
with "locked into the design system", so we leave it out.

## 2. Open-source engines

GitHub and npm figures were checked on 24 Oct 2026.

| Engine | Licence | Maturity | React 19 | SSR/RSC | Data | Fit |
|---|---|---|---|---|---|---|
| **Puck** `@puckeditor/core` | MIT | v0.23.0 (Aug 2026), 13.5k stars, monthly releases. `@measured/puck` is deprecated | peer `^18 \|\| ^19` | `<Render>` and `resolveAllData` run in RSC (`/rsc` export) | `{root:{props}, content:[{type, props}]}`, with slots inline as array props | **Best.** Components are plain React with a fields config. `overrides` restyles the chrome. TipTap rich text, `transformProps` and `migrate`, permissions, history |
| Craft.js | MIT | Last release Feb 2025 (0.2.12) | peer allows 19 | Editor only | Serialised node map | Stalled; you build all the UI |
| GrapesJS | BSD-3 | v0.23.8 (Oct 2026), 26k stars | Wrapper, not React | Stores HTML/CSS | HTML/CSS plus a component JSON | Stores markup, not our components |
| Builder.io SDK | MIT SDK | Active | Yes | Yes | Hosted content API | The editor is a SaaS. Lock-in |
| Plasmic | MIT | Active | Yes | Yes | Hosted project | Same: hosted studio |
| Payload blocks field | MIT | 45k stars, active | Yes | Yes | `blocks: [{blockType,...}]` | A CMS, not a visual editor. Second admin app |
| TinaCMS | Apache-2.0 | Active (3.15, Oct 2026) | Yes | Yes | Git/markdown-first | Git-backed model does not fit Postgres |
| Easyblocks | AGPL-3.0 | No push since Aug 2024 | — | — | — | Licence and dormancy rule it out |

Sources: [Puck docs](https://puckeditor.com/docs) (Context7 `/websites/puckeditor`), [Puck RSC](https://puckeditor.com/docs/integrating-puck/server-components), [Puck data migration](https://puckeditor.com/docs/integrating-puck/data-migration), [Puck 0.21](https://puckeditor.com/blog/puck-021), [Puck 0.23](https://puckeditor.com/blog/upgrading-to-puck-023), GitHub API for each repo.

**Puck, behind a seam:**

- **Storage.** Genesis stores a `PageDoc` that is Puck-compatible by
  construction: `content` is an array of `{type, props}`, and nesting uses
  slots. The editor hands it to Puck unchanged.
- **Published pages** use `@marktiderman/genesis-sites/web`, which never
  imports Puck. That keeps the editor out of the page bundle and lets us swap
  engines.
- **Editor fields** are derived from each section's zod schema
  (`sectionJsonSchema`, from `z.toJSONSchema`), so the schema stays the single
  source of truth for validation, editor fields and AI output.
- **No Puck AI.** It needs the separate `@puckeditor/plugin-ai` package and a
  paid Puck Cloud account ([getting started](https://puckeditor.com/docs/ai/getting-started)).
  Generation is built on our own schemas instead (phase 4).
- **Fallback.** If Puck became unsuitable, a thin Genesis editor (a section
  list, a fields sheet, an iframe preview) fits this model. Puck mainly saves
  us the drag-and-drop canvas and inline editing.

## 3. Features by tier

| Area | MVP | V1 | Later |
|---|---|---|---|
| Sections | nav, hero, features, CTA, testimonials, FAQ, pricing, logos, stats, gallery, rich text, form embed, footer (13) | team, schedule, blog list, video, map, contact details | custom code (admin only), synced "global sections" |
| Theme | Tokens from the brand (colour, fonts, radius); light, dark or both; site overrides limited to token choices | Several palettes per site | Motion presets |
| Variants | 2–4 named layouts per section (`centered`, `split`, `image-left`); presets for the Add picker (Shopify `presets`); a surface per section (`base/muted/accent/inverse`) | — | — |
| Responsive | Mobile-first token CSS; per-section `hideOn`; image focal point | Mobile order of columns | No per-breakpoint free layout |
| Templates | **One-click landing page**: brand plus a message produce nav, hero, features, testimonials, CTA, form and footer. A 3-page starter site. A one-page site seeded from a name, logo, message and brand colours and fonts | Template gallery | — |
| Pages/nav | Pages with clean slugs; nav and footer menus; a 404 page | Nested menus | — |
| SEO | Title, description, OG/Twitter image, canonical, `noindex`; sitemap.xml; robots.txt; JSON-LD `Organization`/`WebSite`/`BreadcrumbList`; automatic redirect on slug change | Redirect manager; `LocalBusiness`, `Event`, `Article` | — |
| Performance | Server-rendered HTML; no hydration; one loader script under 5 KB for the phone menu and plain forms; width/height on images; fonts preconnected | Image CDN transforms (`srcset`, AVIF/WebP); LCP image priority | — |
| A11y (WCAG 2.2 AA) | Renderer assigns heading levels (one `h1`, from the hero); contrast of brand pairs at 4.5:1 (1.4.3) blocks publish; alt text required; focus visible; 24px targets (2.5.8) | Lint panel in the editor | — |
| Publishing | Draft, private preview, publish, release history, rollback | Scheduled publish; single-page publish | Approval workflow |
| Domains | Host app (see §5) | — | — |
| Forms | genesis-forms embed; submissions through the host's endpoint | Lead inbox | — |
| Analytics | `data-gs-event` on CTAs; host analytics adapter | Conversion goals | — |
| A/B | — | Page variants with an even split and a cookieless bucket (Framer model) | Automatic routing (Smart Traffic) |
| i18n | — | Locales as `pages.locale`, `hreflang` | Translation workflow |
| CMS | — | `posts` collection, list and detail templates | Custom collections |
| AI | — | Prompt plus brand produce a sitemap, then sections and copy (Relume flow), as JSON validated against section schemas | Image generation; rewrite a section |
| Collab | Site roles from host RLS; compare-and-swap saves | Autosave and undo/redo (Puck history); presence; comments | Branching |
| Schema | Versioned section props plus migrations | `genesis sites migrate` backfill | — |

FAQ structured data is still worth emitting, but Google now shows FAQ rich
results only for a narrow set of authoritative sites
([Search Central, Aug 2023](https://developers.google.com/search/blog/2023/08/howto-faq-changes)).
Do not sell it as a ranking feature.

## 4. Data model

### Documents (zod 4, in core)

```ts
const SectionNode = z.object({
  id: z.string(),                 // stable, alphanumeric (Shopify rule)
  type: z.string(),               // registry key, e.g. "hero"
  v: z.number().int(),            // props version
  variant: z.string().optional(),
  hidden: z.boolean().optional(), // Shopify `disabled`
  hideOn: z.array(z.enum(["mobile", "desktop"])).optional(),
  placeholder: z.boolean().optional(), // template copy someone must replace; blocks publish
  props: z.record(z.string(), z.unknown()), // validated by the section's schema
});
const PageDoc = z.object({
  schemaVersion: z.literal(1),
  root: z.object({ props: z.looseObject({ title: z.string(), hideSiteChrome: z.boolean().optional() }) }),
  content: z.array(SectionNode),  // Puck `content`; nested blocks are slot props
  seo: Seo.optional(),            // title, description, ogImage, canonical, noindex
});
const SiteDoc = z.object({
  schemaVersion: z.literal(1),
  name: z.string(), lang: z.string(),
  theme: z.object({ colorScheme: z.enum(["light", "dark", "auto"]), overrides: TokenOverrides.optional() }),
  header: z.array(SectionNode), nav: z.array(MenuItem), footer: z.array(SectionNode),
  seo: SeoDefaults,
  redirects: z.array(z.object({ from: PagePath, to: Href, status: z.union([z.literal(301), z.literal(302)]) })),
});
```

Links are a site path, a `#fragment`, or an `http(s)`, `mailto` or `tel` URL,
checked when a document is parsed and again when it renders. Images load from
a site path or `https`. `javascript:`, `data:`, protocol-relative and
backslash tricks are refused.

### Section definitions

They mirror `registerContentType` in genesis-forms
(`packages/forms/src/fields.ts:227`): a `Symbol.for` global registry with
frozen manifests, and a built-in kind is replaced only with
`{ replace: true }`.

```ts
export const hero = defineSection({
  type: "hero", version: 2, label: "Hero", category: "intro",
  schema: z.object({ heading: z.string().max(90), body: z.string().optional(), cta: Link.optional(), image: Image.optional() }),
  variants: [{ id: "centered", label: "Centered" }, { id: "split", label: "Image beside" }],
  defaultVariant: "centered", limit: 1, enabledOn: ["page", "landing"], providesH1: true,
  presets: [{ name: "Centered hero", variant: "centered", props: {/*…*/} }],
  migrations: { 2: ({ title, ...p }) => ({ ...p, heading: title }) }, // v1 → v2
  render: HeroSection,                 // server-safe React built from genesis-ui
});
```

- **Migrations.** `migrateNode` runs `migrations[v+1..version]` on read, in
  both the editor and the renderer. A publish writes migrated props into the
  release. An unknown `type` renders nothing, logs loudly and fails the
  publish check.
- **Derived outputs.** `sectionJsonSchema(type)` (`z.toJSONSchema`, input side)
  produces the editor's fields and the AI output schema from the same
  definition; `sectionManifests()` is the editor's catalog without renderers.

### Postgres

The tables live in schema `genesis_sites`, installed by `genesis add sites`
(`packages/sites/migrations/0001_genesis_sites.sql`).

```sql
sites(id uuid pk, name text, slug text unique, draft jsonb /*SiteDoc*/, draft_rev int,
      live_release_id uuid null, status text check (status in ('draft','live','archived')), created_at, updated_at)
site_pages(id uuid pk, site_id uuid fk, path text, kind text /*page|landing*/,
      draft jsonb /*PageDoc*/, draft_rev int, sort int, deleted_at timestamptz,
      unique(site_id, path) where deleted_at is null)
site_releases(id uuid pk, site_id uuid fk, number int, snapshot jsonb /*SiteDoc + every PageDoc, migrated*/,
      note text, brand_hash text, created_by uuid, created_at, published_at timestamptz null,
      unique(site_id, number))           -- immutable: an update raises
site_assets(id uuid pk, site_id uuid fk, path text /*sites/<site_id>/...*/, mime text /*no SVG*/,
      width int, height int, alt text, blurhash text)
-- V1: site_posts(site_id, slug, data jsonb, status, published_at); site_experiments(page_id, variants jsonb, split int[], status)
```

**The RLS seam.** Genesis owns the tables, and the host owns the meaning of
"who may edit". The migration ships stubs that fail closed:

- `genesis_sites.can_edit(site_id uuid) returns boolean` answers false.
- `genesis_sites.can_view(site_id uuid)`, for draft preview reads, asks
  `can_edit`.
- `genesis_sites.reserved_paths()` lists the path prefixes a page can't use
  because the site shares its hostname with the app (`/api`, `/_server`,
  `/auth`, `/_gs`).

The host replaces them with `create or replace` in its own migration (for
example, a join to its brand membership that names `auth.uid()`), which keeps
their grants. The stubs are written only by `genesis_sites.ensure_hook_stubs()`,
and only over a missing hook or the untouched stub, so neither a re-run nor a
later genesis-sites migration overwrites a host's version; a package test
fails if any migration creates a hook with a statement of its own. A hook must
name the person itself: the write functions are security definer, so the
host's own RLS doesn't filter inside them.

- **Editing.** Reads of drafts, pages, releases and assets are policies
  `using (genesis_sites.can_view(site_id))`; recording and removing an upload
  use `can_edit`. There are no other table write grants.
- **Public reads.** Anon reads only `genesis_sites.live_release(site_id)`: the
  live release of a live site, without its editors' note. Drafts are never
  readable by anon.
- **Writes go through functions.** `save_page_draft(page_id, expected_rev, doc)`
  compares and swaps the revision (raising `GS409` on a conflict) and rechecks
  the page's path against `reserved_paths()`. `publish_site(site_id,
  expected_site_rev, expected_pages, note, brand_hash)` validates the
  documents and paths, snapshots exactly the revisions the client checked, and
  moves the pointer. `rollback_site(site_id, release_id)` repoints.
  `move_page` leaves a 301 and rewrites older redirects so there are no
  chains. Each is security definer with a pinned `search_path`, asks
  `can_edit` before it locks anything, and is granted by name to
  `authenticated` only. Sites are created by the service role
  (`create_site`).
- **Checks.** The accessibility and content checks run in TypeScript
  (`prepareRelease`) before `publish_site`; the database checks shape, size,
  paths and revisions. An editor calling the function directly can skip the
  accessibility checks, never the access rules.
- **Takedowns.** An archived site serves nothing, and an editor can't
  publish or roll it back. A hidden section is left out of every release, so
  it is never public. A trigger on `sites` sends
  `pg_notify('genesis_sites', …)` whenever what a site serves changes
  (publish, rollback, archive, unarchive), for a listener that purges the
  cache.
- **Audit.** Hosts add their own triggers (for example, genesis-studio's audit
  trail).

### Storage interface (core)

```ts
interface SiteStore {
  getLive(siteId: string): Promise<Release | null>;              // public render path
  getDraft(siteId: string): Promise<{ site: SiteDoc; rev: number } | null>;
  saveSiteDraft(siteId: string, rev: number, site: SiteDoc): Promise<SaveResult<SiteDoc>>;
  listPages(siteId: string): Promise<PageMeta[]>;
  getPageDraft(pageId: string): Promise<PageDraft | null>;
  savePageDraft(pageId: string, rev: number, doc: PageDoc): Promise<{ rev: number } | { conflict: PageDoc; rev: number }>;
  createPage, movePage, deletePage,
  publish(siteId: string, o?: { note?: string; brand?: BrandInput }): Promise<Release>;
  rollback(siteId: string, releaseId: string): Promise<Release>;
  listReleases(siteId: string): Promise<ReleaseMeta[]>;
  putAsset?(siteId: string, file: Blob, meta?: AssetMeta): Promise<Asset>;
}
interface BrandSource { getBrand(siteId: string): Promise<BrandInput | null> } // host-implemented
```

The brand is read at render time, not copied into the site, so a brand edit
restyles the site on its next render. The release records the hash of the
brand it was checked against. `/supabase` exports
`createSupabaseSiteStore(client)`, and `createMemorySiteStore()` backs tests,
demos and previews with the same rules.

## 5. Rendering

- **Per-request, cached HTML.** `handleSiteRequest(req, { store, brand,
  siteId, reserved?, forms? })` in `/web` returns a `Response`, or `null` for a
  reserved or unknown path so the host falls through to its own app. It looks
  up the live release, answers robots.txt and sitemap.xml, matches redirects
  first, renders with `renderToReadableStream`, and does not hydrate. Mounting
  it beside the host's TanStack Start or React Router app, as a plain route or
  a Vercel function, avoids depending on any framework's partial hydration.
- **Islands.** One loader script (2.3 KB) loads only on a page with a phone
  menu or a form: it closes the `<details>` menu on Escape, a link or an
  outside click, and sends a plain HTML form (the usual contact or sign-up
  form) as JSON to the host's endpoint. A form that needs the genesis-forms
  engine (logic, pages, recall, hidden inputs) renders with forms-web's
  `<Form>` and loads the form bundle on demand; pages without one never
  download it. The form embed names its form by slug, and the host's `forms`
  resolver says what it is.
- **Theme.** `themeFromBrand(brand).variables` (from genesis-design-system,
  `packages/design-system/src/factories/from-brand.ts`) plus the genesis-ui
  role variables, with foregrounds picked for contrast, are serialised into
  one `<style>` per site. The section CSS is shared and static, so a single
  stylesheet serves every brand. A Content-Security-Policy pins the style by
  hash.
- **Caching.** Pages carry `Cache-Control: public, max-age=0,
  s-maxage=31536000, stale-while-revalidate=86400` and `Vercel-Cache-Tag:
  site:<id>`. A store wrapped in `withCacheInvalidation` purges the tag after
  publish and rollback (for example with `invalidateByTag` from
  `@vercel/functions`); invalidation serves stale content once while it
  regenerates, which avoids a stampede
  ([Vercel cache tags](https://vercel.com/changelog/tag-based-cache-invalidation-now-available-for-all-responses),
  [purge](https://vercel.com/docs/cdn-cache/purge)). Full SSG is unnecessary:
  a cached SSR page is equivalent and needs no rebuild per publish
  ([TanStack Start ISR](https://tanstack.com/start/latest/docs/framework/react/guide/isr)).
- **Scheduled publish (V1).** `pg_cron` publishes releases that are due, then
  calls the same invalidation.
- **Hostnames (host app).** One deployment serves every tenant. The host keeps
  a hostname-to-site table (hostname primary key, site id, verified flag,
  primary flag, plus a `*.platform-domain` subdomain fallback). It adds domains
  and gets automatic certificates through the Vercel Domains API or SDK. Its
  proxy resolves `Host` to a site id and strips any inbound tenant header
  ([Vercel for Platforms](https://vercel.com/docs/platforms),
  [routing](https://vercel.com/docs/platforms/multi-tenant-platforms/middleware-and-routing)).
  The resolved id is passed to `handleSiteRequest`, with `origin` set to the
  primary hostname for canonical URLs. The package keeps no hostname table.
- **Preview.** `mode: "preview"` renders the drafts with `noindex` and
  `no-store`, through a store signed in as the viewer, so `can_view` decides.
  The editor's iframe uses the same renderer.
- **Native.** The renderer is web-only. The native app previews sites in a
  WebView.

## Package layout

```
packages/sites/                  @marktiderman/genesis-sites
  src/core/      schemas, defineSection, registry, migrate, seo (meta, sitemap, robots, JSON-LD,
                 redirects), a11y (contrast, heading order, alt), theme (brand → CSS vars),
                 templates, the SiteStore contract and the memory store
  src/sections/  the catalog: server-safe React on genesis-ui (Band, Display, BandLead)
  src/web/       SiteRenderer, handleSiteRequest, the generated assets
  src/islands/   the loader (menu, light forms) and the form island
  src/supabase/  createSupabaseSiteStore
  src/blocks.ts  sitesBlock = defineBlock({ id: "sites", platforms: ["web", "server"], contributes: { migrations, privacy } })
  migrations/    0001_genesis_sites.sql (+ tests/0001_genesis_sites.test.sql)
  src/editor/    SiteEditor: the Puck config from the registry, Genesis-styled overrides, the canvas,
                 autosave (Autosaver), the Pages and Publish panels, the image picker
```

## Phased build plan

1. **Spike.** Puck inside the Genesis docs app with three sections. Store
   `PageDoc`, render through `/web` with no Puck import, and measure the page
   JS (target 0 KB plus islands).
2. **Landing MVP** (built). Core schemas, 13 sections, theme from the brand,
   the one-click landing page, the form embed, the Supabase migration and
   store, draft/preview/publish/rollback, cache tags, a11y and SEO basics.
3. **Multi-page** (built, without the release history UI). Pages, nav and
   footer, sitemap and robots, redirects on slug change, starter sites.
4. **Editor and growth V1.** The Puck editor, scheduled publish, A/B variants
   with conversion events, posts collection, locales, AI generation (sitemap →
   sections → copy, validated against section JSON Schemas), presets gallery.
5. **Later.** Global sections, comments and presence, automatic traffic
   routing, image generation, custom code.

## Notes from the repo

- **No `fromBrand` export.** The factories are `tailwindFromBrand` and
  `themeFromBrand` in `packages/design-system/src/factories/from-brand.ts`.
- **`CanonicalBrand` isn't consumed by the theme provider yet** (its doc
  comment defers that to "Phase A2b"), so the sites renderer emits
  `themeFromBrand` variables itself.
- **The brand schema has no logo field.** The logo comes from the host's
  `BrandSource`. Fonts exist as `typography.fontFamily`; a site's fonts are a
  fixed list of choices (`FONT_CHOICES`).
- **genesis-ui `Section` is an app-page section** (heading `text-xl`). Marketing
  bands needed a display type scale and a full-bleed surface primitive, added
  to genesis-ui as `Band`, `BandLead` and `Display`
  (`@marktiderman/genesis-ui/band`).
- **zod versions are mixed.** `core` and `features` accept zod 3 or 4 as a
  peer. `z.toJSONSchema` needs zod 4, so `genesis-sites` requires zod 4 and
  says so at import.
- **`@measured/puck` is deprecated** in favour of `@puckeditor/core`.

## Notes from building the editor (Puck 0.23)

- **Data mapping.** A `SectionNode` keeps `id`, `v`, `variant`, `hidden`,
  `hideOn` and `placeholder` beside `props`; Puck keeps everything in
  `props`. The editor carries the node fields as `_variant`, `_v`, `_hidden`,
  `_hideOn` and `_placeholder` (reserved: a section schema using one throws)
  and maps both ways (`toEditorData`, `fromEditorData`). Stored documents
  never hold a Puck-only key.
- **Presets** are extra Puck components named `type@n`, mapped back to
  `type` on save. **Limits** use each component's `permissions.insert`, read
  through a getter so it reflects the page's current counts.
- **Header and footer** are slots on Puck's root (zones `root:header`,
  `root:footer`), so the canvas edits the whole page; they save to the site
  draft and the rest to the page draft, each with its own autosave.
- **Puck copies `metadata`**, so it carries plain objects, not Maps.
- **Root slots fill the frame** (Puck's drop zone is `height: 100%`); the
  editor passes `height: auto`.
- **Host styles.** Puck copies the host app's stylesheets into the iframe
  (its own canvas styles are among them) and copies them again when they
  change; the editor keeps the site stylesheet and theme last, with the theme
  on `html:root`, so the canvas draws what publishes.
- **Dragging isn't enough** (WCAG 2.5.7): each Add-picker entry has an Add
  button that inserts at the end of the right zone.
