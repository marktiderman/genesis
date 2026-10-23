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
- `Finding.code` names the builder's own checks: `"no-questions"` and `"untitled-question"`, and
  the path checks `"unreachable-block"`, `"rule-never-fires"`, `"unreachable-ending"` and
  `"paths-not-checked"`. Questions are numbered as the outline numbers them (headings and page
  breaks are not counted).

### The panels

- **Questions** has three columns: an outline of every block (select it; drag its handle, or focus
  the handle and press Space, the arrow keys and Space again, or Alt+↑/↓, to reorder; then the
  dashed **Add question** and the endings), the selected block's editor (its type, Move, Duplicate
  and Delete, the title and description, the answer settings, **Required**, and a closed
  **Advanced**), and the live preview (phone or desktop, one by one or one page). In a container
  narrower than 66rem the preview goes under the other two, and under 48rem everything stacks:
  outline, editor, preview. The panel uses Tailwind container queries, so it fits whatever space
  the host gives it.
- **Logic and endings** lists the rules as sentences of picker pills ("If [question] [is at most]
  [2] go to [What went wrong?]"), each with its kind (Jump, Show only when, Hide when), a handle to
  reorder it and a menu to change its kind, move or delete it; then the endings as cards, each
  saying which rules use it. Beside them, the **Flow** map shows the steps in order with each
  jump's branch and the endings, sums up the path checks ("Every path ends", or how many path
  problems there are) and offers **Try a path** buttons that light up where one answer leads.

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

When your page header already shows the form's title and Undo/Redo, hide the builder's toolbar
and drive undo from the ref:

```tsx
const builder = useRef<FormBuilderHandle>(null);
const [history, setHistory] = useState({ canUndo: false, canRedo: false });
<Button disabled={!history.canUndo} onClick={() => builder.current?.undo()}>Undo</Button>
<Button disabled={!history.canRedo} onClick={() => builder.current?.redo()}>Redo</Button>
<FormBuilder
  ref={builder}
  toolbar={false} // no title input, Undo/Redo, status badge or actions row
  onHistoryChange={setHistory} // once on mount, then whenever it changes
  onAnalysis={(analysis) => setReady(analysis.canPublish)}
  tabs={false}
  tab={tab}
  defaultValue={draft}
/>
```

To lay out the Settings panel yourself, take the builder's form settings as one node; your rows
can be genesis-ui's `SettingsRow` so the builder's rows match yours:

```tsx
<FormBuilder
  settingsRow={SettingsRow} // label, one-sentence description, then the control
  settingsLayout={(form) => (
    <FormSettingsPage sections={[{ id: "form", title: "Form", content: form }, /* your own sections */]} />
  )}
/>
```

With `settingsLayout`, what it returns is the whole Settings panel: `settingsExtra` and the preview
beside the settings are not shown.

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
| `outputs` | `OutputTarget[]`: places a field's answer may also go besides the response. See [Field outputs](#field-outputs). |

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

#### Calculated fields

The `calculated` type (a value worked out from other answers, such as a total or a score) is opt-in
too: `palette={[...defaultPalette(), ...COMPUTED_FIELD_TYPES]}`. Its settings panel has the formula,
checked as it is typed with the same checks as `parseForm`, buttons for the answers it can use
(`formulaNames(def, field)`), "Show as" (number, percent or text), decimal places, and "Try it":
type sample answers to see the value. A new one starts with the formula `0`; renaming an answer
rewrites the formulas that read it. It has no Required switch, since it is never required.

#### Field outputs

`outputs` tells the builder where a field's answer may also go, such as a column of the
respondent's record or a list of tasks. Each question whose type a target accepts gets a
"Saves to" section listing the targets in plain language, grouped, with "Nowhere else" first.

```tsx
import type { OutputTarget } from "@marktiderman/genesis-forms-builder";

const outputs: OutputTarget[] = [
  { id: "nickname", label: "Nickname on their profile", group: "Profile", types: ["short-text"], prop: "record_column", value: "nickname" },
  {
    id: "follow-up",
    label: "A follow-up for each row",
    group: "Actions",
    types: ["table", "list"],
    prop: "creates_follow_up",
    value: { from: "action", due_in_days: 7 },
    multiple: true,
  },
];

<FormBuilder outputs={outputs} … />
```

| Field | Meaning |
| --- | --- |
| `id`, `label` | Unique id; the plain-language name authors see. |
| `group`, `description` | The heading it is listed under; a hint under it. |
| `types` | Field types it accepts. Default: every type. |
| `prop`, `value` | Choosing it sets `props[prop] = value` on the field. Targets with different props can be used together; one with the same prop replaces the other. |
| `multiple` | Several questions of a form may use it. Default false: choosing it on one question moves it from another, and the inspector says so. |

"Nowhere else" removes the props the field's targets set. Changing a question's type keeps the
targets the new type accepts. The preview notes each one under its question ("→ goes to …"). The
builder only writes the props; the host reads them after a submit and does the saving. The engine
and `parseForm` ignore props they don't know. The edits are in `ops` too (also `@marktiderman/genesis-forms-builder/ops`):
`outputsFor`, `chosenOutputs`, `usesOutput`, `setOutput`, `clearOutputs`, `outputUsedBy` and
`outputPropsFor`.

A target can't use a prop the field types own (`options`, `formula`, `columns`, limits and labels;
the list is `RESERVED_OUTPUT_PROPS`): such a target is not offered and `setOutput` ignores it. The
list of targets is only checked in the builder, so a host that acts on outputs after a submit must
check each field's props against its own targets on the server.

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
