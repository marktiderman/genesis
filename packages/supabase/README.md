# @marktiderman/genesis-supabase

Supabase for Genesis apps on web and React Native.

```ts
import { createGenesisSupabase, must } from "@marktiderman/genesis-supabase";
import { keychainStorage, refreshWhileActive, wipeSessionOnReinstall } from "@marktiderman/genesis-supabase/native";
import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const session = keychainStorage(SecureStore);
await wipeSessionOnReinstall({ session, sessionKey: "sb-<project-ref>-auth-token", installMarker: AsyncStorage });

export const supabase = createGenesisSupabase<Database>({ url, publishableKey, storage: session, platform: "native", crypto: ExpoCrypto });
refreshWhileActive(supabase, AppState);

const rows = must(await supabase.from("tasks").select("*"));
```

- **`createGenesisSupabase`**: a client with PKCE sign-in, a persisted session that refreshes itself, and the storage you pass. `platform: "native"` turns off reading a session from the URL; exchange the OAuth redirect's code yourself.
- **`crypto: ExpoCrypto`** (native): Hermes has no `crypto.subtle`, and without it supabase-js sends the PKCE challenge as `plain` (the verifier itself) and, with no `crypto` at all, makes the verifier with `Math.random`. Passing `expo-crypto` installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` (real WebCrypto is never replaced), so the challenge is S256. A PKCE client made with neither (on any platform: a browser page served over plain HTTP from a LAN address has no `crypto.subtle` either) throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always asks the server to check the token (`getUser`), the path supabase-js itself takes without WebCrypto: the polyfill hashes, it can't verify a signature. `installWebCrypto` and `hasPkceCrypto` on `/native` do the same by hand.
- **`keychainStorage(SecureStore)`**: session storage in the Keychain or Keystore. Values are split between characters into chunks under the Keychain's byte limit; a write switches to its new chunks only once they are all written, so a write cut short keeps the previous session, and its leftover chunks are swept on the next write; writes to one key run one at a time.
- **`refreshWhileActive(client, AppState)`**: refreshes the session only while the app is in front.
- **`wipeSessionOnReinstall`**: the iOS Keychain outlives an uninstall; this removes a leftover session (and its PKCE verifier) on the first launch after an install.
- **`must(result)`**: the data, or a thrown `SupabaseQueryError` carrying the database's `code`, `details` and `hint`.
- **`signInWithApple`, `completeOAuthRedirect`, `deleteMyAccount`, `storeAppleToken`**: see [Account](#account-sign-in-and-deletion) below.
- **`app_release_policy`**: the table the native updates block reads; see [Release policy](#release-policy-the-updates-block).

Nothing here imports React Native or Expo: you pass those modules in.

## Account: sign-in and deletion

What the App Store asks of an app with accounts: an equivalent privacy-preserving login beside any
other third-party sign-in (Guideline 4.8; Sign in with Apple satisfies it), Apple's own button, and
deleting the account from inside the app (5.1.1(v)), including revoking the person's Apple tokens
([Revoking Apple's tokens](#revoking-apples-tokens)). What isn't covered is under
[Not covered yet](#not-covered-yet).

### Sign in with Apple

```ts
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { storeAppleToken } from "@marktiderman/genesis-supabase";
import { signInWithApple } from "@marktiderman/genesis-supabase/native";

const digest = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

async function onApple() {
  const result = await signInWithApple(supabase, AppleAuthentication, { digest, randomNonce: Crypto.randomUUID });
  if (result.canceled) return; // they closed Apple's sheet: not an error
  if (result.error) return showError(result.error.message); // result.error.code says why
  // Apple shares the name on the first sign-in only, so save it now.
  if (result.fullName) await supabase.auth.updateUser({ data: { full_name: result.fullName } });
  // For revoking on deletion: hand the single-use code to the server now (see "Revoking Apple's tokens").
  if (result.authorizationCode) {
    const stored = await storeAppleToken(supabase, { authorizationCode: result.authorizationCode, clientId: Constants.expoConfig?.ios?.bundleIdentifier });
    if (!stored.ok) console.warn(stored.error.message); // they're signed in either way
  }
}
```

- **`signInWithApple(client, AppleAuthentication, { digest, randomNonce? })`**: checks
  `isAvailableAsync()`, asks for name and email with the SHA-256 (lowercase hex; anything else is
  `bad_digest`) of a fresh nonce, and signs in with `signInWithIdToken({ provider: "apple", token, nonce })`
  (Supabase gets the raw nonce and checks the token against it). Returns
  `{ session, user, fullName, email, authorizationCode }`, `{ canceled: true }` or `{ error }` (a
  `GenesisAuthError` with a `code`, plus `fullName` when Apple shared one, so a retry can still
  save it); it never throws.
- Draw it with `appleProvider({ apple: AppleAuthentication, onPress: onApple })` from
  `@marktiderman/genesis-ui-native` in `AuthScreen`'s `providers`: Apple's own button on iOS,
  nothing elsewhere.
- Setup is yours: enable the Apple provider in Supabase Auth with your bundle id as a client id,
  turn on the Sign in with Apple capability (`ios.usesAppleSignIn: true` in `app.json`), and add
  `expo-apple-authentication` and `expo-crypto`.

### Other OAuth providers (Google…): the redirect

```ts
import * as WebBrowser from "expo-web-browser";
import { completeOAuthRedirect } from "@marktiderman/genesis-supabase/native";

const redirectTo = "myapp://auth/callback";
const { data } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
const res = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo);
if (res.type === "success") {
  const result = await completeOAuthRedirect(supabase, res.url);
  if (result.error) showError(result.error.message); // never result.error.providerMessage
  else if (result.redirectType === "recovery") router.push("/set-password");
}
```

- **`completeOAuthRedirect(client, url)`**: reads the redirect's query and fragment. A `code` is
  exchanged with `exchangeCodeForSession`, with the redirect's `sb_flow_id` when it has one so the
  right flow's verifier is used. An `error` comes back as `{ error }` with no request. Returns
  `{ session, redirectType }` (`"recovery"` after a password-reset link) or `{ error }`; it never throws.
- **Pass only the URL `openAuthSessionAsync` resolved with**, for the sign-in the app just started.
  A code is single-use and the exchange spends the stored verifier whatever happens, so feeding it a
  stray `?code=` from some other link burns the sign-in in progress.
- **Handle each redirect once.** If the app also listens with `Linking.addEventListener("url", …)`,
  the same redirect arrives twice and the second exchange fails just after the first signed them
  in. Pick one path (the auth-session result), or remember the last code you handled and skip it.
- **The error text is fixed copy.** `error.message` is chosen from the `code`; the redirect's own
  `error_description` is only on `error.providerMessage`, which is **untrusted**: any web page or
  app can open your callback link with any text in it. Log it, don't show it.
- **Native needs `flowType: "pkce"`**, which `createGenesisSupabase` sets. With the implicit flow
  the redirect carries tokens instead of a code, and this returns `missing_code`.
- **Redirect URLs:** add the exact deep link (`myapp://auth/callback`) to Supabase Auth's Redirect
  URLs, not a wildcard such as `myapp://**`.
- **Why the deep link is safe:** another app can claim your custom scheme, and any page can open
  it. That's harmless because of PKCE: a code is useless without the verifier, which never leaves
  this device. The implicit flow would hand tokens to whoever owns the scheme.

### Deleting the account

The database half is a migration this package ships:
[`migrations/0001_genesis_account_deletion.sql`](./migrations/0001_genesis_account_deletion.sql)
(also at `node_modules/@marktiderman/genesis-supabase/migrations/`). Copy it into your app's
`supabase/migrations/` under a new timestamped name. It defines `public.delete_my_account()`, a
`security definer` function with `search_path = ''` that deletes the caller's `auth.users` row,
executable by `authenticated` only (granted and revoked by name; a later blanket
`grant … on all functions` would hand it back to `anon`, so such a grant must exclude it). Its pgTAP
test is `migrations/tests/0001_genesis_account_deletion.test.sql`: copy it to
`supabase/tests/database/` and run `supabase test db`.

It refuses, by error code (`SupabaseQueryError.code` on the client):

| Code | When |
|---|---|
| `42501` | Nobody is signed in, or the person has a verified MFA factor and the session isn't `aal2`: verify the second factor, then retry. |
| `GA001` | The app's hook refused (below). |
| `GA002` | The app requires a recent sign-in and this one isn't: sign in again, then retry. |
| `23503` | A row still references the login: a foreign key without `on delete cascade`, or files in Storage. |

- **Your data:** deleting the login removes the rows whose foreign keys to `auth.users(id)` are
  `on delete cascade`, and is refused (`23503`) while any other row still points at it, so the
  person never ends up half-deleted. Give every user-owned table such a foreign key: a table keyed
  on `auth.uid()` without one keeps orphans.
- **Storage:** Supabase documents that a user who owns objects in Storage can't be deleted, so the
  call fails (`23503`) while they have files. Remove their files through the Storage API first.
  (Documented by Supabase; not verified against a full stack in this package's tests.)
- **The app hook:** create `private.genesis_before_account_delete(uuid)` and it runs first, in the
  same transaction, with the person's id, to scrub data, set flags, or refuse (e.g. the sole owner
  of a team). Any error it raises cancels the delete and reaches the client as `GA001` (or as the
  hook's own code when that starts with `GA`). The migration's header has an example.
- **Recent sign-in (optional):** call `perform private.genesis_require_recent_sign_in(interval '10 minutes')`
  from the hook to require that the person authenticated within that time (`GA002` otherwise). It
  reads the newest `amr` timestamp in the JWT, which records the actual sign-in and survives a token
  refresh, and falls back to `iat`. On `GA002`, have them sign in again (or `reauthenticate()`),
  then retry.

```ts
import { Alert } from "react-native";
import { deleteMyAccount } from "@marktiderman/genesis-supabase";

<SettingsPage
  sections={sections}
  dangerousActions={[
    {
      label: "Delete account",
      testID: "delete-account",
      onPress: () =>
        Alert.alert("Delete your account?", "This removes your account and its data for good. It can't be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void deleteMyAccount(supabase).catch(showError) },
        ]),
    },
  ]}
/>;
```

- **`deleteMyAccount(client, { revokeAppleTokens? })`**: calls the `delete_my_account` RPC through
  `must`, then signs this device out (`scope: "local"`; the login's refresh tokens went with it). A
  refusal throws a `SupabaseQueryError` and keeps the session. An access token already issued stays
  valid until it expires. With `revokeAppleTokens: true` (or the function's name) it asks the
  `genesis-apple-revoke` function to revoke the person's Apple tokens between the two; that never
  fails the call (below).

### Revoking Apple's tokens

Apple requires an app that offers Sign in with Apple to revoke the person's tokens through its REST
API (`https://appleid.apple.com/auth/revoke`) when they delete their account, and App Review rejects
apps that don't. Supabase doesn't: the native id-token sign-in never gives Supabase an Apple refresh
token, and Auth doesn't keep the provider tokens it does see. So this package ships the server step:

- [`migrations/0003_genesis_apple_token_revocation.sql`](./migrations/0003_genesis_apple_token_revocation.sql):
  `private.genesis_apple_tokens` (one refresh token per login and client id),
  `private.genesis_apple_revocations` (the queue), a `before delete` trigger on `auth.users` that
  moves a login's tokens into the queue, and four `public` functions only `service_role` can execute.
  Its pgTAP test is `migrations/tests/0003_genesis_apple_token_revocation.test.sql`.
- [`functions/genesis-apple-revoke/`](./functions/genesis-apple-revoke): a Supabase Edge Function
  (Deno). `{ action: "store", code, clientId? }` with the person's access token exchanges Apple's
  authorization code at `/auth/token` and keeps the refresh token; `{ action: "revoke" }` revokes
  whatever is due in the queue. `apple.ts` (the client secret, the exchange, the revocation) is plain
  WebCrypto and fetch; `handler.ts` takes its dependencies, so both are unit-tested here.

**How it runs.** At sign-in the app calls `storeAppleToken(supabase, { authorizationCode, clientId })`
(the code is single-use and valid for five minutes). The function checks the access token with the
auth server, exchanges the code with a client secret it signs for that client id, refuses a code
whose Apple account (`sub`) isn't one linked to the caller (and revokes the token that exchange
minted), and stores the refresh token. Deleting the login, by `delete_my_account`, the dashboard or
the admin API, fires the trigger, which queues its tokens in the same transaction. The app's
`deleteMyAccount(supabase, { revokeAppleTokens: true })` then asks the function to work through the
queue at once (it answers 202 straight away and finishes in the background), and a schedule retries
what's left.

**Each revocation is proved first.** Apple answers 200 to `/auth/revoke` for a token it doesn't
know even when the client secret is garbage (seen 2026-10-24), so that 200 alone proves nothing.
The function first checks the token at `/auth/token` (`grant_type=refresh_token`): a 200 means the
secrets are right and the token is live, so it revokes it and forgets the row only on a 200 from
`/auth/revoke`; `invalid_grant` means the token is already dead (the person revoked it, or it
expired), so there's nothing left to revoke and the row goes; anything else (`invalid_client` for
wrong secrets, Apple down) is retried.

**When Apple fails, the account is deleted anyway.** The person asked for their data to go, and the
GDPR's right to erasure doesn't wait on a third party's API; Apple asks for revocation, not for
deletion to block on it. So deletion never calls Apple: a refused delete queues nothing (the
trigger runs in its transaction), a committed one can't lose its token, and the function retries
each queued token with backoff (five minutes, doubling, at most a day apart). After 30 failed
attempts (about four weeks) it gives up: the token is dropped, so a deleted person's token isn't
kept for ever, and the row stays with `last_error` starting `gave_up`. A deleted login that signed in
with Apple but has no stored token (the store step failed, or the account predates this) leaves a
row with `last_error` starting `no_token`. Every failure is logged with Apple's error code; any row
still in `private.genesis_apple_revocations` is one to look at.

For a login with no stored token, the only fix is Apple's own: have the person sign in with Apple
again at deletion, store the fresh code, then delete. This package doesn't do that for you.

**Who can see a token.** Nobody but the migration's functions: the tables are in `private` (not in
the Data API), with row level security on, no policies, and every table privilege revoked from anon
and authenticated. The four `public` functions are granted to `service_role` by name and revoked
from `public`, `anon` and `authenticated` by name; a later blanket `grant … on all functions` would
hand them back, so such a grant must exclude them. The column isn't encrypted: an Apple refresh
token is useless without a client secret signed with your .p8 key, which lives in the function's
secrets, not the database. The function never returns or logs a token, a key or Apple's response
body.

**Setup:**

1. In Apple Developer, under Keys, create a key with Sign in with Apple enabled for your App ID, and
   download the .p8 (once). Note its Key ID and your Team ID.
2. Copy the migration into `supabase/migrations/` under a new timestamped name, its test into
   `supabase/tests/database/`, and `functions/genesis-apple-revoke/` into `supabase/functions/`.
3. Set the secrets (for a local stack, put the same names in `supabase/functions/.env`):
   ```bash
   supabase secrets set APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_ID=FGHIJ67890 \
     APPLE_CLIENT_IDS=com.example.app,com.example.app.dev APPLE_PRIVATE_KEY="$(cat AuthKey_FGHIJ67890.p8)"
   ```
   `APPLE_CLIENT_IDS` lists every bundle id (or Services ID) the app signs in with, each build
   variant too (`.dev`, `.preview`); a store request names one of them, or gets the first, and one
   outside the list is refused (`unknown_client`, logged). Keep the .p8 out of the repo.
4. Deploy without the gateway's JWT check: the store action checks the caller itself, and the
   revoke action runs after the login is gone and needs no caller. Anyone can call it, but all it
   does is work through rows already due, 20 at a time, each at most once per backoff step, and
   answer `{ ok: true }`; repeat calls find nothing due.
   ```toml
   # supabase/config.toml
   [functions.genesis-apple-revoke]
   verify_jwt = false
   ```
   then `supabase functions deploy genesis-apple-revoke`.
5. Schedule the retries (Supabase's pg_cron and pg_net; once per project, not in a migration
   because the URL differs per project):
   ```sql
   select cron.schedule('genesis-apple-revoke', '*/10 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/genesis-apple-revoke',
       headers := '{"content-type": "application/json"}'::jsonb,
       body := '{"action": "revoke"}'::jsonb)
   $$);
   ```
6. Wire the app: `storeAppleToken` after `signInWithApple` (above) and
   `deleteMyAccount(supabase, { revokeAppleTokens: true })`.
7. Before release, sign in with Apple on a device build and check a row appears in
   `private.genesis_apple_tokens`; then delete the account and check the queue empties and the app
   is gone from Settings → Apple ID → Sign in with Apple on the device.

To watch it: `select id, client_id, attempts, last_error, queued_at from private.genesis_apple_revocations order by queued_at;`
(no tokens in that select). `check: invalid_client` means the secrets don't match the client id;
`gave_up` and `no_token` rows are tokens that were never revoked.

Each sign-in replaces the stored token for that client id without revoking the old one, which would
end the authorization the new one belongs to (if Apple's revocation covers the whole authorization,
which isn't verified here).

### Not covered yet

- **Tried against Apple with a real key.** The client secret, the request shapes and the failure
  paths are unit-tested with a throwaway P-256 key and a mocked Apple, and the SQL with pgTAP, but
  no real Sign in with Apple key has been through the exchange and revocation yet (setup step 7).
  That Apple answers `invalid_client` (not `invalid_grant`) to a live token with wrong secrets is
  expected, not observed.
- **Sign in with Apple on the web** (Services ID and redirect) isn't wired: the function accepts a
  Services ID in `APPLE_CLIENT_IDS`, but exchanges codes without a `redirect_uri`, as a native
  sign-in needs.

## Release policy (the updates block)

[`migrations/0002_genesis_app_release_policy.sql`](./migrations/0002_genesis_app_release_policy.sql)
defines `public.app_release_policy`, one row per app: the oldest store version each platform may
run (`min_version_ios`, `min_version_android`), store links, a maintenance switch with a message,
and release notes (`notes`, an array of `{ version, title?, body }`). Copy it into your app's
`supabase/migrations/` under a new timestamped name, and its pgTAP test
(`migrations/tests/0002_genesis_app_release_policy.test.sql`) into `supabase/tests/database/`.

- **Who can do what:** row level security is on; anon and authenticated may only `select` (the app
  reads it before sign-in), and only the service role writes. Supabase's default privileges give
  anon and authenticated everything on a new public table, so the migration revokes them by name
  and grants back `select` alone.
- **Malformed values stay out:** check constraints require plain dotted versions (`1.4.0`), https
  (or `itms-apps://` / `market://`) store links, a store link beside each minimum version (the
  force-upgrade screen's only way out), and notes that are objects with a string `version` and
  `body` (and a string `title`, if any).
- **Read it** with `supabasePolicySource(supabase)` from `@marktiderman/genesis-native/updates`,
  which fails open: no row, a failed read or a malformed value never blocks anyone.

## Choices, and why

- **Keychain chunks rather than encrypted AsyncStorage.** Supabase's Expo guide shows two options: an AES-encrypted value in AsyncStorage with the key in SecureStore ("LargeSecureStore"), or `expo-sqlite/localStorage`. `keychainStorage` keeps the whole session in the Keychain/Keystore instead, split into chunks under the item size limit, with an atomic switch between generations. That means one native dependency (`expo-secure-store`) rather than three, no key to manage, and a session that can't be read off the device's file system. If you prefer LargeSecureStore, pass it as `storage`; everything else here works the same.
- **The URL polyfill.** Supabase's React Native guides still import `react-native-url-polyfill/auto` before creating the client. Keep it until your app has tested PKCE sign-in end to end without it: React Native's built-in `URL` has improved, but the docs don't yet say it's enough.
- **`refreshWhileActive` on native only.** Supabase gates the AppState listener to native platforms; call it from native code (not on web, where the browser already refreshes in the background).


Part of the [Genesis framework](https://github.com/marktiderman/genesis).
