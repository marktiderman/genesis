---
"@marktiderman/genesis-support": minor
---

**Reply by email, end to end.** Migration `0027_genesis_support_email_reply.sql` (support-email
block) adds `support_email_reply` (service role): a reply posted as the login the email went to,
the ticket's person or a handler, from that login's own address, once per Message-ID, at most 20 a
ticket an hour. `/email` gains `supportReplyRoute` (token, automatic mail, `senderAuthenticated`,
`stripReply`), `handleSupportInbound` (the whole inbound endpoint on genesis-notifications'
`createInboundEmailHandler`), `supportEmailOptions` and `supportReplyProvider` (each support
email's own Reply-To and thread header through the runner's `providerFor`), `supportReplyConfig`
(environment and the `support.replyByEmail` setting, with `legacyLabel` for earlier addresses) and
`supportJobClaims`.
