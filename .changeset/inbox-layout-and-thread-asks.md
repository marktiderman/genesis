---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

What building a support inbox on the layouts asked for. Nothing changes for an app that doesn't use these.

- `InboxLayout`: below `lg`, a button over the list opens `views` in a sheet (`activeViewLabel` names the chosen one). `thread` can be a function that gets `{ contextToggle }` to place the Details toggle in its own header, and then no row is spent on it from `md` up. A `thread` element keeps the row as before.
- `ThreadAttachment` takes `kind` (`image`, the default, or `file`) and `name`. A file shows its name and opens `uri`: on the web, http(s) with its host beside the name, or a `blob:` as a download; on the phone, http(s), and a local file only on your own message.
- `ThreadPage`, web and native: `error`, `errorTitle`, `errorBody`, `onRetry` and `retryLabel`. The `empty` slot gets `actionLabel` and `onAction`.
- `ThreadComposer` carries `modesLabel`, and `NativeComposerBar` takes it too, as `ComposerBar` does.
- The web layouts' docs and genesis-ui's README say what Tailwind needs to see the package's classes.
