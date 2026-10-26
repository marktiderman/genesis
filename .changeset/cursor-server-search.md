---
"@marktiderman/genesis-ui": patch
---

ResourcePage `pagination="cursor"` now searches, sorts and filters on the server, as `pagination="server"` already did. Before, the toolbar's search, the status filter and a header sort worked only on the rows already loaded, so a match on an unloaded page never showed.

- **What happens now:** each change restarts from the first page with the server's count, and search waits for a pause in typing.
- **Search box:** it shows only when the list has `searchFields`, since the server needs to know which columns to match.
- **`useResourceTable`'s `total`:** in cursor mode it's the server's count of matches.
