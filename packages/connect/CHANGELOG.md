# @marktiderman/genesis-connect

## 0.4.0

### Minor Changes

- 51db9af: Todoist, and refresh tokens shared across server instances. `todoistProvider` and `TODOIST_SCOPES` connect a Todoist account (comma-joined scopes, rotating refresh tokens, RFC 7009 revoke with HTTP Basic client auth through the new provider field `revokeAuth`). `accessToken` takes `grant` (`SharedGrant`: `lock`, `current`, and optional `readAccessToken` and `writeAccessToken`), so instances refresh one at a time from the grant's current refresh token, store the rotated token before the lock is let go, and share the access token sealed to `<aad>:access`. A provider that rotates no longer risks a used refresh token being sent again by another instance (Todoist revokes every token of the grant when that happens). New `verifyWebhookSignature` (also on `/webhooks`) checks a delivery's HMAC on its raw body in constant time. `forget(sealed, aad, { grant })` drops a refused access token in this process and, with `grant`, the shared copy (new optional `SharedGrant.clearAccessToken`). With `grant`, a missing `onRotate` is refused before any refresh (as it is for a provider with `rotatesRefreshTokens` without one), and `refresh` refuses `grant`, and a provider with `rotatesRefreshTokens` (Todoist) logs a refresh answered without a new refresh token.

## 0.3.0

### Minor Changes

- 9e62421: Security fix: `identity` is now rejected for an ID token whose `aud` names any audience other than this client (unless listed in the new `trustedAudiences`), whose `azp` is present and isn't this client (or is missing with several audiences), and `createConnector` refuses a provider whose `tokenUrl` or `revokeUrl` isn't https (http only on localhost), since the unsigned ID token is trusted only over TLS. `requireIdentity` without the provider's `issuer` or without `openid` in the connector's scopes now throws a `config` error at boot (and `start` refuses scopes without `openid`). A grant the callback turns down after the code exchange (a missing scope, or no identity with `requireIdentity`) can be revoked through `revokeUrl`, best effort, with the new `revokeFailedGrants: true` (off by default, because Google's revoke also ends a returning person's existing connection). A provider `issuer` must be non-empty. The identity is read, and its absence logged, only when `openid` was asked for or `requireIdentity` is set. The README describes Google's Testing publishing status accurately.

### Patch Changes

- 2d714b2: The callback no longer waits on the best-effort revoke of a grant it turns down: the revoke runs in the background, bounded to 3 seconds, and can't leak an unhandled rejection. Documents that a `store` that throws leaves its refresh token unrevoked, and adds tests for look-alike localhost token URLs and for non-string ID token audiences.

## 0.2.0

### Minor Changes

- bc1bd20: Google Calendar read scopes (`calendarEventsReadonly`, `calendarListReadonly`, `calendarReadonly`), and `identity` on the connected account: who the account is (`subject`, `email`, `emailVerified`, `name`, `picture`), read from the ID token the token endpoint sent, after checking its issuer (the provider's new `issuer`, set on `googleProvider`), audience and expiry; a token that fails is logged and leaves `identity` out, and `requireIdentity` fails the connection instead. `email` is included only when verified. The README shows connecting Google Calendar read only.

## 0.1.3

### Patch Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

## 0.1.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.1.1

### Patch Changes

- be8dfe8: New package: connect an outside account, server side. `createSecrets(keyring, { purpose })` seals text bound to a row with AES-256-GCM under a key per purpose (HKDF-SHA-256), as `v2.<key id>.<iv>.<ciphertext>`, opens any key still in the keyring and legacy single-key `v1.` secrets, and rotates with `needsRotation` and `reseal`. `createConnector({ provider: googleProvider, … })` runs the OAuth authorization-code flow with PKCE on Web Request and Response: a signed, short-lived state, the verifier in an HttpOnly cookie, one pinned callback origin with a safe return to the starting address on a shared domain, the granted-scope check, the refresh token sealed and handed to the app's `store`, then `accessToken` (cached), `refresh` and `revoke`. fetch and WebCrypto only; Node 20+, edge and Workers.

  Features: connect
