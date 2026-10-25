---
"@marktiderman/genesis-sites": patch
---

Editor fixes from review:

- `@puckeditor/core` is an optional peer dependency instead of a dependency: install it where `/editor` runs. The root, `/web`, `/sections`, `/supabase` and `/blocks` never import it.
- A publish no longer re-saves every draft: `migrateNode` reports a change only when a node's version or variant moves or a migration step changes its props, compared by content (`stableHash`), not by key order or zod's defaults. `migratePage` and `migrateSite` always return the parsed nodes. The editor saves the parsed page, `Autosaver`'s default `equals` is `stableHash`, and placeholder detection ignores key order and empty values.
- While a publish runs, the canvas is read-only and autosave is paused (`Autosaver.pause()` and `resume()`); afterwards the editor adopts the new revisions and saves what waited.
- Unmounting with unsaved changes saves them, best effort. `onDirtyChange(dirty)` tells the host when there are unsaved changes, so it can ask before a route change.
- `readOnly`: view only, with no Add picker, page actions, Publish or Roll back, no autosave, and a "View only" note.
- "Load their version" keeps the header's and footer's sample sections marked as samples.
- The canvas's fallback theme uses the design system's default brand, and library images get the same address check as links.
