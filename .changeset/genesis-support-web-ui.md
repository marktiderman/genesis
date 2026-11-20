---
"@marktiderman/genesis-support": minor
---

**Support on the web: "Is it fixed?", agent management, the dump viewer and Genesis primitives.**
- The messenger asks "Is it fixed?" on a conversation marked fixed that the person hasn't
  confirmed (`awaitsVerification`), and answers through `client.verify`: confirm, or reopen with
  what's still wrong, with focus moving to the note and back. Its spaces are genesis-ui's `TabBar`,
  with the unread count on Messages, and with `allTenants` each row names its desk
  (`myTicketDesks`). It answers once: a second press sends nothing. A desk-log action this version
  doesn't know shows as "changed this desk" (`DeskLogEntry.action` "other").
- Agent management, for whoever manages a desk's agents (`canManageAgents`): `SupportAgentsAdmin`
  lists the agents with their roles, adds someone found in the desk's tenant (`searchPeople`) as an
  agent or admin, and removes a removable one (`setAgent`, which now takes null for the app's own
  desk); the requester card offers "Make an agent". `SupportLinkRequester`, in the agent inbox, finds
  the person and, after a confirm naming the email and the person, links an email ticket to their
  login through the new `client.linkRequester`. `SupportMyMentions` lists `agentMentions`.
- Reads that differ by who asks (dumps, mentions, people search, who manages a desk, and every
  desk key) are keyed by the client, the signed-in login (the new `client.signedInId`) and the
  tenant, and read the login again when someone signs in or out (`client.onSignedInChange`).
  `supportDeskScope` is now the hook `useSupportDeskScope`. A login that can't be read shows an
  error, not a placeholder.
- The dump viewer: a loading state, an accordion per dump and section, the trigger and a formatted
  date, "Copy text", Sentry and GitHub issue links from the app's `links` (https only), a `role=alert`
  error, a trigger label for every trigger ("Other" for an unknown one), and keys by login (`supportDiagnosticsKeys`). The inbox passes
  `diagnosticsLinks` on.
- The desk card and requester card show loading and error states; a move and a switch confirm with
  a toast (`desks.sent`, `switchedOn`, `switchedOff`); the desk card opens the desk's log
  (`deskHistory`); the inbox shows "Your help desk is off" and "No help desk to answer".
- genesis-ui primitives in place of hand-built pieces: `InlineAlert` for every error and notice,
  `Button asChild variant="link"` for contact links, and views (`ResourceView`) for the help
  center's collections, open tickets by customer and earlier conversations, over rows the client
  read: they need no data provider, so a QueryClientProvider is still all the screens need.
- The feedback panel shows the dump's reference after sending, and its choice rows are labelled.
- Copy: `off.agentDeskBody` no longer names the setting key, and `notifications.someone` names an
  unnamed writer.
