# @marktiderman/genesis-forms-builder

A visual editor for [Genesis Forms](https://www.npmjs.com/package/@marktiderman/genesis-forms) definitions, the Typeform / Google Forms
style: questions and choices, show/hide and jump logic, endings, hidden inputs and settings, with
live checks and a live preview. It edits a `FormDefinition` and stores nothing, so any app can host
it and decide where drafts and published versions live.

> **Use with `@marktiderman/genesis-forms` 0.2.0 or later.** Earlier versions store identifying hidden inputs on anonymous forms, which the builder's anonymous setting promises not to.
>
> **Stability (0.x):** the supported API is `FormBuilder` (its props, `readOnly` included, and `FormBuilderHandle`), `analyze`, `diffDefinitions`, the form operations, `FormTemplate` / `BLANK_TEMPLATE` / `TEMPLATES` / `STARTER_TEMPLATES` / `getTemplate`, `FieldPreset`, and the editor types. The individual panels and other exports may change in minor releases.

```tsx
import "@marktiderman/genesis-forms-builder/styles.css";
import { FormBuilder, diffDefinitions, getTemplate } from "@marktiderman/genesis-forms-builder";
import { MY_TEMPLATES } from "./form-templates"; // see "Templates" below

<FormBuilder
  key={form.id}
  defaultValue={draft ?? getTemplate("customer-feedback", MY_TEMPLATES)!.create()}
  onChange={(def) => saveDraftDebounced(def)}
  actions={(_def, _analysis, builder) => (
    <Button
      onClick={() => {
        const def = builder.flush(); // commits a key still being typed
        if (builder.getAnalysis().canPublish) confirmPublish(diffDefinitions(published, def));
        else builder.revealChecks(); // shows every check, also a new question's missing title
      }}
    >
      Publish
    </Button>
  )}
  brand={{ name: "Acme" }}
/>
```

### Checks while writing

- An empty form shows a neutral **Add a question**, not an error. Publishing stays blocked
  (`analysis.canPublish` is false) until it asks something.
- A question added from the Add menu opens with its title field focused and empty, with the
  placeholder "Your question". A question with no title is an error (`code: "untitled-question"`), but
  the builder holds it back on a new question until the author leaves the title field, or until
  `builder.revealChecks()` (call it when someone tries to publish). Meanwhile the status reads
  **In progress**. `analysis` and `getAnalysis()` always count it. `createField()` still titles a
  field after its type unless you pass `label: ""`.
- `Finding.code` names the builder's own checks: `"no-questions"` and `"untitled-question"`.

### Hosting the panels in your own tabs

The builder's tabs are **Questions**, **Logic and endings** (one panel: `LogicAndEndingsPanel`),
**Settings** and **JSON**. To put them in your own single row of tabs, hide the builder's and pass
the tab you show:

```tsx
const [tab, setTab] = useState<"questions" | "logic" | "responses" | "settings">("questions");
// Your row: Questions · Logic and endings · Responses · Settings
<FormBuilder
  className={tab === "responses" ? "hidden" : undefined} // stays mounted: undo history and drafts survive
  tabs={false}
  tab={tab === "responses" ? "questions" : tab}
  onTabChange={(next) => setTab(next === "endings" ? "logic" : next)} // a check can ask for another panel
  settingsExtra={<YourSettings />} // under the form settings, for one Settings panel
  defaultValue={draft}
/>
```

`tab` and `onTabChange` also work with the builder's own tabs. `"endings"` is still accepted as
another name for the merged panel.

### Reading the value

- `onChange(value)` fires on every edit, undo and redo, straight away. It also fires on unmount for
  text still being typed in a field that saves on blur. It never fires for `defaultValue`.
- `onAnalysis(analysis, value)` fires once the checks catch up with a value. They run behind fast
  typing, so a burst of edits can get one call. It also fires for the starting value.
- `actions(value, analysis, builder)` gets the current value. `analysis` can be a value behind:
  `builder.analysing` says so, and `builder.getAnalysis()` checks the current value now.
- `ref` (a `FormBuilderHandle`) has `getValue()`, `getAnalysis()` and `flush()`, which commits
  pending drafts (keys, hidden input names, numbers) and returns the value.

### Read-only viewers

Pass `readOnly` for people who may read a form but not change it (for example, a team member who is not
the form's owner):

```tsx
<FormBuilder key={form.id} defaultValue={working} readOnly={!canEdit} onChange={saveDraftDebounced} />
```

Every panel stays visible, and questions and rules still open so their settings can be read. Inputs,
selects and switches are disabled (a host's own field-type `Panel` and `ConditionValue` get
`readOnly: true` and render inside a disabled `<fieldset>`); add, remove, reorder, duplicate and drag
are hidden; undo/redo are replaced by a "Read only" badge; the JSON tab is selectable but has no
Apply; and `onChange` is never called, not even for text typed before the switch. The preview,
checks, `actions` and the ref handle work as usual. Panels rendered on their own read the flag from
`BuilderConfigContext` (`{ readOnly: true }`).

### Customising the builder

| Prop | What it does |
| --- | --- |
| `palette` | The field types authors can add, in this order (the Add menu and the Type select). |
| `fieldEditors` | `FieldTypeEditor[]`: per type, `label`, `category`, `icon`, `defaultProps(def)`, a settings `Panel`, a logic `ConditionValue` editor and `starterValue(field, op)`. Each one is asked before the built-in behaviour. A type whose value is a list must define `starterValue`: without it, changing a condition's operator uses the built-in rule (a list for `in`, one value otherwise). |
| `presets` | `FieldPreset[]`: named variants of a field type in the Add menu, such as a table with fixed columns or a list capped at three items. Picking one adds an ordinary field of the base type with the preset's props and settings. |
| `blockKinds` | `{ content?: boolean \| ("heading" \| "text")[]; pageBreak?: boolean }`: which layout blocks the Add menu offers. |
| `previewRegistry` | The preview's `<Form registry>`. It replaces `defaultRegistry`, so pass `defaultRegistry.extend([...])` with your types, not a registry of your types alone. |
| `previewValidators` | Custom validators by field id for the preview's engine. |

#### Structured field types

Four built-in types collect more than one value per question. They are outside the default palette,
so existing hosts don't change; opt in with
`palette={[...defaultPalette(), ...STRUCTURED_FIELD_TYPES]}` (`STRUCTURED_FIELD_TYPES` is from
`@marktiderman/genesis-forms`).

| Type | Use it for |
| --- | --- |
| `list` | Several short answers: goals, action items, three wins this week. |
| `table` | Rows with fixed columns: an action plan (What / Who / By when), pros and cons. A new table starts with two neutral columns for the author to rename. |
| `media-notes` | Notes pinned to moments of a video or audio: lecture notes, reviewing a recorded call. |
| `text-highlights` | Highlight passages of a text and note on each: annotating an article, a policy or a contract. |

Presets turn these into ready-made questions for your domain:

```tsx
import type { FieldPreset } from "@marktiderman/genesis-forms-builder";

const presets: FieldPreset[] = [
  {
    id: "action-plan",
    type: "table",
    label: "Action plan",
    props: { columns: [{ key: "what", label: "What" }, { key: "who", label: "Who" }, { key: "when", label: "By when" }] },
  },
  { id: "top-three", type: "list", label: "Top three", props: { max: 3 }, field: { label: "Your top three" } },
];

<FormBuilder presets={presets} palette={[...defaultPalette(), ...STRUCTURED_FIELD_TYPES]} … />
```

The host still owns templates: pass the one it picked as `defaultValue`. `setIdGenerator(fn)`
replaces the random id generator (for example with a counter in tests); `setIdGenerator()` restores it.
New ids go through `freshId(prefix, def)`, which asks again while the id is already in the form, so
a counter that restarts is fine. A generator that always returns the same id falls back to random ids.
A field-type `Panel` gets `set(patch | (latest) => patch)` and `setProps(partial)`. Both read the field as
it is when the edit runs, so several calls in one handler all apply.

- **Questions:** add any registered field type, headings, text and page breaks; reorder by drag or
  arrows; duplicate; edit label, description, key, placeholder, options, required, identifying and
  sensitive. Keys are slugged and kept unique; option values are kept when labels change, and a new
  option gets a random value so it never takes over a removed option's earlier answers.
- **Logic:** show, hide and jump rules with all/any conditions on earlier answers and hidden inputs.
  Operators come from each field type's manifest. Anything more nested is edited as JSON.
- **Endings, settings, hidden inputs and JSON**, all undoable (Ctrl/Cmd+Z inside the builder;
  typing coalesces).
- **Preview:** the real `<Form>`. A wording edit keeps the answers given so far; a structural one
  starts a new response.
- **Checks (`analyze`):** `parseForm` errors and warnings, plus path coverage: questions no one can
  reach, rules that never fire, endings no one gets to (left out, with a note, when the form has too
  many paths to explore). Errors set `canPublish: false`.
- **Publishing (`diffDefinitions`):** a plain-English list of what changed since the last published
  version, with breaking changes flagged (removed or retyped fields, renamed keys, removed options,
  smaller scales, removed hidden inputs or ones no longer set by the server, a new form id).

Every edit is a function in `ops` (`updateBlock`, `setOptions`, `removeBlock`…) that returns a
valid definition: removing something removes the rules that pointed at it. Edits that need a new
id or option value take it as an argument (`duplicateBlock(def, id, copyId)`, `withOptionValues`,
`defaultProps`), so make it outside a reducer and the edit stays pure. Use them on a server or
in scripts too: `@marktiderman/genesis-forms-builder/ops` has the same functions without
`"use client"`, so a server component or route handler can import them.

### Templates

A `FormTemplate` is a starting point for a new form: `{ id, name, description, create }`, where
`create()` returns a fresh definition with a new form id. `TEMPLATES` is `[BLANK_TEMPLATE]`, the
only built-in one. `STARTER_TEMPLATES` are opt-in examples, each showing which field suits which
question: Customer feedback, Event feedback, Contact request, Action plan, Video notes and Reading
notes. Starting points for your own domain belong in your app: define them, offer them in your own
New-form picker, and look one up with `getTemplate(id, templates)`.

```ts
import { STARTER_TEMPLATES, TEMPLATES, getTemplate, newId, type FormTemplate } from "@marktiderman/genesis-forms-builder";

export const MY_TEMPLATES: readonly FormTemplate[] = [
  ...TEMPLATES, // keeps "Blank form"
  ...STARTER_TEMPLATES, // optional examples
  {
    id: "workshop-feedback",
    name: "Workshop feedback",
    description: "A 1–5 rating and what could be better.",
    create: () => ({
      schemaVersion: 1,
      id: newId("form"),
      title: "How was the workshop?",
      blocks: [
        { kind: "field", id: "q_rating", key: "rating", type: "rating", label: "How was today's workshop?", required: true, props: { max: 5 } },
        { kind: "field", id: "q_better", key: "better", type: "long-text", label: "What could we do better?" },
      ],
      endings: [{ id: "default", title: "Thanks for your feedback!" }],
    }),
  },
];

const start = getTemplate("workshop-feedback", MY_TEMPLATES)!.create(); // getTemplate(id) alone searches TEMPLATES
```

The starter templates that use structured types (Action plan, Video notes, Reading notes) need
those types in `palette` for authors to edit them freely.

Up to 0.1.x `TEMPLATES` also held three domain-specific templates. To keep using them, copy them
from `packages/forms-builder/src/templates.ts` at the tag `@marktiderman/genesis-forms-builder@0.1.1`.

The main entry ships `"use client"` and needs Tailwind to see its classes: import `styles.css` (it
adds an `@source` for the package).
