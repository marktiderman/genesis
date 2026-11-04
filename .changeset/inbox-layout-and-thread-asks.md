---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

What building a support inbox on the layouts asked for. All additive.

- `InboxLayout`: below `lg`, a button over the list opens `views` in a sheet (`activeViewLabel` names the chosen one). From `md` up the Details toggle floats at the thread's top right instead of taking a row; `thread` can be a function that gets `{ contextToggle }` to place it in its own header.
- `ThreadAttachment` takes `kind` (`image`, the default, or `file`) and `name`. A file shows its name and opens `uri`, http(s) and a local file only.
- `ThreadPage`, web and native: `error`, `errorTitle`, `errorBody`, `onRetry` and `retryLabel`. The `empty` slot gets `actionLabel` and `onAction`.
- `ThreadComposer` carries `modesLabel`, and `NativeComposerBar` takes it too, as `ComposerBar` does.
- The web layouts' docs and genesis-ui's README say what Tailwind needs to see the package's classes.
