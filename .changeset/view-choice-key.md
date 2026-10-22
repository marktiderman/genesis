---
"@marktiderman/genesis-ui": patch
---

Fix: every ResourcePage without a `resource` (rows passed in through `data`) shared one remembered table/cards choice, so picking cards on one list switched every other list to cards. The choice is now kept per page, under the same key as its density and page size (`viewSettingsKey`, else `resource`, else the title). `useResourcePage` gains a `viewKey` option.

A caller's unconfirmed `onDelete` is called right away again (#104 had deferred it by a tick). A throw or a rejection is still reported.
