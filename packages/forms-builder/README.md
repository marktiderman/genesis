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
  actions={(def, analysis) => (
    <Button disabled={!analysis.canPublish} onClick={() => confirmPublish(diffDefinitions(published, def))}>
      Publish
    </Button>
  )}
  brand={{ name: "CrossFit Fairfield" }}
/>
```

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

Every edit is a pure function in `ops` (`updateBlock`, `setOptions`, `removeBlock`…) that returns a
valid definition: removing something removes the rules that pointed at it. Use them on a server or
in scripts too. `TEMPLATES` has starting points (blank, after-class feedback, monthly pulse, new
member intake).

The package ships `"use client"` and needs Tailwind to see its classes: import `styles.css` (it
adds an `@source` for the package).
