# Genesis sample site

The site at [genesisone.dev](https://genesisone.dev): Genesis's front door, a demo app on today's
primitives, each building block on its own, the design system, and package pages generated from
this repository. Every page runs in the browser on in-memory data, so it deploys to any static
host.

## Run it

```bash
pnpm install && pnpm build:packages   # from the repo root, once
pnpm --filter sample dev              # http://localhost:3200
pnpm --filter sample build            # prerenders every page into build/client
pnpm --filter sample smoke            # opens every built page in headless Chromium
```

## What's where

| Path | What it shows | Source |
| --- | --- | --- |
| `/` | The landing page: what Genesis is, `genesis init`, a view beside the list it draws, every package | `app/routes/_index.tsx` |
| `/demo` | A multi-tenant demo app: three invented organizations (WorkspaceScope + WorkspaceSwitcher), owner / staff / client roles, `ResourceView` lists, `RecordView` pages, an intake form, chat, an AI assistant, the Data Studio, feature flags, Reset and View source | `app/routes/demo*.tsx`, `app/demo/` |
| `/items`, `/tasks`, `/orders`, `/sandbox`, `/items-custom` | List screens: a `ResourceView`, `ResourcePage` options live, and the same list composed by hand | `app/routes/` |
| `/dashboard`, `/settings` | `DashboardPage`-style tiles and a `SettingsPage` | `app/routes/` |
| `/forms`, `/forms-builder`, `/preview/:scenario` | Genesis Forms: the playground with its inspector, the builder, a respondent's view | `app/routes/forms*.tsx`, `app/lib/forms.ts` |
| `/chat`, `/features`, `/sites`, `/sites-editor`, `/studio` | Chat on the memory client, the feature registry, Genesis Sites and its editor, the Data Studio (dev server only; static builds go to the demo's) | `app/routes/` |
| `/showcase/*` | Tokens, every web and native component (from `app/data/primitives.json`), live page layouts | `app/routes/showcase*.tsx` |
| `/packages/*` | Every published package: entry points, components, hooks, exports | `app/routes/packages*.tsx`, `app/lib/catalog.server.ts` |
| `/storybook/` | Storybook, built from `stories/` | `stories/` |

## How it stays current

- **Generated, not hand-kept.** The package pages and `docs/component-reference.md` read every
  published package's `exports` (`scripts/gen-component-reference.mjs`); the component pages read
  `app/data/primitives.json` (`pnpm docs:generate`); the landing page's package list reads
  `packages/*/package.json`. A new package or export appears on the next build.
- **Every page prerenders** to its own `index.html` (`app/lib/site-paths.ts`), with a title,
  description and Open Graph tags from `app/lib/site.ts`. A new static route needs an entry
  there: the build fails without one.
- **Agent files.** The build writes `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt` and
  `.md` copies of `docs/` and each package README (`scripts/generate-site-files.ts`).
- **Demo coverage** (`pnpm --filter sample coverage:check`, run with `docs:check` in CI): every
  component has a story or a page that uses it, or a reasoned entry in `demo-coverage.allow.json`,
  which only shrinks.
- **Smoke test** (`pnpm --filter sample smoke`, in CI): every page loads with a 200, no errors, no
  error screen, and (one page per route) no axe naming violations.
- The footer shows the Genesis version, commit and build date.

## Hosting

`.github/workflows/deploy-pages.yml` publishes `build/client` and Storybook to GitHub Pages on
every push to `main`. Nothing in the build is specific to Pages: `SITE_URL` sets the origin for
canonical links and the sitemap, and `PAGES_BASE` builds for a subpath. Any static host that serves
`<path>/index.html` and a 404 page (`__spa-fallback.html`) works.

## Data Studio against a real database

`/studio` in the dev server talks to the studio handler (`studio/vite-plugin.ts`). Set it up with
`pnpm --filter sample studio:db` (Postgres) or `pnpm --filter sample studio:supabase` (a local
Supabase), then restart `pnpm --filter sample dev`.
