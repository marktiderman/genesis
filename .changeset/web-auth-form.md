---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-supabase": minor
---

Web sign-in: `AuthForm` in genesis-ui and its Supabase client in genesis-supabase.

- **genesis-ui**: `AuthForm` (root and `/patterns`), the form inside `AuthPage`. Modes `sign-in` (password, magic link or emailed code), `sign-up`, `forgot-password` and `new-password`, controlled or not. The code step is `InputOTP` (`one-time-code`), verifies on the last digit and resends after a cooldown. Provider buttons from a list or from `client.providers()`. Every call goes through the `AuthFormClient` it is given; failures show the catalogue's copy for the error code (the new `auth` part of the UI messages), announced and tied to the field, and a throw is sent to `reportError`. Every field is labelled with the autocomplete password managers need.
- **genesis-supabase**: `createAuthFormClient(supabase, { url, publishableKey, redirectTo, resetRedirectTo })`, that client on Supabase Auth (`signInWithPassword`, `signInWithOtp`, `verifyOtp`, `signUp`, `resetPasswordForEmail`, `updateUser`, `signInWithOAuth`), never throwing; and `fetchAuthSettings`, which reads `/auth/v1/settings` for the OAuth providers turned on and whether sign-up is closed.
