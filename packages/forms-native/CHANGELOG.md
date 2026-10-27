# @marktiderman/genesis-forms-native

## 0.2.0

### Minor Changes

- c103d2d: `FormFocus` reports what it survives through `reportError` from `@marktiderman/genesis-core/errors` instead of `console.warn`: an `onQueued` that throws (`forms-native:on-queued`), a draft that can't be saved or cleared (`forms-native:draft-save`, `forms-native:draft-clear`) and a retry that can't start (`forms-native:retry`). With the native observability block they reach Sentry. `@marktiderman/genesis-core` is now a peer dependency (genesis-ui-native already depends on it).

## 0.1.1

### Patch Changes

- c82a6a2: New package, `@marktiderman/genesis-forms-native` 0.1: `<FormFocus>`, the React Native renderer for Genesis Forms in focus layout, on genesis-forms-react's `useFormController`. One question or content step (heading, text, a host's callout) per screen; field renderers registered by kind for short and long text, email, phone, number, date, single and multiple choice, dropdown, rating, NPS, yes/no, consent, calculated and photo (through a host's picker and storage); filtered lists, a search box over long lists, "Other" answers and `respondentPath` progress. Keyboard-aware scrolling, accessibility focus and spoken announcements, Dynamic Type, reduced motion, haptics, and a theme seam over theme roles (iOS system colors by default), with no NativeWind needed. The platform header is set through `screen` (expo-router's `Stack.Screen`). Slots: `header`, `brand`, `progress`, `navigation`, `ending`, `errorSummary`, `notice`, `status`. `draft` takes `useFormDraft`'s result (loading, resume, a save when the app goes to the background, cleared once the submission is safe) and `outbox` a `createSubmitOutbox` outbox (one idempotency key per response, the queued submission's status on the ending).

  Features: forms-native

- 1718648: `FormFocus` no longer uses `InputAccessoryView`, which React Native 0.88 deprecates (Metro warned on every form with a number or phone question). While a keyboard with no return key is up (iOS's number and phone pads before iOS 26), the app's keyboard toolbar (`keyboardToolbar` on `GenesisNativeApp`, react-native-keyboard-controller's `KeyboardToolbar`) shows with its arrows hidden and a done button that says Next (or Send) and moves the step on; iOS 26 shows the pad's return key itself, so the bar stays away there and on every keyboard that has one. Without a toolbar, the form's own Next button stays in view. Next keeps the keyboard up (it calls `preventDefault()` on the done event); Send closes it. `KeyboardToolbarProps` in genesis-ui-native now lists the optional `showArrows`, `doneText` and `onDoneCallback` Genesis may pass (all `KeyboardToolbar`'s own). `FormNativeContextValue` gains `needsKeysBar` and `setNeedsKeysBar`: a hand-built value (a test's mock) needs them.

  `InboxPage` lets a tap in its header land while the keyboard is up (`keyboardShouldPersistTaps="handled"`): the idea board's first tap on "Suggest" pressed nothing and only closed the keyboard.

  Features: forms-native, inbox-thread
