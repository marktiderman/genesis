---
"@marktiderman/genesis-chat": patch
---

`ChatSearchScreen` clears a large-title or see-through (Liquid Glass) navigation bar: its search field, hint, loading and empty states now sit in the results list (the field as its header), whose automatic content inset moves them below the bar, as `InboxPage` does. Before, the field was a plain view at the top of the screen and drew behind the navigation bar, where it couldn't be tapped.
