# @marktiderman/genesis-forms-web

## 0.6.1

### Patch Changes

- 02b287e: Form, question and ending descriptions keep their line breaks: a single newline breaks the line and a blank line separates paragraphs (`white-space: pre-line`). The text still renders as plain text.

## 0.6.0

### Minor Changes

- 6d5686a: Upload handshake for `photo` fields, moved up from the host app's feedback photo uploads.

  - `genesis-forms/server`: `createUploadHandler({ resolveForm, store, edit?, rateLimit?, ... })`, the
    endpoint that signs one upload per file after checking the form, the field, the file's type and
    size, the attempt id or edit link and the rate limit; the same JSON and status codes the host app
    answered with. `checkUploads(definition, answers, { formId, owner, store })` checks on submit that
    every file the answers name was uploaded by this attempt or for this edit, to that field, stored,
    of an allowed type and size, and no more than the field takes; stored metadata replaces what the
    browser sent. Also `UploadStore`, `StoredUpload`, `UploadOwner`, `uploadFields`, `uploadRules`,
    `attemptHash`, `NOT_UPLOADED_MESSAGE` and `UPLOAD_MESSAGES`.
  - `genesis-forms`: the handshake's JSON types `UploadRequest`, `UploadGrant`, `SignedUpload`,
    `UploadRefusal` and `MAX_UPLOAD_REQUEST_BYTES`.
  - `genesis-forms-web`: `signedUploadHost({ endpoint, claim, send?, readUrl?, fetch? })`, the browser
    half, an `UploadHost` for `<Form onUpload>`; `UploadHost` takes an optional `url(ref)` for reading
    a stored file. It now needs genesis-forms `>=0.7.0`.

## 0.5.0

### Minor Changes

- d1e2966: Options carry more than a value and a label: `ChoiceOption` gains optional `description`,
  `image` (an `https://` link) and `attributes` (`Record<string, string | string[]>`, for filters
  and recall). `readOption` keeps each detail only when it is well formed and within
  `OPTION_LIMITS`; `choiceOptions` and `withHostOptions` keep them, `parseForm` reports a
  definition's malformed ones (`isHttpsUrl`, `optionJson` are exported too). Existing options and
  `hostOptions` work unchanged.

  genesis-forms-web shows an option's description as a muted line under its label and its image as
  a small picture beside it. In genesis-forms-builder, `setOptions` keeps an option's details when
  its label changes, and a host list's `sample` options show theirs in the preview.

  Features: option-lists

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

- bdcb233: Edit links, rate-limit keys and clean form links, moved up from the host app's forms.

  - `genesis-forms/server`: signed edit links (`signEditToken`, `verifyEditToken`, `editLinkUrl`,
    `withEditToken`, `createEditSecretReader`, `isEditLinkRequest`, `withEditLinkHeaders` and their
    constants), byte-for-byte the format the host app signs, so its links keep working. Rate-limit
    pieces without the counter: `clientIp`, `addressPrefix`, `rateLimitKey` (an HMAC of the address's
    /64, never the address), `allow` (fails open) and `RATE_LIMIT_DEFAULTS`. Web Crypto only.
  - `genesis-forms`: `carryAnswers` moves here from genesis-forms-studio, which re-exports it from its
    `rules` entry unchanged; studio now needs genesis-forms `>=0.6.0`.
  - `genesis-forms-web`: `hideQueryOnLoad`, `wasReload` and `HIDDEN_QUERY_KEEP_MS` take a link's query
    out of the address bar. The ending slot takes `actions` (shown in a row under the default ending),
    and `DefaultEnding` is exported.
  - `genesis-forms-studio/rules`: `slugFromTitle`, `SLUG_PATTERN`, `validateSlug`, `copyTitle`,
    `freeSlug` and `offersSubmitAnother`.

## 0.4.0

### Minor Changes

- 8941c14: Options from the app: a single choice, multiple choice or dropdown question can take its options from the app showing the form, such as a coach picker that always lists a practice's current coaches.

  - **genesis-forms**: a choice field may set `props.optionsFrom: { source: "host", key }` (`f.singleChoice`, `f.multiChoice` and `f.dropdown` take `optionsFrom`, and `options` is then optional). `createForm` and `replay` take `hostOptions` (lists by key, `{ value, label }[]`): `engine.definition` has them filled in after the question's own options, so renderers show them and only these values validate. `validateSubmission` takes `hostOptions` too, loaded on the server, so a value the server doesn't offer now is refused. New exports: `withHostOptions`, `optionsSource`, `HostOptions`, `OptionsSource`. `parseForm` checks the shape of `optionsFrom` (an issue), warns when a non-choice type sets it, and no longer warns about rules comparing such a question with a value only the app supplies. Definitions without `optionsFrom` behave exactly as before.
  - **genesis-forms-builder**: `hostOptions?: HostOptionList[]` on `FormBuilder` and `BuilderConfig` (`{ key, label, description?, sample? }`). A choice question's options read "Options: Typed here | From the app", with a picker of the host's lists; the preview and the path checks use each list's `sample`, and a question using a list the host doesn't offer is a warning. New: `setOptionsSource` (ops), `sampleHostOptions`, `HostOptionList`; `analyze` takes `hostOptions`.
  - **genesis-forms-web**: `<Form hostOptions>` passes the lists to the form's engine (with your own `engine`, pass them to `useForm`).

- a3ba64e: An "Other" answer on choice questions: `props.other: true` (or `{ label }`) adds an Other option with a text box to a single choice, multiple choice or dropdown question. The typed text is the answer (one more item on a multiple choice), checked on the server (blank or over 200 characters is refused, and so is text on a question without Other). The builder has an "Allow an Other answer" switch, and response summaries count typed answers together under Other.
- cbc94c1: Partial responses and drop-off by question (Typeform's "capture partial responses after every question").

  - **genesis-forms**: `settings.saveProgress` (off by default; `parseForm` checks it's a boolean). `formProgress(engine)` says how far a respondent got: `{ step, total, fieldId }`, `fieldId` being the furthest question reached, kept after Back; `furthestReached(state, definition)` is the block. `FormState.furthest` holds the furthest block reached with Next. `createForm(definition, { initialValues, resumeAt })` picks up where someone was after a reload: it moves on with Next from the first block to `resumeAt` (so Back still walks their path), stopping early at a step that no longer passes.
  - **genesis-forms-web**: `<Form onProgress={(engine, progress) => …}>`. With `settings.saveProgress` on, it's called a moment after each step forward (`PROGRESS_DELAY_MS`; in classic layout `CLASSIC_PROGRESS_DELAY_MS` after the answers change), never holding up Next: a rejection is ignored, a pending call goes at once on `pagehide`, and none is made once the form is submitted. A short note under the first question says "Your answers save as you go." (`progressNotice`, `null` hides it).
  - **genesis-forms-builder**: a "Save answers as they go" switch in the form's settings, under Responses (`settingsOmit: ["saveProgress"]` leaves it out). `updateSettings` stores `saveProgress` only when on.
  - **genesis-forms-studio**: `SummaryItem.status` (`in_progress`, `partial`, `completed`; missing is completed) and `furthest`. A status filter (`ResponseFilter.status`, `FiltersValue.status`, `<ResponsesFilters statuses>`: Sent and partial by default, Sent, Partial, In progress), so in-progress responses stay out of summaries unless picked; `matchesStatus`, `STATUS_FILTER_LABEL`, `RESPONSE_STATUS_LABEL`. The Responses card says how many are partial. `dropOffByQuestion(items, definitions)` and `<DropOffByQuestion>`: each question's views, how many stopped there, and the drop-off share.

- 93e16e4: A renderer for the `photo` field: "Choose a photo", and "Take a photo" (the camera) on touch devices; type, size and count checked before uploading; a thumbnail (or the file's name when the browser can't draw it) and a remove button per photo. The file goes to the host through the new `Form` prop `onUpload(file, field) => Promise<PhotoRef>` (or an `UploadContext` around the form), so the renderer stays storage-agnostic; a rejected upload shows under the field. While a photo is uploading the form neither moves on nor sends, and says "Wait for the photo to finish uploading." Without a host, a photo field says photos can't be added. New exports: `UploadContext`, `useUpload`, `UploadHost`, `UPLOAD_WAIT_MESSAGE`, `photoAccept`, `photoFileProblem`, `photoFileType`.

## 0.3.0

### Minor Changes

- 5b1f464: A renderer for the `calculated` field type: the worked-out value, read-only, in an `<output>` named by the question and announced politely as it changes. Numbers, percents and text follow the field's `format` and `decimals`; with no value yet it shows a dash. It is in `builtInRenderers` and `defaultRegistry`.
- 5b1f464: Renderers for the new question types, a theme, a required note and one send word.

  - Renders `dropdown` (a native select, so phones show their own picker), `number` (the decimal or numeric keypad, keeps what is typed until it is a number, shows its range), `date` (the browser's date picker with `min`/`max`) and `consent` (one checkbox under the question).
  - Ratings show `lowLabel` / `highLabel` under their ends, each read with its end option, and `display: "stars"` draws a row of stars (still one radio per star, "3 of 5"). NPS takes the same labels and keeps "Not likely" / "Very likely" as defaults.
  - `theme={{ accent, headerImage, headerImageAlt }}` (new `FormTheme` type): the accent becomes the form's primary colour, adjusted only as far as needed for at least 3:1 against the page (light and dark) and 4.5:1 for text on it; `headerImage` is a banner over the title. `themeColors` and `themeCss` are exported.
  - When any question is required, the title shows "\* Required" (`requiredLabel`, `null` hides it; `HeaderSlotProps.requiredNote` and `image` for a custom header).

  **Behaviour change:** the default `submitLabel` is now **"Send"** in every layout (it was "Submit"). Pass `submitLabel="Submit"` to keep the old word.

  Features: forms-web

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
