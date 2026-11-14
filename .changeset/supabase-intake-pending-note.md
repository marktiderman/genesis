---
"@marktiderman/genesis-supabase": patch
---

**`pending` is a new status on the support intake function's wire contract, and it can break code that reads statuses.** `FeedbackStatus` and `FEEDBACK_STATUSES` in `functions/genesis-support-intake/contract.ts` now include `pending` (waiting on the requester). Handle it wherever you read a status: a `switch` with a `never` check stops typechecking (add a case); a `switch` with a `default` quietly puts `pending` in the default bucket; a `Record<FeedbackStatus, …>` needs a `pending` key; code that iterates `FEEDBACK_STATUSES` gets it too; and SQL of your own that checks `status` now meets `pending` rows. It is neither active nor closed.
