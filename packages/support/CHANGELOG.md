# @marktiderman/genesis-support

## 0.2.5

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.2.4

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.2.1

### Patch Changes

- f852f04: Support threads on genesis-chat: a new `support-chat` block (migration `migrations/0001_genesis_support_chat.sql` with its pgTAP test, after 0006 and genesis-chat's 0001 and 0002). A report stays the record; its conversation runs on genesis-chat (kind `support`: the reporter its member, staff observers who reply and write internal notes, an assignee), with status, reply times and read state kept in step, existing replies copied without push, and `support_replies` mirrored both ways for one release. Additive client API: the `chat` option on `createSupportClient` and `createSupport` (a genesis-chat client; with the block, `replies`, `reply`, `markRead` and `subscribe` use the conversation, otherwise `support_replies`), `thread`, `conversationId`, `subscribe`, `isStaff`, `setStatus`, `assign`, `reply(…, { internal })`, optional `internal`, `attachments` and `seq` on replies and `userId` on reports, `defineSupportChatBlock`, native `useSupportConversation` and `mode`/`conversationId` from `useSupportThread` (live on chat, no polling), and `@marktiderman/genesis-support/web-chat` (`SupportReportThread`, `SupportStaffThread`). genesis-chat is a new optional peer.

  Features: support-chat

## 0.2.0

### Minor Changes

- 697c18c: `GenesisNativeApp` mounts `NativeToastProvider` around the screens, so `useToast()` from genesis-ui-native works on every screen without the app mounting one (it threw before). Toasts sit at the top by default, where a tab bar can't cover them; `toast={{ position, disableAnimation }}` places them and `toast={null}` leaves the provider to the app. A top toast now sits below the safe area's top (the status bar and the Dynamic Island) when a `SafeAreaProvider` is above it. `FeedbackForm` takes `sentAlert={false}` to leave the confirmation to `onSent`; the starter shows a toast after a sent report.

  Features: native-app-shell, native-components, support-feedback

### Patch Changes

- b3ee22b: Send feedback from the devtools overlay captures the screen once the overlay's sheet has finished closing, not after a fixed 400 ms that sometimes caught it half way down. The devtools block's `close()` (and the `devtoolsFeedback` slot's `close`) now returns a promise that resolves on the sheet's `onDismiss` (iOS), or after 800 ms where the platform doesn't report it (Android, which always waits that long); the sheet stays mounted while it slides away. The support block's slot waits for it, and still waits 400 ms for an overlay whose `close` returns nothing.

  Features: devtools-overlay, support-feedback

- 03e1fa0: The support block, with its data in the app's own Supabase.

  New package `@marktiderman/genesis-support` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

  - Core: the feedback record (bug, idea, question or praise; message; version signature, route, platform, device; screenshots) behind `ContextCollector` and `FeedbackSink` seams; `createSupportClient` (the Supabase sink, the person's reports and replies, read receipts, signed screenshot URLs, the idea board with votes, "you asked, we shipped"); `createIntakeClient` / `createIntakeSink` for the wire contract over HTTP; a copy catalog; `defineSupportBlock` (`support-feedback`), which adds Send feedback and Help to Settings, its routes and migration 0006.
  - `/web`: `FeedbackPanel` and `FeedbackLauncher` from Genesis UI, tab screenshots with pen marks and hidden areas, pins on the page, and `mountSupportWidget`.
  - `/native`: `createSupport` for `GenesisNativeApp`'s `blocks`, `FeedbackForm`, `ScreenshotAnnotator` (pen and Hide, flattened with `captureRef`), shake to report, `SendFeedbackButton` for a devtools slot, and hooks that feed `InboxPage` and `ThreadPage`.

  `@marktiderman/genesis-supabase`: migration `0006_genesis_support.sql` with its pgTAP test (reports, screenshots in a private bucket with storage policies, staff replies with read receipts, ideas and one vote per person; staff through the app's `private.genesis_support_staff` hook; grants by name; rate limits), and three Edge Function templates: `genesis-support-intake` (the wire contract, as the caller), `genesis-support-notify` (a GitHub issue or a signed webhook per report, summary only) and `genesis-support-cleanup` (removes deleted screenshots through the Storage API).

  `@marktiderman/genesis-support` declares the block under `genesis.blocks` in its package.json, so `genesis add support-feedback` finds its migration, function templates, routes and steps.

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0
