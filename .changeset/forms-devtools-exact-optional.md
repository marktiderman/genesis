---
"@marktiderman/genesis-forms-devtools": patch
---

Optional props and options accept an explicit `undefined`, so apps compiled with `exactOptionalPropertyTypes` can pass their own optional values straight through (`Inspector`, `CoveragePanel`, `ErrorBoundary`, the panels, `pretty` and `encodeShare` options). A type test against the built output keeps it that way.

The built entry now starts with `"use client"` again (the tsup banner was dropped by tree-shaking), so a React Server Component can import the devtools.
