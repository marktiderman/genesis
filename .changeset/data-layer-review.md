---
"@marktiderman/genesis-ui": patch
---

Fixes from a review of the data layer:

- **Create:** `useResourceTable`'s `create` is undefined when `can("create")` refuses, matching ResourcePage, which hides its button. A headless layout no longer offers a create the page wouldn't.
- **KanbanBoard focus:** after a failed move, or a card that leaves the board, KanbanBoard drops its pending refocus, so focus no longer jumps to that card's handle later.
- **Imports:** ResourcePage no longer imports hooks it doesn't call, so no logic appears to live in the page.
