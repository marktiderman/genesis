---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": patch
---

`cleanRoute` redacts long digit runs and grouped codes written as slugs again: `/order/card-4111111111111111` and `/invite/ABCD-EFGH-1234-5678` become `/order/:token` and `/invite/:token`, as they did before the slug rule kept them whole. A slug part of 7 digits or more, or three or more parts of one length with letters and digits, is a token; ordinary slugs, dates and versions (`top-10-tips-2024`, `release-2024-11-19`) stay readable. The support intake function's copy of the contract matches.
