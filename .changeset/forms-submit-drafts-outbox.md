---
"@marktiderman/genesis-forms": minor
---

The submit contract, drafts and the offline outbox.

- `genesis-forms/server`: `submitResponse(input, { definition, store, hostOptions?, context?, formId?, version?, open?, rateLimit?, uploads?, ... })`
  checks a submission again (`validateSubmission`, then `checkUploads`), snapshots the options
  picked (`answerSnapshots`) and stores it once per idempotency key through the app's
  `SubmissionStore` (`save`, optional `find`). It answers a `SubmitResult`: `ok` with the id and
  `receivedAt`, or `invalid`, `duplicate`, `closed`, `rate_limited` or `store_failed`. A key reused
  for other answers is `invalid` (the record keeps an `inputHash`). Also `SubmissionRecord`,
  `StoredSubmissionRef` and `SubmitResponseOptions`.
- `genesis-forms` (and `/server`): the wire types `SubmitRequest` (a `SubmissionInput` plus
  `idempotencyKey` and `clientSubmittedAt`), `SubmitResult`, `SubmitFailureReason`, and
  `isIdempotencyKey`, `isSubmitResult` and `submitOutcome` (delivered, retry or rejected).
- `genesis-forms`: drafts, with `DraftStore`, `createDraftStore(storage)`, `draftOf`,
  `restoreDraft` (refuses the whole draft when a new version no longer fits it, or it is older than
  30 days) and `createDraftAutosave` (debounced, in order, never throws; sensitive answers left out
  by default).
- `genesis-forms`: `createSubmitOutbox({ storage, send, ... })`, which queues submissions with an
  idempotency key, keeps them across restarts, sends them when online with backoff and a timeout,
  and keeps refused or exhausted ones as `failed` until `retry` or `discard`.
- `genesis-forms`: `KeyValueStorage` (the shape of `localStorage` and AsyncStorage),
  `memoryStorage()` and `webStorage()`.

Features: forms-submit, forms-drafts, forms-outbox
