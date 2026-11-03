---
"@marktiderman/genesis-chat": minor
---

Migration 0004: every conversation belongs to a tenant. `conversations.tenant_id` is required, and tenancy comes from the app's `private.genesis_viewer_people` hook (as genesis-supabase 0016 documents).

- Starting a conversation needs a tenant everyone in it shares. A registered subject's tenant comes first, then the single tenant they share; `startConversation(…, { tenantId })` picks one when they share several. People who share no tenant can't start one, unless the kind is registered with `p_cross_tenant => true`: then the conversation takes the starter's tenant, so that tenant's erase or export includes it, and the kind may have no observers.
- `add_members` adds only people of the conversation's tenant.
- A direct conversation is one per pair per tenant.
- `genesis_chat.register_subject(kind, type, resolver, aliases)` registers a record type with a resolver that names its tenant. `ensure_conversation` and `start_conversation` take the tenant from that resolver, or from a function named `private.genesis_chat_resolve_<type>(text)` when the type isn't registered, or from `p_tenant_id`. An alias is an older name for the same type, and calls using it reach the same conversations.
- A kind's observer check is asked only about people of the conversation's tenant, and never about anyone who is or was a member of it. So whoever opened a ticket never reads its internal notes, even if they are staff too. A kind whose staff serve every tenant (a help desk) registers with `p_observer_tenant_gate => false` (or, registered before 0004, defines `private.genesis_chat_ungated_<kind>()` returning true), so its check is asked about anyone who isn't a member. Registering a kind again without the argument keeps its gate.

`ChatConversation.tenantId` is new.

Upgrading: define the hook before applying 0004. A single-tenant app returns its one tenant id, as in the README's example, and `genesis add`, `migrate` and `upgrade` warn when the hook is missing. The migration fills in the tenant of existing conversations (from the subject's resolver, then the tenant every member shares, then the starter's, then the first member's), and stops if it can't place one. The last two can pick a tenant not every member shares, so check those conversations after upgrading. Replace your copies of the 0001–0003 pgTAP tests with this release's. If you use genesis-support's chat, apply its 0006 in the same release: it's copied before chat's 0004.
