---
"@marktiderman/genesis-support": minor
---

**Desks.** Migration `0024_genesis_support_desks.sql` (support-helpdesk block): each tenant's own
help desk, switched on by its tenant admins (`support_set_desk`, logged), questions routed to the
sender's one desk that is on (or the app's `genesis_support_desk_for` hook), and tickets escalated
to the app's own desk, returned or moved between desks with a log (`support_escalate_ticket`,
`support_return_ticket`, `support_move_ticket`, `support_ticket_desk`, `support_desk_move_targets`,
`support_my_desks`, `support_desk_history`); `support_requester_tenants` gains each tenant's role
(the app's `genesis_tenant_role` hook). The `support.desks` setting off keeps 0004's rule. The client
gains `myDesks`, `setDesk`, `ticketDesk`, `deskMoveTargets`, `escalateTicket`, `returnTicket`,
`moveTicket` and `deskHistory`, with `chooseDesk`, `pickerDesks`, `workedDesks` and `deskTenant`.
`/web-chat` gains `SupportRequesterPanel`, `SupportDeskControls`, `SupportDeskPicker`,
`SupportDeskSwitch` and `useSupportDesks`; `SupportAgentInbox` shows the requester and desk cards
(`requesterPanel`, `deskControls`, `onTicketMoved`), and `SupportMessenger` takes `allTenants`.
