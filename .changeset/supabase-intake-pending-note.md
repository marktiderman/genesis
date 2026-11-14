---
"@marktiderman/genesis-supabase": patch
---

**In 0.15.0, `FeedbackStatus` gained `pending`** (waiting on the requester) on the support intake function's wire contract (`FeedbackStatus` and `FEEDBACK_STATUSES` in `functions/genesis-support-intake/contract.ts`), and that release didn't say it can break code that reads statuses. If you've upgraded to 0.15.0 or later, handle it wherever you read a status: a `switch` with a `never` check stops typechecking (add a case); a `switch` with a `default` quietly puts `pending` in the default bucket (add a case); a `Record<FeedbackStatus, …>` map needs a `pending` key; code that iterates `FEEDBACK_STATUSES` gets it too; and SQL of your own that checks `status` now meets `pending` rows. It is neither active nor closed.
