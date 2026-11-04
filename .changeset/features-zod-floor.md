---
"@marktiderman/genesis-features": patch
---

Raise the zod dependency to `^4.6.6`, the first version with the fix for the memory exhaustion advisory. The package validates its own manifest with zod and doesn't expose zod schemas, so an app on zod 3 keeps working with its own copy.
