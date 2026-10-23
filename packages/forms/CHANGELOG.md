# @marktiderman/genesis-forms

## 0.4.1

### Patch Changes

- e1d2ed6: Calculated fields stay fast when an answer a formula reads keeps changing. Each list or table column is read once per answer (kept by the answer's array) and its numbers are added up once, so a step that changes the tax rate no longer walks an unchanged 10,000-row table again. New `MAX_SETTLE_ITEMS` (50,000): the list items and table rows all of a form's formulas read together, each answer and column counted once in form order; a calculated field that reads an answer past it, or one over `MAX_FORMULA_ITEMS`, is now blank instead of a partial total (an answer over `MAX_FORMULA_ITEMS` uses none of the allowance). Totals are kept only for lists the package builds and freezes itself, so a custom `FormulaReader` that changes a list in place gets fresh totals, and `formulaInput` builds a new list on each call. Answers must not be changed in place (pass `setValue` a new array). `parseForm` caps a form's formulas at `MAX_FORM_FORMULA_LENGTH` (20,000) characters together, since each step that changes an answer they read works them out again. A number written with letters (`1e6`, `2x`) now says "Write a number in digits only".

## 0.4.0

### Minor Changes

- 5b1f464: A `calculated` field type: a value worked out from other answers and shown read-only, such as a total or a score. Its props are `{ formula, format?: "number" | "percent" | "text", decimals? }`. The formula language is small and parsed here, never evaluated as code: answer keys (`hours`), one table column (`plan.cost`), numbers, text in quotes, `+ - * /` (also `− × ÷`), parentheses, comparisons (`== != < <= > >=`, also `= ≠ ≤ ≥`), `test ? a : b`, and `sum`, `avg`, `min`, `max` over numbers, lists and table columns. A blank answer makes arithmetic blank, so a total stays empty until its answers are in; `sum` skips blanks.

  The engine works the values out from the answers on the path, again whenever an answer a formula reads changes, and stores them with the answers, so a submission carries them. A replay (and so `validateSubmission`) and prefilled answers work them out once before each step, not once per event, so a large submission stays fast. A list or table of more than `MAX_FORMULA_ITEMS` (10,000) items reads as blank in a formula, and a number literal too large to hold is a parse error. Nesting is counted per parenthesis, call, sign or `? :`, up to 64 levels. `setValue` on a calculated field does nothing, and `validateSubmission` works the values out itself and ignores the client's. A calculated field is never required. Logic may compare a calculated value.

  `parseForm` checks the formula: it must parse, every key must be a question of the form, a table must be read by one of its columns, and a calculated field may only read calculated fields before it. Each problem is an issue on `props.formula` with the character it is at. `format` and `decimals` are checked too, and `required: true` is a warning.

  New exports: `parseFormula`, `evaluateFormula`, `formulaRefs`, `renameFormulaKey`, `formulaNumber`, `FORMULA_FUNCTIONS`, `MAX_FORMULA_LENGTH`, `calculatedProps`, `calculatedValue`, `formatCalculated`, `formulaInput`, `MAX_FORMULA_ITEMS`, `CALCULATED_TYPE`, `COMPUTED_FIELD_TYPES`, `MAX_CALCULATED_DECIMALS` and their types, and `f.calculated` for `defineForm`.

- 5b1f464: Four new field types, and end labels and stars for ratings.

  - `dropdown` (`f.dropdown(key, { options })`): one option from a compact menu. Validated, summarized and compared like single choice.
  - `number` (`f.number(key, { min, max, step })`): a number within optional limits, on an optional step counted from `min` (else 0). Supports `lt`/`gt` logic. `numberLimits(field)`.
  - `date` (`f.date(key, { min, max })`): a real calendar day stored as `YYYY-MM-DD`, within optional limits. `isIsoDate`, `dateLimits(field)`.
  - `consent` (`f.consent(key, { text })`): one checkbox. Checked stores `true`; unchecked is unanswered, so a required consent must be checked. Summarized as "Agreed".
  - `rating` takes `lowLabel`, `highLabel` and `display: "numbers" | "stars"`; `nps` takes the labels. `summarizeValue` adds an end's label (`"5/5 (Great)"`). `scaleLabels(field)`, `ratingDisplay(field)`.

  `parseForm` checks the new props (numbers for number limits, a step above 0, real dates, min not above max, a known rating display, text labels), warns when logic compares a dropdown with a value that is not an option, and `coverage()` finds valid answers for every new type. `validateSubmission` and `publicDefinition` handle them like the other built-in types.

  Later, not in this release: time, a grid of rows by columns, file upload and ranking.

  Features: forms-engine

## 0.3.1

### Patch Changes

- 0156f89: Destinations: the Google token cache is keyed by a SHA-256 digest of the private key as well as the email and scope, so a config with the right email and another key never gets a cached token. Two first deliveries to a new sheet no longer fail permanently: an "already exists" from adding the tab reuses it, and the header is read back and merged again after a concurrent write. A request that can never be sent (a malformed header value or URL) now fails for good instead of retrying as a network error.
- 0156f89: `parseForm` now checks the structured field types' settings even when a field has no `props`, so a `table` field without columns is rejected instead of publishing a form nobody can submit.

## 0.3.0

### Minor Changes

- 9453f10: New `@marktiderman/genesis-forms/destinations` subpath (and the umbrella's `@marktiderman/genesis/forms/destinations`): send a checked submission to an inbox (`emailDestination` with a built-in `resendProvider`), a Google Sheet (`sheetsDestination`, service-account JWT signed with WebCrypto, header management, RAW writes with opt-in formula escaping, dedupe by response id) or a URL (`webhookDestination`, Standard Webhooks HMAC signing with a base64 `whsec_` secret, with `verifyWebhook` for receivers). Each `deliver` resolves a result that is `retryable` or permanent, with `retryAfterSeconds` and a message safe to store; nothing throws or logs, every request has a timeout, and secrets stay out of config. `responseRow` flattens a submission into labelled cells. Still no dependencies: fetch and WebCrypto only, so it runs on Node 20+, edge runtimes and Workers.
- 9453f10: **Breaking for conformance consumers: the shipped scenarios use neutral sample forms.** The `after-class` form is now `event-feedback` (hidden inputs `session` and `owner` instead of `class` and `coach`), and `monthly-pulse` is now `monthly-check-in`. The scenario files are renamed to match (`conformance/event-feedback-*.scenario.json`, `conformance/monthly-check-in-*.scenario.json`; `…-server-ignores-a-client-sent-coach` is now `…-server-ignores-a-client-sent-owner`). Each scenario covers the same logic as before; only ids, keys and copy changed. If you load the files by name, update the names.
- 9453f10: Four built-in structured field types, for questions that collect more than one value:

  - `list`: several short answers, `string[]` (goals, action items, three wins this week). Supports `contains`. Builder `f.list`.
  - `table`: rows with fixed columns, up to `MAX_TABLE_COLUMNS` (6) text columns, `Record<string, string>[]` (an action plan with What / Who / By when, pros and cons). Builder `f.table`.
  - `media-notes`: notes pinned to moments of a video or audio, `{ at, text }[]` with `at` in seconds (lecture notes, reviewing a recorded call). Builder `f.mediaNotes`.
  - `text-highlights`: notes on passages of a text, `{ start, end, quote, note }[]` (annotating an article, a policy or a contract). Every highlight needs a note, and quotes are at most `MAX_HIGHLIGHT_QUOTE_LENGTH` (2000) characters. Builder `f.textHighlights`.

  Each validates, normalizes (trimmed, blanks dropped, notes in time order), summarizes and has samples for `coverage()`; `parseForm` checks their props. New helpers `formatTimestamp`, `parseTimestamp`, `tableColumns`, `tableLimits` and `listLimits`, the `STRUCTURED_FIELD_TYPES` list, and the `TableColumn`, `MediaNote` and `Highlight` types.

## 0.2.0

### Minor Changes

- 46d6f5e: Review fixes for the forms packages.

  - `genesis-forms`: hidden inputs take `identifying: true` (`f.hidden.string({ identifying: true })`); on an anonymous form `validateSubmission` leaves them out of the stored `hidden` and `context`. `parseForm` warns when a comparison literal can never match (wrong type for the field or hidden input, not one of a choice's options, `in` without a list), and rejects a rating `props.max` outside 2 to 10 and a `maxLength` that is not a whole number above 0. Empty answers (blank text, `""`, `[]`) are no longer stored, and a cleared field is left out of `answers()` rather than sent empty: replace a saved draft with it, don't merge into it. `ignored` lists each key once. Number hidden inputs accept only plain decimals such as `-3` or `0.5` (no longer `" 12 "`, `"0x1A"`, `"1e3"`, `"+5"` or `".5"`). Recall tokens in endings and the introduction that name nothing are warned about. Optional options of `createForm`, `validateSubmission` and the field builders accept `undefined` under `exactOptionalPropertyTypes`.
  - `genesis-forms-react`, `genesis-forms-web`: optional hook options and `<Form>` props accept `undefined` under `exactOptionalPropertyTypes`. `onChange`'s docs say it fires on every state change.
  - `genesis-forms-devtools`: identifying fields and hidden inputs are masked like sensitive ones, in share links and in the State and Timeline panels.
  - Peer ranges on other forms packages are now `>=0.1.1 <1.0.0` (on `genesis-forms`) and `>=0.1.0 <1.0.0` (on `-react`), so a minor `genesis-forms` release no longer forces dependents to `1.0.0`.

## 0.1.1

### Patch Changes

- ef7eb56: `f.hidden.string/number/boolean` now type `sensitive` as `sensitive?: true`, not `sensitive?: true | undefined`, so their specs type-check in `defineForm({ hidden })` under `exactOptionalPropertyTypes`. The build also compiles a consumer file against the published types with that flag on.

## 0.1.0

### Minor Changes

Genesis Forms R1. New packages:

- `@marktiderman/genesis-forms` — the zero-dependency engine: a serializable form definition, `defineForm` with inferred answer types, `parseForm`, show/hide and jump logic with a path derived from answers, recall with fallbacks, typed hidden inputs (`url`, `host`, `server`), an event log with `replay`, eight field types, and `/server` `validateSubmission` for server-side checking.
- `@marktiderman/genesis-forms` also ships `explain` ("why is this hidden?" traces for devtools), and in `/testing`: `coverage` (symbolic path enumeration: unreachable blocks, rules that never fire, endings with witnesses), versioned JSON scenarios (`runScenario`, `recordScenario`, `compactEvents`) and an R1 conformance suite at `@marktiderman/genesis-forms/conformance/*.scenario.json`. Failed Next/Submit attempts are logged in the event log, and a completed response is final.
- `@marktiderman/genesis-forms-react` — `useForm`, `useField` (one-field re-renders), a ranked renderer registry and a headless `FormRuntime`.
- `@marktiderman/genesis-forms-web` — `<Form>` with focus (one question at a time) and classic layouts on Genesis UI, accessible by default, with `slots`/`slotProps`. `presentation="page"` is the full-screen respondent view (Typeform style in focus layout, Google Forms style in classic), with an optional `brand` (logo and name) and `useFormPresentation()` for custom slots and renderers.

- `@marktiderman/genesis-forms-devtools` — an inspector with live state, a time-travel event timeline, a server-check panel with tamper mode, and share links in the URL hash.

The umbrella adds `/forms`, `/forms/server`, `/forms/react` and `/forms/web`.
