# @marktiderman/genesis-forms-studio

## 0.6.3

### Patch Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.
- c9fcb99: genesis-ui type-checks under `exactOptionalPropertyTypes` and `noPropertyAccessFromIndexSignature`; no behaviour change. Optional props an app may pass as `undefined` now say so (`?: T | undefined`), index-signature reads use brackets, and settings handed to hooks drop their `undefined` values first. genesis-forms-studio's `NavItemShape` widens `icon` and `disabled` the same way, so a `SubNavItem` still fits it under `exactOptionalPropertyTypes`.

  A consumer with `exactOptionalPropertyTypes` that copies one of these exported types into its own `?: T` fields may need to add `| undefined` there too: `filterProps.statusChips`, `ViewSettings.defaultSort`, the WorkspaceSwitcher slot props `shortcut` and `classNames`, and `SubNavItem.icon` and `children`. `packages/ui/tsconfig.strict.json` now runs in CI so the source stays strict-clean.

## 0.6.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.6.1

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.6.0

### Minor Changes

- 4712a93: `/rules` is pure: it imports only `@marktiderman/genesis-forms` and `@marktiderman/genesis-core` (a new peer, 1.12.0 or later), never React, react-dom or genesis-ui, so a phone app or a server can compute form summaries without installing them. `@marktiderman/genesis-ui`, `react` and `react-dom` are now optional peers, needed only for the components. A test checks the built `dist/rules.js` and `dist/rules.d.ts` and everything they load, and imports `/rules` in Node with no React installed.

  `FormNavItem` is now a shape (`NavItemShape`) rather than genesis-ui's `SubNavItem`, and still passes to `useAppShellSubNav`: `FormNavItem<Icon>` takes the icon's type, `never` by default, and `formNavItems` infers it from the icons you pass. `headlineCards` returns core's `HeadlineNumber` (string or number values), which genesis-ui's `HeadlineNumbers` accepts.

  Features: forms-studio, resource-workspace

## 0.5.1

### Patch Changes

- 49d789d: Doc comments use neutral examples (staff, locations, organization) instead of coaching ones, since Genesis is domain-neutral. No behaviour changes.

## 0.5.0

### Minor Changes

- 14e907f: The resource workspace pieces moved to genesis-ui (`@marktiderman/genesis-ui/resource`). forms-studio re-exports every moved name, marked `@deprecated`, and forms see the same words as before: the deprecated `ShareDialog`, `ReadinessChip`, `readinessOf` and `readinessChip` pass the form's wording and its `no-questions` rule. New `FORM_SHARE_LABELS`, `FORM_READINESS_LABELS` and `FORM_READINESS_OPTIONS` carry those words for hosts that import from genesis-ui directly. `SettingsPageSection` is now an alias of genesis-ui's `ResourceSettingsSection`. The genesis-ui peer floor is now 2.14.0.

  Features: forms-studio, resource-workspace

### Patch Changes

- 4c616c4: answerCell keeps the labels of number and boolean option values again (the label map from the previous release only looked up string answers).
- 35eac40: Linear-time option lookups for large option lists. The response summary counts choice answers through a value map, and answerCell (used per answer by the summary, the table and CSV) looks labels up in a per-options map, instead of scanning the options for every answer; and the option list editor's CSV import preview compares against a value Set instead of scanning per row. A 5,000-option list with 50,000 answers now summarises in milliseconds.

## 0.4.0

### Minor Changes

- 7f12113: Drop-off by question follows each respondent's path. `dropOffByQuestion` rebuilds every response's path with genesis-forms `computePath`, so a question logic hid or jumped over is neither viewed nor left by that respondent, and each response counts once. `SummaryItem` takes optional `hidden` (stored hidden inputs) and `extraAnswers` (answers kept apart, by field key) for logic that reads them. New `dropOffSummary(items, definitions)` returns `{ started, dropOffs }`, where `started` counts distinct responses of any status; `<DropOffByQuestion>` takes `started` (spread the summary into it) and falls back to the first question's views without it.

## 0.3.0

### Minor Changes

- bdcb233: Edit links, rate-limit keys and clean form links, moved up from the host app's forms.

  - `genesis-forms/server`: signed edit links (`signEditToken`, `verifyEditToken`, `editLinkUrl`,
    `withEditToken`, `createEditSecretReader`, `isEditLinkRequest`, `withEditLinkHeaders` and their
    constants), byte-for-byte the format the host app signs, so its links keep working. Rate-limit
    pieces without the counter: `clientIp`, `addressPrefix`, `rateLimitKey` (an HMAC of the address's
    /64, never the address), `allow` (fails open) and `RATE_LIMIT_DEFAULTS`. Web Crypto only.
  - `genesis-forms`: `carryAnswers` moves here from genesis-forms-studio, which re-exports it from its
    `rules` entry unchanged; studio now needs genesis-forms `>=0.6.0`.
  - `genesis-forms-web`: `hideQueryOnLoad`, `wasReload` and `HIDDEN_QUERY_KEEP_MS` take a link's query
    out of the address bar. The ending slot takes `actions` (shown in a row under the default ending),
    and `DefaultEnding` is exported.
  - `genesis-forms-studio/rules`: `slugFromTitle`, `SLUG_PATTERN`, `validateSlug`, `copyTitle`,
    `freeSlug` and `offersSubmitAnother`.

## 0.2.0

### Minor Changes

- a3ba64e: An "Other" answer on choice questions: `props.other: true` (or `{ label }`) adds an Other option with a text box to a single choice, multiple choice or dropdown question. The typed text is the answer (one more item on a multiple choice), checked on the server (blank or over 200 characters is refused, and so is text on a question without Other). The builder has an "Allow an Other answer" switch, and response summaries count typed answers together under Other.
- cbc94c1: Partial responses and drop-off by question (Typeform's "capture partial responses after every question").

  - **genesis-forms**: `settings.saveProgress` (off by default; `parseForm` checks it's a boolean). `formProgress(engine)` says how far a respondent got: `{ step, total, fieldId }`, `fieldId` being the furthest question reached, kept after Back; `furthestReached(state, definition)` is the block. `FormState.furthest` holds the furthest block reached with Next. `createForm(definition, { initialValues, resumeAt })` picks up where someone was after a reload: it moves on with Next from the first block to `resumeAt` (so Back still walks their path), stopping early at a step that no longer passes.
  - **genesis-forms-web**: `<Form onProgress={(engine, progress) => …}>`. With `settings.saveProgress` on, it's called a moment after each step forward (`PROGRESS_DELAY_MS`; in classic layout `CLASSIC_PROGRESS_DELAY_MS` after the answers change), never holding up Next: a rejection is ignored, a pending call goes at once on `pagehide`, and none is made once the form is submitted. A short note under the first question says "Your answers save as you go." (`progressNotice`, `null` hides it).
  - **genesis-forms-builder**: a "Save answers as they go" switch in the form's settings, under Responses (`settingsOmit: ["saveProgress"]` leaves it out). `updateSettings` stores `saveProgress` only when on.
  - **genesis-forms-studio**: `SummaryItem.status` (`in_progress`, `partial`, `completed`; missing is completed) and `furthest`. A status filter (`ResponseFilter.status`, `FiltersValue.status`, `<ResponsesFilters statuses>`: Sent and partial by default, Sent, Partial, In progress), so in-progress responses stay out of summaries unless picked; `matchesStatus`, `STATUS_FILTER_LABEL`, `RESPONSE_STATUS_LABEL`. The Responses card says how many are partial. `dropOffByQuestion(items, definitions)` and `<DropOffByQuestion>`: each question's views, how many stopped there, and the drop-off share.

- 93e16e4: `PhotoAnswer` (`{ photos, resolveUrl }`): a response's photos as thumbnails, each opening full size in a new tab. Data-agnostic: the host resolves each `PhotoRef` to an address it may show, such as a short-lived signed link, or null. A photo most browsers can't draw (HEIC) or that fails to load is a tile with its name and an Open link; one that can't be resolved says "Photo unavailable".

## 0.1.1

### Patch Changes

- 3681e30: Review fixes. `summarizeResponses` counts a rating in one pass (no spread of every answer, which overflowed the stack near 120,000 answers) and keeps the newest version's scale: answers given on an older version's different scale are moved onto it in proportion (`ScaleSummary.rescaled`), answers outside their own scale are left out (`excluded`), and the question card says so. A rating's `max` is read as 1–100. `formAvailability` keeps a form closed when its opening or closing time doesn't parse or has no `Z` or offset (`parseInstant`). `prefilledUrl` keeps a relative link relative instead of throwing. The Low ratings headline honours `skip`, like `needsFollowUp` (`hasLowRatingExcept`). `FollowUpList`'s score has an accessible name.
- 664a25f: New package: the workspace around a form builder. `ResourceHeader` (breadcrumb, title once, status and save-state chips, undo and redo, Preview, Share, Publish), `formNavItems` and `ReadinessChip` for the page's child navigation (genesis-ui's `useAppShellSubNav` and `AppShellSubNavEnd`), the Responses tab (`ResponsesToolbar`, `ResponsesFilters`, `HeadlineNumbers` with `headlineNumbers`/`headlineCards`, `QuestionSummaryCards`, `FollowUpList` with `needsFollowUp`), the Settings layout (`ResourceSettingsPage`, `SettingsSection` around genesis-ui `SettingsRow`/`ToggleRow`) and `ShareDialog`. The pure rules (`summarizeResponses`, filters and presets, `answerColumns`/`toCsv`, `formAvailability`, `prefilledUrl`/`embedSnippet`) are also at `@marktiderman/genesis-forms-studio/rules`. Moved up from the host app. The pieces in `src/generic/` aren't about forms and are meant to move to genesis-ui later.
