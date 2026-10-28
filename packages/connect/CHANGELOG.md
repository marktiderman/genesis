# @marktiderman/genesis-connect

## 0.1.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.1.1

### Patch Changes

- be8dfe8: New package: connect an outside account, server side. `createSecrets(keyring, { purpose })` seals text bound to a row with AES-256-GCM under a key per purpose (HKDF-SHA-256), as `v2.<key id>.<iv>.<ciphertext>`, opens any key still in the keyring and legacy single-key `v1.` secrets, and rotates with `needsRotation` and `reseal`. `createConnector({ provider: googleProvider, … })` runs the OAuth authorization-code flow with PKCE on Web Request and Response: a signed, short-lived state, the verifier in an HttpOnly cookie, one pinned callback origin with a safe return to the starting address on a shared domain, the granted-scope check, the refresh token sealed and handed to the app's `store`, then `accessToken` (cached), `refresh` and `revoke`. fetch and WebCrypto only; Node 20+, edge and Workers.

  Features: connect
