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

Nothing here imports React Native or Expo: you pass those modules in.

## Choices, and why

- **Keychain chunks rather than encrypted AsyncStorage.** Supabase's Expo guide shows two options: an AES-encrypted value in AsyncStorage with the key in SecureStore ("LargeSecureStore"), or `expo-sqlite/localStorage`. `keychainStorage` keeps the whole session in the Keychain/Keystore instead, split into chunks under the item size limit, with an atomic switch between generations. That means one native dependency (`expo-secure-store`) rather than three, no key to manage, and a session that can't be read off the device's file system. If you prefer LargeSecureStore, pass it as `storage`; everything else here works the same.
- **The URL polyfill.** Supabase's React Native guides still import `react-native-url-polyfill/auto` before creating the client. Keep it until your app has tested PKCE sign-in end to end without it: React Native's built-in `URL` has improved, but the docs don't yet say it's enough.
- **`refreshWhileActive` on native only.** Supabase gates the AppState listener to native platforms; call it from native code (not on web, where the browser already refreshes in the background).


Part of the [Genesis framework](https://github.com/marktiderman/genesis).
