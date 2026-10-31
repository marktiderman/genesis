# @marktiderman/genesis-sites

## 0.5.0

### Minor Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- c2ba64f: Sites render from the brand's design system. `SiteBrand` takes `designSystem` (`{ id, density?, corners?, motion? }`) and an optional `colors.secondary`; `siteTheme(brand, theme, { designSystem })` themes through genesis-design-system's `themeFromBrand`, uses the colour engine's roles and contrast pairs when the design system has surfaces, and reports `theme.designSystem`. Sections draw tokens: heading sizes from the fluid ramp (the hero can reach the design system's display size instead of stopping at 60px), heading weight, tracking and case by font class, eyebrows and lead copy, section padding by density, same-surface neighbours sharing their padding instead of doubling it, corners and button corners, a photo filter, the least wash over a photo that keeps text at 4.5:1 (instead of 80%), and a scroll-driven reveal below the fold that skips the hero and honours reduced motion. Each rule falls back to today's value, so `classic@1` (the default) renders exactly as before and keeps its release hash; the markup gains only `data-gs-size`, `data-gs-text`, `data-gs-spacing` and `data-gs-scrim` hooks and a tokenised button radius. Swapping design systems changes only the theme's variables, never the HTML. `/templates` adds the `forge@1` and `studio@1` design systems (`industryDesignSystems`, to register with `registerDesignSystem`) and `IndustryTemplate.designSystems`. `FONT_CHOICES` and the self-hosted font list now come from genesis-design-system (still exported here).
- e7c4e20: The core is neutral: no section, preset, default, example or doc names an industry. The team presets show a person and their role, the timetable's presets a session and its host, and the timetable reads "sessions" where it said "classes" (its table caption, the type legend's name "Session types", the phone day picker's legend). A new optional `labels` prop (`{ items, types }`, default "sessions" and "Session types") sets those nouns per timetable, with no version bump; the fitness template sets "classes" and "Class types". `exampleBrands` are now "Riverside Works" and "Hilltop Collective". Industry flavour moves to a new `/templates` entry: `industryTemplates` and a first `fitness` template, plain data on the sections' own preset shape (presets per section, a sample brand and message), with no code paths. Stored timetables are unchanged: the older host key still renders and still moves into `host`.
- 176bb8b: Responsive images through genesis-media. `handleSiteRequest` and `SiteRenderer` take `imageUrl` (an `ImageUrlBuilder`, such as `supabaseImageUrl({ url })`); with it every section image gets a `srcset` no wider than the file and `sizes` for its layout (capped at the 1280px column). The default is pass-through, so images load from the same URLs as before; `sizes` is now sent only with a `srcset`. Only the page's first large image (a hero, a post cover, a half-width photo) loads eagerly at high priority; every other image loads lazily, and the header logo loads at once at normal priority. `RenderContext.media` carries the builder and that claim. `Image` takes an optional `phone` crop (shown under 640px through `<picture>`, with its own focal point) and `placeholder` (a small base64 data URI, shown while the image loads). `/import`'s guard, fetch and sniffer now come from `@marktiderman/genesis-media/server`; its exports are unchanged.
- 5e0b4c0: Published sites load every font, style and script from the site itself.

  - Fonts are self-hosted. Each font choice is served from `/_gs/` as latin woff2 files (the weights it lists), declared with `@font-face` and `font-display: swap` in the page's inline style, and the heading font is preloaded. Google Fonts is gone from the page and from the Content-Security-Policy (`font-src 'self'`). The files come from `@fontsource/*` at build time; their OFL licences ship in `dist/assets/fonts/LICENSES.txt`. They add about 1.1 MB (base64) to the server bundle, in a chunk loaded only on a font request; that chunk ships without a sourcemap.
  - New font choices: Barlow, Barlow Condensed, Oswald, Roboto Condensed and Bebas Neue. Bebas Neue has one weight, so it is a heading font only: `bodyFont` (and a brand's `fonts.body`) is now `BodyFontChoice`, which leaves it out.
  - A new publish check, `asset-host`: an image, file or brand logo that loads from a host other than the site and the store's asset origin is a warning, and an error on a site with `images: "own"`. That site's `img-src` narrows to `'self' data:` plus the store's asset origin. `SiteStore.assetOrigin` names that origin (the Supabase store's is its storage origin), `PublishOptions.assetOrigins` adds more (pass the same list to `handleSiteRequest`'s `assetOrigins`), and `checkPost` takes the same options as a third argument. Sites without `images: "own"` keep `img-src 'self' https: data:`.

  Breaking, for code that used them: `googleFontHref` and the `fontHref` renderer prop are removed, `FontInfo.google` is replaced by `id`, `family` and `weights`, and the handler's `fonts` option is now a boolean (`false` loads no font files).

### Patch Changes

- e34d9c4: Fix CodeQL alerts. Sites: `checkHtmlOutline` skips `<script>` and `<style>` content with one linear, case-insensitive pass that matches end tags like `</script >`, instead of regex stripping; `absoluteUrl` trims trailing slashes without a backtracking regex. Switchboard (gitdata): single-quoted frontmatter escapes backslashes before quotes (and reads `''` as `'`), and the `# Title` heading match is linear and no longer expands `$&` in a new title.
- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.
- Updated dependencies [6eb984b]
- Updated dependencies [b11005b]
- Updated dependencies [b028861]
- Updated dependencies [176bb8b]
- Updated dependencies [60f8f0d]
- Updated dependencies [222df94]
- Updated dependencies [c9b2640]
- Updated dependencies [4240f39]
- Updated dependencies [c0c573f]
- Updated dependencies [37972e2]
- Updated dependencies [1ed0cba]
- Updated dependencies [f9a11f2]
  - @marktiderman/genesis-features@0.8.0
  - @marktiderman/genesis-media@0.1.1

## 0.4.1

### Patch Changes

- b8b760f: The site editor no longer crashes in a production build with "Could not find component config for footer". The section registry's registrations are split into shared chunks, which `sideEffects` didn't list, so a bundler dropped those it saw no use for (the footer among them). The chunks are now marked as having side effects.

## 0.4.0

### Minor Changes

- 9a254df: The `schedule` section's sessions take `host` (shown as "with …"). `coach` is still accepted and still rendered when `host` is left out, but it is deprecated: the editor no longer shows it, and the section is now version 2, whose migration moves a session's `coach` into `host` (when `host` is empty) on read, in the editor and on publish. A node saved at version 2 can't be read by an older genesis-sites, which reports it as newer.

  The editor hides any prop marked `.meta({ deprecated: true })`, and opens a node at its section's current version (the section's migrations run first), so an edit saves today's fields.

  Behaviour change: the default `emptyText` is "Nothing scheduled" (was "No classes"); a site that set its own keeps it.

  Features: sites-sections

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0

## 0.3.3

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

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
