---
"@marktiderman/genesis-core": major
"@marktiderman/genesis-ui-native": major
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis": minor
---

Scope-neutral names. Genesis named one app's tenant ("practice") in its scope and clock APIs; it now names whatever the screen is scoped to.

Breaking:

- `ResourceScope.practiceId` is gone as a named key. Pass the app's own key in the open slot, as before: `scope={{ practiceId }}`, `scope={{ orgId }}`, `scope={{ leagueId }}`. Views read it as before (`scope: ["practice_id"]` reads `practice_id`, then `practiceId`). To read it typed, augment once: `declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }`.
- A view field's `timeZone: "practice"` is now `timeZone: "scope"`. `timeZone` is a closed type (`"viewer" | "scope" | TimeZoneName`, the new `TimeZoneName` being `"UTC"`, `"GMT"` or `Area/Location`), so `"practice"` is a type error, and `defineView` throws `ViewDefinitionError` on it (naming the codemod) and on any zone the runtime doesn't know, instead of drawing the column on the viewer's clock.
- NativeResourceView's `practiceTimeZone` prop is now `scopeTimeZone`; `DisplayTimeZones.practice` is `DisplayTimeZones.scope`, and `resolveZone("practice", …)` is `resolveZone("scope", …)`; `resolveZone` throws on a zone it doesn't know.

New: `ViewerScope` takes `scopeTimeZone` (a zone the runtime doesn't know throws in development and is reported with `reportError` in production; `scopeClock` is the check, exported) (the IANA zone of whatever the viewer is scoped to), exposed as `useViewerScope().scopeTimeZone`. Columns with `timeZone: "scope"` read on it on the web too (before, the web drew a practice-clock column on the viewer's clock), and NativeResourceView uses it when no `scopeTimeZone` prop is given.

Migrate in one step: `genesis upgrade` runs the `genesis-core-2-scope-names` codemod when genesis-core crosses 2.0.0, or run it by hand with `genesis codemod genesis-core-2-scope-names` (`--dry-run` lists the files). It rewrites `timeZone: "practice"`, `practiceTimeZone` (attribute or object key), `resolveZone("practice", …)` and DisplayTimeZones' `practice` in files that import a Genesis package, and prints the `ResourceScope` augmentation when a file reads `scope.practiceId` and nothing declares it. `genesis doctor`'s `removed-scope-name` rule fails until none are left.

Migration notes: docs/MIGRATION.md, "Scope-neutral names".
