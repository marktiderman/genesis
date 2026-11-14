---
"@marktiderman/genesis-support": minor
---

Features: support-feedback, support-helpdesk
Three migrations. `0011_genesis_support_ticket_fixes.sql` (with support, after 0004) moves the Data Studio's audit log, comments, outbox and dead-letter rows (and the outbox payloads' resource) from `public.support_reports` and `public.support_attachments` to `public.tickets` and `public.ticket_attachments` where those tables exist, and adds `support_agent_unread_count(tenant)` (`client.agentUnreadCount`). `0012_genesis_support_help_answers.sql` (with support-helpdesk, after 0010) clears a help question's answer and cited articles when it ends `safety_routed` or `no_consent`. `0013_genesis_support_agent_queue.sql` (with support-chat) adds `support_agent_queue(tenant, inbox_view)`, the agent queue with no row cap of its own, so the provider pages and counts it; `supportQueueSource({ tenant })` reads it and passes the tenant (the view's `tenant_id` scope filter, or the one given, which still takes the list's `tenant_id` out of the query). The README says how an app's own reply notifications tell the verify prompt apart: `support_replies.prompt = 'verify'`, never the reply's words.
