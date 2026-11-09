# @marktiderman/genesis-connect

Connect an outside account, server side, in a few lines. Three primitives:

- **Secrets with key versioning**: AES-256-GCM, a key per purpose (HKDF-SHA-256), each
  secret bound to its row, and a keyring so keys can be rotated without a migration.
- **An OAuth connector kit**: the authorization-code flow with PKCE on Web `Request` and
  `Response`, Google and Todoist built in, any other provider as a plain object. The app keeps the
  rows; the kit does the flow, seals the refresh token and hands it over.
- **Webhook signatures**: `verifyWebhookSignature` checks a provider's HMAC on a delivery's raw
  body, in constant time.

fetch and WebCrypto only, no dependencies: Node 20+, edge runtimes and Cloudflare Workers.
Server only: never import it into a browser bundle.

## Connect Google Drive

```ts
// connect.server.ts: create it once, at module scope.
import {
  createConnector,
  createSecrets,
  googleProvider,
  GOOGLE_SCOPES,
} from "@marktiderman/genesis-connect";

export const google = createConnector({
  provider: googleProvider,
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  stateSecret: process.env.CONNECT_STATE_SECRET!, // openssl rand -base64 32
  secrets: createSecrets(process.env.CONNECT_KEYRING!, {
    purpose: "google-refresh-token",
  }),
  callbackPath: "/api/connect/google/callback",
  scopes: [GOOGLE_SCOPES.driveFile],
  store: async (account) => {
    // Your table: id, user, sealed refresh token, scope. Never the plaintext.
    // The user is account.subject (from start), never a session read from the callback.
    await db.insert("google_grants", {
      id: account.id,
      user_id: account.subject,
      refresh_token: account.sealedRefreshToken,
      scope: account.scope,
    });
    return { grant: account.id }; // added to the way back: ?connect=connected&grant=…
  },
});

// POST /api/connect/google/start (after your own sign-in check)
export const start = async (request: Request) =>
  (
    await google.start(request, {
      subject: await userId(request),
      returnTo: "/settings/integrations",
    })
  ).redirect();

// GET /api/connect/google/callback
export const callback = (request: Request) => google.callback(request);

// Later, anywhere on the server:
const grant = await db.get("google_grants", grantId);
const token = await google.accessToken(
  grant.refresh_token,
  `google-grant:${grant.id}`,
);
await fetch("https://www.googleapis.com/drive/v3/files", {
  headers: { authorization: `Bearer ${token}` },
});
```

On the way back the page reads `?connect=`: `connected`, `expired` (start again), `browser`
(finished in another browser), `denied` (the person said no), `scope` (they unticked a scope
the app needs) or `failed`. Register `https://<your origin>/api/connect/google/callback` as an
authorized redirect URI in the Google Cloud console.

## Connect Google Calendar (read only)

Each person connects their own Google account and the app reads their calendars. Ask for the
two narrow read scopes plus `openid` and `email`, so the account says who it is:

```ts
export const googleCalendar = createConnector({
  provider: googleProvider,
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  stateSecret: process.env.CONNECT_STATE_SECRET!,
  secrets: createSecrets(process.env.CONNECT_KEYRING!, {
    purpose: "google-refresh-token",
  }),
  callbackPath: "/api/connect/google/callback",
  scopes: [
    GOOGLE_SCOPES.openid,
    GOOGLE_SCOPES.email,
    GOOGLE_SCOPES.calendarListReadonly,
    GOOGLE_SCOPES.calendarEventsReadonly,
  ],
  // Without a checked identity the connection fails, so every grant names its Google account.
  requireIdentity: true,
  store: async (account) => {
    // account.identity: { subject, email?, emailVerified?, name?, picture? } from the ID token.
    // Key the account on identity.subject, never on the email.
    const google = account.identity!;
    await db.insert("google_grants", {
      id: account.id,
      user_id: account.subject,
      google_account: google.subject,
      email: google.email ?? null,
      refresh_token: account.sealedRefreshToken,
      scope: account.scope,
    });
  },
});
```

`identity` is read from the ID token the token endpoint sent over TLS (`createConnector`
refuses a provider whose `tokenUrl` or `revokeUrl` isn't https, except on localhost). Its
signature isn't checked (OpenID Connect allows that only for a token taken straight from the
token endpoint), but its claims are: the issuer is the provider's `issuer`; the audience names
this client and no other audience (unless it is in `trustedAudiences`); `azp`, when present, is
this client, and is present when there are several audiences; and it hasn't expired. It is read
only when the attempt asked for `openid` (or `requireIdentity` is set). When a check fails (or
no ID token comes), `identity` is left out, the reason is logged (`callback` event), and the
connection still succeeds unless `requireIdentity` is set, which fails it instead and revokes
the new grant. `requireIdentity` needs the provider's `issuer` and `openid` in the connector's
`scopes`, or `createConnector` throws `config`. `email` is there only when the provider says
it's verified; never key an account on it, use `subject`. `name` and `picture` are whatever
the person set: treat them as untrusted (escape the name, check the URL before loading it).
`account.idToken` is the raw token with unchecked claims; read `identity` instead. The kit
fetches no calendar data: with `accessToken(...)`, the app calls the Calendar API
(`calendarList`, then `events` with `singleEvents=true` and a sync token) and keeps the rows.
Calendar scopes are sensitive. While the app's OAuth consent screen is in the **Testing**
publishing status, only the test users listed on it (up to 100) can connect, and their grants
and refresh tokens expire seven days after consent. Once it is **In production**, anyone can
connect, but until Google verifies the app it shows the unverified-app warning and caps how
many people can sign in.

## Connect Todoist

Todoist's OAuth (`todoistProvider`) joins scopes with commas, has no OpenID Connect and rotates
refresh tokens: access tokens last an hour, and every refresh sends a new refresh token. Ask for
`data:read_write` to read and change tasks, plus `data:delete` to delete them:

```ts
import { createConnector, createSecrets, todoistProvider, TODOIST_SCOPES } from "@marktiderman/genesis-connect";

export const todoist = createConnector({
  provider: todoistProvider,
  clientId: process.env.TODOIST_CLIENT_ID!,
  clientSecret: process.env.TODOIST_CLIENT_SECRET!,
  stateSecret: process.env.CONNECT_STATE_SECRET!,
  secrets: createSecrets(process.env.CONNECT_KEYRING!, { purpose: "todoist-refresh-token" }),
  callbackPath: "/api/connect/todoist/callback",
  scopes: [TODOIST_SCOPES.dataReadWrite, TODOIST_SCOPES.dataDelete],
  store: async (account) => {
    // No identity: read who the account is with the access token (Todoist's sync, `user`),
    // and key the row on that id, never the email.
  },
});
```

Pass `onRotate` and, on more than one instance, `grant` to `accessToken` ([below](#more-than-one-server-instance)):
a used refresh token sent again more than 60 seconds later revokes every token the person gave
the app. `revoke` is RFC 7009 with HTTP Basic client auth (`revokeAuth`). Apps made in Todoist's
console before refresh tokens get a ten-year access token and no refresh token, which this kit
doesn't keep: make a new app. Todoist's tasks API (sync tokens, batched commands, webhooks) is
`@marktiderman/genesis-tasks`.

### Webhooks

`verifyWebhookSignature` checks a delivery's HMAC on its raw body, in constant time
(`@marktiderman/genesis-connect` or `/webhooks`):

```ts
import { verifyWebhookSignature } from "@marktiderman/genesis-connect/webhooks";

const body = await request.text(); // the raw body: a re-serialized one isn't what was signed
if (
  !(await verifyWebhookSignature({
    secret: process.env.TODOIST_CLIENT_SECRET!,
    payload: body,
    signature: request.headers.get("x-todoist-hmac-sha256"),
  }))
)
  return new Response("Forbidden", { status: 403 });
```

The defaults (SHA-256, base64) are Todoist's; `encoding: "hex"` with `prefix: "sha256="` reads
GitHub's. It returns false for a missing, malformed or wrong signature and never throws for one.

## Secrets and key rotation

```ts
import { createSecrets } from "@marktiderman/genesis-connect/secrets";

// CONNECT_KEYRING = {"active":"k2","keys":{"k1":"<32 bytes base64>","k2":"<32 bytes base64>"}}
const secrets = createSecrets(process.env.CONNECT_KEYRING!, {
  purpose: "webhook-url",
});

const sealed = await secrets.seal(url, `destination:${row.id}`); // v2.k2.<iv>.<ciphertext>
const plain = await secrets.open(row.sealed, `destination:${row.id}`);

// Rotate: add k3 to the keyring, make it active, deploy. Old secrets still open.
// Then re-seal lazily on read, or in a job:
if (secrets.needsRotation(row.sealed))
  await save(row.id, await secrets.reseal(row.sealed, `destination:${row.id}`));
// When no row names k2 any more, drop it from the keyring.
```

- **Associated data is required.** Use the row's id (`grant:<id>`): a secret copied onto
  another row then refuses to open.
- **One purpose per kind of secret.** It is the HKDF `info`; keep it (and an optional
  `salt`) fixed once anything is sealed.
- **A bare key is a keyring of one**, `k1`. That is how a single-key app moves on.
- **Legacy `v1.` secrets** (genesis-forms' `sealSecret`) open with the key named by
  `legacyKeyId` (default `"k1"`), with the same purpose and salt; `reseal` turns them into `v2.`.
- **`v2` keys are derived apart from `v1`** (HKDF info `genesis-connect/v2:<purpose>`), so one
  key and purpose never seal both formats under the same AES key. `v1` is unchanged.
- **Errors are `SecretError`s** with a `code` (`key`, `format`, `unknown-key`, `decrypt`,
  `usage`) and a message that never holds a key, a key id, a plaintext or a ciphertext. Check
  them with `isSecretError(e)` rather than `instanceof`: it also matches the copy genesis-forms
  bundles, and the ESM and CJS builds.

## The OAuth connector

`createConnector(config)` checks its config at boot and returns:

| Call                                                                      | What it does                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(request, { subject, intent?, returnTo, scopes?, data?, params? })` | The provider's sign-in URL and a `Set-Cookie`. `.redirect()` answers a 303; `.json()` answers `{ url }` for a page that navigates itself.                                                                                                                                                                                                          |
| `callback(request)`                                                       | Checks the signed state (signature, age), that the cookie's nonce matches it, handles `error`, exchanges the code with the PKCE verifier, checks every scope asked for was granted (revoking the grant when one wasn't), seals the refresh token and calls `store`. Always a 303 back to `returnTo` with `?connect=<result>`, clearing the cookie. |
| `accessToken(sealed, aad)`                                                | A fresh access token, cached in memory until a minute before it expires.                                                                                                                                                                                                                                                                           |
| `refresh(sealed, aad, { onRotate })`                                      | Uncached; when the provider rotates the refresh token, the new one comes back sealed.                                                                                                                                                                                                                                                              |
| `revoke(sealed, aad)`                                                     | Revokes at the provider and forgets the cached token. True when it is gone. Google ends every token of the person's grant to your client, so only revoke the last connection that uses it.                                                                                                                                                         |

`accessToken`, `refresh` and `revoke` throw a `ConnectError` (check with `isConnectError(e)`)
with a `code`: `revoked` (the grant is gone, `invalid_grant`: connect again), `unavailable`
(retryable: 429, 5xx, a timeout, an abort), `failed`, or a `SecretError` when the sealed token
doesn't open for that row.

#### Providers that rotate refresh tokens

Some providers send a new refresh token on every refresh (Google does not). The kit never drops
one:

- `accessToken(sealed, aad, { onRotate })` needs `onRotate` for such a provider. A rotation
  without it throws a `usage` `ConnectError` whose `sealedRefreshToken` holds the new token;
  store it in place of the old one.
- The access token is cached (under the old and the new refresh token) before `onRotate` runs.
  If `onRotate` throws, a `failed` `ConnectError` carries the new token the same way.
- `refresh()` returns it as `sealedRefreshToken` (and calls `onRotate` when given).
- Concurrent `accessToken` calls for one grant share one refresh, so a cold start never
  rotates twice. The first caller's `signal` aborts the shared refresh.

```ts
const token = await connector.accessToken(row.refresh_token, aad, {
  onRotate: (sealed) => db.update("grants", row.id, { refresh_token: sealed }),
});
```

#### More than one server instance

The cache and the shared refresh live in one process. On serverless, a webhook, a job and a page
can each refresh the same grant at once, and a provider that rotates sees a used refresh token
again: Todoist then revokes every token the person gave the app. Pass `grant`, the grant as the
app keeps it, and refreshes run one at a time across instances:

```ts
const token = await connector.accessToken(row.refresh_token, aad, {
  onRotate: (sealed) => db.update("grants", row.id, { refresh_token: sealed }),
  grant: {
    // The app's lock for this grant: a row lock, an advisory lock, a lease.
    lock: (run) => db.withLock(`grant:${row.id}`, run),
    // Read inside the lock, so a waiter never trades the token the holder just rotated.
    current: async () => (await db.get("grants", row.id)).refresh_token,
    // Optional: share the access token, so instances don't each refresh.
    readAccessToken: async () => db.get("grant_access", row.id),
    writeAccessToken: (sealed, expiresAt) => db.upsert("grant_access", { id: row.id, sealed, expiresAt }),
  },
});
```

When the provider refuses an access token (a 401), call `forget(sealed, aad, { grant })`: it drops
this process's copy and the shared one (`clearAccessToken` when the grant has it, otherwise an
expired token through `writeAccessToken`), so the next `accessToken` refreshes. With a grant,
`onRotate` is required and checked before any refresh, and `refresh` refuses `grant` (it would
trade the token outside the lock). On more than one instance, call a rotating provider only
through `accessToken` with `grant`. A provider with `rotatesRefreshTokens` (Todoist) logs a refresh
answered without a new refresh token: usually the same token was traded twice.

An access token another instance stored is used while it has more than a minute left. Otherwise
the refresh runs inside `lock`, from `current()`, and the rotated token goes to `onRotate` before
the lock is let go. The new access token is sealed (to `<aad>:access`) for `writeAccessToken`.

### What it guarantees

- **Only the browser that started can finish.** The state carries a nonce; the cookie
  (HttpOnly, SameSite=Lax, Secure everywhere but localhost, scoped to the callback path)
  carries the same nonce and the PKCE verifier. No cookie, or another attempt's, ends as
  `browser`. Both cookie variants (host-only and shared-domain) are cleared on the way back.
- **https only**, except on `localhost`, `127.0.0.1` and `[::1]`: `start` on plain http
  anywhere else throws `config`. Behind a proxy that ends TLS, `request.url` may read `http://`:
  pass a `Request` built with the public https URL (from `X-Forwarded-Proto` and `Host`, if
  your proxy sets them and you trust it).
- **The state is signed and short-lived** (HMAC-SHA-256 with a key derived from
  `stateSecret`, 10 minutes by default). A forged, edited or old state ends as `expired`. It is
  signed, not encrypted: `data` is for ids, never secrets, and `subject` is readable in the
  sign-in URL (and by the provider), so pass an opaque user id, not an email address.
- **No secret in a URL or a log.** Token requests are POSTs that never follow a redirect
  (`redirect: "error"`) and time out after 10 seconds. `log` gets safe lines only: a step, a
  result and a reason such as `token endpoint answered 400 (invalid_grant)`.
- **`returnTo` is a path**, never a full URL, so the way back can't be pointed elsewhere.
- **A turned-down grant can be revoked.** When the callback refuses a grant after trading the
  code (a scope unticked, or no identity with `requireIdentity`), `revokeFailedGrants: true`
  revokes it through `revokeUrl` (best effort) rather than leave it standing. It's off by
  default: Google ends every token of the person's grant across the project on a revoke, so a
  returning person who unticks a scope would also lose the connection they already have. Turn
  it on only when each grant is isolated (one connection per client). The revoke runs in the background (at most
  3 seconds), so it never delays the redirect.
- **A `store` that throws keeps its grant.** The callback ends as `failed` but doesn't revoke
  the refresh token, since `store` may have half-written the row; clean up in `store` itself.

### One callback origin for many addresses

When an app answers on many addresses (`team-a.example.com`, `team-b.example.com`) but
registers one redirect URI with the provider:

```ts
createConnector({
  ...config,
  redirectOrigin: "https://app.example.com",
  sharedDomain: "example.com",
});
```

The cookie is scoped to `example.com`, the provider sends everyone to
`https://app.example.com/api/connect/google/callback`, and the browser goes back to the address
it started on, but only when that is exactly an https origin on `example.com` on the default
port; anything else
goes back to the callback's own origin. A start on an address the cookie can't carry to the
pinned origin (a preview on `*.vercel.app`) throws a `config` error rather than failing later.
A public suffix is refused as `sharedDomain`. The built-in list only knows common hosting
suffixes (`vercel.app`, `netlify.app`, `pages.dev`, `workers.dev`, `ngrok-free.app`,
`cloudfront.net`, `up.railway.app`, `co.uk`, `com.au`, …); pass `isPublicSuffix(domain)` (a
Public Suffix List lookup) to cover every one.

Google answers some short scopes with their full names (`email` is granted as
`https://www.googleapis.com/auth/userinfo.email`); `googleProvider.scopeAliases` maps them so
the granted-scope check compares like with like. A provider of your own can set
`scopeAliases` too.

### Another provider

A provider is a plain object:

```ts
const acme: OAuthProvider = {
  id: "acme",
  authorizeUrl: "https://auth.acme.example/authorize",
  tokenUrl: "https://auth.acme.example/token",
  revokeUrl: "https://auth.acme.example/revoke",
  defaultScopes: ["read"],
  tokenAuth: "client_secret_basic", // or "client_secret_post", the default
};
```

### Config

| Option                                         | Default                         |                                                                                             |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `provider`, `clientId`, `clientSecret`         |                                 | The provider and your OAuth client.                                                         |
| `stateSecret`                                  |                                 | 32 bytes, base64. Signs the state.                                                          |
| `secrets`                                      |                                 | `createSecrets(keyring, { purpose })`: seals refresh tokens.                                |
| `callbackPath`                                 |                                 | The callback route's path.                                                                  |
| `store(account, { request })`                  |                                 | Keeps the account. May return query parameters for the way back. Throwing ends as `failed`. |
| `scopes`                                       | `provider.defaultScopes`        | Scopes asked for when `start` names none.                                                   |
| `redirectOrigin`, `sharedDomain`               |                                 | See above.                                                                                  |
| `cookieName`                                   | `genesis_connect_<provider id>` |                                                                                             |
| `cookiePath`                                   | `callbackPath`                  | `callbackPath` or a parent directory of it (RFC 6265 path-match).                           |
| `stateTtlSeconds`                              | 600                             | 60 to 3600.                                                                                 |
| `resultParam`                                  | `connect`                       | The query parameter the result comes back in.                                               |
| `fallbackPath`                                 | `/`                             | Where `expired` goes when there is no state to read `returnTo` from.                        |
| `aad(id)`                                      | `<provider id>-grant:<id>`      | The associated data a grant's refresh token is sealed to.                                   |
| `requireRefreshToken`                          | true                            | Fail when the provider sends none.                                                          |
| `requireIdentity`                              | false                           | Fail when no checked `identity` can be read from the ID token (the reason is logged).       |
| `trustedAudiences`                             | none                            | Other audiences an ID token's `aud` may name besides `clientId`.                            |
| `revokeFailedGrants`                           | false                           | Revoke a grant the callback turns down (a missing scope, no identity). See below.           |
| `isPublicSuffix(domain)`                       |                                 | A Public Suffix List lookup for the `sharedDomain` check.                                   |
| `fetch`, `timeoutMs`, `now`, `randomId`, `log` |                                 | For tests and logging.                                                                      |
