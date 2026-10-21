# @marktiderman/genesis-forms

The Genesis Forms engine. A form is plain JSON: blocks, logic, endings and typed hidden inputs. It
can be stored, diffed, versioned, and evaluated identically in a browser, in React Native and on a
server. Zero dependencies.

**Status: 0.1, release R1.** Field types: `short-text`, `long-text`, `email`, `rating`, `nps`,
`single-choice`, `multi-choice`, `yes-no`. Logic: show, hide, jump to a field or an ending. Layouts
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
- **The path is derived from answers alone**, so the client, the server and a replay always agree.
  A field jumped over counts as hidden: it is not validated, and its value is cleared on submit.
- **Hidden inputs are typed and sourced.** `url` and `host` inputs are untrusted; `server` inputs are
  never read from the client.
- **Unanswered recall renders its fallback** (`{{field:name|there}}`); the text is never dropped.

## Pieces

| Export | What it does |
| --- | --- |
| `defineForm`, `f`, `when` | Author a form in code, with inferred answer types. |
| `parseForm(json)` | Check a stored or built definition: structure, references, operators, recall. |
| `createForm(def)` | The engine: values, visibility, path, Next/Back with history, validation, submit, an event log. Framework-agnostic `subscribe` / `getState`. |
| `replay(def, events)` | Rebuild a response from its event log. |
| `registerFieldType` | Add a field type. Non-JSON values must provide `serialize` and `deserialize`. |
| `/server` → `validateSubmission`, `publicDefinition` | Re-check a submission against the published definition: drops unknown and logic-hidden answers, ignores client values for server inputs, checks drafts by format only. No IO. |
| `/testing` → `simulate` | Walk a form by key in tests. |

## On the server

```ts
import { validateSubmission } from "@marktiderman/genesis-forms/server";

const result = validateSubmission(publishedDefinition, await request.json(), {
  context: { coach: coachForNow() }, // server inputs, resolved here
});
if (!result.ok) return Response.json({ errors: result.errors }, { status: 422 });
await store(result.submission); // answers, hidden, context, ending
```

## License

MIT
