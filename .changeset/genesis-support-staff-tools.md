---
"@marktiderman/genesis-support": minor
---

**Staff tools, boards and the phone's agent desk.** Migration `0022_genesis_support_staff_tools.sql`
(support-chat block) adds `support_agents_list`, `support_reporters` and
`support_requester_tenants`, with optional `private.genesis_person_name` and
`private.genesis_tenant_label` hooks. The client gains `staffList`, `reporters`, `requesterTenants`
(`requesterTenantsLabel`) and `setIdeaStatus`. `/web` gains `SupportMyReports`, `SupportIdeaBoard`,
`SupportIdeaStatusControl`, `SupportShippedIdeas`, `SupportReportFeatureControl` and
`SupportHelpArticle` (copy under `boards`); it now uses genesis-core's resource views, an optional
peer. `/native` gains `useIsSupportAgent`, `useAgentUnreadCount`, `useAgentInbox`, `useAgentThread`
and `supportAgentKeys`.

`/email` gains reply by email's building blocks: `replyKey`, `createReplyToken`,
`verifyReplyToken`, `replyAddress` and `claimsFromAddresses` (a signed, stateless Reply-To per
ticket and recipient), and `stripReply` / `htmlToText` / `REPLY_MARKER` (the reply without quoted
history or signature).
