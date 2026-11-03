# ADR 0015: Support tickets, with tenants

- Status: proposed (2026-11-03)
- Date: 2026-11-03
- Features: `support-helpdesk`, `support-feedback`, `support-chat`, `support-email`
- Related: ADR 0007 (tenancy), ADR 0009 (one resource contract), ADR 0011 (email tickets),
  ADR 0013 (customization layer)

## Context

genesis-support keeps a person's report and its thread, but a report has no tenant, and "staff"
is one app-wide hook. A consumer app whose customers are businesses can't let each business run a
help desk for its own clients, and the app's own staff read every report there is. The table
name, `support_reports`, also says less than the thing it holds: a request that owes someone a
reply, which help desks call a ticket.

Genesis already has what tenancy needs: a bare `tenant_id` on its tables (ADR 0007), the app's
`private.genesis_viewer_people` hook (genesis-supabase 0016), and tenant admin and feature checks
(genesis-supabase 0004). No tenants table is required.

## Decision

1. **Tickets.** `support_reports` → `tickets`, `support_attachments` → `ticket_attachments`
   (migration `0004_genesis_support_tickets.sql`). The old names stay as `security_invoker` views
   with the same column grants for one minor; foreign keys keep `report_id` until then.
2. **Every ticket and idea has a tenant**, the one the app's viewer-people hook names: a
   single-tenant app returns one fixed id, a multi-tenant app one per organization. The app adds
   `private.genesis_support_default_tenant()`, its own tenant. A new ticket takes the tenant sent
   (if the sender is in it, or it is the default), else the sender's only tenant, else the
   default. Existing rows: the app's optional `genesis_support_tenant_for(report)`, else the
   default; then a validated `not null` check. A ticket never changes tenant.
3. **Agents.** `ticket_agents (tenant_id, person_id, role)`, written through
   `support_set_agent` by tenant admins or agent admins. An agent row counts only while the hook
   still lists that person in the tenant. A tenant's agents and admins handle its tickets; the
   app's staff hook means an agent of the default tenant.
4. **Reading and handling are separate checks.** Read: the requester, or a handler. Handle (reply
   as support, internal notes, status, assignment): an agent of the ticket's tenant, or the app's
   report hook, which only answers inside the ticket's tenant or the default one. The requester
   never handles.
5. **Per-tenant switch**: `support-helpdesk` in `tenant_features`.
6. **Blocks follow**: `0005_genesis_support_chat_tickets.sql` makes the support conversation's
   observers and assignee handlers of the ticket; `0006_genesis_support_email_tickets.sql` routes
   inbound mail to a tenant (`genesis_support_email_tenant`) and gives a ticket's emails to its
   handlers.
7. **Boundary**: apps reach tickets through `createSupportClient` and named functions; a doctor
   warning flags direct queries on the tables.

## Glossary

- **ticket**: a request from someone outside the team, owed a reply. Replaces "report" in new
  code. Not a work item; it may link to one.
- **agent**: a person who handles a tenant's tickets. Not "staff".
- **default tenant**: the app's own tenant.

## Alternatives

- A null tenant meaning "the app's own support": rejected; null tenants mean personal rows
  elsewhere, and email tickets have no login.
- A Genesis tenants table first: not needed for this; it can add a foreign key later.
- Folding the requester into the handler check: rejected; requesters would act as support.
- Keeping the app-wide staff hook for every tenant: rejected; staff would read every tenant's
  tickets.

## Consequences

- Apps with existing reports add `genesis_support_default_tenant()` before upgrading; the
  migration stops with a message otherwise.
- The client keeps the old table names this release; the next minor moves it to `tickets`, drops
  the views and renames `report_id`.
- The agent inbox, the messenger and a help center build on this, in later changes.
