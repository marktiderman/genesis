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
  "Continue from here" restarts the form at that point. The cursor resets when the log is replaced
  (a restart, a fork, a loaded link). Only the last 200 events are listed until you expand them.
- **Server check:** the event log replayed through `validateSubmission` with the server context.
  Tamper mode adds a forged server input, an unknown field and a value for a hidden field, so you can
  watch the server drop them.
- **Sensitive fields:** answers to fields marked `sensitive` (on the block or in `props`) show as
  `•••• (sensitive)` in every panel until you switch on "Reveal sensitive values". The switch is per
  inspector and starts off.
- **Share links:** `encodeShare` / `decodeShare` put a definition and events in a URL hash
  (deflate-raw + base64url). The hash never reaches a server, but it does land in browser history,
  clipboards and chats, so by default `encodeShare`:
  - blanks answers to sensitive fields;
  - strips each event's `at` timestamp (when and how fast someone answered; replay ignores it), unless
    you pass `{ includeTimestamps: true }`;
  - leaves out the server `context` and `definition.meta`, unless you pass `{ includeContext: true }`
    or `{ includeMeta: true }`;
  - compacts keystroke-level answers (consecutive answers to one field keep the last), so a long typed
    comment still fits.

  `encodeShare` throws if the payload is still larger than `MAX_SHARE_BYTES` (1 MB of JSON).
  `decodeShare` returns `null` for anything that is not a valid form (checked with `parseForm`),
  carries a malformed event, nests event values or context deeper than 32 levels, or inflates past
  `MAX_SHARE_BYTES`.
- **Error boundaries:** each tab renders inside `ErrorBoundary`, so a value that breaks a panel shows
  a message instead of unmounting your page. It is exported for wrapping your own `<Form>` too.
  `pretty()` / `JsonView` cut deep, circular or huge values with a note instead of throwing.
- **Flow map (`FlowMapPanel`):** the blocks as a graph, laid out with dagre and drawn with React Flow:
  solid edges to the next block, dashed jump edges labelled with their condition, and a node per ending.
  The respondent's path and the block on screen are highlighted live; blocks hidden by rules are dimmed,
  and blocks a jump passes over are marked skipped. `buildFlowGraph(definition, state)` is the pure
  graph behind it, and `layoutFlowGraph` its layout.
- **Logic trace (`LogicTracePanel`):** pick a block (by default the one on screen) and read `explain()`
  in plain English: why it is visible or hidden, the jump that skipped it, each show/hide rule with
  whether it holds, and its validation.
- **Coverage (`CoveragePanel`):** `coverage()` on the definition: unreachable blocks, rules that never
  fire, and each ending reached or not. "Load witness" calls `onFork` with events that replay a
  response reaching that ending (plus the hidden inputs it needs). Forms with more than `autoRunFields`
  fields (12) wait for "Run coverage"; a search that hits `maxStates` is marked truncated.
- **`extraTabs`:** add your own panels (definition editor, flow map, coverage).

```tsx
<Inspector
  engine={engine}
  onFork={restartWith}
  extraTabs={[
    { id: "flow", label: "Flow map", content: <FlowMapPanel engine={engine} /> },
    { id: "trace", label: "Logic trace", content: <LogicTracePanel engine={engine} /> },
    { id: "coverage", label: "Coverage", content: <CoveragePanel definition={engine.definition} onFork={restartWith} /> },
  ]}
/>
```

Add `@import "@marktiderman/genesis-forms-devtools/styles.css";` after the genesis-ui one. It also
imports React Flow's base styles (into the `base` layer) for the flow map.

## License

MIT
