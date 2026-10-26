---
"@marktiderman/genesis-core": minor
---

Count modes for lists: `count: "exact" | "estimated" | "planned" | "none"` on a Supabase resource or per `getList`, with `totalIsEstimate` for approximate totals. `ViewerScope` takes a `scope` (practice, person, space or a set of people), read with `useViewerScope()` / `useOptionalViewerScope()`, plus the viewer's `timeZone` and today on their clock (`day`), which query keys take as their day.
