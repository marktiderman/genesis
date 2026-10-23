---
"@marktiderman/genesis-features": patch
---

The flag scan no longer mistakes a regex literal (`/[/*]/`), a closing JSX tag, or an apostrophe in JSX text for the start of a comment or string. Comments inside a template's `${…}` are blanked like any other code.
