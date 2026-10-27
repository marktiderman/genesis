# @marktiderman/genesis-connect

## 0.1.1

### Patch Changes

- be8dfe8: New package: connect an outside account, server side. `createSecrets(keyring, { purpose })` seals text bound to a row with AES-256-GCM under a key per purpose (HKDF-SHA-256), as `v2.<key id>.<iv>.<ciphertext>`, opens any key still in the keyring and legacy single-key `v1.` secrets, and rotates with `needsRotation` and `reseal`. `createConnector({ provider: googleProvider, … })` runs the OAuth authorization-code flow with PKCE on Web Request and Response: a signed, short-lived state, the verifier in an HttpOnly cookie, one pinned callback origin with a safe return to the starting address on a shared domain, the granted-scope check, the refresh token sealed and handed to the app's `store`, then `accessToken` (cached), `refresh` and `revoke`. fetch and WebCrypto only; Node 20+, edge and Workers.

  Features: connect
