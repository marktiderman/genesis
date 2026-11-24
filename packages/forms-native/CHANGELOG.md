# @marktiderman/genesis-forms-native

## 0.3.1

### Patch Changes

- 84127e9: **New doctor rule `expo-native-deps` (native pack), and the Expo starter on its SDK's versions.**

  - `genesis doctor` now makes the comparison `npx expo install --check` makes, offline: every installed package the installed `expo`'s `bundledNativeModules.json` names (the app's dependencies and devDependencies, plus `expo-modules-core` resolved from expo's real folder, pnpm's isolated store included) must be in the range that SDK expects, prereleases in range allowed and a React Native TV install compared by major.minor, as Expo does. `react-native` and `expo-modules-core` are errors: native code built for another React Native can crash the app at launch, in dyld, before any JavaScript runs. The others are warnings. The finding names an override or resolution that pins the installed version, in the app or at its install root (`expo install --fix` can't move one). `package.json` `expo.install.exclude` keeps a package off the check with Expo's meaning: a name always, `name@version` or `name@range` while the SDK's suggestion matches it. `genesis fix` points to `npx expo install --fix`, the reinstall and a new native build.
  - The starter `genesis init --template native` copies is on Expo SDK 58.0.26's versions: `react-native` 0.88.1 (it was 0.88.0, which `expo` ~58.0.19 resolving to 58.0.26 and its `expo-modules-core` 58.1.0 don't support), with `react-native-safe-area-context`, `expo-web-browser`, `@sentry/react-native`, `@shopify/flash-list`, `@react-native-community/datetimepicker` and the other Expo modules at the versions `expo install --fix` writes. The pnpm settings a new app gets override `react-native` to 0.88.1.
  - An app made from an earlier starter: run `genesis doctor`; on an `expo-native-deps` error, run `npx expo install --fix`, change `react-native` in `pnpm-workspace.yaml` `overrides` to the version it names, reinstall and make a new native build.
  - genesis-native and genesis-forms-native: development dependencies only (`expo` ~58.0.26, `react-native` 0.88.1), so the repository installs one expo and one expo-modules-core. Nothing they ship changes.

## 0.3.0

### Minor Changes

- 4dc7aed: The form now renders with genesis-ui-native primitives: `Button` is a thin wrapper over `NativeButton`, answers are `NativeInput` and `NativeTextarea`, the progress bar is `NativeProgress`, and the header, brand, ending and notice text is `NativeText`. Props, test IDs, accessibility and the form theme (a host `tint`) are unchanged.

### Patch Changes

- 200b7fd: `NativeButton` keeps a caller's `accessibilityState.busy` when `loading` is not set, so a screen reader hears "busy". The form's Button and answer field drop the primitives' fixed height and boxed-field classes, so they grow with the text size and keep the answer line; a long answer no longer takes `NativeTextarea`'s default four lines.

  `NativeProgress` takes `style` and `indicatorStyle`, for colors from a theme object. The form's progress bar uses them, so it keeps the form theme's `tint` on `fill`, and the inner bar is hidden from screen readers, so they hear one progress bar. The form's text parts set their own line height so the ending check, the progress label and the required mark draw at their size.

  `NativeButton` types `style` and `ref`, and `NativeText`, `NativeInput` and `NativeTextarea` type `ref` (React 19 passes it as a prop), so a caller passes them without a cast.

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
