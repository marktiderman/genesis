---
"@marktiderman/genesis-cli": patch
---

The doctor's `eas-placeholder` warnings name the eas.json key and say exactly what replaces each store id (the App Store Connect Apple ID, the Apple Team ID, the Google Play service account key's path). The starter's `links.ts` no longer crashes when genesis.config.json has no `links` block: an app with no domain has no app links.
