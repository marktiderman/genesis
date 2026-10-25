---
"@marktiderman/genesis-forms": minor
---

Delivery, phase 3: everything an app needs to send form responses to destinations from its own outbox, in `@marktiderman/genesis-forms/destinations`.

- `createDeliveryRunner({ claim, record, saveState?, destinations, now?, log?, batchSize?, maxAttempts?, backoff? })` claims a batch of due deliveries, applies each destination's `config.when`, batches deliveries to one destination, keeps its state, and records an outcome per delivery: `sent`, `filtered`, `skipped`, `retry` (deferred by Retry-After without counting an attempt, or backed off by attempt) or `failed`. The store interface is generic, so an app maps it to its own SQL. Also `deliveryOutcome`, `defaultBackoff`, `DEFAULT_MAX_ATTEMPTS`, `DEFAULT_BATCH_SIZE` and the `ClaimedDelivery`, `DeliveryOutcome`, `DeliveryReport`, `DeliveryRunner` types.
- `slackDestination({ url?, resolveHost?, message? })` and `slackMessage`, `escapeSlack`: one escaped message per submission to a Slack incoming webhook.
- Sending by answer: `passesCondition(submission, definition, config)`, `conditionOf`, `isCondition`.
- SSRF checks for hook URLs: `parseHookUrl`, `checkHookHost(url, resolveHost)`, `isPublicAddress`, `HookUrlError`. `webhookDestination` takes `resolveHost` to refuse a hostname that resolves to a non-public address, and `url(config, { destinationId })` to look the address up outside config; `newWebhookSecret()` issues a Standard Webhooks `whsec_` secret.
- Google sign-in for sheets: `googleOAuthAccessToken`, `refreshGoogleAccessToken`, `DRIVE_FILE_SCOPE`; `sheetsDestination` takes `accessToken(config, { destinationId })` in place of `account`.
- Secrets at rest: `deriveSecretKey`, `sealSecret`, `openSecret`, `secretKeyBytes` (AES-256-GCM under an HKDF-SHA-256 key, bound to associated data).
- Edits: `DeliveryOptions.update` (and `DeliveryItem.update`) make the sheet overwrite the response's row and the webhook send `form.updated`. `DeliveryOptions.destinationId` is passed to option functions as `{ destinationId }`. A destination can resolve `{ ok: true, notSent }` for a deliberate no-send.

Existing behaviour is unchanged when the new options are not used.
