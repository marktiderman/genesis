---
"@marktiderman/genesis-support": minor
---

Two migrations. `0011_genesis_support_ticket_fixes.sql` (with support, after 0004) moves the Data Studio's audit log and outbox rows from `public.support_reports` and `public.support_attachments` to `public.tickets` and `public.ticket_attachments` where those tables exist, and adds `support_agent_unread_count(tenant)` (`client.agentUnreadCount`). `0012_genesis_support_help_answers.sql` (with support-helpdesk, after 0010) clears a help question's answer and cited articles when it ends `safety_routed` or `no_consent`. The README says how an app's own reply notifications tell the verify prompt apart: `support_replies.prompt = 'verify'`, never the reply's words.
