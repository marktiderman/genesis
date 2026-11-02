---
"@marktiderman/genesis-cli": patch
---

The doctor's `eas-placeholder` warnings name the eas.json key and say exactly what replaces each store id (the App Store Connect Apple ID, the Apple Team ID, and, for Google Play, a service account key uploaded to EAS, since the production workflow submits there, or the `submit_android` job removed until the app ships to Google Play). The starter's `links.ts` no longer crashes when genesis.config.json has no `links` block: an app with no domain has no app links.
