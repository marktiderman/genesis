---
"@marktiderman/genesis-ui": patch
---

- `sanitizeRichTextDoc` with `maxNodes` or `maxCharacters` now runs a cheap pre-check on the raw input. It refuses a payload more than 4× the node limit or 2× the character limit before sanitizing, and it doesn't walk past that point.
- In `ResourcePage`, the peek keeps its last copy when the open row leaves the current rows (paging, sorting, search, filters). Only a confirmed delete closes it.
- `canEditItem`'s precedence over `canEdit` and `canDelete` is now documented.
