# @marktiderman/genesis-supabase

Supabase for Genesis apps on web and React Native.

```ts
import { createGenesisSupabase, must } from "@marktiderman/genesis-supabase";
import {
  keychainStorage,
  refreshWhileActive,
  wipeSessionOnReinstall,
} from "@marktiderman/genesis-supabase/native";
import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const session = keychainStorage(SecureStore);
await wipeSessionOnReinstall({
  session,
  sessionKey: "sb-<project-ref>-auth-token",
  installMarker: AsyncStorage,
});

export const supabase = createGenesisSupabase<Database>({
  url,
  publishableKey,
  storage: session,
  platform: "native",
  crypto: ExpoCrypto,
});
refreshWhileActive(supabase, AppState);

const rows = must(await supabase.from("tasks").select("*"));
```

- **`createGenesisSupabase`**: a client with PKCE sign-in, a persisted session that refreshes itself, and the storage you pass. `platform: "native"` turns off reading a session from the URL; exchange the OAuth redirect's code yourself.
- **`crypto: ExpoCrypto`** (native): Hermes has no `crypto.subtle`, and without it supabase-js sends the PKCE challenge as `plain` (the verifier itself) and, with no `crypto` at all, makes the verifier with `Math.random`. Passing `expo-crypto` installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` (real WebCrypto is never replaced), so the challenge is S256. A PKCE client made with neither (on any platform: a browser page served over plain HTTP from a LAN address has no `crypto.subtle` either) throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always asks the server to check the token (`getUser`), the path supabase-js itself takes without WebCrypto: the polyfill hashes, it can't verify a signature. `installWebCrypto` and `hasPkceCrypto` on `/native` do the same by hand.
- **`keychainStorage(SecureStore)`**: session storage in the Keychain or Keystore. Values are split between characters into chunks under the Keychain's byte limit; a write switches to its new chunks only once they are all written, so a write cut short keeps the previous session, and its leftover chunks are swept on the next write; writes to one key run one at a time.
- **`refreshWhileActive(client, AppState)`**: refreshes the session only while the app is in front.
- **`wipeSessionOnReinstall`**: the iOS Keychain outlives an uninstall; this removes a leftover session (and its PKCE verifier) on the first launch after an install.
- **`must(result)`**: the data, or a thrown `SupabaseQueryError` carrying the database's `code`, `details` and `hint`.
- **`signInWithApple`, `signInWithGoogle`, `completeOAuthRedirect`, `deleteMyAccount`, `storeAppleToken`**: see [Account](#account-sign-in-and-deletion) below.
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

const digest = (s: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

async function onApple() {
  // The nonce is 32 random bytes from crypto.getRandomValues (createGenesisSupabase installs it on native).
  const result = await signInWithApple(supabase, AppleAuthentication, {
    digest,
  });
  if (result.canceled) return; // they closed Apple's sheet: not an error
  if (result.error) return showError(result.error.message); // result.error.code says why
  // Apple shares the name on the first sign-in only, so save it now.
  if (result.fullName)
    await supabase.auth.updateUser({ data: { full_name: result.fullName } });
  // For revoking on deletion: hand the single-use code to the server now (see "Revoking Apple's tokens").
  if (result.authorizationCode) {
    const stored = await storeAppleToken(supabase, {
      authorizationCode: result.authorizationCode,
      clientId: Constants.expoConfig?.ios?.bundleIdentifier,
    });
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

### Google, natively

```ts
import { GoogleOneTapSignIn } from "@react-native-google-signin/google-signin";
import { signInWithGoogle } from "@marktiderman/genesis-supabase/native";

GoogleOneTapSignIn.configure({
  webClientId: WEB_CLIENT_ID,
  iosClientId: IOS_CLIENT_ID,
}); // once, at start-up

async function onGoogle() {
  const result = await signInWithGoogle(supabase, GoogleOneTapSignIn, {
    digest,
  });
  if (result.canceled) return;
  if (result.error) return showError(result.error.message);
}
```

- **`signInWithGoogle(client, GoogleOneTapSignIn, { digest, randomNonce? })`**: makes a fresh
  nonce (32 random bytes), gives Google its SHA-256 (hex) through
  `authenticate({ nonce })`, checks the returned ID token's `nonce` claim is that hash
  (`google_nonce_missing` otherwise, and nothing is sent), then signs in with
  `signInWithIdToken({ provider: "google", token, nonce })` with the raw nonce, which Supabase checks
  against the token: the flow in Supabase's Google guide. Returns `{ session, user, fullName, email }`,
  `{ canceled: true }` or `{ error }`; it never throws.
- **It needs the Universal sign-in module** (`GoogleOneTapSignIn`, with `authenticate`) of
  `@react-native-google-signin/google-signin`, which is in the library's paid build. The free npm
  build only has the original `GoogleSignin`, which can't pass a nonce on Android or iOS, so its
  tokens fail the nonce check. Genesis doesn't offer a way around that: Supabase's "Skip nonce
  check" would let a stolen ID token sign in, so keep it off. Without the paid build, use the
  redirect below.
- Draw it with `googleProvider({ onPress: onGoogle })` from `@marktiderman/genesis-ui-native`. On
  iOS, Guideline 4.8 wants Sign in with Apple beside it.
- Setup is yours: a Web client id (Supabase's Google provider takes it, plus the iOS and Android
  client ids under "Authorized Client IDs"), an iOS client id, an Android client id with your
  signing certificate's SHA-1, and the module's config plugin with the iOS URL scheme.

### Other OAuth providers (Google…): the redirect

```ts
import * as WebBrowser from "expo-web-browser";
import { completeOAuthRedirect } from "@marktiderman/genesis-supabase/native";

const redirectTo = "myapp://auth/callback";
const { data } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo, skipBrowserRedirect: true },
});
const res = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo);
if (res.type === "success") {
  const result = await completeOAuthRedirect(supabase, res.url);
  if (result.error)
    showError(result.error.message); // never result.error.providerMessage
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

| Code    | When                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `42501` | Nobody is signed in, or the person has a verified MFA factor and the session isn't `aal2`: verify the second factor, then retry. |
| `GA001` | The app's hook refused (below).                                                                                                  |
| `GA002` | The app requires a recent sign-in and this one isn't: sign in again, then retry.                                                 |
| `23503` | A row still references the login: a foreign key without `on delete cascade`, or files in Storage.                                |

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

## Push (the push block)

> **Superseded by [`@marktiderman/genesis-notifications`](../notifications/README.md).** Its
> migration adopts this one's three tables in place (adding columns, changing no row), replaces
> `genesis_push_register` and `genesis_push_forget` with stricter versions (a token moves to
> another login only from the same phone, and forget reveals nothing), and its runner replaces
> the `genesis-push-send` function and the sender functions below. Migration 0005 and the
> function stay here unchanged for apps that already run them; new apps take the notifications
> block instead. When you move, remove 0005's pgTAP test from your app (two of its assertions
> describe the old register and forget) and stop calling `genesis-push-send`.

[`migrations/0005_genesis_push.sql`](./migrations/0005_genesis_push.sql) and the
[`genesis-push-send`](./functions/genesis-push-send) Edge Function are the server half of
`@marktiderman/genesis-native/push`. Copy the migration into your app's `supabase/migrations/`
under a new timestamped name, its pgTAP test (`migrations/tests/0005_genesis_push.test.sql`) into
`supabase/tests/database/`, and the function folder into `supabase/functions/`.

- **Tables**, all with row level security on and owner-only policies:
  `push_devices` (user, Expo token, platform, app version, last seen; read and deleted by the
  owner, written only through `genesis_push_register`), `notification_preferences` (category
  switches, quiet hours with an IANA time zone checked on write, `hide_previews`; the owner reads
  and writes their own row) and `push_receipts` (category, Expo ticket id, status and an Expo
  error code, never content; the owner reads, the sender writes; kept 30 days). Deleting a login
  deletes all three.
- **Who can call what**, granted and revoked by name: `genesis_push_register` (authenticated, its
  own token; a token another login held moves, and ten devices per person are kept),
  `genesis_push_forget(token)` (anon and authenticated: the phone may already be signed out), and
  for the service role only `genesis_push_status`, `genesis_push_targets`,
  `genesis_push_tickets_record`, `genesis_push_receipts_claim`, `genesis_push_receipts_settle` and
  `genesis_push_devices_forget`.
- **Who to push to:** `genesis_push_targets(user, category, default_on, bypass_quiet_hours, at)`
  returns the person's devices, or none when they turned the category off or are in quiet hours.
  Quiet hours are read in their time zone: each night's window runs from the first moment the
  local clock reads the start to the first moment after it that it reads the end (past midnight
  when the start is later), so a repeated fall-back hour doesn't restart it and a skipped
  spring-forward end time ends it at the change. A start equal to the end is no quiet hours, and a
  zone the server no longer knows never silences anyone.
  `genesis_push_status` says why and until when (`quiet_until`), so a caller can send later.
- **An Expo push token is a credential.** Only its owner and the service role can read one. Turn
  on enhanced push security in your Expo project and give the function `EXPO_ACCESS_TOKEN`, so a
  leaked token alone can't push to a phone.

### Sending

Deploy `genesis-push-send` with `--no-verify-jwt` (the starter's `config.toml` sets
`verify_jwt = false`) and set `GENESIS_PUSH_SECRET` (32 characters or more), plus
`EXPO_ACCESS_TOKEN`, and optionally `PUSH_HIDDEN_TITLE` / `PUSH_HIDDEN_BODY` (what someone who hides
previews sees; default "New notification"). Call it from your server, a database trigger
(`pg_net`) or a schedule, never from the app:

```http
POST /functions/v1/genesis-push-send
Authorization: Bearer <GENESIS_PUSH_SECRET>

{ "action": "send", "messages": [
  { "userId": "…", "category": "messages", "title": "Sam", "body": "See you at six",
    "url": "/messages/42", "badge": 3 } ] }
```

Up to 100 messages a request, each at most 3500 bytes of title, subtitle, body, url and data
(UTF-8, so it fits Expo's 4 KB); each may set `subtitle`, `data` (ids, not content), `sound: null`,
`defaultOn`, `urgent` (through quiet hours), `channelId` and `ttlSeconds`. The answer has one result
per message (`deliver`, `reason`: `ok`, `category_off`, `quiet_hours`, `no_devices`; `quietUntil`;
`sent`, `failed`). It sends through Expo in batches of 100, resends a batch Expo refused outright
one by one (so one bad token can't silence the rest), never resends one that timed out or got a
429 or 5xx (it may have been delivered), records the receipt rows of each batch as it goes and
forgets the devices Expo calls `DeviceNotRegistered`. It starts no send after 100 seconds, so a
large or refused run ends inside the function's wall clock; what it didn't send is answered as
`unsent` (send those again). For someone who hides previews, the title and body are replaced and
the subtitle and `data` dropped on the server; the tap still opens `url`, and `category` still
travels, so keep both opaque (ids, never words or search text).

Schedule `{ "action": "receipts" }` every 15 minutes (pg_cron with pg_net, or any scheduler): it
claims the tickets that are due (1000 at a time, again while full claims come back, within the
same time budget), asks Expo for their receipts, records delivered or failed, forgets dead devices
(not one registered again since the push; the same run marks tickets with no receipt after a day
`unknown` and deletes receipts older than 30 days, so without the schedule `push_receipts` keeps
growing), and logs `InvalidCredentials` loudly (your APNs or FCM credentials in EAS are wrong).
Logs and answers carry counts, statuses and Expo's error codes only: never a token, a title, a
body or `data`.

### Not covered yet

- **Real delivery.** The SQL is pgTAP-tested and the function unit-tested against a faked Expo;
  nothing has been delivered through APNs or FCM (that needs an EAS project with push credentials).
- **Scheduling for later.** A message held by quiet hours is answered with `quietUntil`, not queued:
  resend it then if it still matters.

## Support (the support block)

`migrations/0006_genesis_support.sql` is the database half of `@marktiderman/genesis-support`:
reports (`support_reports`), their screenshots (`support_attachments`, in the private
`genesis-support` bucket under `<user id>/<report id>/`), the conversation on each
(`support_replies`), the idea board (`support_ideas`) and one vote per person and idea
(`support_idea_votes`). Copy it and its test (`migrations/tests/0006_genesis_support.test.sql`)
into your app under a new timestamp; it stands alone.

- **Who sees what.** A person sees, edits while open and deletes their own reports, replies on
  them and sees their own screenshots. Every signed-in person reads the idea board; a person sees
  only their own votes, and the count is kept on the idea by a trigger. anon reaches nothing.
- **Staff** are whoever `private.genesis_support_staff(person uuid) returns boolean` says, a hook
  you add (like the tenant-admin hook of 0004). Without it nobody is staff. Staff read every report
  and screenshot, reply, and set statuses through `support_set_report_status` and
  `support_set_idea_status` (shipped stamps `shipped_at` and takes the FeatureId it shipped as).
- **The server's columns.** Status, owner, feature id, read receipts and vote counts can't be
  written by a person (column privileges); a reply's author and staff flag come from the session.
- **Vote stuffing.** One vote per person and idea (the primary key); a Supabase anonymous sign-in
  (`is_anonymous`) can report but never vote or suggest; votes only on open, planned and in
  progress ideas; at most 10 ideas per person a day.
- **Screenshots.** Uploads only into the person's own open report's folder, no overwrite and no
  delete by anyone but the service role; images only, 5 MB each, at most 5 per report. Deleting a
  report or an account queues its objects in `support_attachment_purges` (Supabase refuses direct
  deletes from `storage.objects`); the cleanup function removes them.
- **Limits** raise SQLSTATE `GS429`: 20 reports and 60 replies per person an hour, counted in a
  log that deleting doesn't touch, under a per-person lock.
- **Whatever else the app allows on storage**, restrictive policies hold the bucket to these rules
  for every role but the service role. A deleted report's screenshots can't be opened again, by
  staff or the person, before the cleanup removes them.
- **The notify sinks keep copies.** An issue or webhook made for a report isn't withdrawn when the
  report or the account is deleted: point the GitHub sink at a private repository and delete issues
  yourself when someone asks to be forgotten.

Functions (templates; copy the folder into `supabase/functions/`):

| Function                  | What it does                                                                                                                                         | Secrets                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `genesis-support-intake`  | The wire contract over HTTP (boot, submit, list) for clients without supabase-js; acts as the caller, never the service role                         | `GENESIS_SUPPORT_ORIGINS` (web origins)                                                                                      |
| `genesis-support-notify`  | A Database Webhook on new reports: a GitHub issue per report and/or a signed webhook, with a summary only (no person, device, context or screenshot) | `GENESIS_SUPPORT_WEBHOOK_SECRET`, `GITHUB_TOKEN` + `GITHUB_REPO`, `SUPPORT_WEBHOOK_URL` (+ `SUPPORT_WEBHOOK_SIGNING_SECRET`) |
| `genesis-support-cleanup` | On a schedule: removes queued and orphaned screenshots through the Storage API                                                                       | `GENESIS_SUPPORT_CLEANUP_SECRET`                                                                                             |

All three deploy with `verify_jwt = false` (each checks its caller or secret itself).

### Not covered yet

- Not applied to a hosted project yet: the SQL is pgTAP-tested on a local database and the
  functions unit-tested with fakes.
- Staff screens, Realtime, and an email when staff reply.

## Tenant features

Per-tenant switches for shipped features: a tenant's admins turn a feature off (or back on) for
their tenant with a reason, and its members hide what is off. "Tenant" is whatever your app groups
people by (a team, an organization, a workspace), keyed by a uuid. A switch controls exposure,
never authorization (that is RLS) and never paid access (that is an entitlement).

Copy `migrations/0004_genesis_tenant_features.sql` into `supabase/migrations/` under a timestamped
name, and its pgTAP test into `supabase/tests/database/`. Then give it your membership rule as a
hook, in your own migration:

```sql
create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.memberships m
                 where m.team_id = tenant and m.user_id = person and m.role in ('owner', 'admin'))
$$;
revoke execute on function private.genesis_tenant_admin(uuid, uuid) from public, anon, authenticated;
-- Optional: who may read which features are off (admins always may).
-- create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean …
alter table public.tenant_features add foreign key (tenant_id) references public.teams (id) on delete cascade;
alter table public.tenant_feature_changes add foreign key (tenant_id) references public.teams (id) on delete cascade;
```

Without the admin hook nobody can change a switch (`42501`, with a hint): it fails closed.

```ts
import {
  setTenantFeature,
  tenantFeatures,
  tenantFeatureHistory,
} from "@marktiderman/genesis-supabase";

const features = await tenantFeatures(supabase, teamId); // members and admins; 42501 for anyone else
if (features.isOn("chat")) showChatTab();

await setTenantFeature(supabase, {
  tenantId: teamId,
  featureId: "chat",
  enabled: false,
  reason: "Launching next month",
});
const history = await tenantFeatureHistory(supabase, teamId); // admins: who, when, why, newest first
```

|                                                               |                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `public.set_tenant_feature(tenant, feature, enabled, reason)` | admins only (the hook); a reason of 1 to 500 characters; a FeatureId-shaped id |
| `public.tenant_features_off(tenant)`                          | the ids that are off; members (`private.genesis_tenant_member`) and admins     |
| `public.tenant_feature_settings(tenant)`                      | every switch with its reason, who and when; admins                             |
| `public.tenant_feature_history(tenant, max_rows)`             | every change, newest first; admins                                             |
| `private.tenant_feature_on(tenant, feature)`                  | for SQL gates; a feature with no row is on                                     |

Every change, through the function or by the service role writing the table directly, is
recorded by a trigger in `public.tenant_feature_changes` with the person (none for the service
role or a migration), the JWT role and the time. The tables have row level security on with no
policies and no grants to anon or authenticated: they are reached only through the functions,
each security definer with an empty `search_path`, granted and revoked by name. Deleting a
person never fails on these tables; their changes stay, without them.

`private.tenant_feature_on` answers for any tenant, without the member check, so it is granted to
nobody but the service role: call it from your own security definer functions (owned by the
migration's role, they need no grant). Granting it to authenticated, with usage on `private`, lets
every signed-in person ask about any tenant.

A delete that cascades into `tenant_features` (from your tenant table, or a person whose tenant
goes with them) isn't recorded, so it never refuses the tenant's or the person's deletion; saving
the same switch and reason again changes nothing, not even who and when.

## Testing your schema's data contract (genesis_testing)

`sql/testing/genesis_testing.sql` is a pgTAP kit that checks your own tables and functions keep the
Genesis data rules. Copy it to `supabase/tests/database/000_genesis_testing.test.sql` (the leading
zeros make `supabase test db` run it first; it commits only the `genesis_testing` schema and reports
one passing line of its own). Then call the helpers from your own test files, inside their usual
`begin; … rollback;`:

```sql
select genesis_testing.create_users();          -- owner, staff, client, stranger (fixed ids)
select genesis_testing.refuses($$delete from notes where id = '…'$$,
  genesis_testing.user_id('client'), 'a client can''t delete a note outright');
select genesis_testing.server_owned('public.notes', 'id', '…',
  array['status', 'completed_at'], genesis_testing.user_id('client'));
select genesis_testing.allows_system_paths($$delete from notes where id = '…'$$,
  array['bt.hard_delete=on'], genesis_testing.user_id('client'), 'system work can delete');
select genesis_testing.never_shows('select * from group_progress(''…'')', 'PRIVATE-ANSWER',
  genesis_testing.user_id('staff'), 'a private answer never reaches the report');
select genesis_testing.sees('select * from notes', genesis_testing.user_id('client'), 2, 'own notes only');
```

| Helper                                                               | Passes when                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `refuses(sql, user, description)`                                    | The write raises 42501 or changes no row.                                                                             |
| `allows(sql, user, description, min_rows)`                           | It runs without an error (`user` null: signed out, as jobs and backfills run).                                        |
| `allows_with_setting(sql, setting, value, user, description)`        | It runs with a bypass setting such as `bt.hard_delete`.                                                               |
| `allows_system_paths(sql, settings, user, description)`              | It runs signed out and under each `name=value` setting (one line each).                                               |
| `server_owned(table, key_column, key, columns, user)`                | The user can't change any of `columns` (one line each), whether the update raises, misses, or a trigger puts it back. |
| `never_shows(query, marker, user, description)` / `never_shows_anon` | `marker` appears nowhere in what the query returns, for a table, a view or a report function.                         |
| `sees(query, user, expected, description)`                           | The query returns exactly `expected` rows.                                                                            |

Every check runs in a savepoint that is always rolled back, so checks never affect each other. A
failing check prints why (`# changed from open to done`, `# raised 23514 …`). The `probe_*`
functions return the same verdict as jsonb for testing your own helpers. `sign_in(who)`,
`sign_in_anon()` and `sign_out()` act as someone for the rest of a test, setting both
`request.jwt.claims` and the legacy `request.jwt.claim.sub`.

What to cover, from the review history behind this kit: every guard trigger against every system
path (signed out, your bypass settings, cascades and ON DELETE SET NULL); every column only the
server sets; every security-definer function that reads a table with a privacy flag. The fixture
ids are shared with `@marktiderman/genesis-core/testing`.

## Blocks

`accountBlock` and `tenantFeaturesBlock` are `defineBlock` declarations
(`@marktiderman/genesis-features/blocks`) of what this package's blocks need: their migrations
(with their tests) and, for the account, what it means for the stores' privacy forms. The
functions above don't change; the declarations are for `resolveBlocks` and the shell.

## Choices, and why

- **Keychain chunks rather than encrypted AsyncStorage.** Supabase's Expo guide shows two options: an AES-encrypted value in AsyncStorage with the key in SecureStore ("LargeSecureStore"), or `expo-sqlite/localStorage`. `keychainStorage` keeps the whole session in the Keychain/Keystore instead, split into chunks under the item size limit, with an atomic switch between generations. That means one native dependency (`expo-secure-store`) rather than three, no key to manage, and a session that can't be read off the device's file system. If you prefer LargeSecureStore, pass it as `storage`; everything else here works the same.
- **The URL polyfill.** Supabase's React Native guides still import `react-native-url-polyfill/auto` before creating the client. Keep it until your app has tested PKCE sign-in end to end without it: React Native's built-in `URL` has improved, but the docs don't yet say it's enough.
- **`refreshWhileActive` on native only.** Supabase gates the AppState listener to native platforms; call it from native code (not on web, where the browser already refreshes in the background).

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
