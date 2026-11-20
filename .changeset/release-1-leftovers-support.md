---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": patch
---

Support nits from the #848 review:

- `createDiagnostics` empties the offline queue when a settings answer turns `diagnostics.enabled` or `diagnostics.offlineQueue` off after the queue was made; before, queued dumps waited and could go out once it was turned back on.
- `cleanRoute` redacts secret keys with no digits: a known prefix (`sk_live_…`, `sk_test_…`, `whsec_…`, `ghp_…`, `github_pat_…`) and 32 or more letters with no separator that read as random (case mixed throughout, or too few vowels for words), and `whatsapp:` links (`:phone`). Long word slugs (`how-to-reset-your-password-in-the-settings-screen`, `settingsNotificationsPreferencesScreen`) stay. The intake function's copy matches.
