---
"@marktiderman/genesis-notifications": patch
---

Review fixes before the first release:

- A tenant's sender domain verifies only with an ownership TXT record holding that tenant's own token (`_genesis-notifications.<domain>`, `senderOwnershipRecord`), for one tenant at most (a unique index on verified domains), and never as the app's shared domain or one under it (`checkSenderDomain({ token, reservedDomains })`, and the runner refuses one too). `genesis_notifications_set_sender_dns` takes the domain it checked.
- A cancel that lands while a job is being sent sticks: the job is never retried, and an expired lease ends it cancelled.
- Idempotency keys (and cancel, and collapse) are per type and tenant: tenant A's key never finds tenant B's notification. `cancelNotification` takes `type` and `tenantId`.
- A token registered before install ids (genesis-supabase's 0005, or the three-argument register) is adopted by the first register that brings one, audited, so upgrading strands no phone.
- The secret backstop also refuses relative links, fragments, and any key or parameter ending in token, code, secret, key, otp or password.
- An email whose secret won't decrypt fails alone (`secret_unreadable`); the rest of the claim goes out.
- Resend's 409 `invalid_idempotent_request` fails loudly instead of counting as sent; secret link builders must be deterministic. Requests are paced (`perSecond`, default 5) under Resend's limit.
- Push settles each Expo batch on its own and starts none once its lease is about to run out; with `runBudgetMs` a run claims again until the time left is under the lease.
- Erasing a login also erases rows addressed to its email; unsubscribe tokens carry the address's hash, never the address, and unsubscribe from the sending tenant only; only a `Permanent` bounce suppresses; the provider's id is kept before the job settles.
- The sender function template's `genesis.test` stays critical; push and email links must be paths on the app's own origin.
- Preferences: an old 0005 switch left on no longer turns on opt-in email; clearing a choice for a category with none no longer fails; the web and native screens read choices back after a save; the feed header shares the feed's query; the push block's switch for a category with no notifier push type is kept, not refused.
