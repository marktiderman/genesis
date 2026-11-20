---
"@marktiderman/genesis-chat": patch
---

The photo viewer's notice and buttons take their colours from `media-colors.ts` (`MEDIA_NOTICE`, `MEDIA_SCRIM`, `ON_MEDIA`) instead of literals of their own. Its buttons' backdrop is `MEDIA_SCRIM` (50% black, was 45%).
