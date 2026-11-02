---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-supabase": minor
---

Web sign-in: `AuthForm` in genesis-ui and its Supabase client in genesis-supabase.

- **genesis-ui**: `AuthForm` (root and `/patterns`), the form inside `AuthPage`. Modes `sign-in` (password, magic link or emailed code), `sign-up`, `forgot-password` and `new-password`, controlled or not. The code step is `InputOTP` (`one-time-code`), verifies on the last digit and resends after a cooldown. Provider buttons from a list or from `client.providers()`. Every call goes through the `AuthFormClient` it is given; failures show the catalogue's copy for the error code (the new `auth` part of the UI messages), else the generic line, never the server's text (that goes to `reportError`, as does a throw), announced and tied to the field the code is about. Without sign-up, an email with no account is answered as sent, in neutral copy. "Check your email" takes focus; the code field stays focusable while it verifies. Every field is labelled with the autocomplete password managers need.
- **genesis-supabase**: `createAuthFormClient(supabase, { url, publishableKey, redirectTo, resetRedirectTo })`, that client on the app's Supabase client (`signInWithPassword`, `signInWithOtp`, `verifyOtp`, `signUp`, `resetPasswordForEmail`, `updateUser`, `signInWithOAuth`), never throwing, also with `throwOnError: true`; a missing session is `session_not_found`, and without sign-up an unknown email is answered as sent. `fetchAuthSettings` reads `/auth/v1/settings` for the OAuth providers turned on (only those in `SUPABASE_OAUTH_PROVIDERS`) and whether sign-up is closed, with a 5-second timeout and an optional `signal`, and refuses a secret key.
