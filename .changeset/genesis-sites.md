---
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-ui": minor
---

Sites and landing pages: the MVP of `@marktiderman/genesis-sites`.

New package `@marktiderman/genesis-sites` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

- Core: zod 4 documents (`SiteDoc`, `PageDoc`, `SectionNode`, SEO, menus, redirects) in Puck's `{ root, content }` shape; `defineSection` and the section registry (one per process, frozen manifests, `sectionJsonSchema` and `sectionManifests` for the editor); `migrateNode` for props versions; SEO (meta, Open Graph and Twitter, canonical, sitemap.xml, robots.txt, JSON-LD for Organization, WebSite and BreadcrumbList, redirects on a page move); publish checks that block on the heading outline, alt text, brand colour pairs under 4.5:1 and template placeholders; the theme from the brand through design-system `themeFromBrand`; `landingPage`, `starterSite` and `onePageSite`; the `SiteStore` and `BrandSource` contracts and `createMemorySiteStore`.
- `/sections`: 13 server-rendered sections on Genesis UI (nav, hero, features, CTA, testimonials, FAQ, pricing, logos, stats, gallery, rich text, form embed, footer), each with 2 to 4 variants and presets.
- `/web`: `handleSiteRequest(request, { store, brand, siteId, reserved, forms })` returns a `Response`, or null for reserved and unknown paths so the host app answers. Redirects first, no hydration, an inline theme style, a Content-Security-Policy, `Cache-Control` and `Vercel-Cache-Tag: site:<id>`, preview with noindex and no-store. One script under 5 KB for the phone menu and plain HTML forms.
- `/supabase`: `createSupabaseSiteStore`, over migration `0001_genesis_sites.sql` (the `genesis_sites` schema with RLS through the app's `can_edit` and `can_view` hooks, compare-and-swap drafts, publish, rollback, and `live_release` for anon) with its pgTAP test.
- `/blocks`: `sitesBlock`, also declared under `genesis.blocks`, so `genesis add sites` installs the migration.

`@marktiderman/genesis-ui`: `Band`, `BandLead` and `Display` (`@marktiderman/genesis-ui/band`), a full-bleed marketing band with surfaces and a display type scale, server-safe.

Features: genesis-sites, sites-sections, sites-renderer, sites-store, sites-landing
