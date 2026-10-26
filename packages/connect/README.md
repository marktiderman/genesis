# @marktiderman/genesis-connect

Connect an outside account, server side, in a few lines. Two primitives:

- **Secrets with key versioning**: AES-256-GCM, a key per purpose (HKDF-SHA-256), each
  secret bound to its row, and a keyring so keys can be rotated without a migration.
- **An OAuth connector kit**: the authorization-code flow with PKCE on Web `Request` and
  `Response`, Google built in, any other provider as a plain object. The app keeps the
  rows; the kit does the flow, seals the refresh token and hands it over.

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
- **Errors are `SecretError`s** with a `code` (`key`, `format`, `unknown-key`, `decrypt`,
  `usage`) and a message that never holds a key, a plaintext or a ciphertext.

## The OAuth connector

`createConnector(config)` checks its config at boot and returns:

| Call                                                                      | What it does                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(request, { subject, intent?, returnTo, scopes?, data?, params? })` | The provider's sign-in URL and a `Set-Cookie`. `.redirect()` answers a 303; `.json()` answers `{ url }` for a page that navigates itself.                                                                                                                                                                     |
| `callback(request)`                                                       | Checks the signed state (signature, age), that the cookie's nonce matches it, handles `error`, exchanges the code with the PKCE verifier, checks every scope asked for was granted, seals the refresh token and calls `store`. Always a 303 back to `returnTo` with `?connect=<result>`, clearing the cookie. |
| `accessToken(sealed, aad)`                                                | A fresh access token, cached in memory until a minute before it expires.                                                                                                                                                                                                                                      |
| `refresh(sealed, aad, { onRotate })`                                      | Uncached; when the provider rotates the refresh token, the new one comes back sealed.                                                                                                                                                                                                                         |
| `revoke(sealed, aad)`                                                     | Revokes at the provider and forgets the cached token. True when it is gone. Google ends every token of the person's grant to your client, so only revoke the last connection that uses it.                                                                                                                    |

`accessToken`, `refresh` and `revoke` throw a `ConnectError` with a `code`: `revoked` (the
grant is gone, `invalid_grant`: connect again), `unavailable` (retryable: 429, 5xx, a timeout),
`failed`, or a `SecretError` when the sealed token doesn't open for that row.

### What it guarantees

- **Only the browser that started can finish.** The state carries a nonce; the cookie
  (HttpOnly, SameSite=Lax, Secure on https, scoped to the callback path) carries the same nonce
  and the PKCE verifier. No cookie, or another attempt's, ends as `browser`.
- **The state is signed and short-lived** (HMAC-SHA-256 with a key derived from
  `stateSecret`, 10 minutes by default). A forged, edited or old state ends as `expired`. It is
  signed, not encrypted: `data` is for ids, never secrets.
- **No secret in a URL or a log.** Token requests are POSTs that never follow a redirect
  (`redirect: "error"`) and time out after 10 seconds. `log` gets safe lines only: a step, a
  result and a reason such as `token endpoint answered 400 (invalid_grant)`.
- **`returnTo` is a path**, never a full URL, so the way back can't be pointed elsewhere.

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
it started on, but only when that is exactly an https origin on `example.com`; anything else
goes back to the callback's own origin. A start on an address the cookie can't carry to the
pinned origin (a preview on `*.vercel.app`) throws a `config` error rather than failing later.
A public suffix (`vercel.app`, `co.uk`) is refused as `sharedDomain`.

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
| `cookiePath`                                   | `callbackPath`                  | Must cover `callbackPath`.                                                                  |
| `stateTtlSeconds`                              | 600                             | 60 to 3600.                                                                                 |
| `resultParam`                                  | `connect`                       | The query parameter the result comes back in.                                               |
| `fallbackPath`                                 | `/`                             | Where `expired` goes when there is no state to read `returnTo` from.                        |
| `aad(id)`                                      | `<provider id>-grant:<id>`      | The associated data a grant's refresh token is sealed to.                                   |
| `requireRefreshToken`                          | true                            | Fail when the provider sends none.                                                          |
| `fetch`, `timeoutMs`, `now`, `randomId`, `log` |                                 | For tests and logging.                                                                      |
