---
"@marktiderman/genesis-ui-native": patch
---

NativeResourceView rows draw `summary(row).image` through core's `rowPicture` as the list item's leading picture: the image (decorative unless it has `alt`, with initials if it fails to load), initials alone, or nothing. An unsafe src, or one a phone can't load (a root-relative path), draws initials. `NativeImage` takes `onError`.
