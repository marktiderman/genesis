---
"@marktiderman/genesis-support": minor
---

**Support's declared settings are read.** `support.messenger` (the messenger and its launcher, and
the phone's Home and new message), `support.helpCenter` (Help, help and article routes),
`support.agentDesk` (`SupportAgentInbox`, the phone's agent routes), `support.desks` (the desk card,
picker and switch, and migration 0029), `support.staffAlerts` (migration 0030, the webhook),
`support.githubRepo` / `support.githubIssueDetail` / `support.webhookUrl` (`/server`'s new
`supportNotifiersFromSettings`), `support.replyByEmail` (`/email-notifications`), and `support.contactEmail` /
`support.contactUrl` (`supportContact`, `SupportContact` on the web, `SupportContactRow` and
`block.contact()` on the phone, shown in Help and on error screens). The web components take
`settings`; their summaries no longer say Planned.
