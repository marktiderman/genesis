---
"@marktiderman/genesis-media": patch
---

New package: `@marktiderman/genesis-media`. `ImageValue` (alt or decorative, size, focal point, a phone crop, a blur placeholder); `responsiveImage(value, { imageUrl, sizes, widths, priority, eager })`, which returns `src`, `srcset`, `sizes`, the size, `loading`, `fetchpriority`, `decoding`, `objectPosition` and the phone crop's source; the `ImageUrlBuilder` contract with `supabaseImageUrl` (Supabase Storage transforms) and `passThroughImageUrl`; `sniff`. `/server` holds the fetch guarded against server-side request forgery (`fetchGuarded`, `FetchRefusedError`, `urlProblems`, `isPublicAddress`, `guardedLookup`, `createGuardedTransport`), moved from genesis-sites.
