---
"@marktiderman/genesis-supabase": minor
---

New `/runner` entry: `createRunner`, the outbox engine that used to live in genesis-notifications. It claims a batch of jobs, sends them in groups, records each outcome (`sent`, `filtered`, `skipped`, `retry` with jittered backoff or a Retry-After deferral up to `maxDeferrals`, `failed`, with `disable` on a 410) and never throws for one job. It has no dependencies and no Node built-ins, so other packages can bundle it. It also exports `jobOutcome`, `failureOf`, `defaultBackoff` and the defaults (`DEFAULT_MAX_ATTEMPTS` 8, `DEFAULT_MAX_DEFERRALS` 24, `DEFAULT_BATCH_SIZE` 25), all unchanged. It gains one option, `concurrency`: how many groups are sent at once. Without it, every group is sent at once, as before.

`runJobs` in `/jobs` now runs on this engine. It behaves exactly as before: the same claim and settle calls, at most `concurrency` handlers at once (default 4), the queue still decides attempts and retry times, and a settle that fails is counted as `unsettled` without stopping the run. Signed job calls and `genesis-job:` schedule names are unchanged, and there is no new migration.
