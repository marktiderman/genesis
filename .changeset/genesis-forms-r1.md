---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-react": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-devtools": minor
"@marktiderman/genesis": minor
---

Genesis Forms R1. New packages:

- `@marktiderman/genesis-forms` — the zero-dependency engine: a serializable form definition, `defineForm` with inferred answer types, `parseForm`, show/hide and jump logic with a path derived from answers, recall with fallbacks, typed hidden inputs (`url`, `host`, `server`), an event log with `replay`, eight field types, and `/server` `validateSubmission` for server-side checking.
- `@marktiderman/genesis-forms` also ships `explain` ("why is this hidden?" traces for devtools), and in `/testing`: `coverage` (symbolic path enumeration: unreachable blocks, rules that never fire, endings with witnesses), versioned JSON scenarios (`runScenario`, `recordScenario`, `compactEvents`) and an R1 conformance suite at `@marktiderman/genesis-forms/conformance/*.scenario.json`. Failed Next/Submit attempts are logged in the event log, and a completed response is final.
- `@marktiderman/genesis-forms-react` — `useForm`, `useField` (one-field re-renders), a ranked renderer registry and a headless `FormRuntime`.
- `@marktiderman/genesis-forms-web` — `<Form>` with focus (one question at a time) and classic layouts on Genesis UI, accessible by default, with `slots`/`slotProps`. `presentation="page"` is the full-screen respondent view (Typeform style in focus layout, Google Forms style in classic), with an optional `brand` (logo and name) and `useFormPresentation()` for custom slots and renderers.

- `@marktiderman/genesis-forms-devtools` — an inspector with live state, a time-travel event timeline, a server-check panel with tamper mode, and share links in the URL hash.

The umbrella adds `/forms`, `/forms/server`, `/forms/react` and `/forms/web`.
