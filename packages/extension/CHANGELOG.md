# @marktiderman/genesis-extension

## 0.2.1

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.2.0

### Minor Changes

- 85fa85e: Page bar: line icons on chips and buttons (`PageBarIcon`), tooltips (`PageBarChip.title`, `PageBarModel.titleTip`), a hover-only button (`reveal: "hover"`), a green "saved" lead (`leadTone: "success"`), icon-and-text marks (`bare` chips), the corner tab's accessible name (`collapsedTitle`), a 32px `density: "compact"`, and a × to shrink (`shrinkIcon: "close"`). All optional; a model without them draws as before, except the shrink control is now an SVG chevron instead of `▴`.

  `isFromExtensionPage` now requires the sender's address to be this extension's own (its static origin, or the per-session one `runtime.getURL` gives with `use_dynamic_url`), not any `chrome-extension://` address.

## 0.1.1

### Patch Changes

- 0156f89: The top bar starts as one 32px row with a light shadow, and `autoResize` reports the body's height, so a bar shrinks as well as grows. The small window `openSurface` falls back to carries the open's secret, and `surface.ready` is false for a `?tab=` window opened without it.
- 0156f89: Surfaces: a frame confirming its open secret only removes it if it still holds that secret (re-read, under a Web Lock where shared), so a reopen's new secret is never deleted. The floating panel's host lets the page's clicks through (`pointer-events: none`) until the surface is confirmed.
- 0156f89: Surfaces: each open's secret is stored under a key of its own (`genesis-extension:surface:<tab>:<nonce>`), and confirming a frame removes only that key, so a reopen's secret minted meanwhile is never deleted. A new open clears the tab's earlier secrets.
