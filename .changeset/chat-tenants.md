---
"@marktiderman/genesis-chat": minor
---

Migration 0004: every conversation belongs to a tenant. `conversations.tenant_id` is required, and tenancy comes from the app's `private.genesis_viewer_people` hook (as genesis-supabase 0016 documents).

- Starting a conversation needs a tenant everyone in it shares. A registered subject's tenant comes first, then the single tenant they share; `startConversation(…, { tenantId })` picks one when they share several. People who share no tenant can't start one.
- `add_members` adds only people of the conversation's tenant.
- A direct conversation is one per pair per tenant.
- `genesis_chat.register_subject(kind, type, resolver, aliases)` registers a record type with a resolver that names its tenant. `ensure_conversation` takes the tenant from that resolver, or from `p_tenant_id` for an unregistered type. An alias is an older name for the same type, and calls using it reach the same conversations.
- A kind's observer check is asked only about people of the conversation's tenant, and never about anyone who is or was a member of it. So whoever opened a ticket never reads its internal notes, even if they are staff too.

`ChatConversation.tenantId` is new.

Upgrading: define the hook before applying 0004. The migration fills in the tenant of existing conversations, and stops if it can't place one. Replace your copies of the 0001–0003 pgTAP tests with this release's. If you use genesis-support's chat, apply its 0004 in the same release.
