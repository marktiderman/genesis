---
name: genesis-support
description: Add feedback, bug reports with screenshots, staff replies and an idea board to a Genesis app with @marktiderman/genesis-support (a module) — install it with genesis add support-feedback, make staff, and render its screens. Load before building any feedback, help or idea-board screen.
---

# genesis-support

A module: feedback and a help desk an app installs whole, kept in the app's own Supabase.
People send feedback with a marked-up screenshot (shake to report on native), read staff
replies, and vote on an idea board. Its tables are `support_*`, from genesis-supabase's
migration `0006_genesis_support.sql`.

## Install

```bash
genesis add support-feedback   # the migration, its test, the Edge Functions, routes and steps
genesis add support-chat       # optional: report threads on genesis-chat (needs the chat block)
```

Then follow the steps `genesis add` prints: install the optional native modules for
screenshots and shake, make someone staff with `private.genesis_support_staff(uuid)` in a
migration of your own, and set the Edge Functions' secrets.

## Which entry point

| Need | Import |
|---|---|
| The phone: `createSupport`, the feedback screen, inbox, thread and idea board hooks | `@marktiderman/genesis-support/native` |
| The web: the feedback panel and floating launcher | `@marktiderman/genesis-support/web` |
| The record, `ContextCollector` and `FeedbackSink` seams | `@marktiderman/genesis-support` |

## Rules

- Pass the block to `<GenesisNativeApp blocks>`; Settings gets its rows through the block, and
  the screens are the app's route files, each a genesis-ui-native layout fed by a hook.
- Don't build a second feedback form or idea board: extend this one through its seams.
- Which plan unlocks Support is the app's call, in its own `features.ts`.

Details: the package README.
