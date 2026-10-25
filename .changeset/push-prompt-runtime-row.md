---
"@marktiderman/genesis-native": patch
---

The push soft prompt's content is centred in its sheet (iOS shows it as a full-height page sheet, where the few lines sat at the top). The version signature never prints an empty value: expo-updates gives `""` for the runtime version in a development build, so the devtools overlay's Build section read "Runtime " with nothing after it; it now reads "Runtime none" with updates off and "unknown" otherwise, and an empty version, build, channel or update id counts as not given.

Features: push, app-updates
