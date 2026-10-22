# @marktiderman/genesis-forms-builder

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
