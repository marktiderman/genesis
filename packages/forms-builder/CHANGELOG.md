# @marktiderman/genesis-forms-builder

## 0.6.3

### Patch Changes

- 35eac40: Linear-time option lookups for large option lists. The response summary counts choice answers through a value map, and answerCell (used per answer by the summary, the table and CSV) looks labels up in a per-options map, instead of scanning the options for every answer; and the option list editor's CSV import preview compares against a value Set instead of scanning per row. A 5,000-option list with 50,000 answers now summarises in milliseconds.

## 0.6.2

### Patch Changes

- 661e2a2: Built with TypeScript 6 (Expo SDK 58 expects `typescript ~6.0.3`).

  - `genesis-forms-builder`: the only change in any package's published declarations. `FlowMap` is now typed `MemoExoticComponent<(props) => JSX.Element>` (TypeScript 5.9 wrote `NamedExoticComponent<props>`); it is the same component and takes the same props.
  - `genesis-cli`: `genesis init --template native` makes an app on TypeScript 6, with the starter's component tests (jest-expo and React Native Testing Library: sign-in, Settings, account deletion, the tabs and the root layout's boot) run by its `test` script beside the vitest file checks. The app's `pnpm-workspace.yaml` leaves out the monorepo's `patchedDependencies`, whose patch files an app doesn't have.

## 0.6.1

### Patch Changes

- 02b287e: `OptionListEditor`: "Add option" starts a blank option (placeholder "New option") with a unique value, and while the editor stays open that option's value follows its label through the same slug rule, kept unique against the rest of the list. Existing options keep their value when relabelled.

## 0.6.0

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

- d1e2966: `<OptionListEditor list onChange>` edits a named option list a host keeps (rename; add, remove and
  reorder options; each one's label, description, picture and attributes; CSV paste or file import
  with a preview; CSV export). The pure pieces are in `ops` too: `parseOptionListCsv` (flags
  duplicates, blank rows, over-long values and bad image links), `mergeOptions` (upsert by value),
  `optionListCsv`, `parseCsvRows`, `slugOptionValue`, `hostOptionsOf` and the `OptionList` type.
  Persistence stays with the host.

  Features: option-lists

## 0.5.0

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

- 93e16e4: The `photo` field type in the builder, for a host that opts in with `palette={[...defaultPalette(), ...UPLOAD_FIELD_TYPES]}` (it stays out of `defaultPalette()`, since the host must store the files): a camera icon and a settings panel for the most photos (1–5), the largest photo in MB (1–25) and the formats (at least one stays on). Formulas can't read photos, so `formulaNames` leaves them out.

## 0.4.0

### Minor Changes

- 664a25f: Redesigned the Questions and Logic and endings panels.

  - **Questions**: three columns. An outline of every block (drag or keyboard reorder through genesis-ui's `SortableList`, a dashed Add question, the endings), one focused editor for the selected block (type chip, Move, Duplicate, Delete, a large title, the answer settings with segmented controls, for example a rating's Scale 1–3 / 1–5 / 1–10 / Other and Numbers / Stars, Required with a one-line explanation, Advanced closed), and the live preview beside them. The preview and checks stay one column beside every panel, mounted across panels, so the device, layout and typed answers survive a switch (Logic and endings shows the flow map over it). Three columns fit from a 56rem builder; narrower containers stack outline, editor, preview.
  - **Preview**: phone or desktop frame, One by one / One page, and "Live preview · updates as you type".
  - **Logic and endings**: rules read as sentences of picker pills with a kind chip (Jump, Show only when, Hide when), a reorder handle and a menu. Endings show as cards with Default and "Used by …". A new Flow map shows the steps, jump branches and endings, sums up the path checks and has Try a path buttons.
  - New host hooks: `toolbar={false}` hides the title / undo / status / actions row; `onHistoryChange({ canUndo, canRedo })`; `FormBuilderHandle.undo()`, `.redo()`, `.canUndo()`, `.canRedo()` (optional members of the type, so code that implements or mocks the handle keeps compiling; the builder's ref always has them, so call them as `ref.current?.undo?.()`); `settingsLayout={(formSettings) => …}` to lay out the Settings panel (the form settings then drop their own "Form" heading; `SettingsPanel` takes `formHeading={false}` for the same); `settingsRow={SettingsRow}` for the form settings' rows; `settingsOmit={["anonymous"]}` leaves out rows a host owns, with or without `settingsLayout` (type `FormSettingKey`: `"title"`, `"description"`, `"layout"`, `"anonymous"`, `"clearHiddenValues"`, `"hidden"`; a section with no rows left goes too).
  - `Finding.code` now also names the path checks: `"unreachable-block"`, `"rule-never-fires"`, `"unreachable-ending"`, `"paths-not-checked"`. **Heads-up:** `FindingCode` gains these four members, so an exhaustive `switch` over it (one with a `never` check in its default) no longer compiles until it handles them or adds a default. `BuilderHistory` gains an optional `getStatus()`. "Question n needs a title" counts questions only, as the outline does.
  - New exports: `FlowMap`, `flowCheck`, `RuleSentence`, `RuleKindChip`, `PATH_FINDINGS`, `questionNumbers`, `RowLayoutContext`, `BuilderHistoryState`, `FormSettingKey`, `SettingsRowSlotProps`. `QuestionsPanel` takes optional `preview` and `onOpenEnding`; `LogicAndEndingsPanel` takes optional `aside` and `flow`; `ConditionEditor` takes optional `inline`, `linkedJump` and `onRelink`. Every existing prop still works.
  - Many rules stay fast: each rule picker mounts its option list only while open (a closed one keeps just its chosen option), the step lists are built once per definition, and editing one rule re-renders only that rule's sentence. A form with 200 questions and 100 rules renders.

## 0.3.0

### Minor Changes

- 5b1f464: Field outputs. A host passes `outputs` (`OutputTarget[]`) to `FormBuilder`: places a field's answer may also go, such as a column of the respondent's record or a task list, each with a plain-language `label`, an optional `group`, `description` and accepted `types`, and the `prop` and `value` it sets on the field. A question whose type a target accepts gets a "Saves to" section listing them, grouped, with "Nowhere else" on top. Choosing one sets `props[prop] = value`; targets with different props can be used together, and one with the same prop replaces the other. A target is used by one question at a time unless it is `multiple`, and choosing it on another question moves it there (the inspector says so). Changing a question's type keeps the targets the new type accepts. The preview notes each one under its question ("→ goes to …"). A target can't set a prop the field types own (`options`, `formula`, `columns`, limits and labels, listed in `RESERVED_OUTPUT_PROPS`): it is not offered, and `setOutput` ignores it. The targets are only checked in the builder, so a host that acts on outputs after a submit must check each field's props against its own targets on the server. The ops are exported too: `outputsFor`, `chosenOutputs`, `usesOutput`, `setOutput`, `clearOutputs`, `outputUsedBy`, `outputPropsFor` and `RESERVED_OUTPUT_PROPS`.

  Calculated fields. The builder edits the new `calculated` type: a formula input checked as it is typed (the same checks as `parseForm`), buttons for the answers it can use, "Show as" (number, percent, text) and decimal places, and a value worked out from sample answers typed under "Try it". A new calculated field starts with the formula `0`, it has no Required switch, renaming an answer rewrites the formulas that read it, and logic compares it as a number unless it is shown as text. Like the structured types it is opt-in: `defaultPalette()` leaves out `COMPUTED_FIELD_TYPES`, so add them to `palette`. Its editor is `CALCULATED_FIELD_EDITOR` (also in `BUILT_IN_FIELD_EDITORS`), and `formulaNames(def, field)` lists the answers a formula may name.

- 5b1f464: Builder fixes for new forms and hosts with their own tabs, and settings for the new question types.

  - **Empty form:** shows a neutral "Add a question" instead of a red "1 to fix"; the empty-form finding is listed as information. Publishing is still blocked until the form asks something.
  - **New questions:** a question added from the Add menu opens untitled, with its title field focused and the placeholder "Your question". Its "needs a title" check waits until the author leaves the field, or until the new `FormBuilderHandle.revealChecks()` (call it when someone tries to publish); the status reads "In progress" meanwhile. `createField()` keeps titling a field after its type unless you pass `label: ""`.
  - **Hosting the panels:** `tabs={false}` hides the builder's tab bar; `tab` and `onTabChange` let a host control the panel (also from its own row of tabs); `settingsExtra` renders the host's settings under the form settings. Logic and Endings are one panel, "Logic and endings" (`LogicAndEndingsPanel`); `"endings"` is still accepted as a `BuilderTab`.
  - **New types:** dropdown, number, date and consent are in the default palette, with settings: options (and switching between single choice, multiple choice and dropdown keeps them), smallest/largest/step, earliest/latest date, the consent checkbox's text. Ratings get end labels and a Numbers/Stars choice; NPS gets end labels. Logic compares numbers and dates with the right input.
  - `theme` and `submitLabel` pass through to the preview. `Finding.code` (`"no-questions"`, `"untitled-question"`) names the builder's own checks; `visibleFindings`, `ChecksContext` and `useChecks` are exported for panels hosted on their own.
  - `diffDefinitions` reports a change to end labels, the star display or the consent text as wording, not as a settings change.

  **Behaviour change:** a question with no title is now an error that blocks publishing (it was a warning), since new questions start untitled. The message is "Question N needs a title."

  Features: forms-builder

## 0.2.0

### Minor Changes

- 9453f10: **Breaking: the domain-specific templates are gone.** `TEMPLATES` used to include three templates written for one kind of business (ids `after-class`, `monthly-pulse` and `intake`). Starting points for a domain belong to the app, not to Genesis, so `TEMPLATES` now holds only a blank form:

  - New `BLANK_TEMPLATE` export. `TEMPLATES` is now `[BLANK_TEMPLATE]`, and `getTemplate` returns `undefined` for the old ids.
  - `getTemplate(id, templates?)` takes your own list to search (default `TEMPLATES`). `FormTemplate` is unchanged.

  Migration: define your own templates as `FormTemplate[]` (start with `...TEMPLATES` to keep "Blank form", and add `...STARTER_TEMPLATES` for the opt-in neutral examples), show them in your New-form picker, and pass them to `getTemplate(id, yourTemplates)`. If you used the old ones, copy their definitions from `packages/forms-builder/src/templates.ts` at the tag `@marktiderman/genesis-forms-builder@0.1.1`.

- 9453f10: **Field presets and starter templates.** Additive.

  - `FormBuilder presets={[…]}` (also on `BuilderConfig`) adds named variants of a field type to the Add menu, e.g. a `table` with fixed columns or a `list` capped at four items. A `FieldPreset` has `id`, base `type`, `label`, and optional `description` (hover hint), `icon`, `category`, `props` (laid over the type's default props) and `field` (`label`, `description`, `placeholder`, `required`). Picking one adds an ordinary field of the base type. The Type select still lists base types only, and a preset whose base type isn't registered is skipped. New exports: `FieldPreset`, `PresetEntry`, `palettePresets`, `createPresetField`.
  - `STARTER_TEMPLATES`: six opt-in, neutral example forms (Customer feedback, Event feedback, Contact request, Action plan, Video notes, Reading notes) that show which field suits which question. They are not in `TEMPLATES`; offer them with `[...TEMPLATES, ...STARTER_TEMPLATES]`.

- 9453f10: `FormBuilder` takes `readOnly` for people who may read a form but not change it. Every panel (Questions, Logic, Endings, Settings, JSON) stays visible and questions and rules still open, but their controls are disabled, add/remove/reorder/duplicate/drag are hidden, undo/redo give way to a "Read only" badge, and `onChange` is never called. A host's field-type `Panel` and `ConditionValue` receive a new optional `readOnly` prop, and `BuilderConfig` gains `readOnly` for panels rendered on their own. Additive: the builder behaves as before without the prop.
- 9453f10: A host that opts in gets the structured field types in the palette, with icons and settings panels. The default palette (`defaultPalette()`) leaves them out, so existing hosts don't change; opt in with `palette={[...defaultPalette(), ...STRUCTURED_FIELD_TYPES]}`. The types are list (fewest and most items, placeholder), table (columns with label, key and long answer, reorderable; fewest and most rows), media notes (most notes) and text highlights (passage, most highlights). A new table field starts with two neutral columns ("Column 1", "Column 2") for the author to rename. The builder's own editors are exported as `BUILT_IN_FIELD_EDITORS`; a host `fieldEditors` entry for the same type replaces one.

### Patch Changes

- 9453f10: New `@marktiderman/genesis-forms-builder/ops` subpath: the pure form edits (`updateBlock`, `removeBlock`, `setOptions`…) without `"use client"`, so server components, route handlers and scripts can import them. The main entry is unchanged and still exports them too.
- 9453f10: The `@marktiderman/genesis-forms` peer range is now `>=0.2.0 <1.0.0`, matching the README. Earlier forms versions store identifying hidden inputs on anonymous forms, which the builder's anonymous setting promises not to do.
- 9453f10: Form builder polish from hands-on testing:

  - A form with no questions now previews as "Add a question to see it here." instead of "Question 1 of 0" with an OK button, and a published form never shows "Question N of 0".
  - The question editor keeps Question, Description, Type, its settings and Required up front. Answer name (was Key), "Identifies the respondent", "Sensitive" and the note on repeating an earlier answer move into a closed "Advanced" section, in plainer words.
  - Question titles in the list no longer disappear in a narrow column: the title truncates with "…" (full text on hover), badges wrap under it, and the action buttons wrap to a second line when space runs out.

- 9453f10: Raise the `@marktiderman/genesis-forms` peer floor to `>=0.3.0`. Both packages now import exports that only exist from forms 0.3.0 (`formatTimestamp`, `parseTimestamp`, `rowsColumns`, `MAX_ROWS_COLUMNS`, the structured field types), so a host on forms 0.2.x failed at module load.

## 0.1.1

### Patch Changes

- 46d6f5e: `<FormBuilder>`: `onChange(value)` fires on every edit, undo and redo, at once (and on unmount for text still being typed); the analysis comes separately through `onAnalysis(analysis, value)`. `actions` get the current value plus a `state` with `analysing`, `getValue()`, `getAnalysis()` and `flush()`, and a `ref` exposes the same handle. New props for building variants on the builder: `palette`, `fieldEditors`, `blockKinds`, `previewRegistry` and `previewValidators`. `setIdGenerator` makes generated ids reproducible.
