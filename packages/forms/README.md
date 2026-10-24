# @marktiderman/genesis-forms

The Genesis Forms engine. A form is plain JSON: blocks, logic, endings and typed hidden inputs. It
can be stored, diffed, versioned, and evaluated identically in a browser, in React Native and on a
server. Zero dependencies.

**Status: 0.1, release R1.** Field types: `short-text`, `long-text`, `email`, `phone`, `rating`,
`nps`, `single-choice`, `multi-choice`, `yes-no`, `dropdown`, `number`, `date`, `consent`. Logic: show, hide, jump to a field or an ending. Layouts
(rendered by `genesis-forms-web`): focus (one question at a time) and classic. The full plan is in
[docs/FORMS.md](../../docs/FORMS.md).

```ts
import { defineForm, f, when } from "@marktiderman/genesis-forms";

export const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  hidden: { owner: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's event?", required: true }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:owner|someone}} to follow up?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
  endings: [{ id: "default", title: "Thanks!" }],
});

type Answers = typeof eventFeedback.$answers; // { overall?: number; improve?: string; … }
const json = eventFeedback.toJSON();          // the canonical definition
const version = eventFeedback.hash();         // content fingerprint for publishing
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
  server alike: only string, number and boolean primitives, a number string must be a plain decimal
  (`"12"`, `"-2.5"`; not `""`, `" 12 "` or `"0x1A"`), strings at most 1000 characters.
- **Empty answers are not stored.** `engine.answers()` and the server leave out blank text, `""` and
  empty lists; a required field with one still fails as unanswered.
- **Everything is in the event log.** `initialValues` are logged as leading `answer` events with
  `source: "prefill"`, so `replay` and the server see them.
- **Anonymous forms withhold identifying fields.** `settings.anonymous` is a per-form admin
  setting, off by default. When it is true, fields marked `identifying: true` are treated as hidden
  (off the path, not validated, cleared on submit), the server drops client-sent values for them and
  lists them in `ignored`, and events carry no `at` timestamps whatever clock is passed. Hidden
  inputs marked `identifying: true` (`f.hidden.string({ source: "server", identifying: true })`) are
  left out of the stored `hidden` and `context`; logic still reads them. Fields not marked
  `identifying` are unaffected.
- **Definitions are checked.** `defineForm` runs `parseForm` and throws with every issue;
  `validateSubmission` refuses a definition that does not parse. Ids, keys, hidden names and ending
  ids may not be `Object.prototype` names (`constructor`, `__proto__`…).
- **Unanswered recall renders its fallback** (`{{field:name|there}}`); the text is never dropped.
- **Saving answers as they go is a setting.** `settings.saveProgress` (off by default) says the
  host keeps the answers so far each time the respondent moves on, so an unfinished response
  survives. `formProgress(engine)` says how far they got: `{ step, total, fieldId }`, where
  `fieldId` is the furthest question reached (kept after Back; in classic layout, the last one
  answered). genesis-forms-web's `onProgress` calls the host with it; the server checks the
  answers so far with `validateSubmission(definition, input, { complete: false })`. After a
  reload, `createForm(definition, { initialValues: saved, resumeAt: fieldId })` picks up there.

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
| `/destinations` → `emailDestination` + `resendProvider`, `sheetsDestination`, `webhookDestination`, `responseRow` | Send a checked submission to an inbox, a Google Sheet or a signed webhook. fetch and WebCrypto only. See [Destinations](#destinations). |
| `explain(engine, blockId)` | "Why is this hidden?": the path, the jump that skipped a block, each show/hide rule with its result in plain English, and the field's validation. |
| `/testing` → `simulate`, `coverage`, `runScenario`, `recordScenario`, `compactEvents` | Walk a form by key, enumerate its paths, and run JSON scenarios. See [Testing](#testing). |

`f.phone(key, opts)` stores a string: trimmed, an optional leading `+`, digits and the separators
space, `-`, `(`, `)` and `.`, 7 to 15 digits, at most 32 characters. Operators: `eq`, `neq`,
`answered`, `empty`. Its manifest carries `autocomplete: "tel"` and `inputMode: "tel"` (email:
`"email"` for both).

### Dropdown, number, date and consent

| Type and builder | Value | Notes |
| --- | --- | --- |
| `dropdown`, `f.dropdown(key, { options })` | one option's value | Like single choice, from a compact menu. Operators: `eq`, `neq`, `in`, `answered`, `empty`. |
| `number`, `f.number(key, { min, max, step })` | `number` | All limits optional; `step` counts from `min`, else 0 (`step: 1` for whole numbers). Supports `lt`/`gt` logic. `numberLimits(field)`. |
| `date`, `f.date(key, { min, max })` | `"YYYY-MM-DD"` | A real calendar day within the optional limits. Operators: `eq`, `neq`, `answered`, `empty`. `isIsoDate`, `dateLimits(field)`. |
| `consent`, `f.consent(key, { text })` | `true` | One checkbox; unchecked is unanswered, so `required` means it must be checked. Summarized as "Agreed". |

`f.rating` also takes `lowLabel`, `highLabel` (words under the ends, such as "Poor" and "Great") and
`display: "numbers" | "stars"`; `f.nps` takes the labels too. `summarizeValue` adds an end's label:
`"5/5 (Great)"`. Helpers: `scaleLabels(field)`, `ratingDisplay(field)`.

### Structured field types

Four built-in types collect more than one value for a question. `STRUCTURED_FIELD_TYPES` lists
them (`["list", "table", "media-notes", "text-highlights"]`), for a builder palette or a check.

| Type and builder | Value | Use it for |
| --- | --- | --- |
| `list`, `f.list(key, { min, max, itemMaxLength, itemPlaceholder })` | `string[]` | Several short answers: goals, action items, three wins this week. Supports `contains`. |
| `table`, `f.table(key, { columns, minRows, maxRows })` | `Record<column, string>[]` | Rows with fixed columns (up to `MAX_TABLE_COLUMNS`, 6): an action plan (What / Who / By when), pros and cons. |
| `media-notes`, `f.mediaNotes(key, { maxNotes, textMaxLength })` | `{ at, text }[]`, `at` in seconds | Notes pinned to moments of a video or audio: lecture notes, reviewing a recorded call. |
| `text-highlights`, `f.textHighlights(key, { text, maxHighlights })` | `{ start, end, quote, note }[]` | Highlight passages of a text and note on each: annotating an article, a policy or a contract. Every highlight needs a note. |

```ts
const plan = defineForm({
  id: "action-plan",
  title: "Action plan",
  blocks: [
    f.list("goals", { label: "Your goals for this quarter", max: 3 }),
    f.table("actions", {
      label: "Actions",
      columns: [{ key: "what", label: "What", long: true }, { key: "who", label: "Who" }, { key: "when", label: "By when" }],
      maxRows: 5,
    }),
  ],
});
```

Each type validates, normalizes (trimmed, blanks dropped, notes in time order), summarizes and has
samples for `coverage()`. Helpers: `listLimits`, `tableColumns`, `tableLimits`, `formatTimestamp`
and `parseTimestamp`; types `TableColumn`, `MediaNote` and `Highlight`.

### Photo fields

A `photo` field asks for up to a few photos, such as a picture of broken equipment:
`f.photo(key, { maxFiles, maxSizeMb, formats })`. The answer holds references the host's storage
returned, never the bytes: `PhotoRef[]`, each `{ id, name, type, size }`. The renderer uploads
through the host (`onUpload` on genesis-forms-web's `Form`), so the engine and `validateSubmission`
stay storage-agnostic; the host's server should check that every reference is a file it stored
for this respondent and form before saving.

| Prop | Default | Rule |
| --- | --- | --- |
| `maxFiles` | 3 | 1 to `MAX_PHOTO_FILES` (5). |
| `maxSizeMb` | 10 | 1 to `MAX_PHOTO_SIZE_MB` (25), per photo. |
| `formats` | all four | One or more of `jpeg`, `png`, `heic` (also HEIF) and `webp` (`PHOTO_FORMATS` maps each to its MIME types). |

A photo is neither `sensitive` nor `identifying` by default; set either on the field when it is.
Validation checks each reference's shape, type and size and the count; `normalize` keeps only the
four keys; `summarizeValue` lists the file names. Like the structured types it is opt-in in a
builder palette: `UPLOAD_FIELD_TYPES` (`["photo"]`). Helpers: `photoLimits(field)` (`maxFiles`,
`maxSizeMb`, `maxBytes`, `formats`, `mimeTypes`), `photoRefs(value)`, `isPhotoRef`,
`photoFormatList`, and the messages `photoTypeMessage`, `photoSizeMessage` and `photoCountMessage`.

### Calculated fields

A `calculated` field shows a value worked out from other answers, such as a total, an average or a
band, and the respondent can't change it. Its props are `{ formula, format?, decimals? }`, with
`format` one of `"number"`, `"percent"` (`0.25` shows `25%`) or `"text"`.

```ts
const budget = defineForm({
  id: "budget",
  title: "Weekly budget",
  blocks: [
    f.shortText("hours", { label: "Hours worked" }),
    f.shortText("rate", { label: "Hourly rate" }),
    f.table("costs", { label: "Costs", columns: [{ key: "item", label: "Item" }, { key: "amount", label: "Amount" }] }),
    f.calculated("income", { label: "Income", formula: "hours * rate", decimals: 2 }),
    f.calculated("left", { label: "Left over", formula: "income - sum(costs.amount)", decimals: 2 }),
    f.calculated("status", { label: "Status", formula: "left >= 0 ? 'On budget' : 'Over budget'", format: "text" }),
  ],
});
```

The formula language is small and is parsed and evaluated by this package, never run as code:

| Part | Written as |
| --- | --- |
| Answers | Their key (`hours`); one column of a table as `key.column` (`costs.amount`) |
| Values | Numbers (`12`, `0.5`) and text in quotes (`"High"`, `'High'`) |
| Arithmetic | `+ - * /` (also `− × ÷`), unary minus, parentheses |
| Comparisons | `== != < <= > >=` (also `= ≠ ≤ ≥`), true or false |
| A choice | `test ? a : b` |
| Functions | `sum`, `avg`, `min`, `max` of numbers, lists and table columns |

An unanswered question is blank, and arithmetic with a blank is blank, so a total stays empty until
its answers are in; dividing by zero is blank too. The functions skip blanks (`sum` of nothing is
`0`). Text holding a number (`"12"`, `"1,200"`) counts as that number, and yes / no as 1 / 0.

Limits, so a large submission can't make the server slow:

- A calculated field that reads a list or table of more than `MAX_FORMULA_ITEMS` (10,000) items
  has no value: it is blank, never `0` or a partial total. The same goes for one that reads an
  answer past `MAX_SETTLE_ITEMS` (50,000) items read by all of a form's formulas together (each
  list or table counted once, however many of its columns are read, in form order; an answer over
  10,000 items counts for none).
  Nothing else reports this, so give a table a `maxRows` well under these if its total matters.
- A formula is at most `MAX_FORMULA_LENGTH` characters and 64 levels of parentheses, calls, signs
  and `? :` deep, and all of a form's formulas together at most `MAX_FORM_FORMULA_LENGTH` (20,000).
- Lists are read once per answer, so treat an engine's answers as immutable: pass `setValue` a new
  array (the engine and the built-in renderers never change one in place). `setValue` with the
  array it already holds works it out again. Each engine, and so each `validateSubmission` call,
  keeps its own lists, so the same object passed again after a change is read afresh.
- `validateSubmission` refuses a submission that would be too much work, with an error under `""`,
  and never cuts one short. It doesn't rely on the host's request size limit. Each limit is an
  option for a host that needs more:

  | Limit | Default | Option | Counts |
  | --- | --- | --- | --- |
  | `MAX_EVENTS` | 10,000 | `maxEvents` | Events, after `compactEvents`; at most `RAW_EVENTS_PER_EVENT` (10) times as many may be sent |
  | `MAX_SUBMISSION_VALUES` | 200,000 | `maxValues` | JSON values in the answers, answer events and hidden inputs: each number, text, true / false, list item, row and cell. A run of answers to one field (a table sends itself on every keystroke) counts its last only |
  | `MAX_REPLAY_WORK` | 1,000,000 | `maxReplayWork` | Replaying the events: one unit per block each time the path is walked, one per calculated field each time the answers settle, and a formula's size (its numbers, answers and operators) each time it is worked out. The submit after the replay isn't counted |

  A respondent filling in a long form with formulas uses about 400,000 units of replay work at
  most; the limit stops a log built to make every step work out every formula. After a refusal,
  sending the same body again gets the same answer, so show the `""` message rather than offer
  "Try again".

The engine works the values out from the answers on the path (an answer hidden by logic reads as
blank), again whenever an answer it reads changes, and stores them with the answers, so `engine.answers()` and a
checked submission hold them for later use. `setValue` on a calculated field does nothing, and
`validateSubmission` works the values out itself, dropping any the client sent. A calculated field
is never required. Logic may compare its value.

`parseForm` checks each formula: it must parse, every key must be a question of the form, a table
must be read by one of its columns, and a calculated field may read only calculated fields before
it, so values never go round in a circle. A problem is an issue on `blocks[i].props.formula`, such
as `The formula uses "wage", which is not the answer name of a question in this form.` or
`Expected a number, an answer or "(", but the formula ends there. (at character 9)`.

`parseFormula`, `evaluateFormula`, `formulaRefs` and `renameFormulaKey` work with formulas on their
own; `formatCalculated` shows a value as the field does. Builders offer the type only when the host
names it (`COMPUTED_FIELD_TYPES`).

### Options from the app

A single choice, multiple choice or dropdown question can take its options from the app showing
the form, such as a coach picker that always lists the current coaches:

```ts
f.dropdown("coach", { label: "Who coached you?", optionsFrom: { source: "host", key: "coaches" } });
// stored as props: { optionsFrom: { source: "host", key: "coaches" } }

const lists = { coaches: [{ value: profileId, label: "Ada Lovelace" }] }; // loaded by the app
createForm(definition, { hostOptions: lists }); // or <Form hostOptions={lists}>
validateSubmission(definition, body, { hostOptions: lists }); // loaded again on the server
```

`withHostOptions(definition, lists)` fills them in: the question's own `props.options` first (it
may have some), then the list for its key, each value once. The engine does it for
`engine.definition`, so renderers show the list and an answer must be one of these options;
`validateSubmission` does it with the server's lists, so a value the server doesn't offer now (a
coach who left, a made-up id) is refused. Without a list for the key, the question offers its own
options only. Answers store the option's value; `summarizeValue` shows its label while the list has
it. `parseForm` checks the shape of `optionsFrom`, and doesn't warn about rules comparing with
values only the app knows.

### Option details, filtered lists, search and links

An option can carry more than its value and label, from the question's own `options` or the
app's list:

```ts
{ value: "cff", label: "CrossFit Fairfield",
  description: "12 Main St",                    // a muted line under the label
  image: "https://cdn.example.com/cff.png",      // a small picture; https only
  attributes: { region: "north", coaches: ["ada", "sam"] } } // for filters and recall
```

`readOption` keeps each detail only when it is well formed and within `OPTION_LIMITS`
(description 500 characters, image URL 2048 and `https://` only (`isHttpsUrl`), at most 20
attributes, each a text or a list of up to 50 texts of 200 characters). `parseForm` reports a
definition's malformed details; an app's list is read leniently (the bad detail is dropped).

**Filtered by another answer.** `optionsFrom.filter` shows only the options whose attribute
matches an earlier question's answer, such as coaches at the chosen location:

```ts
f.dropdown("location", { label: "Where?", optionsFrom: { source: "host", key: "locations" } });
f.singleChoice("coach", {
  label: "Who coached you?",
  optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
});
// a coach: { value: "ada", label: "Ada", attributes: { location: ["cff", "cornerstone"] } }
```

`field` is the earlier question's key (`parseForm` checks it exists and comes first). An option
matches when its attribute (a text or a list) shares a value with the answer (a text, or a
multiple choice's list); one without the attribute never matches. Until that question is answered
(or while it is off the path) every option shows. `visibleOptions(definition, field, values)`
says what shows, `answersOnPath(state)` gives it the answers it should read, and React renderers
use `useChoiceOptions` (genesis-forms-react). When the answer changes, the engine clears picks the
filter no longer shows (`clearFilteredAnswers`, following on through filters of filters); a pick
outside the filtered list is refused by the engine and by `validateSubmission`
(`filteredChoiceError`).

**Search.** `isSearchable(field, count)` says whether a renderer puts a search box over the
options: `props.searchable` when it is true or false, else more than `SEARCHABLE_OPTION_COUNT`
(10) options. `searchOptions(options, query)` is the match every renderer uses: every word of the
query in the label, value or description, ignoring case and accents.

**Preselect from a link.** `props.prefill: { param }` on a choice question takes a link's query
parameter, such as `?location=cornerstone`:

```ts
f.dropdown("location", { label: "Where?", optionsFrom: { source: "host", key: "locations" },
  prefill: { param: "location", hideWhenPrefilled: true } });

createForm(definition, { hostOptions: lists, linkParams: new URLSearchParams(location.search) });
// or <Form hostOptions={lists} linkParams={new URLSearchParams(location.search)}>
```

`prefillFromLink(definition, params, values)` resolves it: the value is taken only when it is one
of the options the question shows (a filtered list too), anything else is ignored; a multiple
choice takes repeated parameters or one comma-separated value. The picks become `initialValues`
(logged as `source: "prefill"` answers; the host's own `initialValues` win), so the server checks
them like any answer. With `hideWhenPrefilled` the question is skipped while it holds the link's
answer: `hiddenByPrefill(definition, state)` lists such questions, the engine's Next and Back step
over them, and `respondentPath(definition, state)` is the path a renderer shows and counts. The
answer is stored as usual. A parameter name is letters, digits, `_`, `-` and `.`, at most 64
characters (`isPrefillParam`).

**Snapshots of what was picked.** Store the option's label with its value, so reports group by the
id and history keeps the name it had then:

```ts
import { answerSnapshots, answersFromSnapshots, withHostOptions } from "@marktiderman/genesis-forms/server";

const shown = withHostOptions(definition, lists);
const snapshots = answerSnapshots(shown, result.submission.answers);
// { location: { value: "cff", label: "CrossFit Fairfield" }, helpers: [{ value: "ada", label: "Ada" }] }

// An edit link: find each pick again in today's lists.
const { answers, missing } = answersFromSnapshots(withHostOptions(definition, listsNow), stored);
createForm(definition, { hostOptions: listsNow, initialValues: answers });
```

`answerSnapshots` covers questions with `optionsFrom`; a typed "Other" answer is marked `other`.
`answersFromSnapshots` keeps a value still offered, else takes an option with the same label
(ignoring case and accents), keeps a typed "Other" answer when the question still allows one, and
reports the rest in `missing`. Both are also exported from the main entry.

### An "Other" answer

```ts
f.multiChoice("areas", { label: "Which area?", options: [...], other: true });
f.singleChoice("where", { label: "Where?", options: [...], other: { label: "Somewhere else" } });
// stored as props: { other: true } or { other: { label: "Somewhere else" } }
```

A single choice, multiple choice or dropdown question with `props.other` offers one more option,
"Other" (or its `label`), with a text box. What the respondent types is the answer: the value of a
single choice or dropdown, one more item on a multiple choice. `validateSubmission` accepts at most
one such value per question, not blank and at most `OTHER_MAX_LENGTH` (200) characters, and only on
a question with `other`. `otherOption(field)` reads the setting; `isOtherValue(field, value)` tells a
typed answer from an option.

### Props for the host

Props a field type doesn't use are kept and ignored: the engine, `parseForm` and
`validateSubmission` treat them as data for the app. A host can mark where an answer goes after a
submit, for example `props: { record_column: "nickname" }`, and read it from the definition when it
stores the response. The builder offers such props as `outputs` (see its README).

## On the server

```ts
import { validateSubmission } from "@marktiderman/genesis-forms/server";

const result = validateSubmission(publishedDefinition, await request.json(), {
  context: { owner: ownerForNow() }, // server inputs, resolved here
});
if (!result.ok) return Response.json({ errors: result.errors }, { status: 422 });
await store(result.submission); // answers, hidden, context, ending
```

Errors are keyed by field id. The `""` key is for the whole submission: `"Malformed submission."`
(a body of the wrong shape), a definition that fails `parseForm`, or a submission past one of the
limits above (`maxEvents`, `maxValues`, `maxReplayWork`). Events of an unknown type are dropped, so a newer
client's log still replays. With `settings.clearHiddenValues: false`, a hidden field's value is kept
only if its format is valid.

### Edit links

A respondent can change a sent response through a signed link, `?edit=<id>.<nonce>.<expires>.<sig>`:
an HMAC-SHA256 (Web Crypto) under a server secret of at least 32 bytes, working for 30 days. The app
keeps a nonce per response and changes it after each edit, so only the newest link works; it checks
the nonce itself. Without a usable secret there are no edit links: signing returns null and nothing
verifies.

```ts
import {
  createEditSecretReader,
  editLinkUrl,
  verifyEditToken,
  withEditLinkHeaders,
} from "@marktiderman/genesis-forms/server";

const editSecret = createEditSecretReader({ variable: "FORM_EDIT_SECRET" }); // warns once when missing
const editUrl = await editLinkUrl(`/f/${slug}`, { id: response.id, nonce: response.editNonce }, editSecret(env));
const claims = await verifyEditToken(url.searchParams.get("edit"), editSecret(env)); // then compare claims.nonce
// The link is a credential: no Referer, no caching, on the page it opens.
return withEditLinkHeaders(request, response, { isFormPage: (u) => u.pathname.startsWith("/f/") });
```

`signEditToken`, `withEditToken`, `isEditLinkRequest`, `isUsableEditSecret`, `EDIT_LINK_TTL_SECONDS`,
`MIN_EDIT_SECRET_BYTES` and `EDIT_LINK_PARAM` are the parts. `carryAnswers` (main entry) moves a
stored response's answers onto a newer version of the form by field key, for the edit page's prefill.

### Rate limits

The submit endpoint's limit, without the counter: `clientIp(headers, trusted?)` reads the first
trusted proxy header (`DEFAULT_TRUSTED_IP_HEADERS`: `x-vercel-forwarded-for`, `x-forwarded-for`,
`x-real-ip`; trust only headers your proxy overwrites), `addressPrefix` keeps an IPv4 address whole
and an IPv6 one by its /64, and `rateLimitKey({ kind, scope, ip, secret })` is
`<kind>:<scope>:<hex HMAC-SHA256 of the prefix>`, so the address is never stored. The app's
`RateLimitStore.hit(key, limit, windowSeconds)` counts (shared by every instance); `allow` fails
open, and logs, when it answers null or throws. `RATE_LIMIT_DEFAULTS` holds 60 submits, 900 saves as
they go and 120 photo uploads per 10 minutes.

```ts
const key = await rateLimitKey({ kind: "submit", scope: practiceId, ip: clientIp(request.headers), secret });
if (!(await allow(store, { key, ...RATE_LIMIT_DEFAULTS.submit }, { log }))) return tooMany();
```

## Destinations

`@marktiderman/genesis-forms/destinations` sends a checked submission somewhere. No dependencies:
fetch and WebCrypto only, so it runs on Node 20+, edge runtimes and Workers. Storage stays the
app's (the outbox, claims, attempts, the retry schedule); a destination delivers once and reports
what happened. It is a separate subpath, not part of `/server`, because `/server` does no IO and
this does: it is the one entry that touches the network and credentials.

```ts
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import {
  emailDestination,
  resendProvider,
  sheetsDestination,
  webhookDestination,
  type Destination,
} from "@marktiderman/genesis-forms/destinations";

const destinations: Record<string, Destination> = {
  email: emailDestination({
    provider: resendProvider({ apiKey: env.RESEND_API_KEY }),
    from: "Feedback <feedback@send.example.com>",
    replyTo: "email", // the key of an email field; only a single valid address is used
  }),
  sheet: sheetsDestination({
    account: { clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY },
  }),
  webhook: webhookDestination({ secret: (config) => secretFor(config) }),
};

const checked = validateSubmission(definition, body);
if (checked.ok) {
  const submission = { id: savedId, ...checked.submission, submittedAt: "2026-10-22", meta: { form_version: 3 } };
  const result = await destinations.sheet.deliver(submission, definition, { spreadsheetId: "1AbC…" }, {
    deliveryId,         // stable across retries: the email idempotency key and the webhook-id
    state: saved.state, // what the sheet cached last time
    redelivery: claims > 1,
  });
  if (result.ok) saveState(result.state);
  else if (result.retryable) retryLater(result.retryAfterSeconds); // else: needs a config fix
}
```

**The contract.** `deliver(submission, definition, config, options?)` resolves a `DeliveryResult`
and never throws. Failures carry `retryable` (`true` for 408, 425, 429, 5xx, timeouts and network
errors; `false` for other statuses, bad config, a secret or account resolver that throws, and a
`TypeError` from a bug), `retryAfterSeconds` when the service said when to come back
(Retry-After as delta-seconds or an IMF-fixdate, else 60 s; at least 1 s, at most a day), the
`status`, and an `error` that is safe to
store and log: never a secret, an answer, contact details or the webhook URL. Config is plain JSON
(recipients, a spreadsheet id, a URL); secrets go to the factory, never in config. Every request
has a timeout (`timeoutMs`, default 10 s) and honours `options.signal`. `deliverBatch(items,
config)` (the sheet) sends many in one request; all succeed or fail together. Write your own by
implementing `Destination` and throwing `DeliveryError` inside; `deliveryFailure(error)` turns any
error into a safe result.

**Rows.** `responseRow(submission, definition)` flattens a submission: `id`, `submitted_at`, the
app's `meta` columns, then one column per field key in form order. Numbers stay numbers, choices
show their labels, lists join with `, `, yes/no reads `Yes`/`No`. Labels fill recall from the
submission. On an anonymous form identifying fields get no column. `sensitive` fields:
`"include"`, `"mask"` (`[sensitive]`) or `"omit"`; recall never leaks a masked value into a label.

| Destination | Config | Notes |
| --- | --- | --- |
| `emailDestination({ provider, from, replyTo?, render?, sensitive? })` | `{ to: string \| string[], subject? }` | HTML and plain text from the definition (`renderEmail`), every value HTML-escaped. Subject, From, To and Reply-To are stripped of line breaks or refused, so no answer can add a header. At most 50 recipients. Sensitive fields masked by default. The idempotency key is the delivery id plus a hash of the recipients. `resendProvider({ apiKey })` is built in; any `EmailProvider` works. `render` and `emailBody(lines)` let an app write its own content and keep the escaping. |
| `sheetsDestination({ account, escapeFormulas?, sensitive? })` | `{ spreadsheetId, sheetName? }` | Service-account JWT signed with WebCrypto (RS256), token cached per process. Creates the tab, writes and freezes the header, adds a column for a new key without moving others, appends with `valueInputOption=RAW`, so Sheets stores text exactly as typed and never runs it as a formula (`@team thanks` stays `@team thanks`). No `'` is added by default, since RAW would store it literally; `escapeFormulas: true` adds one (headers included) for a sheet that is exported and opened elsewhere. `escapeFormula(cell)` is the same opt-in guard for CSV you write yourself: text starting with `=`, `@`, tab or CR, or with `+`/`-` followed by anything but number punctuation, gets a leading `'`. Keeps the tab, header and last row in `state`, so a normal delivery is one request. On `redelivery`, skips ids already in the last 500 rows. A 403/404 says to share the sheet with the service account. |
| `webhookDestination({ secret, allowInsecureUrls?, allowPrivateHosts?, sensitive? })` | `{ url }` | [Standard Webhooks](https://www.standardwebhooks.com): `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<HMAC-SHA256>`. The secret is base64 (at least 16 bytes decoded), usually `whsec_`-prefixed; as in every Standard Webhooks library the prefix is optional and the rest is always base64-decoded, so receivers verify with the same string. A secret that is not padded standard base64 (a raw passphrase, say) fails permanently rather than signing deliveries no receiver could verify. Generate one with `"whsec_" + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`. Body `{ type: "form.submitted", timestamp, data: { form, submission, row } }`. https only, no URL credentials, no localhost or private, loopback or link-local address literals, redirects not followed. A hostname that resolves to a private address is not caught: if untrusted users pick URLs, send from a network that cannot reach internal services. Receivers check with `verifyWebhook({ secret, headers, body })` (constant-time, five-minute tolerance). |

## Testing

```ts
import { coverage, recordScenario, runScenario, simulate } from "@marktiderman/genesis-forms/testing";

// Walk a form by key.
expect(simulate(eventFeedback).answer({ overall: 2 }).pathKeys()).toEqual(["overall", "improve", "contact_me"]);

// Every block reachable, every rule able to fire, every ending reached.
const report = coverage(eventFeedback);
expect(report.unreachableBlocks).toEqual([]);
expect(report.rulesNeverFired).toEqual([]);
expect(report.endings.default.reached).toBe(true); // witness: answers that reach it
```

`coverage` enumerates paths symbolically: each field gets a small domain (rating `1..max`, NPS
`0..10`, yes/no, each choice option, a sample text, "unanswered" unless required) plus the values
the logic compares it with, and a depth-first search answers fields in path order. It stops at
`maxStates` (default 5000) and then reports `truncated: true`. A completed response with no jump to
an ending reaches the default ending. A plugin type gives coverage its answers through the manifest's
`samples(field)`. A field with no valid sample answer is listed in `unsampledFields`; coverage
still steers the logic down each branch on it (unanswered, the compared values, some answer), so its
blocks and rules count, but an ending found only that way stays `reached: false` with `needsSamples`.

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
(the R1 sample forms: event-feedback and monthly-check-in). Run each file through `runScenario` to hold
another runtime, a renderer or an app's CI to the same behaviour. The fixtures are generated by
`pnpm --filter @marktiderman/genesis-forms conformance:build`; review the diff before committing.

Two engine rules the suite pins down: failed `next` and `submit` attempts are logged, so a replay
shows the same errors; and a completed response is final, so edits after submit are ignored by the
engine and by the server's replay.

## License

MIT
