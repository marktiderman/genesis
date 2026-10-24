# @marktiderman/genesis-forms-react

React bindings for [Genesis Forms](../forms/README.md). Headless: no markup, no styles. Works in
React DOM and React Native.

| Export | What it does |
| --- | --- |
| `useForm(form, options)` | Creates an engine, and a new one when the definition changes identity (keep it stable: module scope or `useMemo`). `options` are read when an engine is created. |
| `useField(engine, id)` | Value, error, visibility and recalled label for one field. Typing in one field re-renders that field only. |
| `useFormSelector(engine, select)` | Subscribe to any slice of the form state. |
| `useChoiceOptions(engine, id)` | The options a choice question shows now: all of them, or the ones its filter keeps given another answer (`visibleOptions` in genesis-forms). Re-renders only when that list changes. |
| `useRespondentPath(engine)` | The blocks to render and count: the path without questions a link prefilled and hides (`respondentPath` in genesis-forms). |
| `createRendererRegistry(entries)` | Field renderers by type or test, ranked: a higher `rank` overrides a built-in without forking. `extend()` returns a new registry; `register()` mutates this one in place. |
| `<FormRuntime>`, `<FieldRenderer id>` | Provide the engine, the registry and a per-form id prefix (`useId`, so two forms on a page never share ids); render one field with whatever the registry resolves. A renderer gets `inputId` and, in a one-at-a-time layout, `onAdvance`, which it should call only for a deliberate pick (click, tap, Space or Enter), never for an arrow-key change. |
| `useFormController(engine, options)` | The headless controller a renderer draws: the step on screen and the path, errors, Next and Back, sending with retry, auto-advance, saving progress, what to announce and where focus goes. `<Form>` in genesis-forms-web renders it; a native renderer renders the same one. See below. |
| `formEngineOptions(options, { hostOptions, linkParams })` | The engine options for a form that takes the host's option lists and the link's parameters beside its own. |

## `useFormController`

```tsx
const engine = useForm(form, formEngineOptions(options, { hostOptions, linkParams }));
const c = useFormController(engine, {
  layout,            // "focus" | "classic"; default: the definition's, else "classic"
  onSubmit,          // (engine) => void | Promise<void>; a rejection keeps the answers, phase "failed"
  onChange,          // (state, engine) => void, on every state change
  onProgress,        // with settings.saveProgress: (engine, formProgress) after each step
  autoAdvance,       // default true: c.onAdvance moves on after a single pick
  waitFor,           // () => message | null: hold Next and Send (an upload in flight)
  focus,             // (target) => void: move focus; the controller says when and to what
});
```

It returns:

| Field | |
| --- | --- |
| `engine`, `definition`, `layout` | What it runs. |
| `status`, `current`, `path`, `errors`, `errorList` | The state to draw: the block on screen, the blocks to render (`respondentPath`), errors by id, and the invalid answers in order (`{ id, label, message }`). |
| `step`, `total`, `isLast`, `canGoBack`, `historyLength` | Progress and the navigation's state. |
| `description`, `ending` | The introduction with recall resolved; the `Ending` reached (or the first). |
| `phase`, `busy`, `failed`, `locked`, `showEnding` | Sending: `"idle"`, `"sending"`, `"sent"` or `"failed"`; completed answers are locked; the ending shows once `onSubmit` resolved. |
| `saveProgress`, `announcement`, `direction` | Whether answers save as they go; the latest live-region message; which way the last step went. |
| `advance()`, `submit()`, `back()` | The controls. `submit` is what Enter, OK or Send does: `advance` in focus layout, send in classic. |
| `onAdvance`, `cancelAdvance()` | For a field renderer's single pick (focus layout with `autoAdvance`), and to cancel it. |
| `flushProgress()`, `announce(message)` | Send a pending save now (the page or app is going away); say something in the live region. |

`focus` gets `{ kind: "step", id }` when a new question is on screen (focus layout; never on the
first render), `{ kind: "ending" }`, `{ kind: "errorSummary" }` after a failed classic submit, and
`{ kind: "submit" }` after a failed send. Actions and options are read when they run, so passing new
functions each render is fine and an action from an old render acts on the current one. A different
engine starts the controller over.

For the ready-made web UI, use [`@marktiderman/genesis-forms-web`](../forms-web/README.md).

## License

MIT
