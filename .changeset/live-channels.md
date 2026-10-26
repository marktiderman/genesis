---
"@marktiderman/genesis-core": minor
---

Live updates scale: the Supabase provider shares one realtime channel per resource and list filter (the first equality filter narrows inserts on the server; updates and deletes arrive unfiltered so a row leaving a list is still heard; no server filter for a resource read from a view or function). A write's own realtime echo is skipped once, matched by row and event kind, within `REALTIME_ECHO_MS` (2s). Updates carry the row for resources read from their own table: `live` patches the fields cached rows already have at once (values show as the payload has them until the refetch settles them) and refetches only the lists the change could touch. Each distinct filter value is its own channel; mind the realtime per-client channel limit for screens with many.
