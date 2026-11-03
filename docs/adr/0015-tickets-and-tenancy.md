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
   `private.genesis_support_default_tenant()`, its own tenant, before the migration (it stops
   otherwise). A new ticket takes the tenant the client sends, usually the viewer's current
   workspace (checked: the sender is in it, or it is the default, and its help desk is on), else
   the default. Nothing is inferred from the sender's memberships: a client of one business may
   still be writing to the app. An idea goes to
   the app's own board unless a tenant is named. The app's hooks raising is an error, never a
   silent fallback. `support_default_tenant()` tells clients the app's own tenant. Existing rows: the app's optional `genesis_support_tenant_for(report)`, else the
   default, filled without touching `updated_at` or firing app triggers; then a validated `not
   null` check. A ticket never changes tenant.
3. **Agents.** `ticket_agents (tenant_id, person_id, role)`, written through
   `support_set_agent` by tenant admins or agent admins. An agent row counts only while the hook
   still lists that person in the tenant. A tenant's agents and admins handle its tickets; the
   app's staff hook means an agent of the default tenant.
4. **Reading and handling are separate checks.** Read: the requester, or a handler. Handle (reply
   as support, internal notes, status, assignment): an agent of the ticket's tenant, or, for the
   app's own tickets only, the app's report hook. The requester
   never handles.
5. **Opt-in per tenant**: a tenant takes tickets once `support-helpdesk` is enabled for it in
   `tenant_features`; no row (or no table) means off. The default tenant is always on.
   Screenshots keep their paths; access comes from the ticket row, not the path.
6. **Blocks follow.** The support-chat and support-email blocks' first migrations (0001, 0002)
   act on `support_reports`, which is now a view, so each block ships a version for the renamed
   table that is safe to run again (`0005_genesis_support_chat_on_tickets.sql`,
   `0007_genesis_support_email_on_tickets.sql`): apps that applied 0001/0002 get the same objects
   back, new apps get the block whole, in any order after 0004. Then
   `0006_genesis_support_chat_tenants.sql` makes the conversation's observers and assignee
   handlers of the ticket (and registers the ticket subject with genesis-chat's subject registry
   when it exists), and `0008_genesis_support_email_tenants.sql` routes inbound mail to a tenant
   (`genesis_support_email_tenant`; a tenant with the help desk off gets none), keeps a reply to
   its own tenant's thread, gives a ticket's emails to its handlers, and lets an agent link an
   email ticket only to someone in its tenant.
7. **Boundary**: apps reach tickets through `createSupportClient` and named functions; a doctor
   warning flags direct queries on the tables, and another flags app SQL naming the old views.
8. **The old names go** in a later minor, once every supported phone build uses the new names;
   that minor's changeset says so.
9. **Chat subject**: the stored `support_report` subject stays; `TICKET_SUBJECT` replaces
   `SUPPORT_CHAT_SUBJECT` as the constant to compare with. 0006 registers the subject's tenant
   resolver with genesis-chat's registry only if that registry is installed.

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

- Apps add `genesis_support_default_tenant()` before upgrading; the migration stops with a
  message otherwise.
- App SQL that creates triggers or policies on, or alters, `support_reports` must name `tickets`:
  the old name is a view. Realtime subscriptions on `support_reports` move to `tickets`.
- The client keeps the old table names this release; the next minor moves it to `tickets`, drops
  the views and renames `report_id`.
- The agent inbox, the messenger and a help center build on this, in later changes.
