---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": minor
---

The support block, with its data in the app's own Supabase.

New package `@marktiderman/genesis-support` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

- Core: the feedback record (bug, idea, question or praise; message; version signature, route, platform, device; screenshots) behind `ContextCollector` and `FeedbackSink` seams; `createSupportClient` (the Supabase sink, the person's reports and replies, read receipts, signed screenshot URLs, the idea board with votes, "you asked, we shipped"); `createIntakeClient` / `createIntakeSink` for the wire contract over HTTP; a copy catalog; `defineSupportBlock` (`support-feedback`), which adds Send feedback and Help to Settings, its routes and migration 0006.
- `/web`: `FeedbackPanel` and `FeedbackLauncher` from Genesis UI, tab screenshots with pen marks and hidden areas, pins on the page, and `mountSupportWidget`.
- `/native`: `createSupport` for `GenesisNativeApp`'s `blocks`, `FeedbackForm`, `ScreenshotAnnotator` (pen and Hide, flattened with `captureRef`), shake to report, `SendFeedbackButton` for a devtools slot, and hooks that feed `InboxPage` and `ThreadPage`.

`@marktiderman/genesis-supabase`: migration `0006_genesis_support.sql` with its pgTAP test (reports, screenshots in a private bucket with storage policies, staff replies with read receipts, ideas and one vote per person; staff through the app's `private.genesis_support_staff` hook; grants by name; rate limits), and three Edge Function templates: `genesis-support-intake` (the wire contract, as the caller), `genesis-support-notify` (a GitHub issue or a signed webhook per report, summary only) and `genesis-support-cleanup` (removes deleted screenshots through the Storage API).
