---
"@marktiderman/genesis-core": minor
---

New `useDraft` (and `DraftController`, the same rules without React): autosave one row as it's edited. It saves a moment after the last change, one write at a time, adds the row on the first save with something in it, and merges into a row another tab started (`adopt`). It starts again when the server's copy wins (`revision`, with `discarded` and `onRevision`), retries network failures only, saves on leaving the page, and has a final `commit`. See the README's "Autosave a draft".
