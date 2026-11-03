---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": patch
---

Tickets, with tenants (ADR 0015). Migration `0004_genesis_support_tickets.sql` (support-feedback block), with `0005_genesis_support_chat_tickets.sql` (support-chat) and `0006_genesis_support_email_tickets.sql` (support-email), each with its pgTAP test.

- **Tickets.** `support_reports` is renamed `tickets` and `support_attachments` `ticket_attachments`. For one minor the old names stay as views over the new tables (`security_invoker`, same column grants), so installed clients, the intake function and app SQL keep working; the client still reads the old names this release.
- **Tenants.** Every ticket and idea has a `tenant_id`: the tenant your `genesis_viewer_people` hook returns (one fixed id in a single-tenant app, one per organization in a multi-tenant one). A new ticket takes the tenant it is sent with (if the sender is in it), else the sender's only tenant, else your default tenant. Existing rows are filled from `genesis_support_tenant_for(report)` if you define it, else the default tenant.
- **You must add** `private.genesis_support_default_tenant() returns uuid` (your own tenant) before applying 0004 when you already have reports; the migration stops and says so otherwise.
- **Agents.** `ticket_agents` (tenant, person, `agent` or `admin`), managed with `support_set_agent`; `support_is_agent(tenant)`. A tenant's agents and admins handle its tickets; your staff hook now means "agent of your default tenant", so platform staff no longer read other tenants' tickets.
- **Reading and handling stay separate**: the requester reads a ticket and never handles it; the report-handler hook only answers inside the ticket's tenant (or yours).
- **Off per tenant**: a tenant with `support-helpdesk` turned off in `tenant_features` takes no tickets.
- **Email**: route an inbound email to a tenant with `genesis_support_email_tenant(recipients)`; a ticket's emails are read by its handlers.
- **TypeScript**: `Ticket`, `TicketAgentRole`, `TICKET_SUBJECT` (compare against it, never the literal); `SupportClientOptions.tenantId`; optional `myTickets`, `isAgent`, `setAgent`.
- **Doctor**: a new warning for app code that queries `tickets` (or the old names) directly instead of through the support client.

genesis-supabase: `0006_genesis_support.test.sql` passes on the renamed tables and defines a default tenant inside its transaction when support 0004 is applied.
