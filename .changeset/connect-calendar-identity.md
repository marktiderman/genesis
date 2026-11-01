---
"@marktiderman/genesis-connect": minor
---

Google Calendar read scopes (`calendarEventsReadonly`, `calendarListReadonly`, `calendarReadonly`), and `identity` on the connected account: who the account is (`subject`, `email`, `emailVerified`, `name`, `picture`), read from the ID token the token endpoint sent, after checking its issuer (the provider's new `issuer`, set on `googleProvider`), audience and expiry; a token that fails is logged and leaves `identity` out, and `requireIdentity` fails the connection instead. `email` is included only when verified. The README shows connecting Google Calendar read only.
