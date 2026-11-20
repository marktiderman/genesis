---
"@marktiderman/genesis-support": minor
---

**Staff tools, boards and the phone's agent desk.** Migration `0022_genesis_support_staff_tools.sql`
(support-chat block) adds `support_agents_list`, `support_ticket_requesters` and
`support_requester_tenants`, with optional `private.genesis_person_name` and
`private.genesis_tenant_label` hooks. The client gains `staffList`, `reporters`, `requesterTenants`
(`requesterTenantsLabel`) and `setIdeaStatus`. A new entry, `/web-boards`, has `SupportMyReports`, `SupportIdeaBoard`,
`SupportIdeaStatusControl`, `SupportShippedIdeas`, `SupportReportFeatureControl` and
`SupportHelpArticle` (copy under `boards`); it uses genesis-core's resource views (an optional
peer), so `/web` itself is unchanged. `/native` gains `useIsSupportAgent`, `useAgentUnreadCount`, `useAgentInbox`, `useAgentThread`
and `supportAgentKeys`.

`/email` gains reply by email's building blocks: `replyKey`, `replyKeyring`, `createReplyToken`,
`verifyReplyToken`, `replyAddress` and `claimsFromAddresses` (a signed, stateless Reply-To per
ticket and recipient, with key rotation by letter and an issued week so addresses expire), and `stripReply` / `htmlToText` / `REPLY_MARKER` / `MAX_EMAIL_CHARS` (the reply without quoted
history or signature, linear on hostile input).

Review fixes: Genesis defines no `private.genesis_viewer_people` and keeps no function of the app's
hook names (0021 is a stand-in that 0023 drops; Genesis's wrappers answer with the reserved tenant
`bda1457d-053b-422c-8887-e046e54b8344` and the platform admins), so an app's own hooks can come in
any later migration. `support_agents_list` checks candidates only (an optional
`private.genesis_support_staff_list()` hook; `support.agentListScan` opts into every login), and
the requester functions check the ticket's handler. The settings readers in SQL skip a value that
doesn't fit for the layer below, as `resolveSettings` does, and the dump trigger refuses dumps
while `diagnostics.enabled` is false; a client with diagnostics off clears its offline queue.
Settings no screen reads yet say **Planned**; `support.severity` is off by default; the email and
AI keys are Edge Function secrets. Reply keys take a label (`REPLY_KEY_LABEL` by default) and a
keyring's `legacy` keys verify addresses an app made in the earlier format; email bodies are cut to
`MAX_EMAIL_CHARS` and read without backtracking. The phone's agent query keys are scoped by login.

**Platform admins become ticket staff.** In an app with no `private.genesis_support_staff` hook,
migration 0023 makes the app's platform admins (`private.genesis_platform_admin`) support staff:
they read and answer the app's own tickets. Define the staff hook to choose others. Migration
`0026_genesis_support_diagnostics_access.sql` keeps a dump sent with a ticket to whoever handles
that ticket, so staff (platform admins included) read only dumps with no ticket and those of the
app's own tickets. 0023 drops 0021's stand-in only while its body is still exactly the stand-in's.
Reply tokens keep 12 bits of the issued week (no wraparound for about 78 years) beside a 44-bit
MAC, and a keyring with a letter in both `keys` and `legacy` throws. The dump settings counted in
whole numbers are declared `integer`.
