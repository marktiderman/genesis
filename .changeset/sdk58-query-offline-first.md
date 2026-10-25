---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-ui-native": minor
---

`createNativeQueryClient` defaults queries and mutations to `networkMode: "offlineFirst"` instead of `"always"`. A request still runs once whatever the network says; its retries now pause while NetInfo (through `connectQueryLifecycle`) reports offline and continue when the network is back, and stale queries refetch on reconnect (`"always"` turned `refetchOnReconnect` off, so the NetInfo wiring did nothing). Offline, a query with saved data keeps showing it; one with nothing saved stays `pending` with `isPaused` instead of failing after its retries; a mutation, with no retries by default, still fails at once. Pass `networkMode: "always"` in `defaultOptions` to keep the old behaviour. `NativeResourcePage` shows an offline message (`offlineState` to replace it) in place of the empty state while its list is paused with nothing saved (search and filters stay above it), and its pull-to-refresh spinner stops while a refetch is paused offline. `connectQueryLifecycle`'s cleanup sets the app back online, so no query stays paused on a stale "offline".

Features: native-app-shell
