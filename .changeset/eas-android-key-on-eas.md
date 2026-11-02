---
"@marktiderman/genesis-cli": patch
---

The `eas-placeholder` step for the Google Play service account key says to upload the key to EAS (`eas credentials`) and remove only `serviceAccountKeyPath`, since the production workflow submits on EAS where a local file isn't there; until the app ships to Google Play, remove the `submit_android` job and keep `submit.production.android`. The doctor's `lock-files` rule warns on a locked file that can't be read. The starter's `linkHosts` takes a genesis.config.json with no `links` block without a type error.
