---
"@marktiderman/genesis-cli": patch
---

`genesis doctor` route and install rules, from the #303 review:

- A route whose component is imported (`component: CoursesPage`, a re-exported default) renders; it is no longer read as redirect-only and skipped.
- TanStack `posts.lazy.tsx` is paired with `posts.tsx` as one route (segments `posts`, not `posts/lazy`).
- A route rendering its own content around an `<Outlet>` is a page as well as a layout: `page-layout` and `hand-rolled-sub-nav` check it. Only pure layouts are skipped.
- Next.js: private `_folders`, `(groups)`, `@slots` and the special files (error, loading, not-found, template, default, route handlers) aren't routes.
- `duplicate-genesis-package`: copies reached only through dev tooling (devDependencies, the Genesis CLI's own tree) are dev-only; when one copy is left at runtime the finding is `info`. `peer-range-mismatch` inside a dev-only copy is `info` too.
