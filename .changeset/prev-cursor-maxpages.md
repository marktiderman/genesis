---
"@marktiderman/genesis-core": minor
---

Cursor pages go both ways: the Supabase provider returns `prevCursor` (the rows before a page's first row, read in reverse and turned around), and `useInfiniteResource` takes `maxPages` to keep only that many pages loaded, loading dropped ones again when scrolled back. Realtime echo marks are now skipped once per channel, so two lists of one table don't refetch for your own write.
