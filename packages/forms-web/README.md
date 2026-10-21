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
  progress bar, Enter to continue (Ctrl/Cmd+Enter in long text) and auto-advance after a single pick
  (`autoAdvance={false}` turns it off). `classic` shows every visible question with an error summary.
- **Accessible by default:** group questions are a `fieldset` with a `legend`; errors are linked with
  `aria-describedby`; focus moves to each new question; progress is announced; targets are at least
  44px.
- **Extension ladder:** `slots` replaces a part (`header`, `progress`, `navigation`, `ending`,
  `errorSummary`), `null` removes it, and `slotProps` feeds it (and wins over the defaults). Field
  renderers come from a registry: `defaultRegistry.extend([{ type: "email", rank: 10, Component }])`.

R1 renderers: short and long text, email, rating, NPS, single choice, multiple choice, yes/no.

## License

MIT
