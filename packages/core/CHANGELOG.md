# @marktiderman/genesis-core

## 1.1.1

### Patch Changes

- e1e5b94: Fix `useOne` sharing one cache entry across different `select` projections.

  `useOne(resource, id, { select })` keyed its query on `[resource, "detail", id]` only. `select` is part of the _request_ — two callers asking for the same row with different projections get different rows back — so leaving it out of the key made them collide. Whichever mounted first won for the whole `staleTime` window (five minutes under `GenesisProvider`'s defaults), and the second silently rendered a record missing the joined fields it had asked for: no error, no refetch, no refetch-on-mount, just absent data. The key is now `[resource, "detail", id, select]`.

  `useResource`'s list key has always included `select` — it keys on the whole `params` object, which carries it — so this was the one place the projection was dropped. That asymmetry is the evidence it was an oversight rather than a decision.

  **Patch, not minor or major.** No signature changes, no option changes, no return-shape change; `useOne` accepts and returns exactly what it did. The only observable difference is that a query which previously served another projection's row now fetches its own — a defect being removed, which is what a patch is for. There is no persisted-cache migration to worry about: react-query keys live in memory for the life of the page, so the worst an upgrade costs is one extra fetch per distinct projection on first mount.

  Found while building `ResourceDetailPage` (`@marktiderman/genesis-ui`), which exposes `select` as a prop so a detail route can join its relations. Shipping that prop on top of the broken key would have handed every consumer a cache collision that looks like missing data, so the fix belongs here rather than being worked around in the component.

## 1.1.0

### Minor Changes

- c3d1c7e: `useResource`'s `defaultFilters` now resyncs whenever its _value_ changes (order-independent deep-equality, not just identity), not just on first render. Previously the initial `defaultFilters` array was only read into state once via `useState`'s initializer, so a caller whose scope/audience changed on an already-mounted, already-enabled hook (e.g. switching teams without a remount) kept querying with the stale filters — consumers were working around this with an app-level `useEffect` + `setFilters` re-sync. The resync now happens during render, so a filter change already applies before that render's fetch goes out.

  This covers filters _changing_ after mount; it can't help a hook whose `defaultFilters` starts `undefined` while the real value is still resolving — `undefined` is inherently ambiguous between "this caller doesn't use `defaultFilters`" and "not ready yet," so a caller in the latter case must also gate `enabled` on that same readiness signal for its very first fetch to be scoped correctly.

  `createSupabaseProvider` now accepts a new, separate `SupabaseClientInput` type for its `client` parameter — deliberately looser than the existing public `SupabaseClient` type, which is unchanged. A real `@supabase/supabase-js` client's generic, table-typed `PostgrestQueryBuilder` never structurally matched `SupabaseClient`'s `from()` return type, forcing every consumer to pass their client through an `as never` cast. `SupabaseClientInput.from()` returns `unknown` instead, which any real client satisfies without a cast; `createSupabaseProvider` narrows to the internal query-builder shape itself, once, right after each `from()` call. `SupabaseClient` keeps its original, stricter shape for any caller that types its own client against it directly.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

## 0.1.1

### Patch Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-core`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
