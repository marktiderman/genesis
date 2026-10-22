# @marktiderman/genesis-forms-builder

A visual editor for [Genesis Forms](../forms/README.md) definitions, the Typeform / Google Forms
style: questions and choices, show/hide and jump logic, endings, hidden inputs and settings, with
live checks and a live preview. It edits a `FormDefinition` and stores nothing, so any app can host
it and decide where drafts and published versions live.

```tsx
import "@marktiderman/genesis-forms-builder/styles.css";
import { FormBuilder, diffDefinitions, getTemplate } from "@marktiderman/genesis-forms-builder";

<FormBuilder
  key={form.id}
  defaultValue={draft ?? getTemplate("after-class")!.create()}
  onChange={(def) => saveDraftDebounced(def)}
  actions={(_def, analysis, builder) => (
    <Button
      disabled={!analysis.canPublish && !builder.analysing}
      onClick={() => {
        const def = builder.flush(); // commits a key still being typed
        if (builder.getAnalysis().canPublish) confirmPublish(diffDefinitions(published, def));
      }}
    >
      Publish
    </Button>
  )}
  brand={{ name: "CrossFit Fairfield" }}
/>
```

### Reading the value

- `onChange(value)` fires on every edit, undo and redo, straight away. It also fires on unmount for
  text still being typed in a field that saves on blur. It never fires for `defaultValue`.
- `onAnalysis(analysis, value)` fires once the checks catch up with a value. They run behind fast
  typing, so a burst of edits can get one call. It also fires for the starting value.
- `actions(value, analysis, builder)` gets the current value. `analysis` can be a value behind:
  `builder.analysing` says so, and `builder.getAnalysis()` checks the current value now.
- `ref` (a `FormBuilderHandle`) has `getValue()`, `getAnalysis()` and `flush()`, which commits
  pending drafts (keys, hidden input names, numbers) and returns the value.

### Building a variant (worksheets)

| Prop | What it does |
| --- | --- |
| `palette` | The field types authors can add, in this order (the Add menu and the Type select). |
| `fieldEditors` | `FieldTypeEditor[]`: per type, `label`, `category`, `icon`, `defaultProps(def)`, a settings `Panel`, a logic `ConditionValue` editor and `starterValue(field, op)`. Each one is asked before the built-in behaviour. |
| `blockKinds` | `{ content?: boolean \| ("heading" \| "text")[]; pageBreak?: boolean }`: which layout blocks the Add menu offers. |
| `previewRegistry` | Renderers for the preview's `<Form>`, such as `defaultRegistry.extend([...])` for custom types. |
| `previewValidators` | Custom validators by field id for the preview's engine. |

The host still owns templates: pass the one it picked as `defaultValue`. `setIdGenerator(fn)`
replaces the random id generator (for example with a counter in tests); `setIdGenerator()` restores it.

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
in scripts too. `TEMPLATES` has starting points (blank, after-class feedback, monthly pulse, new
member intake).

The package ships `"use client"` and needs Tailwind to see its classes: import `styles.css` (it
adds an `@source` for the package).
