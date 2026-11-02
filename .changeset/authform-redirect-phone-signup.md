---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-supabase": minor
---

`AuthForm` and `createAuthFormClient`: provider redirects, sign-up fields, a texted code, and the email beside a new password. Everything that changes what people see is opt-in.

- **Provider redirect** (genesis-supabase): `createAuthFormClient` takes `providerRedirectTo` (a string, or a function of the provider's id) and `providerQueryParams` (a record, or a function of the provider's id), passed to `signInWithOAuth` as `redirectTo` and `queryParams`. An app no longer overrides `signInWithProvider` to set them. `emailRedirectTo` sets where the emailed links (a magic link, the sign-up confirmation, and by default the reset link) come back to, apart from `redirectTo`.
- **Sign-up fields** (opt-in): `signUpFields={["full_name"]}`, fields of your own (`{ name, label, … }`), or a slot (`({ values, setValue, disabled }) => …`). Their values go to `client.signUp` as `data`, which genesis-supabase passes as `options.data` (the user's metadata). Without it `signUp` gets no `data`, as before.
- **A texted code** (opt-in): the `"phone-code"` method in `methods` asks for a phone number, texts a code (`client.sendPhoneCode`, on Supabase `signInWithOtp({ phone })`) and checks it in the same code step (`client.verifyPhoneCode`, `verifyOtp({ phone, token, type: "sms" })`). Both calls are optional on `AuthFormClient`; a client without them leaves the method out. New copy: `auth.phone`, `phoneHint`, `phoneCodeSent`, `sendPhoneCode`, `usePhoneCode`, `useDifferentPhone`, `fullName`, `errors.phoneRequired`, `errors.phoneInvalid`, `errors.fieldRequired`, `errors.over_sms_send_rate_limit`, `errors.sms_send_failed`, `errors.phone_exists`.
- **The email beside a new password**: in `mode="new-password"`, a known email (`initialEmail`, else the new optional `client.currentEmail()`, which genesis-supabase reads from the session) is in the form as a hidden `autocomplete="username"` field, so password managers save the new password with its account. Nothing changes on screen; `showAccountEmail` (opt-in) shows it read-only.
