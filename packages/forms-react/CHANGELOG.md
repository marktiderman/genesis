# @marktiderman/genesis-forms-react

## 0.3.3

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

## 0.3.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.3.1

### Patch Changes

- 98aaa90: `useFormDraft`: autosave now starts listening before the form is painted. An answer given between the form appearing and a passive effect running was not saved until the next change (seen with async storage, as on React Native).

## 0.3.0

### Minor Changes

- e73f96f: `useFormDraft(definition, { store, respondent, version?, delayMs?, ... })`: `useForm` with a draft
  on the device, put back when the form opens (at the question reached), saved as the respondent
  goes and flushed when the page is hidden or the component unmounts; `clear()` once the submission
  is queued. `useSubmitOutbox(outbox)`: the outbox's state (pending, failed, items, online), started
  on mount and following the browser's online and offline events. `outboxSubmit(outbox, { formId,
clearDraft })`: an `onSubmit` for `useFormController` that queues the submission and then clears
  the draft (a storage failure leaves the controller `failed`, answers kept). It now needs genesis-forms
  `>=0.7.0`.

  Features: forms-drafts, forms-outbox

- e7b724c: A content-type registry, merging partial responses, and a shared form controller.

  - `genesis-forms`: every field and content kind is one registered definition that the engine,
    `parseForm`, validation, the server and snapshots read, instead of switches on type names. A
    field kind's manifest gains `checkProps` (its props schema), `choice: { multiple }` (its answer
    shape: a host's choice kind gets `optionsFrom`, filters, `prefill`, `other` and snapshots),
    `literal`, and `snapshot`/`fromSnapshot` for other kinds. `registerContentType`,
    `getContentType`, `listContentTypes` and `contentText` add content kinds; `ContentBlock` takes
    `props` and any registered `type`. Also `choiceKind`, `isChoiceField`, `isBuiltInFieldType`,
    `VALIDATOR_FAILED_MESSAGE` and the `PropsCheck` types. `registerFieldType` now refuses a
    built-in kind's name unless `{ replace: true }`, refuses a manifest without `value` or
    `operators`, and stores a frozen copy (`operators` reads as a fresh list); a choice kind
    without its own `validate` gets the built-in check for its shape. A validator that throws
    refuses the answer; a props check that throws is one `parseForm` issue; a throwing `literal`,
    `snapshot` or `fromSnapshot` is skipped. The registry's global key names its format
    (`field-types@2`), so an older copy of the package in the same process keeps its own registry.
    `choiceOptions`, `withHostOptions`, `answerSnapshots`, `answersFromSnapshots` and
    `validateSubmission` return exactly what they did (golden tests pin them). Two message
    changes: once a host registers a content kind, an unknown kind's issue lists it ("Must be
    heading, text or callout."); and a field whose type is an `Object.prototype` name
    (`toString`) no longer gets nonsense literal warnings.
  - `genesis-forms`: `mergeResponses(definition, base, patch, { hidden?, hostOptions?, offPath? })`
    lays a patch over a saved draft for resuming and partial saves. Answers on a path no longer
    taken are dropped, unless `offPath: "keep"` (the default keeps them only with
    `settings.clearHiddenValues: false`). Also exported from `/server`.
  - `genesis-forms-react`: `useFormController(engine, options)`, the headless controller for any
    renderer (step and path, errors, Next and Back, sending with retry, auto-advance, saving
    progress, announcements and focus targets), plus `formEngineOptions` and the
    `ADVANCE_DELAY_MS`, `PROGRESS_DELAY_MS` and `CLASSIC_PROGRESS_DELAY_MS` timings.
  - `genesis-forms-web`: `<Form>` renders `useFormController`; its behaviour is unchanged. A content
    kind it has no drawing for shows its display text. It now needs genesis-forms-react `>=0.3.0`.

### Patch Changes

- 4eb5e06: `outboxSubmit` queues the form's hidden inputs (link prefill, host values) with the event log, so the server receives and re-validates them.

## 0.2.0

### Minor Changes

- d1e2966: Lists filtered by another answer, search for long lists, and preselecting from a link. Every
  decision lives in genesis-forms, pure, so web and native renderers, the engine and the server
  agree.

  - **Filtered lists:** `props.optionsFrom.filter: { attribute, field }` shows only the options
    whose attribute matches an earlier question's answer (`visibleOptions`, `optionMatches`,
    `answersOnPath`). The engine clears a pick that stops matching (`clearFilteredAnswers`), and the
    engine and `validateSubmission` refuse one outside the filter (`filteredChoiceError`).
    `parseForm` checks the question it reads exists and comes earlier.
  - **Search:** `isSearchable(field, count)` (more than `SEARCHABLE_OPTION_COUNT`, 10, unless
    `props.searchable` says) and `searchOptions(options, query)`. genesis-forms-web draws such a
    question as an in-page searchable list (genesis-ui `Command`), in classic and focus layouts.
  - **Link prefill:** `props.prefill: { param, hideWhenPrefilled? }`, `createForm`'s `linkParams`
    and `<Form linkParams>` preselect an option from `?param=value` when it is offered
    (`prefillFromLink`); with `hideWhenPrefilled` the engine steps over it (`hiddenByPrefill`,
    `respondentPath`) and still stores the answer, which the server checks like any other.
  - genesis-forms-react: `useChoiceOptions(engine, id)` and `useRespondentPath(engine)`.
  - genesis-forms-builder: "Only show options matching" under a list from the app
    (`setOptionsFilter`, `HostOptionList.attributes`, `hostListAttributes`), and per choice
    question a Search box setting and "Fill in from the link" (`setPrefill`). Renaming, moving or
    removing the question a filter reads keeps the definition valid.

  Features: option-lists

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
