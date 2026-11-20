---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": patch
---

Support nits from the #848 review:

- `createDiagnostics` empties the offline queue when a settings answer turns `diagnostics.enabled` or `diagnostics.offlineQueue` off after the queue was made; before, queued dumps waited and could go out once it was turned back on.
- `cleanRoute` redacts secret keys with no digits: a known prefix with a body of letters and digits (`sk_live_…`, `sk_test_…`, `whsec_…`, `ghp_…`, Supabase's `sb_secret_…` and `sb_publishable_…`, and `github_pat_…`), and 32 or more letters with no separator that read as random (capitals side by side in mixed case, few vowels, or 7 consonants in a row); and `whatsapp:` links (`:phone`). Slugs stay: `whsec_rotation_guide`, `sk_test_driven_development_basics`, `MyAppHomeTabFeedItemDetailViewScreen`, `whyhttpsmattersforyoursmallbusinesssite`. The intake function's copy matches.
