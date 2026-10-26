---
"@marktiderman/genesis-cli": minor
---

`genesis doctor` route and install rules, from the #303 and #314 reviews. Minor: some routes and copies are newly checked, so `--strict` can newly fail.

- A route whose component is imported (`component: CoursesPage`, a re-exported default) renders; it is no longer read as redirect-only and skipped.
- TanStack `posts.lazy.tsx` is paired with `posts.tsx` as one route (segments `posts`, not `posts/lazy`).
- A route rendering its own content around an `<Outlet>` is a page as well as a layout: `page-layout` and `hand-rolled-sub-nav` check it. Only pure layouts are skipped.
- Next.js: private `_folders`, `(groups)`, `@slots` and the special files (error, loading, not-found, template, default, route handlers) aren't routes.
- `duplicate-genesis-package`: copies reached only through dev tooling (devDependencies, the Genesis CLI's own tree) are dev-only; when exactly one copy is left at runtime the finding is `info`, otherwise it warns. An app with no runtime dependencies (everything in devDependencies) has them taken as runtime. `peer-range-mismatch` inside a dev-only copy is `info` too.
- The route rules follow what a route renders through imports of rendered components, lazy imports, re-exports and barrels (relative, tsconfig `paths`, package.json `imports`, `@/` `~/` `#/`), up to six modules deep, and stay quiet when the trail runs out.
- A wrapper around an `<Outlet>` is a layout, not a page; an `<Outlet>` in an imported layout component makes the route a layout; a folder `route.tsx` with its own content is checked; `export default R` of a local redirect is redirect-only.
- Next.js: only `page` and `layout` files under `app/` are routes, and a `(group)` layout wraps only its group.
