---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-supabase": patch
---

`AuthForm`: four fixes.

- **Before hydration**, a server-rendered form's submit is disabled (drawn as enabled, so nothing changes on screen) and the form is `method="post"`. An early click or Enter no longer sends the browser's GET, which dropped what was typed and the `next` value and could put the email in the URL. A client-only render is ready at once.
- **`notice`**: a notice above the form's first step, drawn with `Alert`. Pass `{ kind: "reset-link-expired" | "provider-cancelled" | "account-deleted" }` for the catalogue's copy (`auth.notices`), a `message` of your own, or a plain string. An expired link is announced as an error, the others politely; `tone` overrides it. New types `AuthFormNotice` and `AuthFormNoticeKind`.
- **`offerCodeOnConfirm`** (opt-in, default off): with `"email-code"` in `methods`, the "check your email" screens after a magic link and after sign-up offer "Enter the code instead" (`auth.enterCodeInstead`), which opens the code step for the same email. For someone in an embedded browser, where the link opens in another browser.
- **Code copy**: `auth.codeSent` and `auth.codeSentIfAccount` no longer read "a 8-digit code": they now say "We sent a code to {email}. It has {length} digits." `codeLength` is documented as having to match the project's `otp_length`, and in development a refused code logs a hint to compare the two. genesis-supabase's docs say the same.
