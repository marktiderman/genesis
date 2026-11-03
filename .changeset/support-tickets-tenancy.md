---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": patch
---

Tickets, with tenants (ADR 0015). Migration `0004_genesis_support_tickets.sql` (support-feedback block). The support-chat block now ships `0005_genesis_support_chat_on_tickets.sql` (its 0001, for the renamed table and safe to re-run) and `0006_genesis_support_chat_tenants.sql`; support-email ships `0007_genesis_support_email_on_tickets.sql` and `0008_genesis_support_email_tenants.sql`. Each comes with its pgTAP test.

- **Tickets.** `support_reports` is renamed `tickets` and `support_attachments` `ticket_attachments`. For one minor the old names stay as views over the new tables (`security_invoker`, same column grants), so installed clients, the intake function and app SQL keep working; the client still reads the old names this release.
- **Tenants.** Every ticket and idea has a `tenant_id`: the tenant your `genesis_viewer_people` hook returns (one fixed id in a single-tenant app, one per organization in a multi-tenant one). A new ticket takes the tenant it is sent with (`tenantId`, usually the viewer's current workspace; refused if the sender isn't in it or its help desk is off), else your default tenant; nothing is guessed. Existing rows are filled from `genesis_support_tenant_for(report)` if you define it, else the default tenant.
- **You must add** `private.genesis_support_default_tenant() returns uuid` (your own tenant) before applying 0004; the migration stops and says so otherwise. Existing rows keep their `updated_at`.
- **Your SQL**: triggers, policies or `alter table` on `support_reports` must name `tickets` (the old name is a view); move realtime subscriptions to `tickets`.
- **Agents.** `ticket_agents` (tenant, person, `agent` or `admin`), managed with `support_set_agent`; `support_is_agent(tenant)`. A tenant's agents and admins handle its tickets; your staff hook now means "agent of your default tenant", so platform staff no longer read other tenants' tickets. With genesis-chat 0004, support chats stay in their ticket's tenant whichever migration runs first, and your staff read them without being listed as people of your tenant.
- **Reading and handling stay separate**: the requester reads a ticket and never handles it; the report-handler hook only answers for your own tenant's tickets.
- **Opt-in per tenant**: a tenant takes tickets and email only once `support-helpdesk` is enabled for it in `tenant_features`; your own tenant always does. Email for a tenant that is off goes to your own support. Ideas go to your own board unless a tenant is named. `support_default_tenant()` returns your tenant.
- **Email**: route an inbound email to a tenant with `genesis_support_email_tenant(recipients)`; a ticket's emails are read by its handlers.
- **TypeScript**: `Ticket`, `TicketAgentRole`, `TICKET_SUBJECT` (compare against it, never the literal); `SupportClientOptions.tenantId`; optional `myTickets`, `isAgent`, `setAgent`.
- **Doctor**: new warnings for app code that queries `tickets` (or the old names) directly instead of through the support client, and for app SQL that still names `support_reports` or `support_attachments` (dropped in a later minor, once every supported phone build is on the new names).

genesis-supabase: `0006_genesis_support.test.sql` passes on the renamed tables and defines a default tenant inside its transaction when support 0004 is applied.
