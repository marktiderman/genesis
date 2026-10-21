# @marktiderman/genesis-forms-react

React bindings for [Genesis Forms](../forms/README.md). Headless: no markup, no styles. Works in
React DOM and React Native.

| Export | What it does |
| --- | --- |
| `useForm(form, options)` | Creates one engine for the component's lifetime. |
| `useField(engine, id)` | Value, error, visibility and recalled label for one field. Typing in one field re-renders that field only. |
| `useFormSelector(engine, select)` | Subscribe to any slice of the form state. |
| `createRendererRegistry(entries)` | Field renderers by type or test, ranked: a higher `rank` overrides a built-in without forking. |
| `<FormRuntime>`, `<FieldRenderer id>` | Provide the engine and registry; render one field with whatever the registry resolves. |

For the ready-made web UI, use [`@marktiderman/genesis-forms-web`](../forms-web/README.md).

## License

MIT
