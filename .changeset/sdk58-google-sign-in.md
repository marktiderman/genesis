---
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-ui-native": minor
---

Native Google sign-in. `@marktiderman/genesis-supabase/native` adds `signInWithGoogle(client, GoogleOneTapSignIn, { digest, randomNonce? })`: a fresh 32-byte nonce, its SHA-256 to Google through the Universal sign-in module's `authenticate({ nonce })`, a check that the ID token carries that hash (`google_nonce_missing` otherwise, before anything reaches Supabase), then `signInWithIdToken({ provider: "google", token, nonce })` with the raw nonce, as Supabase's Google guide describes. `@react-native-google-signin/google-signin` is an optional peer and is passed in, never imported. `@marktiderman/genesis-ui-native` adds `googleProvider({ onPress, label?, icon?, enabled? })` for `AuthScreen`'s `providers`. The Apple nonce docs no longer suggest `randomUUID`: the default is 32 random bytes.

Features: account
