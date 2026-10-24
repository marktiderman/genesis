# @marktiderman/genesis-forms-studio

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
