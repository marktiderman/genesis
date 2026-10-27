---
"@marktiderman/genesis-core": major
"@marktiderman/genesis-ui-native": major
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis": minor
---

Scope-neutral names. Genesis named one app's tenant ("practice") in its scope and clock APIs; it now names whatever the screen is scoped to.

Breaking:

- `ResourceScope.practiceId` is gone as a named key. Pass the app's own key in the open slot, as before: `scope={{ practiceId }}`, `scope={{ orgId }}`, `scope={{ leagueId }}`. Views read it as before (`scope: ["practice_id"]` reads `practice_id`, then `practiceId`). To read it typed, augment once: `declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }`.
- A view field's `timeZone: "practice"` is now `timeZone: "scope"`. `"practice"` is no longer special: it is read as an IANA name, isn't one, and falls back to the viewer's clock.
- NativeResourceView's `practiceTimeZone` prop is now `scopeTimeZone`; `DisplayTimeZones.practice` is `DisplayTimeZones.scope`, and `resolveZone("practice", …)` is `resolveZone("scope", …)`.

New: `ViewerScope` takes `scopeTimeZone` (the IANA zone of whatever the viewer is scoped to), exposed as `useViewerScope().scopeTimeZone`. Columns with `timeZone: "scope"` read on it on the web too (before, the web drew a practice-clock column on the viewer's clock), and NativeResourceView uses it when no `scopeTimeZone` prop is given.

Migrate in one step: `genesis upgrade` runs the `genesis-core-2-scope-names` codemod when genesis-core crosses 2.0.0, or run it by hand with `genesis codemod genesis-core-2-scope-names` (`--dry-run` lists the files). It rewrites `timeZone: "practice"`, `practiceTimeZone=` and `resolveZone("practice", …)` in files that import a Genesis package, and prints the `ResourceScope` augmentation when a file reads `practiceId`. A hand-built `DisplayTimeZones` object's `practice` key is not rewritten: rename it to `scope`.

Migration notes: docs/MIGRATION.md, "Scope-neutral names".
