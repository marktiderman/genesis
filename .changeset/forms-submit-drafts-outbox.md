---
"@marktiderman/genesis-forms": minor
---

The submit contract, drafts and the offline outbox.

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
