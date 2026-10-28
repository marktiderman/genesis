# @marktiderman/genesis-forms-devtools

## 0.1.3

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.1.2

### Patch Changes

- 9453f10: Optional props and options accept an explicit `undefined`, so apps compiled with `exactOptionalPropertyTypes` can pass their own optional values straight through (`Inspector`, `CoveragePanel`, `ErrorBoundary`, the panels, `pretty` and `encodeShare` options). A type test against the built output keeps it that way.

  The built entry now starts with `"use client"` again (the tsup banner was dropped by tree-shaking), so a React Server Component can import the devtools.

## 0.1.1

### Patch Changes

- 46d6f5e: Review fixes for the forms packages.

  - `genesis-forms`: hidden inputs take `identifying: true` (`f.hidden.string({ identifying: true })`); on an anonymous form `validateSubmission` leaves them out of the stored `hidden` and `context`. `parseForm` warns when a comparison literal can never match (wrong type for the field or hidden input, not one of a choice's options, `in` without a list), and rejects a rating `props.max` outside 2 to 10 and a `maxLength` that is not a whole number above 0. Empty answers (blank text, `""`, `[]`) are no longer stored, and a cleared field is left out of `answers()` rather than sent empty: replace a saved draft with it, don't merge into it. `ignored` lists each key once. Number hidden inputs accept only plain decimals such as `-3` or `0.5` (no longer `" 12 "`, `"0x1A"`, `"1e3"`, `"+5"` or `".5"`). Recall tokens in endings and the introduction that name nothing are warned about. Optional options of `createForm`, `validateSubmission` and the field builders accept `undefined` under `exactOptionalPropertyTypes`.
  - `genesis-forms-react`, `genesis-forms-web`: optional hook options and `<Form>` props accept `undefined` under `exactOptionalPropertyTypes`. `onChange`'s docs say it fires on every state change.
  - `genesis-forms-devtools`: identifying fields and hidden inputs are masked like sensitive ones, in share links and in the State and Timeline panels.
  - Peer ranges on other forms packages are now `>=0.1.1 <1.0.0` (on `genesis-forms`) and `>=0.1.0 <1.0.0` (on `-react`), so a minor `genesis-forms` release no longer forces dependents to `1.0.0`.

## 0.1.0

### Minor Changes

Genesis Forms R1. New packages:

- `@marktiderman/genesis-forms` — the zero-dependency engine: a serializable form definition, `defineForm` with inferred answer types, `parseForm`, show/hide and jump logic with a path derived from answers, recall with fallbacks, typed hidden inputs (`url`, `host`, `server`), an event log with `replay`, eight field types, and `/server` `validateSubmission` for server-side checking.
- `@marktiderman/genesis-forms` also ships `explain` ("why is this hidden?" traces for devtools), and in `/testing`: `coverage` (symbolic path enumeration: unreachable blocks, rules that never fire, endings with witnesses), versioned JSON scenarios (`runScenario`, `recordScenario`, `compactEvents`) and an R1 conformance suite at `@marktiderman/genesis-forms/conformance/*.scenario.json`. Failed Next/Submit attempts are logged in the event log, and a completed response is final.
- `@marktiderman/genesis-forms-react` — `useForm`, `useField` (one-field re-renders), a ranked renderer registry and a headless `FormRuntime`.
- `@marktiderman/genesis-forms-web` — `<Form>` with focus (one question at a time) and classic layouts on Genesis UI, accessible by default, with `slots`/`slotProps`. `presentation="page"` is the full-screen respondent view (Typeform style in focus layout, Google Forms style in classic), with an optional `brand` (logo and name) and `useFormPresentation()` for custom slots and renderers.

- `@marktiderman/genesis-forms-devtools` — an inspector with live state, a time-travel event timeline, a server-check panel with tamper mode, and share links in the URL hash.

The umbrella adds `/forms`, `/forms/server`, `/forms/react` and `/forms/web`.
