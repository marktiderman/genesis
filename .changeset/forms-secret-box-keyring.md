---
"@marktiderman/genesis-forms": minor
---

The destination secret box (`deriveSecretKey`, `sealSecret`, `openSecret`, `secretKeyBytes`) now runs on genesis-connect's, bundled in, so forms still installs nothing. Same `v1.` format, same `DeliveryError` messages. `@marktiderman/genesis-forms/destinations` also exports the keyring (`createSecrets`, `parseKeyring`, `SecretError`, `isSecretError`): it opens `v1.` secrets sealed with `sealSecret` (same purpose and salt, the key as `legacyKeyId`) and re-seals them as rotatable `v2.` ones.

Features: connect
