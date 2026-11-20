---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": patch
---

Support fixes from the #848 review:

- `cleanRoute` judges each segment after percent-decoding and redacts more: a slug with 9 or more digits in all (`order-4111-1111-1111-1111`, `call-555-555-0101`; a date like `release-2024-11-19` has 8 and stays), card and IBAN numbers in groups joined by spaces (`%20`) or `+`, phone numbers without a `+` (`555-555-0101`, `555.555.0101`, `(555) 555-0101`, `tel:` links), SSNs (`123-45-6789` → `:id`) and base64 with `=` padding. A percent-encoded `?` or `#` (`%3F`, `%23`) ends the path like a written one. The intake function's copy matches.
- The whole-dump cap measures the dump as the database stores it (jsonb text, a space after every `,` and `:`), so a dump trimmed to `diagnostics.maxBytes` (up to 512 KB) is never refused by migration 0019's size check.
- A settings function that has never answered means no dumps (fail closed) in `createDiagnosticsHandler`, `createSupport` and `createDiagnostics`; after one answer, a failing read keeps the last values. Queued dumps wait while diagnostics are off instead of being dropped.
- The handler names a dump brought with feedback on the feedback only after the store saved it, through the new optional `DiagnosticsStore.linkDiagnostics` (`supabaseDiagnosticsStore` has it). A store without it leaves the feedback unnamed; the dump still names the feedback.
- No routes are recorded for the dump while diagnostics are off.
- Under React's StrictMode, which mounts the feedback screen twice, a shake's dump is still sent once: `ShakeDump.release` waits a tick before sending, so a remount takes it back.
- Migration 0028 sets `lock_timeout` to 5 seconds before adding its check.
