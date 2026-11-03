---
"@marktiderman/genesis-chat": minor
"@marktiderman/genesis-ui": minor
---

The chat dock. `@marktiderman/genesis-chat/web` adds `ChatDockProvider`, `useChatDock` and `ChatDock`: conversations that stay open while people move around the app. On a wide screen there are up to three windows bottom-right, each a thread and composer that minimizes to a bar with its unread count, and a fourth replaces the one used longest ago. On a narrow screen they share one side sheet with a switcher and an unread bubble. Expand opens the conversation on the app's Messages page. `openPanel` opens anything else in the dock, such as a help desk messenger. A minimized window doesn't mount its thread, so nothing is marked read behind the viewer's back.

`AppShell` takes a `dock` slot, fixed bottom-right outside the scrolling page and lifted clear of the phone's bottom bar. That's where `ChatDock` goes.
