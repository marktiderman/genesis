---
"@marktiderman/genesis-chat": minor
"@marktiderman/genesis-ui": minor
---

The chat dock. `@marktiderman/genesis-chat/web` adds `ChatDockProvider`, `useChatDock` and `ChatDock`: conversations that stay open while people move around the app.

- **Wide screens:** up to three windows bottom-right, or as many as fit, with the rest behind a "+N" menu. Each window is a thread and composer that minimizes to a bar with its unread count. Opening a fourth replaces the one used longest ago.
- **Narrow screens:** one side sheet with a keyboard-navigable switcher, and an unread bubble.
- **Expand** opens the conversation on the app's Messages page.
- **Panels:** `openPanel` opens anything else in the dock, such as a help desk messenger, and `updatePanel` keeps its unread count live.
- **Out of sight:** a minimized window or a hidden tab keeps its thread mounted, with read-marking paused. A draft survives minimizing, and nothing is marked read behind the viewer's back.
- **Focus:** opening a window focuses its composer. Escape minimizes and leaves focus on the window's bar.
- **Restoring:** open conversations are kept per signed-in person and restored after hydration, so server-rendered pages don't mismatch. `forgetChatDock` clears them on sign-out.

`ChatThread` takes `markRead` (default true) and `autoFocus`.

`AppShell` takes a `dock` slot, fixed bottom-right outside the scrolling page and lifted clear of the phone's bottom bar. That's where `ChatDock` goes.
