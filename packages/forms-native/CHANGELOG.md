# @marktiderman/genesis-forms-native

## 0.2.3

### Patch Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

## 0.2.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.2.1

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

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
