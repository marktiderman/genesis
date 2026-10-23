# @marktiderman/genesis-forms-builder

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
