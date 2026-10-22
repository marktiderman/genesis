# @marktiderman/genesis-forms

The Genesis Forms engine. A form is plain JSON: blocks, logic, endings and typed hidden inputs. It
can be stored, diffed, versioned, and evaluated identically in a browser, in React Native and on a
server. Zero dependencies.

**Status: 0.1, release R1.** Field types: `short-text`, `long-text`, `email`, `phone`, `rating`,
`nps`, `single-choice`, `multi-choice`, `yes-no`. Logic: show, hide, jump to a field or an ending. Layouts
(rendered by `genesis-forms-web`): focus (one question at a time) and classic. The full plan is in
[docs/FORMS.md](../../docs/FORMS.md).

```ts
import { defineForm, f, when } from "@marktiderman/genesis-forms";

export const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },
  hidden: { coach: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's class?", required: true }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:coach|a coach}} to follow up?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
  endings: [{ id: "default", title: "Thanks!" }],
});

type Answers = typeof afterClass.$answers; // { overall?: number; improve?: string; … }
const json = afterClass.toJSON();          // the canonical definition
const version = afterClass.hash();         // content fingerprint for publishing
```

## The rules it keeps

- **Answers are keyed by field id**, never by label or position. `id` defaults to the key; set it
  explicitly before renaming a key on a live form.
- **The path is derived from the answers on the path**, so the client, the server and a replay
  always agree. It is built in one forward pass: a block's rules, and the jumps from it, see only the
  fields already on the path before it. A field that is hidden, jumped over or later in the form
  reads as unanswered, whatever value it still holds. A field jumped over counts as hidden: it is
  not validated, and its value is cleared on submit.
- **Empty is unanswered.** An empty value (unanswered, `null`, blank text, an empty list) fails
  `eq`, `in` and `contains` and passes `neq`: `eq null` is never true for a cleared field.
- **Hidden inputs are typed and sourced.** `url` and `host` inputs are untrusted; `server` inputs are
  never read from the client. `coerceHidden(definition, raw)` types them, in `createForm` and on the
  server alike: only string, number and boolean primitives, `""` is not a number, strings at most
  1000 characters.
- **Everything is in the event log.** `initialValues` are logged as leading `answer` events with
  `source: "prefill"`, so `replay` and the server see them.
- **Anonymous forms withhold identifying fields.** `settings.anonymous` is a per-form admin
  setting, off by default. When it is true, fields marked `identifying: true` are treated as hidden
  (off the path, not validated, cleared on submit), the server drops client-sent values for them and
  lists them in `ignored`, and events carry no `at` timestamps whatever clock is passed. Fields not
  marked `identifying` are unaffected.
- **Definitions are checked.** `defineForm` runs `parseForm` and throws with every issue;
  `validateSubmission` refuses a definition that does not parse. Ids, keys, hidden names and ending
  ids may not be `Object.prototype` names (`constructor`, `__proto__`…).
- **Unanswered recall renders its fallback** (`{{field:name|there}}`); the text is never dropped.

## Pieces

| Export | What it does |
| --- | --- |
| `defineForm`, `f`, `when` | Author a form in code, with inferred answer types. |
| `parseForm(json)` | Check a stored or built definition: structure, text fields, references, operators, recall. Never throws. |
| `createForm(def)` | The engine: values, visibility, path, Next/Back with history, validation, submit, an event log. Framework-agnostic `subscribe` / `getState`. |
| `replay(def, events)` | Rebuild a response from its event log. |
| `registerFieldType` | Add a field type. Non-JSON values must provide `serialize` and `deserialize`; `normalize` sets the stored form (email trims). A field whose type is not registered accepts no answer. |
| `coerceHidden(def, raw, { sources })` | Type hidden inputs by their declarations; reports dropped names in `ignored`. |
| `isFormEvent(value)` | Guard for one well-formed event-log entry. |
| `isSensitive(block)` | `sensitive: true` on a field, or the `props.sensitive` alias. Hidden inputs take `sensitive: true` too (`f.hidden.string({ source: "server", sensitive: true })`); devtools masks both. |
| `/server` → `validateSubmission`, `publicDefinition` | Re-check a submission against the published definition: drops unknown and logic-hidden answers, ignores client values for server inputs, checks drafts by format only. Never throws on a malformed body. No IO. |
| `explain(engine, blockId)` | "Why is this hidden?": the path, the jump that skipped a block, each show/hide rule with its result in plain English, and the field's validation. |
| `/testing` → `simulate`, `coverage`, `runScenario`, `recordScenario`, `compactEvents` | Walk a form by key, enumerate its paths, and run JSON scenarios. See [Testing](#testing). |

`f.phone(key, opts)` stores a string: trimmed, an optional leading `+`, digits and the separators
space, `-`, `(`, `)` and `.`, 7 to 15 digits, at most 32 characters. Operators: `eq`, `neq`,
`answered`, `empty`. Its manifest carries `autocomplete: "tel"` and `inputMode: "tel"` (email:
`"email"` for both).

## On the server

```ts
import { validateSubmission } from "@marktiderman/genesis-forms/server";

const result = validateSubmission(publishedDefinition, await request.json(), {
  context: { coach: coachForNow() }, // server inputs, resolved here
});
if (!result.ok) return Response.json({ errors: result.errors }, { status: 422 });
await store(result.submission); // answers, hidden, context, ending
```

Errors are keyed by field id. The `""` key is for the whole submission: `"Malformed submission."`
(a body of the wrong shape), a definition that fails `parseForm`, or more than `maxEvents` events
(default 10 000, counted after `compactEvents`). Events of an unknown type are dropped, so a newer
client's log still replays. With `settings.clearHiddenValues: false`, a hidden field's value is kept
only if its format is valid.

## Testing

```ts
import { coverage, recordScenario, runScenario, simulate } from "@marktiderman/genesis-forms/testing";

// Walk a form by key.
expect(simulate(afterClass).answer({ overall: 2 }).pathKeys()).toEqual(["overall", "improve", "contact_me"]);

// Every block reachable, every rule able to fire, every ending reached.
const report = coverage(afterClass);
expect(report.unreachableBlocks).toEqual([]);
expect(report.rulesNeverFired).toEqual([]);
expect(report.endings.default.reached).toBe(true); // witness: answers that reach it
```

`coverage` enumerates paths symbolically: each field gets a small domain (rating `1..max`, NPS
`0..10`, yes/no, each choice option, a sample text, "unanswered" unless required) plus the values
the logic compares it with, and a depth-first search answers fields in path order. It stops at
`maxStates` (default 5000) and then reports `truncated: true`. A completed response with no jump to
an ending reaches the default ending.

**Scenarios** are versioned JSON (`scenarioVersion: 1`): a definition, hidden inputs, server
`context`, an event log and the expected `path`, `visible`, `current`, `status`, `ending`,
`answers`, client `errors` and server verdict (all by key). `runScenario(s)` replays the events
with the clock off, compares, and runs `validateSubmission` (as completed when the replay
completed, or as `expect.server.complete` says). `recordScenario(engine, name)` freezes a live
engine as a scenario with its expectations filled in.

Text inputs log one answer event per keystroke. `compactEvents(events)` merges consecutive answers
to the same field, keeping the last value; the result replays to the same state because the path
depends on values alone, not on how they were typed. `recordScenario` compacts by default (`compact: false` keeps every event).

The **conformance suite** ships in the package: `@marktiderman/genesis-forms/conformance/*.scenario.json`
(the R1 sample forms: after-class and monthly-pulse). Run each file through `runScenario` to hold
another runtime, a renderer or an app's CI to the same behaviour. The fixtures are generated by
`pnpm --filter @marktiderman/genesis-forms conformance:build`; review the diff before committing.

Two engine rules the suite pins down: failed `next` and `submit` attempts are logged, so a replay
shows the same errors; and a completed response is final, so edits after submit are ignored by the
engine and by the server's replay.

## License

MIT
