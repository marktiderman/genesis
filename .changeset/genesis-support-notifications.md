---
"@marktiderman/genesis-support": minor
---

**Support's notifications.** Migration `0024_genesis_support_notifications.sql` (support block)
sends `support.message` to a ticket's desk (a new ticket, the person's next message, a ticket moved
there; while `support.staffAlerts` is on and nobody who handles it has it), `support.reply` to the
person when support answers, and `support.verify` with the verify prompt, through
genesis-notifications' `genesis_notify`, with an optional `private.genesis_support_staff_to_notify`
hook. `supportNotificationTypes` adds the three types to the app's `defineNotifications`;
`/email`'s `supportEmailTemplates` and `supportEmailTemplate` are their emails. genesis-notifications
is a new optional peer.
