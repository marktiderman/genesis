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

For the ready-made web UI, use [`@marktiderman/genesis-forms-web`](../forms-web/README.md).

## License

MIT
