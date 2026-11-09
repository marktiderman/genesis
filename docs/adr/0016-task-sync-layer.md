# ADR 0016: genesis-tasks, the task sync layer

- Status: proposed
- Date: 2026-11-09
- Features: `task-sync-layer`, `connect`
- Related: ADR 0005 (layers), ADR 0014 (genesis-calendar, the same shape for calendars);
  genesis-connect (`todoistProvider`, the shared `grant`), core/dates

## Context

People keep their tasks in an outside list (Todoist first; Google Tasks and Microsoft To Do are
the same shape) and want an app's tasks there too, both ways. A consumer app asked for a two-way
Todoist sync. Done by hand, each app would get the same things wrong:

- Todoist's sync token, and full reads that hold active tasks only;
- command uuids that make retries safe, and temp ids across batches;
- repeating tasks, whose due day Todoist moves on completion;
- signed webhooks that can arrive late, twice or never;
- a two-way merge that compares only two sides and so loses an edit.

`pnpm features find todoist` and `… task sync` find nothing. `connect` gets a token and fetches no
data, and `calendar-read-layer` reads calendars only. Nothing in Genesis syncs tasks with an
outside list.

## Decision

1. A new package, `@marktiderman/genesis-tasks` (layer primitive, group data, ADR 0005), with one
   entry `.`: pure TypeScript on fetch and WebCrypto, with no storage, no OAuth and no React. It
   mirrors genesis-calendar: provider-neutral types plus one adapter per provider.
2. Provider-neutral: `TaskFields` (title, notes, due day, done: what a two-way sync keeps equal),
   `ExtraTaskFields` (labels and priority, merged when an app asks for them in `fields`),
   `ExternalTask` (with `assigneeId`), `ExternalList`, `normalizeTaskFields`, `normalizeLabels`,
   `matchesScope` and `mergeTask`. `mergeTask` is a three-way merge, field by field, against the
   last agreed state. A field both sides changed goes to the later change, or to `prefer`. Labels
   merge as a set: adds on either side kept, removals on either side applied.
3. Todoist: `syncTodoist`, `getTodoistTask`, `todoistCommand` with `runTodoistCommands`,
   `readTodoistWebhook`, `fromTodoistItem`, and `TodoistError` (`isTodoistError`).
4. OAuth stays in genesis-connect: `todoistProvider`, plus `accessToken`'s `grant` for rotating
   refresh tokens across server instances.
5. A doctor rule, `task-sync-uses-genesis-tasks` (warn), flags hand-written `api.todoist.com`
   calls and Todoist SDK imports.

## Glossary

- **Outside list**: a task list kept by another service (a Todoist project). Not "external
  provider" or "integration source".
- **Task fields**: the shared fields a two-way sync keeps equal.
- **Base**: the task fields both sides last agreed on, which the merge compares against.

## Alternatives

- **A `/todoist` entry on genesis-connect.** Lost: genesis-connect is OAuth and secrets, and
  calendars already set the pattern of a data layer of its own.
- **Leave it to the app.** Lost: the hard parts (merge, commands, webhooks) are the same for every
  app, and the second app would copy the first.
- **Todoist's TypeScript SDK.** Lost: it covers REST calls, not incremental sync, command
  batching or the merge, and it brings dependencies.

## Consequences

- The first version is published by hand (docs/RELEASING.md, "A brand-new package").
- Its webhook check is a small private copy of genesis-connect's `verifyWebhookSignature`, because
  this package's first version publishes before connect 0.4.0. It can import connect's later.
- Google Tasks and Microsoft To Do adapters come when an app needs them, against the same
  `TaskFields` and `mergeTask`.
