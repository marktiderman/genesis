# ADR 0011: Email is a support ticket channel

- Status: accepted (the maintainer, 2026-10-29)
- Date: 2026-10-29
- Features: `support-email`, `support-feedback`, `support-chat`, `notifications-email`
- Related: ADR 0010 (own product events), docs/RESOURCE-VIEW.md

## Context

genesis-support keeps a person's report (a bug, an idea, a question) and its conversation with
staff, in the app, and with the support-chat block on genesis-chat. A help desk also takes email:
someone writes to support@, gets an answer by email, replies from their mail app, and staff see
one thread whichever way it came. Genesis already sends email through Resend
(genesis-notifications: one key per app, tenant sender identities, bounce suppression, signed
webhooks). Resend now receives email (an `email.received` webhook, the full message from
`GET /emails/receiving/{id}`) and threads replies by `In-Reply-To` and `References`. Its newer
Inboxes product (threads, drafts, assignment) is in private beta.

## Decision

1. **Tickets stay in the app's own tables** (support_reports and support_replies). A report gains
   a channel (`app` or `email`), the requester's address and name, and a reply token. An email
   ticket may have no login: staff see it; a person sees only reports of their own login.
2. **Inbound is general, support is one route.** genesis-notifications' `createInboundEmailHandler`
   (`/server`) verifies Resend's `email.received` webhook, fetches the message and hands it to
   the first route that takes it. Support is `supportEmailRoute` (genesis-support `/email`); an
   agent's inbox, an onboarding address or a forward are other routes on the same handler, and
   SMS will route the same way. The support route files with `support_receive_email` (service
   role). A message joins the ticket its reply address
   (`support+<token>@…`) or its `In-Reply-To`/`References` names; anything else opens a new
   ticket. The same message twice is kept once. A reply reopens an answered ticket.
3. **Outbound**: a staff reply on an email ticket (written in the app, or in support-chat, which
   mirrors into support_replies) queues an email; `runSupportEmail` sends the queue through the
   notifications `EmailProvider` (Resend), threaded, with the ticket's reply address and an
   idempotency key so a retry sends once.
4. **No login is linked from an email address**: a From header can be forged. Staff link a ticket
   to a person by hand; authentication results (SPF, DKIM, DMARC) are kept for them to judge.
5. **AI drafts, people send**: the support assistant may draft a reply; only a staff member sends
   it, the same rule as Resend's own drafts.
6. **Resend Inboxes is a later adapter**, once it is generally available, behind the same tables.

## Consequences

- One ticket list and one thread for app and email; usage, features and tickets join in one
  database.
- Statuses and queues, saved replies, SLAs and satisfaction ratings build on this next.
- Attachments on inbound email are recorded (names, types, sizes) but not stored yet.
