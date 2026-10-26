# @marktiderman/genesis-sites

## 0.3.1

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.3.0

### Minor Changes

- 1bc3e37: Add the visual editor, `@marktiderman/genesis-sites/editor`: `<SiteEditor siteId store brand forms? assets? onPublish? />`.

  - The Puck config is generated from the section registry: fields from each section's JSON Schema (text, textarea, rich text, links, the image picker, selects for variants and enums, lists, slots), one Add-picker entry per preset grouped by category, and each section's `limit` enforced in the picker.
  - The canvas is an iframe drawn by the sections' own renderers with the site stylesheet and the brand's theme; Preview runs the real `/web` request handler in a sandboxed frame.
  - Pages panel: open, add (blank, the landing page from the brand, the starter site's pages), change an address (a 301 is written; reserved paths are refused), delete, and the header menu. Reordering uses the store's optional `reorderPages`.
  - Autosave by compare-and-swap (`Autosaver`): edits made during a save or a conflict are kept; a conflict offers loading the other version or keeping yours. Undo and redo come from Puck's history.
  - Publish panel: the publish checks (errors block), preview, publish with a note, release history and rollback, and per-page SEO (title, description, share image, noindex).
  - Image picker over the store's `putAsset` (or the host's upload), with alt text required unless the image is decorative.
  - Styled with Genesis UI through Puck's overrides. Puck (`@puckeditor/core` ^0.23) is an optional peer dependency: install it where the editor runs. Apps import everything from `/editor`; the root, `/web` and `/sections` never load it.

### Patch Changes

- 7765add: The site editor no longer saves over another editor's work after a publish: a change made while publishing is saved on the new revision only when the store still holds what the publish left; otherwise it meets the conflict dialog. While a publish runs (or in view-only mode) the Add, Up, Down and Remove buttons and the menu editor are off too. A slot inside an object or a list item is reported as "can't be edited here" instead of being treated as a top-level slot.
- e4f1d0a: Editor fixes from review:

  - `@puckeditor/core` is an optional peer dependency instead of a dependency: install it where `/editor` runs. The root, `/web`, `/sections`, `/supabase` and `/blocks` never import it.
  - A publish no longer re-saves every draft: `migrateNode` reports a change only when a node's version or variant moves or a migration step changes its props, compared by content (`stableHash`), not by key order or zod's defaults. `migratePage` and `migrateSite` always return the parsed nodes. The editor saves the parsed page, `Autosaver`'s default `equals` is `stableHash`, and placeholder detection ignores key order and empty values.
  - While a publish runs, the canvas is read-only and autosave is paused (`Autosaver.pause()` and `resume()`); afterwards the editor adopts the new revisions and saves what waited.
  - Unmounting with unsaved changes saves them, best effort. `onDirtyChange(dirty)` tells the host when there are unsaved changes, so it can ask before a route change.
  - `readOnly`: view only, with no Add picker, page actions, Publish or Roll back, no autosave, and a "View only" note.
  - "Load their version" keeps the header's and footer's sample sections marked as samples.
  - The canvas's fallback theme uses the design system's default brand, and library images get the same address check as links.

## 0.2.0

### Minor Changes

- 2586999: Sites V1: the sections, blog and import a real multi-page site needs.

  - Seven new sections, each with variants, presets, a JSON Schema for the editor, and axe checks: `schedule` (a weekly timetable: an accessible table on wider screens, a day picker that needs no script on a phone, chips per class type, empty slots said aloud), `team` (photo, role, credentials, a long bio that opens in place, a quote, a link to a person's page), `blog-list` and `post-body` (the blog), `map` (OpenStreetMap or Google Maps behind a click: no provider frame on the page until the visitor asks, a picture and the address until then, and the page's Content-Security-Policy frames only that provider), `timeline` (an ordered programme) and `file` (downloads that say their type and size).
  - Inside existing sections: `Link` takes `external` (an outbound booking link: http(s) only, `rel="noopener noreferrer"`, `data-gs-outbound`), `target` and an analytics `event`; pricing takes plan groups with their own headings and anchors, up to 12 plans each; features takes a `steps` variant and `numbered`, with a button and a note per item; logos takes text badges and a `trust-bar` variant with a short claim.
  - The blog: `PostDoc`, a post page kind (`post`, the template every post renders in: the index at its path, each post at `<path>/<slug>`), pages of posts (`?page=`), `Article` JSON-LD, `og:type` article, a breadcrumb, sitemap entries and `rss.xml`. Stores gain `listPosts`, `getPost`, `savePost` (compare-and-swap), `publishPost` (checks alt text and headings, then publishes the checked revision), `unpublishPost`, `deletePost`, `listLivePosts`, `getLivePost` and the one-time `importPosts` (keeps slugs and dates; a post that fails a check comes in as a draft). Migration `0002_genesis_sites_posts.sql` adds `site_posts` (a draft and a published copy, RLS through `can_edit` and `can_view`) with `live_posts` and `live_post` for anon, and its pgTAP test.
  - Forms: the resolver also answers `{ kind: "mailto", email }`, a button that writes an email (nothing posted or stored), beside a genesis-forms form posted to the app's endpoint or another service's, and a hosted form.
  - `@marktiderman/genesis-sites/import` (Node): `importAssets(store, siteId, urls)` re-hosts an old site's images and PDFs behind a guard against server-side request forgery (http(s), ports 80 and 443, public addresses only, checked when the socket connects, every redirect checked, a size and time cap, the type from the bytes), and `rewriteUrls` points imported documents at the copies. `putAsset` stores a PDF under `sites/<site_id>/files/`.

  Features: sites-sections, sites-blog, sites-import, sites-renderer, sites-store

### Patch Changes

- fe8fca4: Sites and landing pages: the MVP of `@marktiderman/genesis-sites`.

  New package `@marktiderman/genesis-sites` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

  - Core: zod 4 documents (`SiteDoc`, `PageDoc`, `SectionNode`, SEO, menus, redirects) in Puck's `{ root, content }` shape; `defineSection` and the section registry (one per process, frozen manifests, `sectionJsonSchema` and `sectionManifests` for the editor); `migrateNode` for props versions; SEO (meta, Open Graph and Twitter, canonical, sitemap.xml, robots.txt, JSON-LD for Organization, WebSite and BreadcrumbList, redirects on a page move); publish checks that block on the heading outline, alt text, brand colour pairs under 4.5:1 and template placeholders; the theme from the brand through design-system `themeFromBrand`; `landingPage`, `starterSite` and `onePageSite`; the `SiteStore` and `BrandSource` contracts and `createMemorySiteStore`.
  - `/sections`: 13 server-rendered sections on Genesis UI (nav, hero, features, CTA, testimonials, FAQ, pricing, logos, stats, gallery, rich text, form embed, footer), each with 2 to 4 variants and presets.
  - `/web`: `handleSiteRequest(request, { store, brand, siteId, reserved, forms })` returns a `Response`, or null for reserved and unknown paths so the host app answers. Redirects first, no hydration, an inline theme style, a Content-Security-Policy, `Cache-Control` and `Vercel-Cache-Tag: site:<id>`, preview with noindex and no-store. One script under 5 KB for the phone menu and plain HTML forms.
  - `/supabase`: `createSupabaseSiteStore`, over migration `0001_genesis_sites.sql` (the `genesis_sites` schema with RLS through the app's `can_edit` and `can_view` hooks, compare-and-swap drafts, publish, rollback, and `live_release` for anon) with its pgTAP test.
  - `/blocks`: `sitesBlock`, also declared under `genesis.blocks`, so `genesis add sites` installs the migration.

  `@marktiderman/genesis-ui`: `Band`, `BandLead` and `Display` (`@marktiderman/genesis-ui/band`), a full-bleed marketing band with surfaces and a display type scale, server-safe.

  Features: genesis-sites, sites-sections, sites-renderer, sites-store, sites-landing

- f8df732: A redirect can't start on one of the app's reserved paths: `save_site_draft` and `publish_site` refuse one (any case, with a query string or not), and `isReservedPath` compares case-insensitively. The README says to pass `reserved` to `handleSiteRequest` (anon can't read `reserved_paths()`) and that a public assets bucket needs random file names.
  A host that reserves `/` reserves the root page only, in the database as in `isReservedPath`.
- dc237f0: Review fixes for the V1 sections.

  - Preview needs a signed-in viewer: `handleSiteRequest` takes `viewer` (the viewer's user id) and, in preview without one, answers null before reading any draft, page or post. Drafts are never read as anon.
  - A failed read of the published posts no longer breaks the live page: the list renders empty (and logs), and a post that can't be read is not found.
  - The timetable tells class types apart without colour: each chip names its type in text, the legend lists every type the shown days use (described or not), and the outline tone is dashed where plain is solid. An unnumbered timeline marker shows a dot.
  - The contrast check adds a 3:1 warning for the brand's primary colour as a border or marker on the page.
  - `import_posts` publishes a post only when it asks for `published`; with no status it comes in as a draft.
  - `importAssets` names a file "file" when its URL has a malformed escape, instead of failing it.
  - An absolute logo link gets `rel="noopener noreferrer"`; pricing group and plan headings derive from the section's level.

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0
