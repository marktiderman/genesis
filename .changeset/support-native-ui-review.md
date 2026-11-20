---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-ui-native": minor
---

Support on the phone, after the final review. The person's thread asks "Is it fixed?" once support marks a report addressed (`client.verify`; reports carry `verifiedAt`). The agent thread links the requester's email, has an assignee picker and the desk controls (`AgentDeskControls`: send up, hand back, move), and the agent inbox has a tenant admin's desk switch (`AgentDeskSwitch`). Settings has a "Support inbox" row into the agent desk for the app's agents. The dump viewer says when it is loading, heads each dump with its trigger and local time (`dumpHeading`), shows it in the mono font and copies it (saying so when a copy fails). The feedback form shows "About: …" (`openFeedback({ about })`, else the screen's path) with "Not this". The native screens use genesis-ui-native's layout primitives and text presets, and errors show in `NativeInlineAlert`. `healthChecks.runCheck(name)` runs one check again.

`createSupport` follows live settings (`appSettings` as a function, and `subscribeSettings` to update an open Settings screen): its Settings rows, the idea board, shake to report and "Report this". It forgets queued dumps and feedback on sign-out. `SupportRoute` never throws without a support block: it shows `unavailable` (default an empty state), and `onFeedbackSent` replaces the feedback screen's alert (a toast). Caught errors from a desk move or switch and a failed copy go to `onError` (`SupportErrorSource`).

A block's Settings row can take a `useShown` hook (genesis-config), and genesis-native's `useBlockSettings` leaves out a row it hides. genesis-native's error screens take `labels` ("Contact support" included, `DEFAULT_FATAL_SCREEN_LABELS`) and offer "Report this" when a block takes reports (`NativeBlock.reportProblem`: the support block opens its feedback form with the error attached). The devtools overlay is a `NativeSheet`, shows health checks in words (`checkLabels`) with a "Try again" for each where the registry has `runCheck`, and its values wrap and can be selected.

genesis-ui-native: `NativeSettingsRow` takes `descriptionLines` (`null` wraps the description whole) and `selectable`, and `NativeListItem` `subtitleLines` and `subtitleSelectable`.
