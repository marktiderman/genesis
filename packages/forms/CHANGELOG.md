# @marktiderman/genesis-forms

## 0.10.1

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.10.0

### Minor Changes

- be8dfe8: The destination secret box (`deriveSecretKey`, `sealSecret`, `openSecret`, `secretKeyBytes`) now runs on genesis-connect's, bundled in, so forms still installs nothing. Same `v1.` format, same `DeliveryError` messages. `@marktiderman/genesis-forms/destinations` also exports the keyring (`createSecrets`, `parseKeyring`, `SecretError`, `isSecretError`): it opens `v1.` secrets sealed with `sealSecret` (same purpose and salt, the key as `legacyKeyId`) and re-seals them as rotatable `v2.` ones.

  Features: connect

## 0.9.3

### Patch Changes

- 80a027a: Forms' destinations now bundle the outbox engine from `@marktiderman/genesis-supabase/runner`, where it moved, instead of from genesis-notifications. The bundled code is the same, so delivery behaves exactly as before, and forms still installs no dependencies. A new test pins forms' outcomes on the engine: filtered and skipped deliveries are never retried, a Retry-After defers without using an attempt up to `maxDeferrals`, a 410 fails with `disable`, and the defaults stay at 8 attempts, 24 deferrals and batches of 25.

## 0.9.2

### Patch Changes

- 49d789d: Doc comments use neutral examples (staff, locations, organization) instead of coaching ones, since Genesis is domain-neutral. No behaviour changes.

## 0.9.1

### Patch Changes

- ae8503d: `createDeliveryRunner` now runs on genesis-notifications' shared outbox runner (`createRunner` from `@marktiderman/genesis-notifications/runner`), bundled into this build, so forms still has no dependencies. Its options, outcomes, report and log lines are unchanged; `deliveryOutcome` and `defaultBackoff` are the shared ones.

  Features: forms-destinations

## 0.9.0

### Minor Changes

- e7b724c: A content-type registry, merging partial responses, and a shared form controller.

  - `genesis-forms`: every field and content kind is one registered definition that the engine,
    `parseForm`, validation, the server and snapshots read, instead of switches on type names. A
    field kind's manifest gains `checkProps` (its props schema), `choice: { multiple }` (its answer
    shape: a host's choice kind gets `optionsFrom`, filters, `prefill`, `other` and snapshots),
    `literal`, and `snapshot`/`fromSnapshot` for other kinds. `registerContentType`,
    `getContentType`, `listContentTypes` and `contentText` add content kinds; `ContentBlock` takes
    `props` and any registered `type`. Also `choiceKind`, `isChoiceField`, `isBuiltInFieldType`,
    `VALIDATOR_FAILED_MESSAGE` and the `PropsCheck` types. `registerFieldType` now refuses a
    built-in kind's name unless `{ replace: true }`, refuses a manifest without `value` or
    `operators`, and stores a frozen copy (`operators` reads as a fresh list); a choice kind
    without its own `validate` gets the built-in check for its shape. A validator that throws
    refuses the answer; a props check that throws is one `parseForm` issue; a throwing `literal`,
    `snapshot` or `fromSnapshot` is skipped. The registry's global key names its format
    (`field-types@2`), so an older copy of the package in the same process keeps its own registry.
    `choiceOptions`, `withHostOptions`, `answerSnapshots`, `answersFromSnapshots` and
    `validateSubmission` return exactly what they did (golden tests pin them). Two message
    changes: once a host registers a content kind, an unknown kind's issue lists it ("Must be
    heading, text or callout."); and a field whose type is an `Object.prototype` name
    (`toString`) no longer gets nonsense literal warnings.
  - `genesis-forms`: `mergeResponses(definition, base, patch, { hidden?, hostOptions?, offPath? })`
    lays a patch over a saved draft for resuming and partial saves. Answers on a path no longer
    taken are dropped, unless `offPath: "keep"` (the default keeps them only with
    `settings.clearHiddenValues: false`). Also exported from `/server`.
  - `genesis-forms-react`: `useFormController(engine, options)`, the headless controller for any
    renderer (step and path, errors, Next and Back, sending with retry, auto-advance, saving
    progress, announcements and focus targets), plus `formEngineOptions` and the
    `ADVANCE_DELAY_MS`, `PROGRESS_DELAY_MS` and `CLASSIC_PROGRESS_DELAY_MS` timings.
  - `genesis-forms-web`: `<Form>` renders `useFormController`; its behaviour is unchanged. A content
    kind it has no drawing for shows its display text. It now needs genesis-forms-react `>=0.3.0`.

- e73f96f: The submit contract, drafts and the offline outbox.

  - `genesis-forms/server`: `submitResponse(input, { definition, store, hostOptions?, context?, formId?, version?, open?, rateLimit?, uploads?, ... })`
    checks a submission again (`validateSubmission`, then `checkUploads`), snapshots the options
    picked (`answerSnapshots`) and stores it once per idempotency key through the app's
    `SubmissionStore` (`find`, then `save`). It answers a `SubmitResult`: `ok` with the id and
    `receivedAt`, or `invalid`, `duplicate`, `conflict` (a key reused for other answers; the record
    keeps an `inputHash`), `closed`, `rate_limited` (with an optional `retryAfterSeconds`) or
    `store_failed`. The record lists the checked `uploadIds`. Also `SubmissionRecord`,
    `StoredSubmissionRef`, `SubmitResponseOptions` and `RateLimitAnswer`.
  - `genesis-forms` (and `/server`): the wire types `SubmitRequest` (a `SubmissionInput` plus
    `idempotencyKey`, `clientSubmittedAt` and `attemptId`), `SubmitResult`, `SubmitFailureReason`, and
    `isIdempotencyKey`, `isSubmitResult` and `submitOutcome` (delivered, retry or rejected).
  - `genesis-forms`: drafts, with `DraftStore`, `createDraftStore(storage)`, `draftOf`,
    `restoreDraft` (refuses the whole draft when a new version no longer fits it, or it is older than
    30 days) and `createDraftAutosave` (debounced, in order, never throws; sensitive answers left out
    by default).
  - `genesis-forms`: `createSubmitOutbox({ storage, send, ... })`, which queues submissions with an
    idempotency key, keeps them across restarts, sends them when online with backoff and a timeout,
    and keeps refused ones as `failed` until `retry` or `discard` (ones that ran out of tries start
    again when the outbox starts and when the device comes back online).
  - `genesis-forms`: `KeyValueStorage` (the shape of `localStorage` and AsyncStorage),
    `memoryStorage()` and `webStorage()`.

  Features: forms-submit, forms-drafts, forms-outbox

- bd7ab1c: Trusted client IP headers, Standard Webhooks retries and secret rotation.

  - **Behaviour change: `clientIp` no longer reads `x-forwarded-for` or `x-real-ip` by default.**
    `DEFAULT_TRUSTED_IP_HEADERS` is now `x-vercel-forwarded-for` and `cf-connecting-ip`, headers the
    platform sets itself; the leftmost `x-forwarded-for` entries are whatever the client sent, so a
    client could pick its own rate-limit key. New `ClientIpOptions.forwardedForHops` reads
    `x-forwarded-for` from the right, at the hop your own proxies appended (1: the rightmost).
    **Migration:** a host that relied on `x-forwarded-for` (behind its own load balancer, not Vercel
    or Cloudflare) passes `clientIp(request.headers, { headers: [], forwardedForHops: 1 })`, with the
    number of its proxies that append an address, or `forwardedForHops` (and `trustedIpHeaders: []`)
    in `createUploadHandler`'s `rateLimit`. Without it, every request there counts as `"unknown"`, one
    shared bucket. A host that relied on `x-real-ip` passes `["x-real-ip"]` if its proxy overwrites it.
  - Webhooks, per the Standard Webhooks spec:
    - `defaultBackoff` is 5 minutes, quadrupling, at most 24 hours, jittered by ±20%: about 3 days
      across the default 8 attempts (was 1 minute doubling to 6 hours). It applies to every
      destination the runner sends to.
    - A 410 Gone from a webhook fails with `disable: true` on the `DeliveryResult`, and the runner's
      `failed` outcome carries `disable: true`, so the app can switch the destination off.
      `DeliveryError` takes `disable` too.
    - `secret` may be several secrets (`string[]`, or a resolver returning one): each signs, and the
      signatures are space-separated, so a rotation needs no downtime. `signWebhook` and
      `verifyWebhook` take an array as well.
    - The minimum secret is 24 bytes decoded (was 16), `MIN_WEBHOOK_SECRET_BYTES`;
      `newWebhookSecret()` still issues 32. A shorter secret fails permanently, and `verifyWebhook`
      refuses it, so replace any 16 to 23 byte secret before upgrading.
    - The payload's `timestamp` is when the event happened (`submission.submittedAt`), falling back
      to the send time; the `webhook-timestamp` header stays the send time.
    - The README says to send through an egress proxy that refuses internal addresses where untrusted
      users choose webhook URLs, since a DNS check before `fetch` can be rebound.
  - `deriveSecretKey(key, info, { salt })` takes an optional HKDF salt (bytes, or text as UTF-8). The
    default stays empty, so everything sealed before opens unchanged; a fixed app-wide random salt is
    recommended for new keys.

  Features: forms-destinations, forms-submit

### Patch Changes

- cfc46b4: `submitResponse` passes every `validateSubmission` option through, so options added later reach it too; the README says edits and progress saves are out of scope and that an endpoint answers `duplicate` as success.

## 0.8.0

### Minor Changes

- 51d6c9d: Delivery, phase 3: everything an app needs to send form responses to destinations from its own outbox, in `@marktiderman/genesis-forms/destinations`.

  - `createDeliveryRunner({ claim, record, saveState?, destinations, now?, log?, batchSize?, maxAttempts?, backoff? })` claims a batch of due deliveries, applies each destination's `config.when`, batches deliveries to one destination, keeps its state, and records an outcome per delivery: `sent`, `filtered`, `skipped`, `retry` (deferred by Retry-After without counting an attempt, or backed off by attempt) or `failed`. The store interface is generic, so an app maps it to its own SQL. Also `deliveryOutcome`, `defaultBackoff`, `DEFAULT_MAX_ATTEMPTS`, `DEFAULT_MAX_DEFERRALS` (deferrals cap at `maxDeferrals`, then count as attempts), `DEFAULT_BATCH_SIZE` and the `ClaimedDelivery`, `DeliveryOutcome`, `DeliveryReport`, `DeliveryRunner` types.
  - `slackDestination({ url?, resolveHost?, message? })` and `slackMessage`, `escapeSlack`: one escaped message per submission to a Slack incoming webhook.
  - Sending by answer: `passesCondition(submission, definition, config)`, `conditionOf`, `isCondition`.
  - SSRF checks for hook URLs: `parseHookUrl`, `checkHookHost(url, resolveHost)`, `isPublicAddress`, `HookUrlError`. `webhookDestination` takes `resolveHost` to refuse a hostname that resolves to a non-public address, and `url(config, { destinationId })` to look the address up outside config; `newWebhookSecret()` issues a Standard Webhooks `whsec_` secret.
  - Google sign-in for sheets: `googleOAuthAccessToken`, `refreshGoogleAccessToken`, `DRIVE_FILE_SCOPE`; `sheetsDestination` takes `accessToken(config, { destinationId })` in place of `account`.
  - Secrets at rest: `deriveSecretKey`, `sealSecret`, `openSecret`, `secretKeyBytes` (AES-256-GCM under an HKDF-SHA-256 key, bound to associated data).
  - Edits: `DeliveryOptions.update` (and `DeliveryItem.update`) make the sheet overwrite the response's row and the webhook send `form.updated`. `DeliveryOptions.destinationId` is passed to option functions as `{ destinationId }`. A destination can resolve `{ ok: true, notSent }` for a deliberate no-send.

  Existing behaviour is unchanged when the new options are not used.

## 0.7.0

### Minor Changes

- 6d5686a: Upload handshake for `photo` fields, moved up from the host app's feedback photo uploads.

  - `genesis-forms/server`: `createUploadHandler({ resolveForm, store, edit?, rateLimit?, ... })`, the
    endpoint that signs one upload per file after checking the form, the field, the file's type and
    size, the attempt id or edit link and the rate limit; the same JSON and status codes the host app
    answered with. `checkUploads(definition, answers, { formId, owner, store })` checks on submit that
    every file the answers name was uploaded by this attempt or for this edit, to that field, stored,
    of an allowed type and size, and no more than the field takes; stored metadata replaces what the
    browser sent. Also `UploadStore`, `StoredUpload`, `UploadOwner`, `uploadFields`, `uploadRules`,
    `attemptHash`, `NOT_UPLOADED_MESSAGE` and `UPLOAD_MESSAGES`.
  - `genesis-forms`: the handshake's JSON types `UploadRequest`, `UploadGrant`, `SignedUpload`,
    `UploadRefusal` and `MAX_UPLOAD_REQUEST_BYTES`.
  - `genesis-forms-web`: `signedUploadHost({ endpoint, claim, send?, readUrl?, fetch? })`, the browser
    half, an `UploadHost` for `<Form onUpload>`; `UploadHost` takes an optional `url(ref)` for reading
    a stored file. It now needs genesis-forms `>=0.7.0`.

## 0.6.0

### Minor Changes

- d1e2966: Answer snapshots for options from the app: `answerSnapshots(definition, answers)` pairs each
  answer with its label as of now (`{ value, label }`, or a list), so a host stores the id for
  reports and the name for history; `answersFromSnapshots(definition, snapshots)` finds each pick
  again for an edit link (by value, else by label) and reports what is gone in `missing`. Exported
  from `@marktiderman/genesis-forms/server` (with `withHostOptions`) and the main entry.

  Features: option-lists

- d1e2966: Options carry more than a value and a label: `ChoiceOption` gains optional `description`,
  `image` (an `https://` link) and `attributes` (`Record<string, string | string[]>`, for filters
  and recall). `readOption` keeps each detail only when it is well formed and within
  `OPTION_LIMITS`; `choiceOptions` and `withHostOptions` keep them, `parseForm` reports a
  definition's malformed ones (`isHttpsUrl`, `optionJson` are exported too). Existing options and
  `hostOptions` work unchanged.

  genesis-forms-web shows an option's description as a muted line under its label and its image as
  a small picture beside it. In genesis-forms-builder, `setOptions` keeps an option's details when
  its label changes, and a host list's `sample` options show theirs in the preview.

  Features: option-lists

- d1e2966: Lists filtered by another answer, search for long lists, and preselecting from a link. Every
  decision lives in genesis-forms, pure, so web and native renderers, the engine and the server
  agree.

  - **Filtered lists:** `props.optionsFrom.filter: { attribute, field }` shows only the options
    whose attribute matches an earlier question's answer (`visibleOptions`, `optionMatches`,
    `answersOnPath`). The engine clears a pick that stops matching (`clearFilteredAnswers`), and the
    engine and `validateSubmission` refuse one outside the filter (`filteredChoiceError`).
    `parseForm` checks the question it reads exists and comes earlier.
  - **Search:** `isSearchable(field, count)` (more than `SEARCHABLE_OPTION_COUNT`, 10, unless
    `props.searchable` says) and `searchOptions(options, query)`. genesis-forms-web draws such a
    question as an in-page searchable list (genesis-ui `Command`), in classic and focus layouts.
  - **Link prefill:** `props.prefill: { param, hideWhenPrefilled? }`, `createForm`'s `linkParams`
    and `<Form linkParams>` preselect an option from `?param=value` when it is offered
    (`prefillFromLink`); with `hideWhenPrefilled` the engine steps over it (`hiddenByPrefill`,
    `respondentPath`) and still stores the answer, which the server checks like any other.
  - genesis-forms-react: `useChoiceOptions(engine, id)` and `useRespondentPath(engine)`.
  - genesis-forms-builder: "Only show options matching" under a list from the app
    (`setOptionsFilter`, `HostOptionList.attributes`, `hostListAttributes`), and per choice
    question a Search box setting and "Fill in from the link" (`setPrefill`). Renaming, moving or
    removing the question a filter reads keeps the definition valid.

  Features: option-lists

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

## 0.5.0

### Minor Changes

- 8941c14: Options from the app: a single choice, multiple choice or dropdown question can take its options from the app showing the form, such as a coach picker that always lists a practice's current coaches.

  - **genesis-forms**: a choice field may set `props.optionsFrom: { source: "host", key }` (`f.singleChoice`, `f.multiChoice` and `f.dropdown` take `optionsFrom`, and `options` is then optional). `createForm` and `replay` take `hostOptions` (lists by key, `{ value, label }[]`): `engine.definition` has them filled in after the question's own options, so renderers show them and only these values validate. `validateSubmission` takes `hostOptions` too, loaded on the server, so a value the server doesn't offer now is refused. New exports: `withHostOptions`, `optionsSource`, `HostOptions`, `OptionsSource`. `parseForm` checks the shape of `optionsFrom` (an issue), warns when a non-choice type sets it, and no longer warns about rules comparing such a question with a value only the app supplies. Definitions without `optionsFrom` behave exactly as before.
  - **genesis-forms-builder**: `hostOptions?: HostOptionList[]` on `FormBuilder` and `BuilderConfig` (`{ key, label, description?, sample? }`). A choice question's options read "Options: Typed here | From the app", with a picker of the host's lists; the preview and the path checks use each list's `sample`, and a question using a list the host doesn't offer is a warning. New: `setOptionsSource` (ops), `sampleHostOptions`, `HostOptionList`; `analyze` takes `hostOptions`.
  - **genesis-forms-web**: `<Form hostOptions>` passes the lists to the form's engine (with your own `engine`, pass them to `useForm`).

- a3ba64e: An "Other" answer on choice questions: `props.other: true` (or `{ label }`) adds an Other option with a text box to a single choice, multiple choice or dropdown question. The typed text is the answer (one more item on a multiple choice), checked on the server (blank or over 200 characters is refused, and so is text on a question without Other). The builder has an "Allow an Other answer" switch, and response summaries count typed answers together under Other.
- cbc94c1: Partial responses and drop-off by question (Typeform's "capture partial responses after every question").

  - **genesis-forms**: `settings.saveProgress` (off by default; `parseForm` checks it's a boolean). `formProgress(engine)` says how far a respondent got: `{ step, total, fieldId }`, `fieldId` being the furthest question reached, kept after Back; `furthestReached(state, definition)` is the block. `FormState.furthest` holds the furthest block reached with Next. `createForm(definition, { initialValues, resumeAt })` picks up where someone was after a reload: it moves on with Next from the first block to `resumeAt` (so Back still walks their path), stopping early at a step that no longer passes.
  - **genesis-forms-web**: `<Form onProgress={(engine, progress) => …}>`. With `settings.saveProgress` on, it's called a moment after each step forward (`PROGRESS_DELAY_MS`; in classic layout `CLASSIC_PROGRESS_DELAY_MS` after the answers change), never holding up Next: a rejection is ignored, a pending call goes at once on `pagehide`, and none is made once the form is submitted. A short note under the first question says "Your answers save as you go." (`progressNotice`, `null` hides it).
  - **genesis-forms-builder**: a "Save answers as they go" switch in the form's settings, under Responses (`settingsOmit: ["saveProgress"]` leaves it out). `updateSettings` stores `saveProgress` only when on.
  - **genesis-forms-studio**: `SummaryItem.status` (`in_progress`, `partial`, `completed`; missing is completed) and `furthest`. A status filter (`ResponseFilter.status`, `FiltersValue.status`, `<ResponsesFilters statuses>`: Sent and partial by default, Sent, Partial, In progress), so in-progress responses stay out of summaries unless picked; `matchesStatus`, `STATUS_FILTER_LABEL`, `RESPONSE_STATUS_LABEL`. The Responses card says how many are partial. `dropOffByQuestion(items, definitions)` and `<DropOffByQuestion>`: each question's views, how many stopped there, and the drop-off share.

- 93e16e4: A `photo` field type: a respondent attaches up to a few photos, such as a picture of broken equipment. The answer is a list of references the host's storage returned, `{ id, name, type, size }` (`PhotoRef`), never the bytes. Props: `maxFiles` (1–5, default 3), `maxSizeMb` (1–25, default 10) and `formats` (`jpeg`, `png`, `heic`, `webp`; default all four). Validation checks each reference's shape, type and size and the count; `normalize` keeps only the four keys; `summarizeValue` lists the file names. Not sensitive or identifying by default. `parseForm` checks the props, and a formula reading a photo field gets a warning. New: `f.photo`, `PHOTO_TYPE`, `UPLOAD_FIELD_TYPES` (opt-in for builder palettes), `PHOTO_FORMATS`, `photoLimits`, `photoRefs`, `isPhotoRef`, `isPhotoFormat`, `photoFormatList`, `photoTypeMessage`, `photoSizeMessage`, `photoCountMessage`, `DEFAULT_PHOTO_FILES`, `MAX_PHOTO_FILES`, `DEFAULT_PHOTO_SIZE_MB`, `MAX_PHOTO_SIZE_MB`, `MAX_PHOTO_ID_LENGTH`, `MAX_PHOTO_NAME_LENGTH`, and the types `PhotoRef`, `PhotoFormat`, `PhotoLimits`.

## 0.4.2

### Patch Changes

- 8db0a9d: Calculated fields settle in linear time. A settle copies the answers once rather than once per changed field, and formula props and column lists are set up once per calculator. During a replay, back and next skip the formulas when no logic rule reads a calculated field. A list or table now counts once toward `MAX_SETTLE_ITEMS`, however many of its columns a formula reads. Caches belong to each calculator, so each engine and each `validateSubmission` call reads its answers afresh, and `setValue` with the array the engine already holds recomputes.
- ea0a6ca: `validateSubmission` refuses a submission that would be too much work, with an error under `""`, instead of relying on the host's request size limit. Besides `maxEvents` (`MAX_EVENTS`, 10,000), two new limits, each overridable: `maxValues` (`MAX_SUBMISSION_VALUES`, 200,000 JSON values across the answers, answer events and hidden inputs, with a run of answers to one field counted once, so typing in a table is fine) and `maxReplayWork` (`MAX_REPLAY_WORK`, 1,000,000 units: one per block for each walk of the path, one per calculated field for each settle, and a formula's size each time it is worked out; the submit after the replay isn't counted, so it never throws). At most `RAW_EVENTS_PER_EVENT` (10) × `maxEvents` events may be sent before compaction. A log built so that every step works out every formula (2,000 fields over a 10,000-row table with logic reading one) is now refused in about 0.1 s instead of taking about 5 s.

## 0.4.1

### Patch Changes

- e1d2ed6: Calculated fields stay fast when an answer a formula reads keeps changing. Each list or table column is read once per answer (kept by the answer's array) and its numbers are added up once, so a step that changes the tax rate no longer walks an unchanged 10,000-row table again. New `MAX_SETTLE_ITEMS` (50,000): the list items and table rows all of a form's formulas read together, each answer and column counted once in form order; a calculated field that reads an answer past it, or one over `MAX_FORMULA_ITEMS`, is now blank instead of a partial total (an answer over `MAX_FORMULA_ITEMS` uses none of the allowance). Totals are kept only for lists the package builds and freezes itself, so a custom `FormulaReader` that changes a list in place gets fresh totals, and `formulaInput` builds a new list on each call. Answers must not be changed in place (pass `setValue` a new array). `parseForm` caps a form's formulas at `MAX_FORM_FORMULA_LENGTH` (20,000) characters together, since each step that changes an answer they read works them out again. A number written with letters (`1e6`, `2x`) now says "Write a number in digits only".

## 0.4.0

### Minor Changes

- 5b1f464: A `calculated` field type: a value worked out from other answers and shown read-only, such as a total or a score. Its props are `{ formula, format?: "number" | "percent" | "text", decimals? }`. The formula language is small and parsed here, never evaluated as code: answer keys (`hours`), one table column (`plan.cost`), numbers, text in quotes, `+ - * /` (also `− × ÷`), parentheses, comparisons (`== != < <= > >=`, also `= ≠ ≤ ≥`), `test ? a : b`, and `sum`, `avg`, `min`, `max` over numbers, lists and table columns. A blank answer makes arithmetic blank, so a total stays empty until its answers are in; `sum` skips blanks.

  The engine works the values out from the answers on the path, again whenever an answer a formula reads changes, and stores them with the answers, so a submission carries them. A replay (and so `validateSubmission`) and prefilled answers work them out once before each step, not once per event, so a large submission stays fast. A list or table of more than `MAX_FORMULA_ITEMS` (10,000) items reads as blank in a formula, and a number literal too large to hold is a parse error. Nesting is counted per parenthesis, call, sign or `? :`, up to 64 levels. `setValue` on a calculated field does nothing, and `validateSubmission` works the values out itself and ignores the client's. A calculated field is never required. Logic may compare a calculated value.

  `parseForm` checks the formula: it must parse, every key must be a question of the form, a table must be read by one of its columns, and a calculated field may only read calculated fields before it. Each problem is an issue on `props.formula` with the character it is at. `format` and `decimals` are checked too, and `required: true` is a warning.

  New exports: `parseFormula`, `evaluateFormula`, `formulaRefs`, `renameFormulaKey`, `formulaNumber`, `FORMULA_FUNCTIONS`, `MAX_FORMULA_LENGTH`, `calculatedProps`, `calculatedValue`, `formatCalculated`, `formulaInput`, `MAX_FORMULA_ITEMS`, `CALCULATED_TYPE`, `COMPUTED_FIELD_TYPES`, `MAX_CALCULATED_DECIMALS` and their types, and `f.calculated` for `defineForm`.

- 5b1f464: Four new field types, and end labels and stars for ratings.

  - `dropdown` (`f.dropdown(key, { options })`): one option from a compact menu. Validated, summarized and compared like single choice.
  - `number` (`f.number(key, { min, max, step })`): a number within optional limits, on an optional step counted from `min` (else 0). Supports `lt`/`gt` logic. `numberLimits(field)`.
  - `date` (`f.date(key, { min, max })`): a real calendar day stored as `YYYY-MM-DD`, within optional limits. `isIsoDate`, `dateLimits(field)`.
  - `consent` (`f.consent(key, { text })`): one checkbox. Checked stores `true`; unchecked is unanswered, so a required consent must be checked. Summarized as "Agreed".
  - `rating` takes `lowLabel`, `highLabel` and `display: "numbers" | "stars"`; `nps` takes the labels. `summarizeValue` adds an end's label (`"5/5 (Great)"`). `scaleLabels(field)`, `ratingDisplay(field)`.

  `parseForm` checks the new props (numbers for number limits, a step above 0, real dates, min not above max, a known rating display, text labels), warns when logic compares a dropdown with a value that is not an option, and `coverage()` finds valid answers for every new type. `validateSubmission` and `publicDefinition` handle them like the other built-in types.

  Later, not in this release: time, a grid of rows by columns, file upload and ranking.

  Features: forms-engine

## 0.3.1

### Patch Changes

- 0156f89: Destinations: the Google token cache is keyed by a SHA-256 digest of the private key as well as the email and scope, so a config with the right email and another key never gets a cached token. Two first deliveries to a new sheet no longer fail permanently: an "already exists" from adding the tab reuses it, and the header is read back and merged again after a concurrent write. A request that can never be sent (a malformed header value or URL) now fails for good instead of retrying as a network error.
- 0156f89: `parseForm` now checks the structured field types' settings even when a field has no `props`, so a `table` field without columns is rejected instead of publishing a form nobody can submit.

## 0.3.0

### Minor Changes

- 9453f10: New `@marktiderman/genesis-forms/destinations` subpath (and the umbrella's `@marktiderman/genesis/forms/destinations`): send a checked submission to an inbox (`emailDestination` with a built-in `resendProvider`), a Google Sheet (`sheetsDestination`, service-account JWT signed with WebCrypto, header management, RAW writes with opt-in formula escaping, dedupe by response id) or a URL (`webhookDestination`, Standard Webhooks HMAC signing with a base64 `whsec_` secret, with `verifyWebhook` for receivers). Each `deliver` resolves a result that is `retryable` or permanent, with `retryAfterSeconds` and a message safe to store; nothing throws or logs, every request has a timeout, and secrets stay out of config. `responseRow` flattens a submission into labelled cells. Still no dependencies: fetch and WebCrypto only, so it runs on Node 20+, edge runtimes and Workers.
- 9453f10: **Breaking for conformance consumers: the shipped scenarios use neutral sample forms.** The `after-class` form is now `event-feedback` (hidden inputs `session` and `owner` instead of `class` and `coach`), and `monthly-pulse` is now `monthly-check-in`. The scenario files are renamed to match (`conformance/event-feedback-*.scenario.json`, `conformance/monthly-check-in-*.scenario.json`; `…-server-ignores-a-client-sent-coach` is now `…-server-ignores-a-client-sent-owner`). Each scenario covers the same logic as before; only ids, keys and copy changed. If you load the files by name, update the names.
- 9453f10: Four built-in structured field types, for questions that collect more than one value:

  - `list`: several short answers, `string[]` (goals, action items, three wins this week). Supports `contains`. Builder `f.list`.
  - `table`: rows with fixed columns, up to `MAX_TABLE_COLUMNS` (6) text columns, `Record<string, string>[]` (an action plan with What / Who / By when, pros and cons). Builder `f.table`.
  - `media-notes`: notes pinned to moments of a video or audio, `{ at, text }[]` with `at` in seconds (lecture notes, reviewing a recorded call). Builder `f.mediaNotes`.
  - `text-highlights`: notes on passages of a text, `{ start, end, quote, note }[]` (annotating an article, a policy or a contract). Every highlight needs a note, and quotes are at most `MAX_HIGHLIGHT_QUOTE_LENGTH` (2000) characters. Builder `f.textHighlights`.

  Each validates, normalizes (trimmed, blanks dropped, notes in time order), summarizes and has samples for `coverage()`; `parseForm` checks their props. New helpers `formatTimestamp`, `parseTimestamp`, `tableColumns`, `tableLimits` and `listLimits`, the `STRUCTURED_FIELD_TYPES` list, and the `TableColumn`, `MediaNote` and `Highlight` types.

## 0.2.0

### Minor Changes

- 46d6f5e: Review fixes for the forms packages.

  - `genesis-forms`: hidden inputs take `identifying: true` (`f.hidden.string({ identifying: true })`); on an anonymous form `validateSubmission` leaves them out of the stored `hidden` and `context`. `parseForm` warns when a comparison literal can never match (wrong type for the field or hidden input, not one of a choice's options, `in` without a list), and rejects a rating `props.max` outside 2 to 10 and a `maxLength` that is not a whole number above 0. Empty answers (blank text, `""`, `[]`) are no longer stored, and a cleared field is left out of `answers()` rather than sent empty: replace a saved draft with it, don't merge into it. `ignored` lists each key once. Number hidden inputs accept only plain decimals such as `-3` or `0.5` (no longer `" 12 "`, `"0x1A"`, `"1e3"`, `"+5"` or `".5"`). Recall tokens in endings and the introduction that name nothing are warned about. Optional options of `createForm`, `validateSubmission` and the field builders accept `undefined` under `exactOptionalPropertyTypes`.
  - `genesis-forms-react`, `genesis-forms-web`: optional hook options and `<Form>` props accept `undefined` under `exactOptionalPropertyTypes`. `onChange`'s docs say it fires on every state change.
  - `genesis-forms-devtools`: identifying fields and hidden inputs are masked like sensitive ones, in share links and in the State and Timeline panels.
  - Peer ranges on other forms packages are now `>=0.1.1 <1.0.0` (on `genesis-forms`) and `>=0.1.0 <1.0.0` (on `-react`), so a minor `genesis-forms` release no longer forces dependents to `1.0.0`.

## 0.1.1

### Patch Changes

- ef7eb56: `f.hidden.string/number/boolean` now type `sensitive` as `sensitive?: true`, not `sensitive?: true | undefined`, so their specs type-check in `defineForm({ hidden })` under `exactOptionalPropertyTypes`. The build also compiles a consumer file against the published types with that flag on.

## 0.1.0

### Minor Changes

Genesis Forms R1. New packages:

- `@marktiderman/genesis-forms` — the zero-dependency engine: a serializable form definition, `defineForm` with inferred answer types, `parseForm`, show/hide and jump logic with a path derived from answers, recall with fallbacks, typed hidden inputs (`url`, `host`, `server`), an event log with `replay`, eight field types, and `/server` `validateSubmission` for server-side checking.
- `@marktiderman/genesis-forms` also ships `explain` ("why is this hidden?" traces for devtools), and in `/testing`: `coverage` (symbolic path enumeration: unreachable blocks, rules that never fire, endings with witnesses), versioned JSON scenarios (`runScenario`, `recordScenario`, `compactEvents`) and an R1 conformance suite at `@marktiderman/genesis-forms/conformance/*.scenario.json`. Failed Next/Submit attempts are logged in the event log, and a completed response is final.
- `@marktiderman/genesis-forms-react` — `useForm`, `useField` (one-field re-renders), a ranked renderer registry and a headless `FormRuntime`.
- `@marktiderman/genesis-forms-web` — `<Form>` with focus (one question at a time) and classic layouts on Genesis UI, accessible by default, with `slots`/`slotProps`. `presentation="page"` is the full-screen respondent view (Typeform style in focus layout, Google Forms style in classic), with an optional `brand` (logo and name) and `useFormPresentation()` for custom slots and renderers.

- `@marktiderman/genesis-forms-devtools` — an inspector with live state, a time-travel event timeline, a server-check panel with tamper mode, and share links in the URL hash.

The umbrella adds `/forms`, `/forms/server`, `/forms/react` and `/forms/web`.
