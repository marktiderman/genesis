---
"@marktiderman/genesis-ui-native": patch
---

NativeGalleryGrid draws on the first paint (at the window width, corrected by `onLayout`) and sets `contentInsetAdjustmentBehavior="automatic"` (a new prop), so under an iOS large-title header the first row starts below the title instead of under it.
