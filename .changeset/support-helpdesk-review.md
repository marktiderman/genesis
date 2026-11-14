---
"@marktiderman/genesis-support": patch
---

**`pending` is a new `FeedbackStatus`, and it can break code that reads statuses.** This release adds `pending` (waiting on the requester) to the exported `FeedbackStatus` union and to `FEEDBACK_STATUSES`. Handle it everywhere you read a status before you upgrade:

- A `switch` over the status with a `never` check stops typechecking; add a `pending` case.
- A `switch` with a `default` still compiles, but quietly puts `pending` in the default bucket. Decide where it belongs (it is neither active nor closed: the desk shows it in its own Pending view) and add a case.
- A `Record<FeedbackStatus, …>` map (labels, colours, icons) needs a `pending` key.
- Code that iterates `FEEDBACK_STATUSES` (filters, menus, counts) now gets `pending` too.
- Your own SQL that checks `status` (`in ('open', 'submitted', 'in_progress')` for active, `not in ('addressed', 'wont_fix')` for open) now meets `pending` rows: decide which side they fall on.

There's no codemod: where `pending` belongs is your app's call.

Follow-ups from the help-desk review:

- **The phone gets the reply expectation.** `createSupport` takes `replyExpectation` and `officeHours`, as `SupportMessenger` does on the web (one shared piece): `useStartConversation` says how soon people hear back, or when someone's back, above the composer (and returns it as `expectation`), and `useSupportThread` says where the answer will come under a thread nobody has answered yet (`awaiting`), only when one of the two is set. The agent desk stays web only; the README says so.
- **The composer's `!` and `?` pickers leave punctuation alone.** They open only once a letter follows the trigger, so "Merci !" or a lone "?" is just words, and Enter inserts an option only after the arrow keys move into the list; otherwise Enter sends. Tab still inserts.
- **`{first_name}` and `{name}` are never an email address or a stand-in.** Without a real name for the requester (an email ticket with none, or `resolveUser` returning `""`), they fill as nothing and take the space before them: "Hi {first_name}," reads "Hi,".
- **Office hours reject times past "24:00"** ("24:30" was read as 00:30 the next day); a span it can't read is left out.
- **Migration `0015_genesis_support_agent_tools_bounds.sql`** (the support-chat block brings it after 0014): the report's open-by-requester list calls the app's new optional set-based hook, `private.genesis_support_requester_labels(reports uuid[])`, once for every open ticket, or else 0014's one-ticket hook for at most the 1,000 most recently changed open tickets, saying so with `AgentReport.byRequesterCapped` (and a line under `SupportAgentReports`' list). A mention is readable only while the mentioned agent still handles its ticket.
