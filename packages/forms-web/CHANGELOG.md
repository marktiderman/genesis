# @marktiderman/genesis-forms-web

## 0.2.0

### Minor Changes

- 9453f10: Renderers for the `list`, `table`, `media-notes` and `text-highlights` field types, in `defaultRegistry`. Lists and tables add, remove and reorder entries (SortableList: drag, keyboard and a Move menu). Media notes take a typed time (`m:ss`, `h:mm:ss` or seconds); text highlights come from selecting words in the passage or typing them. New `MediaTimeContext` / `useMediaTime` (type `MediaTime`) link notes to the host's video or audio player (`currentTime` prefills "Add note at 1:23", `seek` plays from a note), and `SourceTextContext` / `useSourceText` supply the passage to highlight.

### Patch Changes

- 9453f10: Form builder polish from hands-on testing:

  - A form with no questions now previews as "Add a question to see it here." instead of "Question 1 of 0" with an OK button, and a published form never shows "Question N of 0".
  - The question editor keeps Question, Description, Type, its settings and Required up front. Answer name (was Key), "Identifies the respondent", "Sensitive" and the note on repeating an earlier answer move into a closed "Advanced" section, in plainer words.
  - Question titles in the list no longer disappear in a narrow column: the title truncates with "…" (full text on hover), badges wrap under it, and the action buttons wrap to a second line when space runs out.

- 9453f10: Raise the `@marktiderman/genesis-forms` peer floor to `>=0.3.0`. Both packages now import exports that only exist from forms 0.3.0 (`formatTimestamp`, `parseTimestamp`, `rowsColumns`, `MAX_ROWS_COLUMNS`, the structured field types), so a host on forms 0.2.x failed at module load.

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
