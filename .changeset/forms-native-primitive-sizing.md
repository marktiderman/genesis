---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-forms-native": patch
---

`NativeButton` keeps a caller's `accessibilityState.busy` when `loading` is not set, so a screen reader hears "busy". The form's Button and answer field drop the primitives' fixed height and boxed-field classes, so they grow with the text size and keep the answer line; a long answer no longer takes `NativeTextarea`'s default four lines.

`NativeProgress` takes `style` and `indicatorStyle`, for colors from a theme object. The form's progress bar uses them, so it keeps the form theme's `tint` on `fill`, and the inner bar is hidden from screen readers, so they hear one progress bar. The form's text parts set their own line height so the ending check, the progress label and the required mark draw at their size.

`NativeButton` types `style` and `ref`, and `NativeText`, `NativeInput` and `NativeTextarea` type `ref` (React 19 passes it as a prop), so a caller passes them without a cast.
