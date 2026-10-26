---
"@marktiderman/genesis-ui": patch
---

Follow-ups from review:

- **ResourcePage `variant="embedded"`:** the filter row now also shows for saved views and whenever the list is already filtered (such as a `?q=` arriving from the URL), so a filtered list always shows why and how to clear it. An explicit `header="page"` keeps the full header, count and view settings included.
- **KanbanBoard focus:** after a move that saves asynchronously, focus returns to the card once it arrives in its new column. An earlier failed move of the same card no longer cancels a later move's refocus.
