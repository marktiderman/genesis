# @marktiderman/genesis-supabase

Supabase for Genesis apps on web and React Native.

```ts
import { createGenesisSupabase, must } from "@marktiderman/genesis-supabase";
import { keychainStorage, refreshWhileActive, wipeSessionOnReinstall } from "@marktiderman/genesis-supabase/native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const session = keychainStorage(SecureStore);
await wipeSessionOnReinstall({ session, sessionKey: "sb-<project-ref>-auth-token", installMarker: AsyncStorage });

export const supabase = createGenesisSupabase<Database>({ url, publishableKey, storage: session, platform: "native" });
refreshWhileActive(supabase, AppState);

const rows = must(await supabase.from("tasks").select("*"));
```

- **`createGenesisSupabase`**: a client with PKCE sign-in, a persisted session that refreshes itself, and the storage you pass. `platform: "native"` turns off reading a session from the URL; exchange the OAuth redirect's code yourself.
- **`keychainStorage(SecureStore)`**: session storage in the Keychain or Keystore. Values are split between characters into chunks under the Keychain's byte limit; a write switches to its new chunks only once they are all written, so a write cut short keeps the previous session, and its leftover chunks are swept on the next write; writes to one key run one at a time.
- **`refreshWhileActive(client, AppState)`**: refreshes the session only while the app is in front.
- **`wipeSessionOnReinstall`**: the iOS Keychain outlives an uninstall; this removes a leftover session (and its PKCE verifier) on the first launch after an install.
- **`must(result)`**: the data, or a thrown `SupabaseQueryError` carrying the database's `code`, `details` and `hint`.
- **`signInWithApple`, `completeOAuthRedirect`, `deleteMyAccount`**: see [Account](#account-sign-in-and-deletion) below.

Nothing here imports React Native or Expo: you pass those modules in.

## Account: sign-in and deletion

What the App Store asks of an app with accounts, in a few lines: Sign in with Apple beside any
other third-party sign-in (Guideline 4.8), Apple's own button, and deleting the account from
inside the app (5.1.1(v)).

### Sign in with Apple

```ts
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { signInWithApple } from "@marktiderman/genesis-supabase/native";

const digest = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

async function onApple() {
  const result = await signInWithApple(supabase, AppleAuthentication, { digest, randomNonce: Crypto.randomUUID });
  if (result.canceled) return; // they closed Apple's sheet: not an error
  if (result.error) return showError(result.error.message); // result.error.code says why
  // Apple shares the name on the first sign-in only, so save it now.
  if (result.fullName) await supabase.auth.updateUser({ data: { full_name: result.fullName } });
}
```

- **`signInWithApple(client, AppleAuthentication, { digest, randomNonce? })`**: checks
  `isAvailableAsync()`, asks for name and email with the SHA-256 of a fresh nonce, and signs in
  with `signInWithIdToken({ provider: "apple", token, nonce })` (Supabase gets the raw nonce and
  checks the token against it). Returns `{ session, user, fullName, email }`, `{ canceled: true }`
  or `{ error }` (a `GenesisAuthError` with a `code`); it never throws.
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
  const { session, error } = await completeOAuthRedirect(supabase, res.url);
}
```

- **`completeOAuthRedirect(client, url)`**: reads the redirect's query and fragment. A `code` is
  exchanged with `exchangeCodeForSession` (PKCE; the verifier is already in the client's storage);
  an `error`/`error_description` comes back as `{ error }` with no request. Returns `{ session }`
  or `{ error }`; it never throws. A deep link that opens the app cold goes through the same call.

### Deleting the account

The database half is a migration this package ships:
[`migrations/0001_genesis_account_deletion.sql`](./migrations/0001_genesis_account_deletion.sql)
(also at `node_modules/@marktiderman/genesis-supabase/migrations/`). Copy it into your app's
`supabase/migrations/` under a new timestamped name. It defines `public.delete_my_account()`, a
`security definer` function with `search_path = ''` that deletes the caller's `auth.users` row,
executable by `authenticated` only (granted and revoked by name). Its pgTAP test is
`migrations/tests/0001_genesis_account_deletion.test.sql`: copy it to `supabase/tests/database/`
and run `supabase test db`.

Deleting the login removes the rows whose foreign keys to `auth.users(id)` are `on delete cascade`,
and is refused (`23503`) while any other row still points at it, so check each such key. Files in
Storage aren't tied by a foreign key; remove them first.

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

- **`deleteMyAccount(client)`**: calls the `delete_my_account` RPC through `must`, then signs this
  device out (`scope: "local"`; the login's refresh tokens went with it). A refusal throws a
  `SupabaseQueryError` and keeps the session. An access token already issued stays valid until it
  expires.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
