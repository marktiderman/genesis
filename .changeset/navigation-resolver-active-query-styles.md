---
"@marktiderman/genesis-ui": minor
---

**`resolveNavigation`, query/hash-aware `isPathActive`, and a Tailwind v4 `@source` entry.**

Purely additive — no existing call site changes behavior unless it opts in. Per `docs/FRAMEWORK.md` rule 5, a **minor**.

- **`resolveNavigation(tree, pathname)`** (root barrel and `/data`, with types `NavigationNode<T>` and `ResolvedNavigation<T>`). Resolves where a pathname sits in a logical navigation tree and returns `{ current, parent, items, trail, params }`. Nodes match whole path segments only; the most specific match wins, and on a tie a static segment beats a `$param` regardless of sibling order. Logical ancestors are kept even when their URLs share no prefix. Params are captured from the matched node and every `trail` path (so `parent` too) is interpolated **by name**. Pure — never reads browser history.

- **`isPathActive` matches query and hash, opt-in.** `activePath` may now carry `?search#hash`. An item whose `to` has neither compares against the path part only (as before, and now also when the location has a query). An item whose `to` names a query or hash — `/admin?tab=users`, `/settings#profile` — is active only on that exact path with every named param equal (extra params ignored) and, if named, the same hash. A new optional third argument `{ end: true }` gives exact path matching. New exported type: `IsPathActiveOptions`.

- **`@marktiderman/genesis-ui/styles.css`.** A CSS file containing `@source "./"` relative to the published `dist/`, so a Tailwind v4 app writes `@import "@marktiderman/genesis-ui/styles.css";` instead of hardcoding an `@source` path into `node_modules`. Documented in `SKILL.md` under "Wiring into an app".
