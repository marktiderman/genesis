---
"@marktiderman/genesis-support": minor
---

The help desk's agent inbox on the web. `SupportAgentInbox` (`/web-chat`) is a tenant's inbox on genesis-ui's `InboxLayout`, `InboxViews`, `InboxPage` and `ThreadPage`: the views Mine, Unassigned and All, the thread with reply and internal note, status, assignee and a details panel the app can add to (`context`). Migration `0009_genesis_support_inbox.sql` (in the support-chat block) adds its read path, `support_agent_tickets` and `support_agent_ticket_counts`, for a tenant's agents only; the client gains `agentTickets`, `agentTicket` and `agentTicketCounts`, and a reply gains `authorId` on genesis-chat.
