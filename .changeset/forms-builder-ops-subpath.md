---
"@marktiderman/genesis-forms-builder": patch
---

New `@marktiderman/genesis-forms-builder/ops` subpath: the pure form edits (`updateBlock`, `removeBlock`, `setOptions`…) without `"use client"`, so server components, route handlers and scripts can import them. The main entry is unchanged and still exports them too.
