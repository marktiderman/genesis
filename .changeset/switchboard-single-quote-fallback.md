---
"@marktiderman/genesis-switchboard": patch
---

A single-quoted frontmatter value that JSON can't read (a raw tab, say) keeps its `''` → `'` unescaping instead of returning the doubled quotes.
