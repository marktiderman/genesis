# Genesis Forms

Plan v0.3, 2026-10-21. Status: **proposal, for the maintainer's decision**. Nothing described here
is built yet.

> **Revised 2026-10-21, at the maintainer's direction.**
>
> - **Greenfield.** v0.1 designed forms around what Genesis already had. This version designs the
>   best form system we can build today. The engine owes nothing to existing Genesis code or
>   doctrine; Genesis's design system comes in only at the renderer layer.
> - **Home and consumers.** The mechanics live in the Genesis monorepo as open-source packages that
>   every client and internal project (Breakthrough, Conversation Cards, Gamify, …) can install
>   today. A dedicated client project, the forms product with hosted builder, workspaces and
>   results, is built on top of the same packages. See
>   [Packages vs the product](#packages-vs-the-product).
> - **Use cases.** Worksheets, feedback forms, onboarding, intake and marketing qualification. See
>   [Use cases](#use-cases).
> - **First consumer: CrossFit Fairfield.** A member feedback system for the gym, live as soon as
>   possible and improved from there. It is milestone M1, a thin slice through the whole design.
>   See [M1: CrossFit Fairfield feedback](#m1-crossfit-fairfield-feedback).

A reusable, extensible form system for React and React Native apps, released as open source. A form
is defined once, as data or as typed code. It renders as a classic form, a paged wizard, or one
question at a time. It branches, scores, grades and calculates. It saves partial responses and
resumes them on any device. It re-validates on the server, and it ships an optional visual builder.
Everything is MIT, including the builder.

This plan comes from two sources:

- current documentation for Typeform, Tally, Fillout, Google Forms, Microsoft Forms, Jotform,
  Cognito Forms, Paperform, Youform, SurveyJS, Formbricks, Form.io, JSON Forms,
  react-jsonschema-form (RJSF), uniforms, TanStack Form, react-hook-form, Conform, shadcn `Field`,
  and Puck, read 2026-10-21. Per-product notes and sources are in
  [Appendix A](#appendix-a-what-we-learn-from-each-alternative);
- file-level reading of Genesis at `9ae9388`, used only for
  [Fitting into Genesis](#fitting-into-genesis).

## Principles

1. **A form is data.** Anything a form can do (show a field, skip a page, compute a score) is
   expressible as JSON that can be stored, diffed, versioned, and evaluated identically in a browser,
   in React Native, and on a server. No closures and no `eval` in the stored format.
2. **Code-first is just as first-class.** Developers author forms in TypeScript with full inference
   of the answer types. The TypeScript produces the same JSON. Builder users and developers edit the
   same artifact.
3. **Headless core, swappable skins.** All behaviour lives in a framework-agnostic engine. Renderers
   (shadcn for web, NativeWind for native, unstyled) only draw. No renderer is privileged.
4. **Every built-in is replaceable.** Field types, layouts, the logic function library, storage,
   uploads and analytics are all registries or adapters. The built-ins use the same public API as
   plugins.
5. **The premium features are free.** Partial submissions, resume, drop-off analytics, logic,
   calculations, the builder: the things hosted tools charge for are core features here.
6. **Accessible by construction.** WCAG 2.2 AA is part of the field-type contract, tested in CI,
   including in one-question-at-a-time mode.
7. **The server is the authority.** Client validation is user experience. The same engine runs on
   the server and decides what is accepted.

## Use cases

The five forms this has to be excellent at, and what each one demands. Every capability below is in
the packages, not in one app, so every project gets all of them.

| Use case | Typical shape | What it needs beyond a basic form |
| --- | --- | --- |
| **Worksheets** (learning, coaching, reflection) | Rich content interleaved with questions; done by a signed-in user, often over several sessions; reviewed by a teacher or coach | Content blocks (rich text, image, video) between questions; inline fill-in-the-blank, matching, ordering; **answer keys that never reach the browser**; auto-grading plus manual grading with feedback per question; attempts; assignment to a user; save and resume across devices; print/PDF. See [Scoring, grading and worksheets](#scoring-grading-and-worksheets). |
| **Feedback forms** (NPS, CSAT, post-session, product) | Short, often one at a time, often embedded or sent by link; high volume | `nps`, `rating`, `scale`; focus layout; hidden context (session id, user id, product area) passed by URL or host app; follow-up questions branching on the score; drop-off analytics; anonymous or identified. |
| **Onboarding forms** | Multi-step, inside an app, signed-in user | Prefill from the user's existing record; answers written back into app records (profile, preferences) via the store adapter; paged layout with progress; save and resume; branching by role or plan; native renderer for mobile onboarding. |
| **Intake forms** (clients, patients, applicants) | Long, sectioned, sensitive | `repeat` groups (dependants, previous employers); file uploads and signature; `sensitive` fields with encryption at rest and no analytics; conditional sections; review page before submit; server-side validation; retention settings; routing to a person or queue by answer (webhooks). |
| **Marketing qualification** (lead capture, demo requests) | Embedded on marketing sites; one at a time; short | Hidden UTM and referrer inputs; **lead scoring** with variables; branching to different endings (book a call for high scores, resources for low); a scheduling plugin on the ending; CRM webhooks; embeds (inline, popup, slider); partials, so an abandoned lead is still a lead; per-question drop-off. |

Capabilities shared by all five, and therefore non-negotiable in the core: branching, variables,
recall, typed hidden inputs, partials and resume, server validation, analytics events, theming, and
embeds or in-app rendering.

## What best-in-class means

Where the market leaders stop, and where this design aims:

| Capability | Typeform | Tally | Fillout | Google Forms | SurveyJS | **Forms** |
| --- | --- | --- | --- | --- | --- | --- |
| One-at-a-time mode | ✓ best | partial | ✓ | — | — | ✓, with real screen-reader support |
| Document-style editor (`/` to insert) | — | ✓ best | — | — | — | ✓ |
| Branch from any field type, AND/OR | ✓ | ✓ | ✓ | choice only | ✓ | ✓, plus static analysis |
| Variables and calculations | ✓ (score, price) | ✓ | ✓ | — | ✓ | ✓, typed, with dependency graph |
| Recall in choice labels and endings | — | partial | ✓ | — | ✓ | ✓ |
| Typed hidden fields | strings only | — | ✓ | — | ✓ | ✓ |
| Repeating groups, aggregates | — | — | partial | — | ✓ | ✓ |
| Partial responses | paid | paid | paid tiers | — | DIY | **free** |
| Resume on another device | — | — | login only | — | DIY | ✓ link, token or user |
| Drop-off analytics | paid | paid | ✓ | — | paid | **free**, event stream |
| Server-side re-validation of logic | n/a (hosted) | n/a | n/a | n/a | DIY | ✓, same engine |
| Typed code-first authoring | — | — | — | — | — | ✓ |
| Self-host / own your data | — | — | — | — | ✓ | ✓, any backend |
| React Native | — | — | — | — | community | ✓ |
| Visual builder licence | hosted | hosted | hosted | hosted | commercial | **MIT** |
| Branch-coverage test harness | — | — | — | — | — | ✓ |

## Lessons from the market

| # | Lesson | Learned from | Design response |
| --- | --- | --- | --- |
| 1 | The form *is* a flat list of blocks: questions, text, media and page breaks in one document. | Tally, Paperform, Typeform `fields[]` | `blocks[]`, grouped into pages by `page-break` blocks. |
| 2 | Logic is three things: **visibility**, **navigation** and **computation**. | Typeform, Formbricks, Fillout | One condition AST with three effect kinds. |
| 3 | Conditions are typed per field type (`contains` for text, `lower_than` for numbers, `answered` for files). | Typeform Create API | Each field type declares its operators. |
| 4 | Branching only on choice fields (Google), only forward (Microsoft), or from a multi-select to one target is the most common complaint. | Google, Microsoft Forms | Any field, any operator, nesting, forward or back, fallback target. |
| 5 | Hidden fields as strings can't drive numeric logic. | Typeform community | Hidden inputs and variables are typed. |
| 6 | Recall of an unanswered field silently drops the question; recall isn't allowed in choices. | Typeform | Recall everywhere text appears, with an explicit fallback. |
| 7 | Partials and drop-off analytics are what everyone charges for. | Tally, Youform, Typeform | Free and in the core. |
| 8 | Same-device-only resume; widgets that silently opt out of save-and-resume. | Fillout, Jotform | Resume by token, link or user; every field type must serialize. |
| 9 | One-at-a-time mode fails screen-reader users when focus isn't managed. | Typeform a11y reports | Focus, `aria-live` and group semantics are in the field contract. |
| 10 | Ranked **testers** let a third party override a built-in renderer without forking. | JSON Forms, RJSF | Renderer registry with ranks. |
| 11 | Keep data schema and UI apart, but don't author in JSON Schema: `if/then/else` is a poor UI-logic language. | JSON Forms, RJSF | Own definition format; *export* JSON Schema. |
| 12 | Arbitrary JS in conditions is a security hole and doesn't run everywhere. | Form.io `customConditional` | Data-only AST; custom functions are registered, named and pure. |
| 13 | Repeating sections with aggregates separate forms from data apps. | Cognito Forms | `repeat` groups, path-based values, `sum`/`count`. |
| 14 | Monetized builders split the free renderer from a paid creator. | SurveyJS | The builder is MIT. |
| 15 | The builder canvas must render the real renderer, driven by per-type metadata. | Puck, SurveyJS Creator | Each field type ships a `propsSchema` that drives the builder. |
| 16 | The respondent URL is an integration surface. | Google `entry.N=`, Fillout, Tally | Declared, typed URL inputs; undeclared params are ignored. |
| 17 | Code-first libraries win developers with types; schema-first ones win builders with data. Nobody does both. | TanStack Form vs SurveyJS | Typed DSL that compiles to the JSON definition. |

Licensing: Formbricks, OpnForm and HeyForm are AGPL, and the SurveyJS Creator is commercial. We
depend on and copy from none of them. JSON Forms, RJSF, TanStack Form, Puck and shadcn are MIT or
Apache-2.0.

## Architecture

```
  ┌──────────────── @marktiderman/genesis-forms ── zero dependencies, no React ─────────────────┐
  │ definition + its schema · typed DSL · migrations · expression/logic engine · navigation      │
  │ reactive store (signals) · validation (Standard Schema) · recall · scoring · i18n           │
  │ /server  validate + submit handler, webhook signing      /testing  path simulation, coverage │
  └───────────────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                  ┌────────────────▼─────────────────┐
                  │ genesis-forms-react              │  hooks, field registry,
                  │ (headless, no styling)           │  <FormRuntime>
                  └──┬──────────────┬─────────────┬──┘
                     │              │             │
       ┌─────────────▼───┐ ┌────────▼────────┐ ┌──▼──────────────────┐ ┌──────────────────────────┐
       │ genesis-forms-  │ │ genesis-forms-  │ │ genesis-forms-      │ │ genesis-forms-supabase   │
       │ web             │ │ native          │ │ builder             │ │ store, SQL + RLS, edge   │
       │ on genesis-ui + │ │ on genesis-ui-  │ │ (MIT)               │ │ submit handler, storage  │
       │ design-system   │ │ native          │ │                     │ │                          │
       └─────────────────┘ └─────────────────┘ └─────────────────────┘ └──────────────────────────┘
                                         later: genesis-forms-embed · -devtools · -mcp · field plugins
```

**The greenfield line.** `genesis-forms` and `genesis-forms-react` depend on nothing else in Genesis,
so the engine is designed on its own merits and stays usable anywhere. The renderer kits are where
Genesis comes in: they are built from Genesis's primitives and tokens, which is what "extends the
Genesis design system" means in practice. Where a kit needs a primitive Genesis lacks (rating, date
range, signature pad, sortable list), the primitive is added to `genesis-ui` / `genesis-ui-native`,
so every Genesis app gets it, not just forms.

| Package | Contents | Notes |
| --- | --- | --- |
| `@marktiderman/genesis-forms` | Definition types and their schema, `defineForm` DSL, migrations, expression evaluator, logic graph, navigation, reactive store, validation, recall, scoring, i18n, `toJsonSchema`. Subpaths: `/server` (`validateSubmission`, `createSubmitHandler` as web-standard `Request → Response`, webhook signing), `/testing` (simulation, branch coverage), `/stores/memory`, `/stores/local`, `/stores/rest`. | No dependencies. Runs in browsers, React Native, Node, Deno, Workers. Budget: ≤ 15 kB gzipped for the root entry. |
| `@marktiderman/genesis-forms-react` | `useForm`, `useField`, `useNavigation`, `useResponse`; field and layout registries; `<FormRuntime>` (headless) | Fine-grained subscriptions via `useSyncExternalStore`: typing in one field re-renders one field. |
| `@marktiderman/genesis-forms-web` | Web renderer kit: field renderers, layouts, chrome | Built on `genesis-ui` and `genesis-design-system`. Each field renderer on its own subpath and lazy-loaded. |
| `@marktiderman/genesis-forms-native` | React Native renderer kit | Built on `genesis-ui-native` (NativeWind). Same vocabulary as the web kit. |
| `@marktiderman/genesis-forms-supabase` | `FormStore` for Supabase: SQL for forms, versions, responses, grades; RLS; storage policies; edge-function submit handler | The backend most client projects already use. |
| `@marktiderman/genesis-forms-builder` | Visual builder | Edits a definition; no storage of its own. The product hosts it; any app can embed it (e.g. teachers authoring worksheets inside Gamify). |
| Later: `-embed`, `-devtools`, `-mcp`, field plugins | Web component and iframe embeds (inline, full page, popup, slider, side tab, `postMessage` events); logic-trace devtools; MCP server for agents; payments, scheduling, signature, captcha | |

## Two ways to author, one artifact

**Code-first**, with answer types inferred:

```ts
import { defineForm, f, when } from "@marktiderman/genesis-forms";

export const intake = defineForm({
  id: "intake",
  title: "Book a demo",
  layout: { mode: "focus" },
  hidden: { utm_source: f.hidden.string(), seats_hint: f.hidden.number() },
  variables: { score: f.variable.number(0) },
  blocks: [
    f.shortText("name", { label: "What's your name?", required: true, autocomplete: "name" }),
    f.email("email", { label: "Thanks {{field:name}}. Your work email?", required: true }),
    f.singleChoice("size", {
      label: "Team size",
      options: [{ value: "1-10" }, { value: "11-200" }, { value: "200+" }],
    }),
    f.pageBreak(),
    f.longText("enterprise_needs", { label: "What do you need at scale?" }),
    f.nps("likelihood", { label: "How likely are you to recommend us?" }),
  ],
  logic: [
    when("size").is("200+").add("score", 10),
    when("size").isNot("200+").hide("enterprise_needs"),
    when("likelihood").lessThan(7).jumpTo({ ending: "detractor" }),
  ],
  endings: [{ id: "detractor", title: "Thanks — we'll follow up." }, { id: "default", title: "Done!" }],
});

type IntakeAnswers = typeof intake.$answers;
// { name: string; email: string; size?: "1-10" | "11-200" | "200+"; enterprise_needs?: string; likelihood?: number }

const json = intake.toJSON(); // the same FormDefinition the builder produces
```

The object maps for `hidden` and `variables` above are **authoring sugar only**. `defineForm`
normalizes them to the canonical array shape that `FormDefinition` declares (`{ name, type, … }[]`,
in declaration order), and `toJSON()` always emits that canonical shape. `parseForm` accepts only
the canonical shape, so there is exactly one stored format, and the builder never sees the sugar.

**Data-first:** the builder, an AI agent or an API produces the JSON directly. `parseForm(json)`
validates it (structure, references, operator/type compatibility, cycles) and returns the same typed
object. A CLI (`genesis-forms typegen intake.json`) generates `IntakeAnswers` for JSON-authored forms.

## The definition

```ts
export interface FormDefinition {
  schemaVersion: 1;                 // the definition *format*; migrateDefinition() upgrades old ones
  id: string;
  version?: number;                 // stamped on publish; responses pin it
  title: string;
  description?: string;
  layout: FormLayout;               // default; the renderer may override
  blocks: Block[];                  // flat, ordered; page-break blocks split pages
  hidden?: HiddenInput[];           // typed inputs; source: "url" | "host" | "server"
  variables?: Variable[];           // typed: score, price, …
  logic?: LogicRule[];
  endings?: Ending[];
  settings?: FormSettings;          // partials, resume, clearHiddenValues, quiz, spam, retention
  theme?: ThemeRef;                 // token overrides
  locale?: string;
  translations?: Record<string, Translations>;
  meta?: Record<string, unknown>;   // free for apps and plugins; preserved round-trip
}

export type FormLayout =
  | { mode: "classic"; columns?: 1 | 2 }
  | { mode: "paged"; progress?: "bar" | "steps" | "none" }
  | { mode: "focus"; progress?: "bar" | "none"; keyboard?: boolean };

export interface FieldBlock<TProps = Record<string, unknown>> {
  kind: "field";
  id: string;                       // immutable; answers are keyed by this
  key: string;                      // human / export name; renamable
  type: string;                     // registry key: "short-text", "acme/signature"
  label: string;                    // supports {{recall}}
  description?: string;
  required?: boolean;
  props?: TProps;                   // validated by the type's propsSchema
  validation?: ValidationRule[];    // minLength, pattern, range, or a named registered validator
  defaultValue?: unknown;
  sensitive?: boolean;              // PII: excluded from analytics, eligible for encryption at rest
  colSpan?: 1 | 2;
}

export type Block =
  | FieldBlock
  | { kind: "content"; id: string; type: string; props: Record<string, unknown> } // heading, rich text, image, video, divider
  | { kind: "page-break"; id: string; title?: string; description?: string }
  | { kind: "group"; id: string; key: string; label?: string; blocks: Block[]; repeat?: { min?: Expr; max?: Expr } };
```

Rules taken straight from the pitfalls list:

- **Answers are keyed by `block.id`, never by label or position.** `key` is for exports and recall
  and is safe to rename.
- **A published version is immutable.** Editing a live form creates a draft. The builder and
  `diffDefinitions(a, b)` report breaking changes (deleted or retyped fields that have answers).
- **`schemaVersion` versions the format itself**, with migrations, because the format will evolve.
- **Unknown `meta` and unknown plugin props survive a round-trip**, so a builder without a plugin
  installed doesn't destroy that plugin's configuration.

## Logic and expressions

```ts
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { op: string; left: Operand; right?: Operand };  // op comes from the field type's operator table

export type Operand =
  | { field: string; path?: string }                  // block id; path into a group/repeat
  | { hidden: string }
  | { variable: string }
  | { value: unknown }
  | { fn: string; args: Operand[] };                  // registered pure function: sum, count, age, wordCount

export type LogicRule =
  | { id: string; when: Condition; effect: "show" | "hide" | "require" | "disable"; target: string }
  | { id: string; when: Condition; effect: "jump"; from: string; to: string | { ending: string } }
  | { id: string; when?: Condition; effect: "set" | "add" | "subtract" | "multiply" | "divide";
      variable: string; value: Operand }
  | { id: string; when: Condition; effect: "setOptions"; target: string; options: Operand };
```

- **Portable.** The AST round-trips to [JSON Logic](https://jsonlogic.com), so rules can also run in
  Postgres, Python or Go. The engine is our own small evaluator plus a conformance suite, because
  existing JSON Logic ports disagree on edge cases.
- **A text syntax for humans.** `{size} = "200+" and {score} > 5` parses to the AST, for the
  builder's advanced mode and for readable diffs. The AST stays the stored format.
- **A reactive dependency graph.** Visibility, required state, variables and options are derived
  values in the store. A change recomputes only what depends on it. Variables evaluate in
  topological order.
- **Static analysis on every parse:** cycles, unreachable pages and endings, jumps backwards past a
  required field, conditions that can never be true (an operator that doesn't fit the type, a
  choice value that doesn't exist), and recall of a field that comes later in the form.
- **Navigation is a history stack.** Back after a jump returns to where the respondent really was.
- **Explicit visibility semantics.** A field that logic has hidden is never validated. Its value is
  cleared on submit by default (`settings.clearHiddenValues`) or kept. This applies to fields hidden by
  logic, not to hidden *inputs*, which are never cleared.
- **Trusted context.** A hidden input with `source: "server"` is never read from the client. The
  form loader resolves it for display (recall), and the submit handler resolves it again,
  authoritatively, and stores it in `response.context`. URL and host inputs are untrusted and stored
  in `response.hidden`. Recall of an unanswered field renders its
  `fallback`; it never drops the question.
- **Extensible.** `registerFunction({ name, args, returns, impl })` adds pure functions. They are
  type-checked by the analyser and must be installed wherever the form is evaluated, including on
  the server; `parseForm` reports a missing function instead of failing at runtime.

## Scoring, grading and worksheets

Worksheets and quizzes are the use case most form tools handle worst (Google Forms quizzes are the
usual baseline), and the one where a naive design leaks answers. So assessment is a first-class
module of the core, not a plugin.

```ts
// Authoring side: the full definition, which only the server and the builder see.
f.singleChoice("q1", {
  label: "Which planet is largest?",
  options: [{ value: "earth" }, { value: "jupiter" }, { value: "mars" }],
  assessment: { points: 2, answer: "jupiter", feedback: { incorrect: "Hint: it's a gas giant." } },
});

f.fillBlanks("q2", {                     // inline blanks inside a sentence
  template: "Water boils at {{blank:temp}} °C at sea level.",
  assessment: { points: 1, answers: { temp: { equals: 100, tolerance: 0 } } },
});

f.longText("reflection", {
  assessment: { points: 5, grading: "manual", rubric: [{ id: "depth", label: "Depth", max: 3 }, { id: "evidence", label: "Evidence", max: 2 }] },
});
```

- **Answer keys never reach the browser.** `publicDefinition(def)` strips `assessment.answer*`,
  rubrics and grader-only feedback. The store serves only the public definition to respondents;
  grading runs in `/server`. Immediate feedback ("check my answer") is a server round trip, with
  rate limiting so it can't be used to enumerate answers.
- **Auto-grading** for choice, number (with tolerance), text (exact, case-insensitive, regex, or a
  list of accepted answers), fill-in-the-blank, matching and ordering. **Manual grading** with
  rubrics and per-question comments for long answers and uploads. A response's grade is
  `auto + manual`, recomputed when a grader changes anything.
- **Attempts and modes:** `settings.assessment = { attempts, showFeedback: "never" | "after-each" |
  "after-submit" | "after-release", timeLimit?, shuffle?, passMark? }`.
- **Assignment:** a response can belong to an assignment (`assignmentId`, `assigneeId`, due date),
  which is what turns a form into a worksheet given to a class or a client. The core stores the
  ids; the app decides what an assignment is.
- **Grading view:** `genesis-forms-web` ships `<ResponseReview>` (one response, with the key, the
  rubric and comment boxes) and `<GradingQueue>` (responses awaiting manual grading).
- **Print and PDF:** a `print` layout renders every block statically, with answers or blank.
- **Scores are ordinary variables**, so a lead score, a quiz score and a wellbeing score all use the
  same machinery; the assessment module only adds keys, grading and release rules.

## The engine and state

The core owns state. It doesn't wrap react-hook-form or TanStack Form, for one reason: in a form
product, **values, visibility, navigation, variables and validation are one reactive graph**. A
value change can hide a page, recompute a score, change which ending is reachable and clear an
error. Bolting logic onto a library that only knows values gives you two sources of truth. Both
libraries were studied for their good ideas, which are kept:

- **Fine-grained subscriptions** (the reason react-hook-form is fast): a signals-based store, read
  in React through `useSyncExternalStore`. `useField("email")` re-renders only when that field's
  slice changes.
- **Standard Schema at the validation boundary** (from TanStack Form and shadcn `Field`): a field's
  value schema can come from Zod, Valibot, ArkType or anything else that implements `~standard`.
  Built-in field types ship their schemas without depending on any of them.
- **Per-event validation**: `onChange`, `onBlur`, `onSubmit`, and async validators with debounce and
  `AbortSignal`, such as "is this username taken?".
- **Server errors map back to fields** by block id.

```ts
const form = createForm(intake, { initialValues, hidden: fromURL(location.search), store, analytics });

form.subscribe((state) => …);         // vanilla, framework-agnostic
form.setValue("email", "a@b.co");
form.next();                          // validates the page, evaluates jumps, pushes history
form.state.visible("enterprise_needs");
form.state.variables.score;
await form.submit();
```

The store being framework-agnostic is what makes `@marktiderman/genesis-forms/server`, `@marktiderman/genesis-forms/testing`, React Native,
and later Vue or Svelte bindings cheap.

## The field-type registry

The single biggest extensibility lever. A field type is a React-free manifest plus one renderer per
platform:

```ts
export interface FieldTypeManifest<TValue, TProps> {
  type: string;                                   // "rating", or "acme/signature" for plugins
  label: string; icon?: string;                   // the builder's "/" menu
  category: "text" | "choice" | "number" | "date" | "media" | "data" | "advanced";
  propsSchema: StandardSchemaV1<TProps>;          // drives the builder inspector, validates props
  defaultProps: TProps;
  valueSchema: (props: TProps) => StandardSchemaV1<TValue>;
  emptyValue: TValue | undefined;
  operators: OperatorDef<TValue>[];               // feeds the logic builder and the analyser
  value: { json: true }                           // TValue is already plain JSON
       | { json: false; serialize: (v: TValue) => Json; deserialize: (j: Json) => TValue };
  summarize: (v: TValue, props: TProps, locale: string) => string; // recall, exports, emails
  toJsonSchema?: (props: TProps) => JSONSchema;
  a11y: { semantics: "control" | "group"; autocomplete?: string };
  keyboard?: { shortcuts?: "letters" | "numbers" };  // one-at-a-time mode
}

// @marktiderman/genesis-forms-react: renderers are registered per platform, with ranked testers
registerRenderer({ type: "rating", rank: 1, Component: RatingField });                 // built-in
registerRenderer({ type: "email", rank: 10, Component: MyEmailField });                // app override
registerRenderer({ test: (b) => b.props?.variant === "cards", rank: 20, Component: ChoiceCards });
```

- `registerFieldType` rejects a manifest whose `value` is `json: false` without both converters, so
  a plugin can't register a `Date`, `File` or other non-JSON value that would corrupt drafts and
  server replay. In development it also round-trips `defaultProps`' empty value through
  `serialize`/`deserialize` (or `JSON.stringify`) and throws if the result differs.
- The highest-ranked match wins, so overriding a built-in never needs a fork.
- Registries are scoped (`<FormProvider registry={…}>`), so two forms on a page can differ.
- A plugin is a package exporting a manifest plus renderers (`genesis-forms-field-signature`). It shows up
  in the builder, the logic panel, exports and the server with no further code.
- A field with no renderer for the current platform renders a clear placeholder and reports it,
  rather than disappearing.

### Built-in catalogue

Deliberately tight; Jotform's sprawl is the anti-pattern. Everything else is a plugin.

| Category | Types |
| --- | --- |
| Text | `short-text`, `long-text`, `email`, `phone` (with country), `url`, `number`, `currency` |
| Choice | `single-choice` (list or cards, optional "other"), `multi-choice`, `dropdown` (searchable), `yes-no`, `consent` |
| Scale | `rating`, `scale` (1–N with labels), `nps`, `ranking`, `matrix` |
| Date | `date`, `time`, `date-time`, `date-range` |
| Media | `file`, `image`, `signature` |
| Data | `lookup` (options from an adapter: a database table, an API) |
| Structure | `group`, `repeat`, `hidden`, `statement`, `page-break` |

First plugins after the core: payments (Stripe), scheduling, address autocomplete, captcha
(Turnstile), e-signature.

## Rendering

```tsx
import { Form } from "@marktiderman/genesis-forms-web";

<Form
  form={intake}                       // or definition={json}
  layout={{ mode: "focus" }}          // overrides the definition
  initialValues={{ email: user.email }}
  store={supabaseStore(supabase)}     // partials, resume, submit
  onSubmit={(response) => …}
  slots={{ ending: MyThankYou }}      // replace one part (null removes it)
  slotProps={{ progress: { className: "h-1" } }}
/>
```

**Three layouts over one definition:** `classic` (all visible blocks, optional columns), `paged`
(split at page breaks, progress bar or steps), and `focus` (one question at a time: Enter advances,
letter or number keys select, Shift+Enter makes a newline, the next question animates in). Layouts
are themselves registered, so a "chat" layout is a plugin, not a fork.

**Composition, from most to least done for you:**

1. `<Form>`: the whole thing.
2. `slots` and `slotProps`: replace or feed any named part (`shell`, `header`, `progress`, `page`,
   `block`, `fieldChrome`, `navigation`, `ending`, `errorSummary`). `null` removes a part, and
   `slotProps` win over the defaults. This is the Genesis extension ladder (EXTENDING.md) as is.
3. Parts: `FormShell`, `FormProgress`, `FormNavigation`, `FieldChrome`, each field renderer.
4. Hooks: `useForm`, `useField`, `useNavigation`, `useResponse`, with no markup at all.

Plus the field registry, which changes one field type everywhere without touching layouts.

**Styling.** Renderers use only Genesis semantic tokens (`--primary`, `--radius`, `--background`,
…) plus a few form tokens added to the design system (`--form-question-size`,
`--form-choice-radius`, `--form-progress`), and expose state through data attributes
(`data-invalid`, `data-visible`, `data-active`, `data-layout="focus"`). A theme is a plain object of
those variables, so it can travel inside a definition and make an embed look the same everywhere.
Custom CSS is an escape hatch.

**Accessibility, part of the contract:**

- `fieldset`/`legend` for every `semantics: "group"` type (radio, checkbox list, rating, scale,
  matrix);
- `aria-invalid` and `aria-describedby` on every control; a focusable error summary on submit;
- in focus mode, focus moves to each question's heading, progress is announced through `aria-live`,
  and the sticky footer never covers the focused control (WCAG 2.2 2.4.11);
- `autocomplete` tokens from the manifest; paste and autofill are never blocked (3.3.8);
- answers survive Back, refresh and resume, and recall avoids asking twice (3.3.7);
- 24px minimum targets (2.5.8); reduced motion respected;
- RTL layouts, and every built-in string translatable.

**Progressive enhancement** (from Conform): in frameworks with server actions, a classic-layout
form submits as a normal HTML form before JavaScript loads.

## Responses, persistence and resume

```ts
export interface FormResponse {
  id: string;
  formId: string;
  formVersion: number;               // pinned
  status: "draft" | "completed" | "abandoned";
  answers: Record<string, Json>;     // keyed by block id, serialized
  hidden: Record<string, Json>;     // untrusted inputs (URL, host app)
  context: Record<string, Json>;    // server-resolved inputs, e.g. class and coach; never client-supplied
  variables: Record<string, Json>;
  ending?: string;
  cursor?: { pageId?: string; blockId?: string; history: string[] };
  respondent?: { userId?: string; resumeToken?: string };
  meta: { locale: string; layout: string; userAgent?: string; referrer?: string };
  startedAt: string; updatedAt: string; completedAt?: string;
}

export interface FormStore {
  loadForm(id: string, version?: number): Promise<FormDefinition>;
  saveDraft(r: FormResponse): Promise<void>;
  loadDraft(by: { token: string } | { userId: string; formId: string }): Promise<FormResponse | null>;
  submit(r: FormResponse): Promise<SubmitResult>;
  upload?(blockId: string, file: Blob, opts: { signal: AbortSignal; onProgress(p: number): void }): Promise<FileRef>;
  lookup?(source: string, query: LookupQuery): Promise<Option[]>;
}
```

- **Partials and resume are separate settings**, because they raise different privacy questions.
  `capturePartials` autosaves drafts (debounced, offline-queued in IndexedDB or AsyncStorage).
  `resume: "device" | "link" | "user" | false` chooses how a respondent gets back.
- **Every field type serializes**: the registry refuses types that don't (see the field-type
  registry), so no type silently breaks resume.
- **Uploads are direct-to-storage** with signed URLs, progress, retries and cancellation. A response
  holds file references, never file bytes.
- **The server decides.** `createSubmitHandler()` loads the pinned version, replays the answers
  through the same engine, clears values of fields hidden by logic, resolves server-sourced context, recomputes variables and the ending, and only then
  writes. It also signs outgoing webhooks (HMAC, with timestamp and replay protection) and supports
  idempotency keys so double submits don't create duplicates.
- **Supabase adapter.** Ships SQL for `forms`, `form_versions` and `form_responses`, RLS policies,
  storage bucket policies, and an edge-function submit handler. **Clients never write response
  tables directly**: anon and authenticated roles get no `INSERT` or `UPDATE` on `form_responses`.
  Drafts and submissions both go through the handler, which validates and writes with its own role.
  Staff read through RLS.

## Analytics

An event stream rather than counters: `form_view`, `form_start`, `page_view`, `field_focus`,
`field_answer`, `field_error`, `page_complete`, `submit_attempt`, `submit_success`, `abandon`. Each
event carries `{ responseId, formId, formVersion, blockId?, layout, ts }`. Values of `sensitive`
fields are never included. Sinks are adapters (the store itself, PostHog, GA4, a callback).
Per-question drop-off funnels, time per question and completion rate by layout come from the
stream. The builder's results view reads them.

## The builder

`@marktiderman/genesis-forms-builder`, MIT. It edits a definition and nothing else.

- **Document editor** in the Tally style: you type on the page, and `/` inserts any registered block
  type (built-in or plugin). Blocks reorder by drag or keyboard.
- **Inspector** generated from each type's `propsSchema`, so a plugin type is editable with no
  builder code.
- **Logic panel** that offers only the operators each field type declares; a **flow map** of pages,
  jumps and endings; the analyser's warnings inline (unreachable pages, cycles, impossible
  conditions).
- **Live preview** rendering the real `<Form>` in all three layouts, on a phone-sized frame or the
  real native renderer through Expo web.
- **Publish and versioning:** validate, stamp a version, show the breaking-change diff, and keep the
  history.
- **Translations view:** every string in every locale, side by side.
- **AI assist, optional:** "create a form from this description", "add a scoring rule", "translate
  to Spanish". It works because the output is a definition that `parseForm` validates. The same
  operations are exposed to agents through `genesis-forms-mcp`.
- **Later: real-time collaboration** via a CRDT (Yjs) document of the definition.

## Testing and developer tools

A form with branching has many paths, and nobody tests them by hand. `@marktiderman/genesis-forms/testing` makes them
testable:

```ts
import { simulate, coverage } from "@marktiderman/genesis-forms/testing";

test("enterprise path", async () => {
  const run = simulate(intake, { hidden: { utm_source: "ads" } });
  await run.answer({ name: "Ada", email: "ada@x.co", size: "200+" });
  expect(run.state.variables.score).toBe(10);
  expect(run.visiblePages()).toContain("page-2");
  await run.answer({ likelihood: 5 });
  expect(run.ending).toBe("detractor");
});

test("every branch is reachable", () => {
  expect(coverage(intake).unreachable).toEqual([]);  // enumerates paths symbolically
});
```

Also: `renderForm()` for testing-library with axe checks built in; `genesis-forms-devtools` with a logic
trace ("why is this field hidden?"); and `genesis-forms typegen` and `genesis-forms validate` CLI commands for CI.

## Security and privacy

- No `eval`, no `Function`, no HTML injection: rich text in content blocks is a sanitized,
  structured document, not HTML.
- `sensitive` fields: excluded from analytics, masked in devtools, optionally encrypted at rest by
  the store adapter.
- Spam: honeypot and timing checks built in; captcha as a plugin; rate limiting in the server
  handler.
- Retention: `settings.retention` (for example, delete drafts after 30 days); the Supabase adapter
  ships a scheduled cleanup.
- Resume links are signed, expiring, and single-respondent.

## Performance budgets

- `@marktiderman/genesis-forms` ≤ 15 kB gzipped; `@marktiderman/genesis-forms-react` ≤ 5 kB; field renderers lazy-loaded per type, so a
  three-field form doesn't ship a signature pad.
- Typing in a field re-renders that field only.
- A 500-block form with 200 logic rules evaluates a change in under 2 ms on a mid-range phone.
- These are CI-enforced (size-limit and a benchmark suite), not aspirations.

## Packages vs the product

Two deliverables, one codebase of mechanics:

| In the open-source packages (Genesis monorepo) | In the dedicated client project (the forms product) |
| --- | --- |
| Definition, engine, store, logic, scoring, grading | Workspaces, teams, roles, billing |
| Renderer kits, layouts, field types | Hosted builder app, form library, templates gallery |
| Builder component | Publishing to hosted URLs, custom domains |
| `FormStore` contract + Supabase adapter + SQL | Its own Supabase project, using that adapter |
| Server submit handler, webhook signing | Integrations catalogue (CRM, Slack, email), notification rules |
| Analytics event stream | Results dashboards, exports, drop-off reports |
| Embed bundle | Embed code generator |

The test for where something goes: **if two client projects would both want it, it belongs in the
packages.** The product is then just the first and largest consumer, and it can't accumulate private
mechanics that Breakthrough, Conversation Cards or Gamify would have to rebuild. This is the Genesis
rule ("when a downstream app hand-builds something genesis nearly had, that is the bug report")
applied to forms.

### Adopting in client projects today

A client project doesn't need the product or the builder to start. After F0–F2 it can:

```tsx
// forms/onboarding.ts: authored in code, versioned with the app
export const onboarding = defineForm({ … });

// app route
<Form form={onboarding} store={supabaseStore(supabase)} layout={{ mode: "paged" }} />
```

Forms authored in code can later be opened in the builder (they are the same JSON), and forms built
in the product can be loaded by id into any app. Each project keeps its own Supabase tables, from
the same migration.

## Fitting into Genesis

The engine is greenfield; these are the seams where it meets existing Genesis code.

| Genesis piece | How it connects |
| --- | --- |
| `genesis-design-system` tokens and themes | The kits use the semantic variables (`--primary`, `--radius`, …) plus a few new form tokens added to the design system (`--form-question-size`, `--form-choice-radius`, `--form-progress`), mapped to NativeWind by `themeFromBrand`. Each client's brand themes its forms with no extra work. |
| `genesis-ui` / `genesis-ui-native` primitives | The kits render with them. New primitives the kits need (rating, date range, time, signature, sortable list, matrix) are added there first. |
| Extension ladder (`slots`/`slotProps`, `className`) | `<Form>` follows it exactly, with a `FormSlotMap`. The field registry is a finer rung below it. |
| `DataProvider` (`genesis-core`) | `genesisStore(provider)` implements `FormStore` on any provider, for apps not on Supabase. Lives in `genesis-forms-react` behind an optional peer, so the core stays dependency-free. |
| `ResourceForm` / `ResourceFormFieldDef` | Left alone at first. Later, `fromResourceFields(defs)` converts configs and `ResourceForm` can render through the engine, which fixes its known gaps: closures as conditions, the `if`-chain renderer, required fields that still validate while hidden. |
| Data Studio `FieldSchema` | `fromResourceSchema(schema)` builds a form from database metadata, giving Data Studio a public **form view** (like Airtable forms). |
| FRAMEWORK.md rule 4 ("Forms → react-hook-form + zod") | The one real conflict, because the forms engine owns its state. Proposed amendment: rule 4 covers CRUD forms; form *products* use `genesis-forms`. Decision 2. |
| Conventions | Changesets, subpath exports, `"use client"` stamping, `check-exports-resolve`, token lint, `testID` → `data-testid`, Storybook stories in `apps/sample`. All apply unchanged. |

## M1: CrossFit Fairfield feedback

The first real consumer is a member feedback system for CrossFit Fairfield. It has to be live fast
and then improve continuously. So M1 is a **thin vertical slice** through F0–F2: every layer exists,
each with only what the gym needs. The definition format, ids, store contract and server
validation are built properly from day one, because those are the things that can't be changed
later without migrating data. Everything else is deliberately minimal.

### What members see

One permanent QR code on the whiteboard and in the post-class message links to the form
(`/f/after-class`). Members never type the class or coach, and can't change them. The server works
them out from the submission time and a small `class_schedule` table, and stores them in
`response.context`.

```ts
export const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },                       // one question at a time, thumb-friendly
  hidden: {                                         // resolved by the server, never from the URL
    class: f.hidden.string({ source: "server" }),
    coach: f.hidden.string({ source: "server" }),
  },
  blocks: [
    f.rating("overall", { label: "How was today's class?", max: 5, required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [{ value: "coaching" }, { value: "workout" }, { value: "community" },
                { value: "scaling" }, { value: "equipment" }, { value: "cleanliness" }],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:coach|a coach}} to follow up with you?" }),
    f.shortText("name", { label: "Your name", required: true }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("name"),
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),  // low score: skip straight to "what could be better"
  ],
  endings: [{ id: "default", title: "Thanks! See you at the next class 💪" }],
  settings: { anonymous: true },                    // anonymous unless they ask for follow-up
});
```

A second, monthly form (`monthly-pulse`) adds an `nps` question and is sent by email or text.
Members can always open it anonymously; anything identifying is opt-in.

### What the owner and coaches see

- **Responses list:** Genesis's existing `ResourcePage` on the `form_responses` table through the
  Supabase provider, with filters by form, coach, class time and score. Nothing new to build.
- **Alerts:** a low rating, or any "follow up with me", sends an email (or Slack/text) to the owner
  through a Supabase database webhook and a small edge function.
- **Weekly summary:** average rating by coach and class time, NPS trend, and the free-text
  comments. A Genesis page reading a SQL view to start.

### M1 scope

| Layer | In M1 | Deferred |
| --- | --- | --- |
| Core | Definition format and schema, `defineForm`, `parseForm` (structure checks), show/hide, jump, recall with fallback, typed hidden inputs from the URL, validation | Variables and calculations, repeat groups, full static analysis, i18n |
| Fields | `rating`, `nps`, `single-choice`, `multi-choice`, `yes-no`, `short-text`, `long-text`, `email` | Everything else |
| Layouts | `focus` (members on phones) and `classic` | `paged`, print |
| Store | Supabase: `forms`, `form_versions`, `form_responses` tables. No client role can write `form_responses`; the submit handler is the only writer. Only staff can read. | Partials, resume, uploads |
| Server | Edge-function submit handler that re-validates against the pinned version; honeypot and rate limit | Signed webhooks to third parties |
| Admin | `ResourcePage` responses list, alert function, summary view | Builder, dashboards in the product |
| Analytics | `form_view`, `form_start`, `submit_success` | Per-question drop-off |

Forms are authored in code for M1; the gym owner asks for a change and it ships. The builder (F3)
later opens exactly these definitions.

### After M1, driven by what the gym asks for

Likely next steps, in order of value to the gym: per-question drop-off (are people quitting the
form?), partials, a coach dashboard, the monthly NPS trend, a builder so staff can edit questions
themselves, then onboarding (new-member intake with waiver signature and injury history:
`sensitive` fields, uploads, signature).

Each step lands in the packages first, so Breakthrough, Conversation Cards, Gamify and the forms
product get it too.

## Roadmap

Ordered so client projects can use it as early as possible, and so the product's builder lands on a
proven engine. M1 (above) is a slice through F0–F2 that ships first; each phase then completes its
layer.

| Phase | Ships | Done when |
| --- | --- | --- |
| **F0 · Core** | `genesis-forms`: definition + schema, `defineForm` with inference, `parseForm` + analyser, logic engine, navigation, store, validation, recall, variables, `/testing`. | Conformance suite passes in Node, Workers and React Native's JS engine; size budget met. |
| **F1 · Web** | `genesis-forms-react`, registries, `genesis-forms-web` with text, choice, scale, date and file types; classic, paged and focus layouts; keyboard model; a11y suite; new primitives in `genesis-ui`. | A branching, scoring feedback form works with keyboard and screen reader only; axe clean in CI. **First client project adopts it.** |
| **F2 · Responses** | `FormStore`, `genesis-forms-supabase`, partials, resume, uploads, `/server` submit handler, webhooks, analytics events. | An onboarding form resumes on another device; a lead form is re-validated server-side and fires a signed webhook. |
| **F3 · Builder** | `genesis-forms-builder`: document editor, `/` menu, inspector from `propsSchema`, logic panel and flow map, preview, publish/versioning, translations. **The product's builder app ships on it.** | A non-developer builds and publishes a branching form; a plugin field type appears in the builder with no builder changes. |
| **F4 · Assessment** | Answer keys, `publicDefinition`, auto + manual grading, rubrics, attempts, assignments, `<ResponseReview>`, `<GradingQueue>`, print layout, `fillBlanks`, matching, ordering. | A worksheet is assigned, completed over two sessions, auto- and manually graded, with no answer key in the browser bundle or network traffic. |
| **F5 · Native + embed** | `genesis-forms-native`, `genesis-forms-embed`, devtools. | The same definition runs in an Expo app and in an embed on a marketing site. |
| **F6 · Ecosystem** | Plugins (payments, scheduling, signature, captcha), AI assist, MCP server, collaboration, Genesis `ResourceForm` and Data Studio integration. | Third-party field packages exist outside the repo. |

Decided: the builder (F3) ships before assessment (F4).

## Decisions

**Decided 2026-10-21 by the maintainer:**

1. **Package split:** `@marktiderman/genesis-forms` plus `-react`, `-web`, `-native`, `-supabase`,
   `-builder`, as above.
2. **Engine-owned state.** FRAMEWORK.md rule 4 is to be amended when the first forms package lands
   (it is unchanged today): react-hook-form + zod still covers CRUD forms; form products use `genesis-forms`, whose engine owns its state (see
   [The engine and state](#the-engine-and-state)).
3. **The builder comes before assessment:** F3 is the builder, F4 is assessment.

**Still open:**

4. **Own logic AST** that round-trips to JSON Logic, instead of storing raw JSON Logic.
   *Recommended.*
5. **Assessment in the core** rather than a plugin. *Recommended*, because answer-key stripping has
   to be enforced by the store and server, and a plugin can't guarantee that.
6. **The product's name and repository**, which this plan deliberately leaves open: it consumes the
   packages like any other client project.

## Appendix A: what we learn from each alternative

**Typeform.** One question per screen, keyboard-first (Enter, letter keys), the best-known
conversational UX. Its logic is the most instructive model, because the Create API exposes it as
JSON: per-field `actions[]` of `jump`/`add`/`subtract`/`multiply`/`divide`, conditions with
per-type operators, and built-in `score` and `price` variables
([logic jumps](https://www.typeform.com/developers/create/logic-jumps/)). Recall uses
`{{field:ref}}`, `{{hidden:x}}` and `{{var:score}}`, but not in choice labels, and a question that
recalls an unanswered field is dropped ([recall](https://www.typeform.com/developers/create/recall-information/)).
Embeds: inline, full page, popup, slider, popover, side tab
([embed SDK](https://typeform.com/developers/embed/modal)). Weaknesses: response caps and pricing,
reported screen-reader problems with choice fields, and slow pacing for long or expert forms.
*Take:* the focus layout, keyboard model, typed logic actions, variables and the embed set.
*Avoid:* string-only hidden fields, silent question dropping, partials behind a paywall.

**Tally.** A Notion-style document editor: you type on the page and `/` inserts blocks, so text,
media, questions and page breaks are one linear list ([help](https://tally.so/help/create-a-form)).
Show/hide on any block, page skips, calculated variables, hidden fields, piping. A generous free
tier; partials and drop-off analytics are Pro ([features](https://www.tally.so/features)).
*Take:* the block-list model and the `/` editor. *Avoid:* gating partials.

**Fillout.** Page-based with typed pages (form, ending, payment, scheduling). Conditions can use
answers, URL params, integration data and dates ([help](https://fillout.com/help/conditional-hiding)).
URL params become hidden fields by marking a field "Hide always"
([help](https://www.fillout.com/help/url-parameters)). Save-and-resume is automatic but tied to one
browser and device ([help](https://www.fillout.com/help/partial-submissions)). Strong record
prefill from Airtable, Notion and HubSpot. *Take:* typed pages, prefill from a data source (the `lookup`
adapter and `initialValues`). *Avoid:* device-only resume.

**Google Forms.** Sections and "go to section based on answer", but only from multiple-choice and
dropdown questions, with no AND/OR ([help](https://support.google.com/docs/answer/141062)). Quizzes
with answer keys, regex response validation, prefill links (`entry.N=`). *Take:* quiz grading and
prefill links as a simple, familiar baseline. *Avoid:* choice-only branching.

**Microsoft Forms.** Per-question branching, forward only, and a multi-select can branch to only
one place ([Q&A](https://learn.microsoft.com/en-us/answers/questions/5217875/ms-forms-limits-to-the-no-of-questions-and-branchi)).
*Avoid:* both limits.

**Jotform.** The widest catalogue and heavy conditional logic, but a cluttered builder, and some
widgets silently break Save and Continue Later
([answers](https://jotform.com/nl/answers/12557053-form-how-to-enable-save-and-continue-later-option)).
*Take:* card vs classic layout as a switch over one form. *Avoid:* catalogue sprawl and widgets that
opt out of core features.

**Cognito Forms.** Repeating sections and tables with min/max, plus a real expression language over
nested data (`Attendees.Count(AdultOrChild = "Adult")`)
([docs](https://www.cognitoforms.com/support/51/calculations/repeating-sectionstables)). *Take:*
`repeat` groups and aggregate functions.

**Paperform.** Document-style editing like Tally, a calculation field with its own formula
language, and piping of answers, scores and totals almost anywhere
([scoring](https://paperform.co/help/articles/scoring-guide/)). *Take:* recall everywhere.

**Youform.** A Typeform-style clone whose main differentiator is unlimited free responses; partials
are its paid feature ([pricing](https://youform.com/pricing)). *Lesson:* free partials and analytics
are a real differentiator for an open-source project.

**SurveyJS.** A JSON schema (`pages[].elements[]`), a string expression language (`visibleIf`,
`enableIf`, `requiredIf`, calculated values, triggers), custom functions through `FunctionFactory`,
and a custom-question API ([docs](https://surveyjs.io/form-library/examples/use-custom-functions-in-expressions/documentation)).
The library is MIT; the Creator is commercial ([licenses](https://surveyjs.io/Licenses)). No
official React Native renderer. *Take:* `clearInvisibleValues`, named custom functions, the
separation of renderer and builder. *Avoid:* a commercial builder.

**Formbricks / OpnForm / HeyForm.** Open-source apps, all AGPL. Formbricks's logic model
(conditions on questions, variables or hidden fields; actions `calculate`, `requireAnswer`,
`jumpToBlock`/`jumpToEnding` with a fallback) is a clean reference
([docs](https://formbricks.com/docs/surveys/general-features/conditional-logic)). *Take:* the
fallback target. *Avoid:* the licence: learn from the docs, copy no code.

**Form.io.** JSON `components[]`, a builder, conditions as simple rules, JSON Logic, or raw JS
(`customConditional`) ([help](https://help.form.io/form-building/logic-and-conditions)). *Take:*
JSON Logic as the portable rule format. *Avoid:* raw JS conditions.

**JSON Forms (EclipseSource).** JSON Schema plus a separate UI schema; renderers are chosen by
ranked **testers** (`rankWith(3, scopeEndsWith("rating"))`), so a custom renderer overrides a
default without forking ([custom renderers](https://jsonforms.io/docs/tutorial/custom-renderers)).
Rules are `{ effect: SHOW|HIDE|ENABLE|DISABLE, condition }`. MIT. *Take:* ranked testers. *Avoid:*
JSON Schema as the authoring format.

**react-jsonschema-form (RJSF).** JSON Schema plus `uiSchema`; a registry of fields, widgets and
templates, where a theme is just a registry. `@rjsf/shadcn` exists. Apache-2.0. *Take:* themes as
registries; `toJsonSchema()` export for interop with it.

**uniforms.** Any schema through a "bridge" (JSON Schema, Zod, SimpleSchema). *Take:* importers
(`fromJsonSchema`, `fromZod`, and Genesis's own configs) instead of one input format.

**TanStack Form v1.** Code-first, headless, React Native support, Standard Schema validators, and
`createFormHook` for pre-bound field components
([composition](https://tanstack.com/form/v1/docs/framework/react/guides/form-composition)). *Take:*
Standard Schema at the validator boundary and per-event async validation. Considered as the state
layer; see decision 2.

**react-hook-form + zod.** The most widely used React form stack, and Genesis's current doctrine.
*Take:* fine-grained subscriptions so typing doesn't re-render the form.

**Conform.** Built on native `FormData`, with progressive enhancement and server actions. *Take:*
public forms should submit even before JavaScript loads, where the host framework allows it.

**shadcn `Field`.** The new presentational primitives (`FieldSet`, `FieldLegend`, `FieldGroup`,
`Field`, `FieldLabel`, `FieldDescription`, `FieldError`) replace the old RHF-coupled `<Form>` and
accept Standard Schema issues ([docs](https://ui.shadcn.com/docs/components/radix/field)).
*Take:* build `@marktiderman/genesis-forms-web`'s field chrome on `Field`, especially `FieldSet`/`FieldLegend` for
group semantics.

**Puck / craft.js.** Visual editors where the data is `{ type, props }` nodes and a config maps
each type to `{ fields, render }` ([Puck](https://github.com/measuredco/puck)). MIT. *Take:* the
builder renders the real component and generates settings from field metadata.

**Standards.**

- *JSON Schema 2020-12:* for export and server validation, not authoring.
- *Standard Schema:* the validator plug-in point.
- *JSON Logic:* the portable rule format.
- *W3C WAI forms tutorial and WCAG 2.2:* the accessibility contract
  ([WAI](https://www.w3.org/WAI/tutorials/forms/)).

**Uncertain as of 2026-10-21:** whether react-hook-form 8 is stable; the exact formio.js licence;
current Typeform plan limits and whether hidden fields are still string-only; the status of a formal
JSON Logic spec. None of these change the plan.
