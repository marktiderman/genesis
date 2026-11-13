# Proposal: the client layer and resource surfaces

Status: **discussion**. This PR is the working room for two sessions (a consumer app's dashboard session and the Genesis themes session) to agree the shape before anyone builds. Decisions land as ADRs and docs in follow-up PRs; this file is deleted when they do.

## 1. The client layer

Every Genesis client app keeps its Genesis configuration in **one folder** (name TBD, see open question 1). Pages only compose what it exports.

```
<client layer>/
  resources.genesis.ts   generated contract (genesis introspect), never hand-edited
  provider.ts            the one data provider (createSupabaseProvider + per-resource sources)
  root.tsx               DataProviderRoot + WorkspaceScope/ViewerScope + ResourceViewDefaultsProvider
  copy.ts                message overrides
  views/<resource>.view.ts   one defineView / defineRecordView per content type (platform-neutral)
  cells/                 shared cell renderers
  components/            the app's own shared components built on Genesis
  surfaces/              custom experiences on the same views (section 2)
  index.ts               the one import surface for pages
```

Rules: one definition per content type (variants are presets, never a second view); pages only compose (no columns, no data fetching, no restyled primitives in routes); data only through the provider; upgrades land once in the layer; gaps go upstream (`genesis upstream`); the phone imports the same `views/*.view.ts`.

It maps ADR 0013's five customization levels to one place. No `defineClient` registry: views are plain exports and a registry would be a second index of the same facts.

Proposed Genesis changes (all non-breaking):

- **Docs:** ADR "The client layer"; `docs/CLIENT-LAYER.md` (worked example + migration); point FRAMEWORK, RESOURCE-VIEW (today "one file beside the feature"), AGENTS, SKILL and GLOSSARY at it.
- **Scaffold:** `genesis init` writes the skeleton and `genesis.config.json` `client.dir`; `genesis codemod client-layer` for existing apps; `apps/sample` and the RN starter use the layer.
- **Helpers:** RPC sources receive the scope (`source: { rpc, args: (scope, params) => … }`); `routeProviders({ byResource, fallback })` for apps mid-migration; a Next App Router URL adapter; `stickyPager={false}` for embedded lists.
- **Doctor (warn/info, opt-in via `client.dir`):** `client/layer` (view/provider/scope definitions outside the layer), `client/one-view-per-resource`, `core/direct-data-access` widened to `.ts` outside the layer, `client/pages-only-compose` (info). Fixes: `ui/lists-use-resource-view` follows one barrel re-export; `ui/records-use-record-view` finds Next routes; an unknown rule key drops the key, not the rule; architecture findings first in the report; `genesis agents` writes the layer rules into each app's agent guide.

## 2. Resource surfaces (custom experiences)

Not every screen is a list or record: a live console, a TV screen, celebration moments, an animated leaderboard. Today they're hand-built and lose the layer's benefits.

- `useResourceView(props)` already returns `{ rows, total, loading, error, truncated, loadMore, columns, … }` with the view's scope, `live` and `can`.
- **New: `<ResourceSurface>`**, a sibling of `ResourceView` on the same view definitions and provider: it owns loading/empty/error states (each overridable), URL state and scope; the app renders everything else.

  ```tsx
  <ResourceSurface view={leaderboard} preset="today" live>
    {(state) => <AnimatedBoard rows={state.rows} />}
  </ResourceSurface>
  ```

- Covers board and calendar modes (the hook throws for them today).
- Themeable: each piece carries `data-slot="app-<name>"` (app themes accept `app-` parts).
- Colour only from brand variables; motion only from `resolveMotion` / `--ds-dur-*` / `--ds-ease-*` (reduced-motion aware). A doctor info rule can check `surfaces/`.
- Name: "surface", not "block" (`defineBlock` is the install unit).

## Open questions

1. **Folder default.** (a) `src/client/` as the Genesis default, with the codemod moving existing apps (one consumer keeps views in `src/lib/views/` today). (b) Adopt that existing `src/lib/views/` + shell layout as the default. Either way it's one `client.dir` key.
2. **Who builds what.** Proposed: the Genesis themes session builds `<ResourceSurface>` (own PR + ADR + glossary, separate from #790); the dashboard session builds the client-layer docs/scaffold/doctor changes after question 1 is settled.
3. Anything in section 1 that conflicts with the theming work in #790.
