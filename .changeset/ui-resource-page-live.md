---
"@marktiderman/genesis-ui": minor
---

`ResourcePage` (and `useResourceTable`) takes `live`: in `resource` mode, the list and the open record refetch when the provider reports a change, for example through Supabase Realtime. It is shorthand for `resourceOptions.live`, which wins.
