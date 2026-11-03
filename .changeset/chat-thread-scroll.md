---
"@marktiderman/genesis-chat": patch
---

The web thread centres a message (the first unread when it opens, or one a reply quote jumps to) by scrolling its own message list only. Before, `scrollIntoView` also scrolled the panes and page around it, as in an inbox with a list beside the thread. The jump is instant when the reader prefers reduced motion.
