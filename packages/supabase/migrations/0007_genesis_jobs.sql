-- Genesis jobs: one background-job queue and one way to schedule work.
--
-- Two halves:
--
-- 1. A queue, private.genesis_jobs. Code (a trigger, a server function, the app) enqueues a job
--    of a kind with a JSON payload; a runner claims due jobs with SKIP LOCKED, each leased to a
--    claim id, does the work and settles each one: done, retry later, or failed. A job whose
--    lease runs out comes back as a redelivery; one that keeps dying fails as lease_expired.
--    An idempotency key makes an enqueue that repeats (a retried trigger, a double click) one job.
--    The runner half is `runJobs` in @marktiderman/genesis-supabase/jobs.
--
-- 2. Schedules. genesis_schedule_job(name, cron, job) asks pg_cron to POST to the app's job route
--    (`<url>/<job>`) through pg_net, with the bearer secret the route checks. The URL and the
--    secret are read from Vault by name at call time, never stored in cron's table:
--
--      select vault.create_secret('https://app.example.com/api/jobs', 'genesis_jobs_url');
--      select vault.create_secret('<a long random secret>', 'genesis_jobs_secret');
--      select genesis_schedule_job('send-digests', '*/5 * * * *', 'digests');
--
--    The app's route is `createJobsHandler` in @marktiderman/genesis-supabase/jobs, which
--    checks the same secret (and a previous one while you rotate it). pg_cron and pg_net are
--    only needed for schedules: the queue works without them.
--
-- Access: the queue has row level security on, no policies and no grants to anon or
-- authenticated. Everything goes through the functions below, granted by name to service_role
-- only (a server job, a trigger running as its owner). Payloads never hold secrets: they are
-- readable by anyone with the service role.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
-- It stands alone.
--
-- Verify: the pgTAP test beside this file (`tests/0007_genesis_jobs.test.sql`).

create schema if not exists private;

create table private.genesis_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint genesis_jobs_kind_format check (kind ~ '^[a-z][a-z0-9]*([-_.:][a-z0-9]+)*$' and char_length(kind) <= 100),
  payload jsonb not null default '{}'::jsonb,
  -- One job per (kind, key) while it is queued or running: a second enqueue returns the first.
  idempotency_key text
    constraint genesis_jobs_idempotency_key_length check (char_length(idempotency_key) between 1 and 200),
  status text not null default 'pending'
    constraint genesis_jobs_status check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  run_after timestamptz not null default now(),
  -- Attempts started (claims), including redeliveries.
  attempts integer not null default 0,
  max_attempts integer not null default 8
    constraint genesis_jobs_max_attempts check (max_attempts between 1 and 100),
  lease_until timestamptz,
  -- The claim this job is leased to; settling with another one is stale.
  claim_id uuid,
  last_error text
    constraint genesis_jobs_last_error_length check (char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index genesis_jobs_idempotency on private.genesis_jobs (kind, idempotency_key)
  where idempotency_key is not null and status in ('pending', 'running');
create index genesis_jobs_due on private.genesis_jobs (run_after) where status = 'pending';
create index genesis_jobs_leased on private.genesis_jobs (lease_until) where status = 'running';
create index genesis_jobs_finished on private.genesis_jobs (finished_at) where finished_at is not null;

alter table private.genesis_jobs enable row level security;
revoke all on table private.genesis_jobs from public, anon, authenticated;

-- Queues one job and returns its id. With an idempotency key, a job of the same kind and key
-- that is still pending or running is returned instead of a new one.
create function public.genesis_job_enqueue(
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_run_after timestamptz default null,
  p_idempotency_key text default null,
  p_max_attempts integer default 8
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job uuid;
begin
  if p_kind is null then
    raise exception 'genesis_job_enqueue: kind is required' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'genesis_job_enqueue: payload is a JSON object' using errcode = '22023';
  end if;
  if p_idempotency_key is not null then
    select j.id into job from private.genesis_jobs j
    where j.kind = p_kind and j.idempotency_key = p_idempotency_key and j.status in ('pending', 'running');
    if found then
      return job;
    end if;
  end if;
  begin
    insert into private.genesis_jobs (kind, payload, run_after, idempotency_key, max_attempts)
    values (p_kind, p_payload, coalesce(p_run_after, now()), p_idempotency_key, coalesce(p_max_attempts, 8))
    returning id into job;
  exception when unique_violation then
    -- Two enqueues with one key raced; the other one won.
    select j.id into job from private.genesis_jobs j
    where j.kind = p_kind and j.idempotency_key = p_idempotency_key and j.status in ('pending', 'running');
  end;
  return job;
end $$;

-- Hands out up to p_limit due jobs of the given kinds (all kinds when null), oldest first, each
-- leased for p_lease_seconds to one new claim id. Due: pending and past run_after, or running
-- with a lease that ran out (`redelivery`: the last attempt may have done the work). A job whose
-- lease ran out on its last attempt fails as lease_expired instead of coming back for ever.
create function public.genesis_jobs_claim(
  p_kinds text[] default null,
  p_limit integer default 25,
  p_lease_seconds integer default 300
) returns table (id uuid, kind text, payload jsonb, attempt integer, redelivery boolean, claim_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  claim uuid := gen_random_uuid();
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'genesis_jobs_claim: limit is 1 to 1000' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then
    raise exception 'genesis_jobs_claim: lease is 1 to 3600 seconds' using errcode = '22023';
  end if;

  -- Out of attempts with the lease gone: the runner died with it every time.
  update private.genesis_jobs j
  set status = 'failed', last_error = 'lease_expired', lease_until = null, claim_id = null,
      finished_at = now(), updated_at = now()
  where j.status = 'running' and j.lease_until < now() and j.attempts >= j.max_attempts
    and (p_kinds is null or j.kind = any (p_kinds));

  return query
  with due as (
    select j.id, j.status = 'running' as redelivery
    from private.genesis_jobs j
    where ((j.status = 'pending' and j.run_after <= now()) or (j.status = 'running' and j.lease_until < now()))
      and (p_kinds is null or j.kind = any (p_kinds))
    order by j.run_after, j.created_at
    limit p_limit
    for update skip locked
  )
  update private.genesis_jobs j
  set status = 'running', attempts = j.attempts + 1, lease_until = now() + make_interval(secs => p_lease_seconds),
      claim_id = claim, updated_at = now()
  from due
  where j.id = due.id
  returning j.id, j.kind, j.payload, j.attempts, due.redelivery, j.claim_id;
end $$;

-- Records what happened to a claimed job. p_outcome: 'done'; 'retry' (back to pending after
-- p_retry_after_seconds, or failed when out of attempts); 'failed' (permanent). Returns false,
-- changing nothing, when the claim is stale (the lease ran out and the job was claimed again).
create function public.genesis_jobs_settle(
  p_id uuid,
  p_claim_id uuid,
  p_outcome text,
  p_retry_after_seconds integer default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  j private.genesis_jobs;
begin
  if p_outcome is null or p_outcome not in ('done', 'retry', 'failed') then
    raise exception 'genesis_jobs_settle: outcome is done, retry or failed' using errcode = '22023';
  end if;
  if p_outcome = 'retry' and (p_retry_after_seconds is null or p_retry_after_seconds not between 0 and 604800) then
    raise exception 'genesis_jobs_settle: a retry needs retry_after_seconds, 0 to 604800' using errcode = '22023';
  end if;

  select * into j from private.genesis_jobs x where x.id = p_id for update;
  if not found or j.status <> 'running' or j.claim_id is distinct from p_claim_id then
    return false;
  end if;

  if p_outcome = 'done' then
    update private.genesis_jobs x set status = 'done', last_error = null, lease_until = null, claim_id = null,
      finished_at = now(), updated_at = now() where x.id = p_id;
  elsif p_outcome = 'retry' and j.attempts < j.max_attempts then
    update private.genesis_jobs x set status = 'pending', last_error = left(p_error, 1000),
      run_after = now() + make_interval(secs => p_retry_after_seconds), lease_until = null, claim_id = null,
      updated_at = now() where x.id = p_id;
  else
    update private.genesis_jobs x set status = 'failed', last_error = left(coalesce(p_error, 'failed'), 1000),
      lease_until = null, claim_id = null, finished_at = now(), updated_at = now() where x.id = p_id;
  end if;
  return true;
end $$;

-- Cancels a job that hasn't run yet. A running job finishes its attempt; true when cancelled.
create function public.genesis_job_cancel(p_id uuid) returns boolean
language sql
security definer
set search_path = ''
as $$
  with cancelled as (
    update private.genesis_jobs j set status = 'cancelled', finished_at = now(), updated_at = now()
    where j.id = p_id and j.status = 'pending'
    returning 1
  )
  select exists (select 1 from cancelled)
$$;

-- Deletes finished jobs (done, failed, cancelled) older than p_keep. Scheduled below when pg_cron
-- is there; returns how many went.
create function private.genesis_jobs_purge(p_keep interval default interval '14 days') returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.genesis_jobs j
    where j.status in ('done', 'failed', 'cancelled') and j.finished_at < now() - p_keep
    returning 1
  )
  select count(*)::integer from gone
$$;

-- POSTs {"job": p_job} to <genesis_jobs_url>/<p_job> with the bearer genesis_jobs_secret, both
-- read from Vault now. Returns pg_net's request id. What cron runs for each schedule.
create function private.genesis_jobs_call(p_job text) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
  request bigint;
begin
  if p_job is null or p_job !~ '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$' or char_length(p_job) > 100 then
    raise exception 'genesis_jobs_call: job is a lowercase name like "send-digests"' using errcode = '22023';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'genesis_jobs_call: Vault is not installed' using errcode = '55000';
  end if;
  if to_regnamespace('net') is null then
    raise exception 'genesis_jobs_call: pg_net is not installed (create extension pg_net)' using errcode = '55000';
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'genesis_jobs_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'genesis_jobs_secret';
  if base is null or secret is null then
    raise exception 'genesis_jobs_call: set the Vault secrets genesis_jobs_url and genesis_jobs_secret' using errcode = '55000';
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    into request
    using rtrim(base, '/') || '/' || p_job,
          jsonb_build_object('job', p_job),
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
  return request;
end $$;

-- Schedules (or reschedules) p_job on a cron schedule under the cron job name p_name. Returns
-- cron's job id.
create function public.genesis_schedule_job(p_name text, p_schedule text, p_job text) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scheduled bigint;
begin
  if p_name is null or p_name !~ '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$' or char_length(p_name) > 100 then
    raise exception 'genesis_schedule_job: name is a lowercase name like "send-digests"' using errcode = '22023';
  end if;
  if p_job is null or p_job !~ '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$' or char_length(p_job) > 100 then
    raise exception 'genesis_schedule_job: job is a lowercase name like "digests"' using errcode = '22023';
  end if;
  if to_regnamespace('cron') is null then
    raise exception 'genesis_schedule_job: pg_cron is not installed (create extension pg_cron)' using errcode = '55000';
  end if;
  execute 'select cron.schedule($1, $2, $3)' into scheduled
    using p_name, p_schedule, format('select private.genesis_jobs_call(%L)', p_job);
  return scheduled;
end $$;

-- Removes a schedule made by genesis_schedule_job. True when one was there.
create function public.genesis_unschedule_job(p_name text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed boolean := false;
begin
  if to_regnamespace('cron') is null then
    return false;
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into removed using p_name;
  if removed then
    execute 'select cron.unschedule($1)' using p_name;
  end if;
  return removed;
end $$;

revoke execute on function public.genesis_job_enqueue(text, jsonb, timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.genesis_jobs_claim(text[], integer, integer) from public, anon, authenticated;
revoke execute on function public.genesis_jobs_settle(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.genesis_job_cancel(uuid) from public, anon, authenticated;
revoke execute on function public.genesis_schedule_job(text, text, text) from public, anon, authenticated;
revoke execute on function public.genesis_unschedule_job(text) from public, anon, authenticated;
revoke execute on function private.genesis_jobs_purge(interval) from public, anon, authenticated;
revoke execute on function private.genesis_jobs_call(text) from public, anon, authenticated;

grant execute on function public.genesis_job_enqueue(text, jsonb, timestamptz, text, integer) to service_role;
grant execute on function public.genesis_jobs_claim(text[], integer, integer) to service_role;
grant execute on function public.genesis_jobs_settle(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.genesis_job_cancel(uuid) to service_role;
grant execute on function public.genesis_schedule_job(text, text, text) to service_role;
grant execute on function public.genesis_unschedule_job(text) to service_role;

-- Finished jobs go after 14 days, when pg_cron is there.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('genesis-jobs-purge', '20 4 * * *', 'select private.genesis_jobs_purge()');
  end if;
end $$;
