---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis": patch
---

New `@marktiderman/genesis-forms/destinations` subpath (and the umbrella's `@marktiderman/genesis/forms/destinations`): send a checked submission to an inbox (`emailDestination` with a built-in `resendProvider`), a Google Sheet (`sheetsDestination`, service-account JWT signed with WebCrypto, header management, RAW writes with opt-in formula escaping, dedupe by response id) or a URL (`webhookDestination`, Standard Webhooks HMAC signing with a base64 `whsec_` secret, with `verifyWebhook` for receivers). Each `deliver` resolves a result that is `retryable` or permanent, with `retryAfterSeconds` and a message safe to store; nothing throws or logs, every request has a timeout, and secrets stay out of config. `responseRow` flattens a submission into labelled cells. Still no dependencies: fetch and WebCrypto only, so it runs on Node 20+, edge runtimes and Workers.
