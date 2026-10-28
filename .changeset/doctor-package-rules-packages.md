---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-collab": patch
"@marktiderman/genesis-connect": patch
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-switchboard": patch
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-extension": patch
"@marktiderman/genesis-features": patch
"@marktiderman/genesis-forms-builder": patch
"@marktiderman/genesis-forms-devtools": patch
"@marktiderman/genesis-forms-native": patch
"@marktiderman/genesis-forms-react": patch
"@marktiderman/genesis-forms-studio": patch
"@marktiderman/genesis-forms-web": patch
"@marktiderman/genesis-forms": patch
"@marktiderman/genesis": patch
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-notifications": patch
"@marktiderman/genesis-product": patch
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-studio-server": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-supabase": patch
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-ui-native": patch
---

Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules that export a `loader` or `action`, or use `createServerFn`, whose server code never reaches the browser; they become errors in a later minor release.

Features: doctor-package-rules
