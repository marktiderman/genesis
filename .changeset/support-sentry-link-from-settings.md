---
"@marktiderman/genesis-support": minor
---

Diagnostics: the staff dump viewer links a dump to its Sentry event from Genesis settings. Without `links.sentry`, `SupportTicketDiagnostics` (new `settings` prop) and the agent inbox (through its `settings`) build the link from `observability.sentryOrg` and `observability.sentryDsn`: `https://<org>.sentry.io/issues/?project=<id>&query=<event id>` on sentry.io, or the DSN's own host for a self-hosted Sentry. `sentryEventLink(settings)` is the builder on its own. The app's own `links.sentry` still wins.
