---
"@marktiderman/genesis-support": minor
---

**Support on the web: "Is it fixed?", agent management, the dump viewer and Genesis primitives.**
- The messenger asks "Is it fixed?" on a conversation marked fixed that the person hasn't
  confirmed (`awaitsVerification`), and answers through `client.verify`: confirm, or reopen with
  what's still wrong. Its spaces are genesis-ui's `TabBar`, with the unread count on Messages, and
  with `allTenants` each row names its desk (`deskLabel`). Reports carry `tenantId` and `verifiedAt`.
- Agent management: `SupportAgentsAdmin` lists a desk's agents for its admins, adds one (`findPeople`)
  as an agent or admin and removes one (`setAgent`); the requester card offers "Make an agent".
  `SupportLinkRequester` (in the agent inbox with `findPeople`) links an email ticket to a login
  through the new `client.linkRequester`. `SupportMyMentions` lists `agentMentions`.
- The dump viewer: a loading state, an accordion per dump and section, the trigger and a formatted
  date, "Copy text", Sentry and GitHub issue links from the app's `links` (https only), a `role=alert`
  error, and query keys scoped to the client (`supportDiagnosticsKeys`). The inbox passes
  `diagnosticsLinks` on.
- The desk card and requester card show loading and error states; a move and a switch confirm with
  a toast (`desks.sent`, `switchedOn`, `switchedOff`); the desk card opens the desk's log
  (`deskHistory`); the inbox shows "Your help desk is off" and "No help desk to answer".
- genesis-ui primitives in place of hand-built pieces: `InlineAlert` for every error and notice,
  `Button asChild variant="link"` for contact links, and views (`ResourceView`) for the help
  center's collections, open tickets by customer and earlier conversations. Those lists render under
  `GenesisProvider`, as `/web-boards` already does.
- The feedback panel shows the dump's reference after sending, and its choice rows are labelled.
- Copy: `off.agentDeskBody` no longer names the setting key, and `notifications.someone` names an
  unnamed writer.
