---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-notifications": minor
---

Email is a support ticket channel (ADR 0011). genesis-notifications gains `createInboundEmailHandler` (`/server`): it verifies Resend's `email.received` webhook, fetches the message and hands it to the first route that takes it (`InboundEmail`, `inboundEmailOf`, `parseAddress`). genesis-support gains the `support-email` block (migration 0002: a report's channel, requester and reply token, `support_email_messages`, `support_receive_email`, a queue of staff replies to send) and `/email`: `supportEmailRoute` (files mail to a support address, a ticket's reply address or a ticket's thread) and `runSupportEmail` (sends staff replies threaded through the notifier's Resend provider, once per reply). 0006's reply rule now lets staff answer a ticket with no login and server code write on an email ticket.
