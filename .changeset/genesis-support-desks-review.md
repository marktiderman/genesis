---
"@marktiderman/genesis-support": minor
---

**Desks, notifications and reply by email, after review.**
- The SQL reads `support.desks`, `support.staffAlerts`, `support.agentDesk` and `support.helpCenter`
  through support 0020's `genesis_support_setting_bool`, with the preset's default: a value set to
  false is honoured. `support.agentDesk` off refuses every agent read (0009's inbox check),
  `support.helpCenter` off the help center's reads, and desks need the agent desk.
- Moving a ticket between two tenants' desks is for the app's staff or an agent of both;
  `support_desk_move_targets` offers only those desks, and a move's words (and who moved it) stay
  with the desk it came from, in its history, its desk card and the alert. The ticket's chat
  conversation moves with it. `can_escalate` is false with desks off; the routing hook doesn't run.
- Whom `support.message` tells comes from the tenant's agent rows and the app's staff list and
  tenant admin list hooks (`genesis_support_staff_list()`, `genesis_tenant_admin_list(tenant)`),
  never a scan of every login; notifications carry the ticket's tenant.
- `senderAuthenticated` trusts DMARC only (a DKIM pass from another domain isn't the sender).
  `support_email_reply` keeps Message-IDs 60 days. 0029 and 0031 stop with a clear message over an
  app's own `support_desks` or `support_email_reply`.
- From CodeRabbit's review: switching a desk is serialized; escalation history follows the log's
  own order; `support.agentDesk` off also empties `support_my_desks` and the desk card; names that
  are email addresses show as Someone in notifications; an agent row's person resolves to its login
  through an optional `genesis_person_login` hook; the email-posts table has row level security; the
  same Message-ID on two tickets is two messages; the verify email doesn't ask for a reply; a retry
  in a later week gets another idempotency key with its other Reply-To; an uppercase `HTTPS://`
  webhook works; a contact page needs a host and `mailtoHref` encodes the mailbox; desk query keys
  are per client (`supportDeskScope`), the desk card resets on another ticket and offers only what
  the client can do; Home shows no articles with the help center off; the native route keeps the
  zone of a path passed to `SupportRoute`, puts the zone in front of support's own hrefs, checks
  paths at a segment boundary (`isUnderPath`), keeps an explicit `ideas` option over its setting and
  reads a thread named `constructor` as a thread; paths and addresses are checked in one pass
  (CodeQL).
