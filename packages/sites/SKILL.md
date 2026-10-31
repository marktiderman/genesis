---
name: genesis-sites
description: Add or change a site, landing page or blog in a Genesis app with @marktiderman/genesis-sites (a module) — install it with genesis add sites, decide who edits, serve pages with handleSiteRequest, and add sections. Load before building any public page, landing page or site editor.
---

# genesis-sites

A module: a mini app an app installs whole and a tenant switches on. A site is a set of pages
made of sections, drawn from the brand, served as cached HTML with no hydration, and published
as releases you can roll back. Its tables are in the `genesis_sites` schema.

## Install

```bash
genesis add sites                         # migrations and their pgTAP tests, the feature entry, the steps
pnpm add @marktiderman/genesis-sites zod@^4
```

Then, as `genesis add` prints:

1. Expose `genesis_sites` to the API (`[api] schemas` in `supabase/config.toml`, and the dashboard).
2. Decide who edits: replace `genesis_sites.can_edit(uuid)` (and `can_view`) in a migration of your
   own, after the module's. The stubs fail closed. Name the person (`auth.uid()`) in the hook.
3. Mount `handleSiteRequest` from `/web` before the app's routes. It returns `null` for a path that
   isn't the site's, so the app answers.

## Which entry point

| Need | Import |
|---|---|
| Site and page documents, `defineSection`, `landingPage`, `starterSite`, publish checks | `@marktiderman/genesis-sites` |
| The built-in sections | `@marktiderman/genesis-sites/sections` |
| Serving: `handleSiteRequest` | `@marktiderman/genesis-sites/web` |
| The Supabase store | `@marktiderman/genesis-sites/supabase` |
| The visual editor, `<SiteEditor>` | `@marktiderman/genesis-sites/editor` |
| Importing an old site's assets (Node) | `@marktiderman/genesis-sites/import` |

## Rules

- Reuse a section before writing one; a new one is `defineSection` with a props schema and a
  migration for its props, never a hand-built page.
- Forms on a page embed Genesis Forms (the `forms` primitive); don't build a contact form by hand.
- Never write to `genesis_sites` from outside the module's functions: the schema is the module's.
- Which plan unlocks Sites is the app's call, in its own `features.ts`.

Details: the package README and [docs/SITES.md](https://github.com/marktiderman/genesis/blob/main/docs/SITES.md).
