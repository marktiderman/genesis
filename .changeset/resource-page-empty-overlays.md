---
"@marktiderman/genesis-ui": patch
---

ResourcePage: New opens the form on an empty list. The built-in form, the peek and the delete dialog now mount beside the shell instead of inside it, because the shell swaps its children for the empty state. Before this, New on an empty list did nothing, so a screen with no records couldn't make its first one.
