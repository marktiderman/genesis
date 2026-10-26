---
"@marktiderman/genesis-supabase": minor
---

Background jobs: `migrations/0007_genesis_jobs.sql` and `@marktiderman/genesis-supabase/jobs`.

- **Queue.** `genesis_jobs` takes:
  - enqueues with an idempotency key;
  - claims with `SKIP LOCKED` and leases (a lease that runs out redelivers the job; a job that keeps dying fails as `lease_expired`);
  - settles (done, retry, failed);
  - cancel and a 14-day purge.
- **Schedules.** `genesis_schedule_job(name, cron, job)` calls the app's job route through pg_cron and pg_net, with the URL and the secret read from Vault each time. Each request is signed for its job, and never carries the secret. Schedules are cron jobs named `genesis-job:<name>`.
- **Server.** `enqueueJob`, `runJobs` (handlers by kind, jittered backoff, `PermanentJobError`; never throws for one job or for a failed settle), `createJobsHandler` (one route; requests signed per job for five minutes, or the bearer secret; the previous secret is accepted during a rotation) and `signJobRequest`.
- **Block.** `jobsBlock`.
