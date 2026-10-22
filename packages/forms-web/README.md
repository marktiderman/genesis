# @marktiderman/genesis-forms-web

The web renderer for [Genesis Forms](../forms/README.md), built on Genesis UI components and tokens.

```tsx
import { Form } from "@marktiderman/genesis-forms-web";

<Form
  form={afterClass}                    // a defineForm result or a canonical definition
  layout="focus"                       // one question at a time; or "classic"
  options={{ hidden: { coach: "Sam" } }}
  onChange={(state) => saveDraft(state)}
  onSubmit={(engine) => submit(engine.getState().events)}
/>
```

```css
@import "tailwindcss";
@import "@marktiderman/genesis-ui/styles.css";
@import "@marktiderman/genesis-forms-web/styles.css";
```

- **Layouts:** `focus` moves through the respondent's path one question at a time, with Back, a
  progress bar and Enter to continue (Ctrl/Cmd+Enter in long text; Enter on a focused radio or
  checkbox too). After a single pick (rating, NPS, yes/no, one choice) it moves on by itself
  (`autoAdvance={false}` turns it off): only a click, tap or Space counts as a pick, arrow keys just
  move through the options, and it never moves on from the last question, so Submit is always a
  deliberate press. `classic` shows every visible question; a failed submit focuses an error summary
  above the fields that links to each invalid one.
- **Accessible by default:** group questions are a `fieldset` with a `legend`, and rating, NPS and
  yes/no are real radio groups (arrows select). Every control carries `aria-invalid`,
  errors are linked with `aria-describedby`, and the NPS end labels are read with 0 and 10. In
  focus layout, focus moves to each new question (the input of a text field, otherwise the visible
  question text), a failed Next is announced once through a live region, and the ending heading
  takes focus. Choice rows are full-width labels at least 44px tall; motion respects
  `prefers-reduced-motion`. Ids are unique per form, so two forms can share a page.
- **Submitting:** the ending shows once `onSubmit` resolves. If it rejects, the completed response
  stays on screen read-only (a completed response is final), Back is hidden, and "Try again"
  (`retryLabel`) resends the same answers.
- **Engines:** `<Form form={def}>` owns an engine and starts a new one when `def` changes identity,
  so keep the definition stable (module scope or `useMemo`). Pass `engine` (from `useForm`) to read
  state outside the form; `form` and `options` are then unused, and a new `engine` starts the form
  over.
- **Extension ladder:** `slots` replaces a part (`header`, `progress`, `navigation`, `ending`,
  `errorSummary`), `null` removes it, and `slotProps` feeds it (and wins over the defaults). A custom
  ending can mark an element `data-gf-focus` to receive focus; a custom error summary can mark itself
  `data-gf-error-summary` (with `tabIndex={-1}`) to be focused after a failed submit.
- **Renderers** come from a registry. `defaultRegistry` is shared by every `<Form>` without a
  `registry` prop, so prefer `extend()`, which returns a new registry and changes nothing else:
  `<Form registry={defaultRegistry.extend([{ type: "email", rank: 10, Component }])} />`.
  `defaultRegistry.register(entry)` mutates the shared registry in place, for every form in the app.

Renderers: short and long text, email, phone (`type="tel"`), rating, NPS, single choice, multiple
choice, yes/no.

## License

MIT
