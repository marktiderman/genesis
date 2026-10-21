# @marktiderman/genesis-forms-devtools

Developer tools for [Genesis Forms](../forms/README.md). Mount the inspector next to a form in a
playground, or in your app during development, to see exactly what the engine and the server see.

```tsx
import { useForm } from "@marktiderman/genesis-forms-react";
import { Form } from "@marktiderman/genesis-forms-web";
import { Inspector } from "@marktiderman/genesis-forms-devtools";

const engine = useForm(afterClass, { hidden: context });
<Form form={afterClass} engine={engine} />
<Inspector engine={engine} context={context} onFork={(events) => restartWith(events)} />
```

- **State:** the respondent's path, visible fields, values by key, errors and hidden inputs, live.
- **Timeline:** the event log with time travel. Scrubbing replays a prefix into a separate engine;
  "Continue from here" restarts the form at that point.
- **Server check:** the event log replayed through `validateSubmission` with the server context.
  Tamper mode adds a forged server input, an unknown field and a value for a hidden field, so you can
  watch the server drop them.
- **Share links:** `encodeShare` / `decodeShare` put a definition and events in a URL hash
  (deflate-raw + base64url). The hash never reaches a server, but it does land in browser history,
  clipboards and chats, so answers to fields with `props.sensitive` are blanked and the server
  `context` and `definition.meta` are left out unless you pass `{ includeContext: true }` or
  `{ includeMeta: true }`. `decodeShare` returns `null` for anything that is not a valid form
  (checked with `parseForm`), carries a malformed event, or inflates past `MAX_SHARE_BYTES` (1 MB).
- **`extraTabs`:** add your own panels (definition editor, flow map, coverage).

Add `@import "@marktiderman/genesis-forms-devtools/styles.css";` after the genesis-ui one.

## License

MIT
