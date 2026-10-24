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

export const supabase = createGenesisSupabase<Database>({ url, publishableKey, storage: session, detectSessionInUrl: false });
refreshWhileActive(supabase, AppState);

const rows = must(await supabase.from("tasks").select("*"));
```

- **`createGenesisSupabase`**: a client with PKCE sign-in, a persisted session that refreshes itself, and the storage you pass. On native, pass `detectSessionInUrl: false` and exchange the OAuth redirect's code yourself.
- **`keychainStorage(SecureStore)`**: session storage in the Keychain or Keystore. Values are split into chunks under the Keychain's size limit; a write switches to its new chunks only once they are all written, so a write cut short keeps the previous session; writes to one key run one at a time.
- **`refreshWhileActive(client, AppState)`**: refreshes the session only while the app is in front.
- **`wipeSessionOnReinstall`**: the iOS Keychain outlives an uninstall; this removes a leftover session on the first launch after an install.
- **`must(result)`**: the data, or a thrown error with the database's message.

Nothing here imports React Native or Expo: you pass those modules in.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
