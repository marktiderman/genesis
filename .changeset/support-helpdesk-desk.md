---
"@marktiderman/genesis-support": minor
---

The agent's desk, with migrations `0013_genesis_support_queues.sql` and `0014_genesis_support_agent_tools.sql` (the support-chat block brings both after 0009):

- **Pending.** A new ticket status, `pending` (waiting on the requester), set by an agent and back to `open` by itself when the requester writes. The other statuses keep their meaning. `SupportAgentInbox` gains the Pending and Closed views; Mine and Unassigned hold active tickets, and the counts on Mine, Unassigned and All are active tickets only. Rows show who wrote, the status, who has it and how long the requester has waited (`AgentTicket.waitingSince`).
- **Earlier conversations.** The details panel lists the requester's other tickets in the tenant (`client.agentEarlierTickets`, `support_agent_requester_tickets`), each opening in the inbox; the app's `context` cards stay.
- **The composer.** In an internal note `@` mentions a teammate (genesis-chat's mention format): the database records it in `ticket_mentions` (`client.agentMentions`) and calls the app's optional `private.genesis_support_agent_mentioned` hook to notify them. `!` inserts a saved reply with `{first_name}`-style variables filled (`replyVariables`), and `?` a help article's title and link (`articleHref`). When someone writes while an agent is writing, Send first says the conversation changed, with Send anyway and Review.
- **Saved replies** per tenant: `SupportSavedRepliesAdmin`, `client.savedReplies`, `saveSavedReply` and `deleteSavedReply`.
- **Reports**: `SupportAgentReports` and `client.agentReport` (opened, closed, median first response and time to close over a range, open now, and open by the requester's company through the app's optional `private.genesis_support_requester_label` hook).
- **The messenger's reply expectation**: `replyExpectation` and `officeHours` on `SupportMessenger` (and the launcher) say how soon people hear back or, outside office hours, when someone is back; `officeHoursState` is the same check anywhere.
