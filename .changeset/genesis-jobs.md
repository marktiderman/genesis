---
"@marktiderman/genesis-supabase": minor
---

Background jobs: `migrations/0007_genesis_jobs.sql` and `@marktiderman/genesis-supabase/jobs`.

- **Queue.** `genesis_jobs` takes:
  - enqueues with an idempotency key;
  - claims with `SKIP LOCKED` and leases (a lease that runs out redelivers the job; a job that keeps dying fails as `lease_expired`);
  - settles (done, retry, failed);
  - cancel and a 14-day purge.
- **Schedules.** `genesis_schedule_job(name, cron, job)` calls the app's job route through pg_cron and pg_net, with the URL and the bearer secret read from Vault each time.
- **Server.** `enqueueJob`, `runJobs` (handlers by kind, jittered backoff, `PermanentJobError`, never throws for one job) and `createJobsHandler` (one route, a constant-time bearer check that accepts the previous secret during a rotation).
- **Block.** `jobsBlock`.
