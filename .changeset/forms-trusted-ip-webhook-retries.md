---
"@marktiderman/genesis-forms": minor
---

Trusted client IP headers, Standard Webhooks retries and secret rotation.

- **Behaviour change: `clientIp` no longer reads `x-forwarded-for` or `x-real-ip` by default.**
  `DEFAULT_TRUSTED_IP_HEADERS` is now `x-vercel-forwarded-for` and `cf-connecting-ip`, headers the
  platform sets itself; the leftmost `x-forwarded-for` entries are whatever the client sent, so a
  client could pick its own rate-limit key. New `ClientIpOptions.forwardedForHops` reads
  `x-forwarded-for` from the right, at the hop your own proxies appended (1: the rightmost).
  **Migration:** a host that relied on `x-forwarded-for` (behind its own load balancer, not Vercel
  or Cloudflare) passes `clientIp(request.headers, { headers: [], forwardedForHops: 1 })`, with the
  number of its proxies that append an address, or `forwardedForHops` (and `trustedIpHeaders: []`)
  in `createUploadHandler`'s `rateLimit`. Without it, every request there counts as `"unknown"`, one
  shared bucket. A host that relied on `x-real-ip` passes `["x-real-ip"]` if its proxy overwrites it.
- Webhooks, per the Standard Webhooks spec:
  - `defaultBackoff` is 5 minutes, quadrupling, at most 24 hours, jittered by ±20%: about 3 days
    across the default 8 attempts (was 1 minute doubling to 6 hours). It applies to every
    destination the runner sends to.
  - A 410 Gone from a webhook fails with `disable: true` on the `DeliveryResult`, and the runner's
    `failed` outcome carries `disable: true`, so the app can switch the destination off.
    `DeliveryError` takes `disable` too.
  - `secret` may be several secrets (`string[]`, or a resolver returning one): each signs, and the
    signatures are space-separated, so a rotation needs no downtime. `signWebhook` and
    `verifyWebhook` take an array as well.
  - The minimum secret is 24 bytes decoded (was 16), `MIN_WEBHOOK_SECRET_BYTES`;
    `newWebhookSecret()` still issues 32. A shorter secret fails permanently, and `verifyWebhook`
    refuses it, so replace any 16 to 23 byte secret before upgrading.
  - The payload's `timestamp` is when the event happened (`submission.submittedAt`), falling back
    to the send time; the `webhook-timestamp` header stays the send time.
  - The README says to send through an egress proxy that refuses internal addresses where untrusted
    users choose webhook URLs, since a DNS check before `fetch` can be rebound.
- `deriveSecretKey(key, info, { salt })` takes an optional HKDF salt (bytes, or text as UTF-8). The
  default stays empty, so everything sealed before opens unchanged; a fixed app-wide random salt is
  recommended for new keys.

Features: forms-destinations, forms-submit
