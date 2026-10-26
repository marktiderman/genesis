-- @feat:jobs
-- pgTAP test for 0007_genesis_jobs.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own jobs and rolls everything back. The schedule checks run when pg_cron
-- is installed and pass as skipped when it isn't.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Access: only the service role reaches the queue, and only through the functions.
select ok(not has_function_privilege('anon', 'public.genesis_job_enqueue(text, jsonb, timestamptz, text, integer)', 'execute'), 'anon cannot enqueue');
select ok(not has_function_privilege('authenticated', 'public.genesis_job_enqueue(text, jsonb, timestamptz, text, integer)', 'execute'), 'authenticated cannot enqueue');
select ok(not has_function_privilege('authenticated', 'public.genesis_jobs_claim(text[], integer, integer)', 'execute'), 'authenticated cannot claim');
select ok(not has_function_privilege('authenticated', 'public.genesis_jobs_settle(uuid, uuid, text, integer, text)', 'execute'), 'authenticated cannot settle');
select ok(not has_function_privilege('authenticated', 'public.genesis_schedule_job(text, text, text)', 'execute'), 'authenticated cannot schedule');
select ok(not has_function_privilege('authenticated', 'private.genesis_jobs_call(text)', 'execute'), 'authenticated cannot call a job route');
select ok(has_function_privilege('service_role', 'public.genesis_jobs_claim(text[], integer, integer)', 'execute'), 'service_role claims');
select ok(not has_table_privilege('authenticated', 'private.genesis_jobs', 'select'), 'authenticated cannot read the queue');
select ok((select relrowsecurity from pg_class where oid = 'private.genesis_jobs'::regclass), 'the queue has row level security on');

-- Start from an empty queue so other jobs in the app's database don't change the counts.
create temp table saved_jobs as select * from private.genesis_jobs;
delete from private.genesis_jobs;

-- Enqueue.
select throws_ok($$ select public.genesis_job_enqueue('Bad Kind') $$, '23514', null, 'a kind is lowercase');
select throws_ok($$ select public.genesis_job_enqueue('test.a', '[1]'::jsonb) $$, '22023', null, 'a payload is an object');

create temp table ids (name text primary key, id uuid);
insert into ids values ('a1', public.genesis_job_enqueue('test.a', '{"n": 1}'));
insert into ids values ('a2', public.genesis_job_enqueue('test.a', '{"n": 2}', p_idempotency_key => 'k'));
select is(public.genesis_job_enqueue('test.a', '{"n": 3}', p_idempotency_key => 'k'), (select id from ids where name = 'a2'),
  'an enqueue with a queued key returns the queued job');
select isnt(public.genesis_job_enqueue('test.b', '{}', p_idempotency_key => 'k'), (select id from ids where name = 'a2'),
  'the same key on another kind is another job');
insert into ids values ('later', public.genesis_job_enqueue('test.a', '{}', now() + interval '1 hour'));
select is((select count(*)::int from private.genesis_jobs), 4, 'four jobs queued');

-- Claim.
select throws_ok($$ select * from public.genesis_jobs_claim(null, 0) $$, '22023', null, 'a claim takes 1 or more');
create temp table claim1 as select * from public.genesis_jobs_claim(array['test.a'], 10, 60);
select is((select count(*)::int from claim1), 2, 'a claim hands out the due jobs of its kinds, not the future one');
select ok((select bool_and(attempt = 1 and not redelivery) from claim1), 'first attempts, not redeliveries');
select is((select count(distinct claim_id)::int from claim1), 1, 'one claim id for the batch');
select is((select count(*)::int from public.genesis_jobs_claim(array['test.a'], 10, 60)), 0, 'leased jobs are not handed out again');
select is((select count(*)::int from public.genesis_jobs_claim(null, 10, 60)), 1, 'no kinds claims every kind (test.b)');

-- Settle.
select ok(public.genesis_jobs_settle((select id from ids where name = 'a1'), (select claim_id from claim1 limit 1), 'done'), 'done settles');
select is((select status from private.genesis_jobs where id = (select id from ids where name = 'a1')), 'done', 'the job is done');
select ok(not public.genesis_jobs_settle((select id from ids where name = 'a1'), (select claim_id from claim1 limit 1), 'done'), 'settling twice is stale');
select ok(not public.genesis_jobs_settle((select id from ids where name = 'a2'), gen_random_uuid(), 'done'), 'another claim id is stale');
select throws_ok(format('select public.genesis_jobs_settle(%L, %L, %L)', (select id from ids where name = 'a2'), (select claim_id from claim1 limit 1), 'retry'),
  '22023', null, 'a retry needs a delay');
select ok(public.genesis_jobs_settle((select id from ids where name = 'a2'), (select claim_id from claim1 limit 1), 'retry', 0, 'timeout'), 'retry settles');
select is((select status || ':' || last_error from private.genesis_jobs where id = (select id from ids where name = 'a2')), 'pending:timeout', 'a retry is pending again with its error');
select ok(public.genesis_job_enqueue('test.a', '{}', p_idempotency_key => 'k') = (select id from ids where name = 'a2'), 'a retrying job still holds its key');

-- Out of attempts: a retry on the last attempt fails.
update private.genesis_jobs set max_attempts = 2 where id = (select id from ids where name = 'a2');
create temp table claim2 as select * from public.genesis_jobs_claim(array['test.a'], 10, 60);
select is((select attempt from claim2 where id = (select id from ids where name = 'a2')), 2, 'the second attempt');
select ok(public.genesis_jobs_settle((select id from ids where name = 'a2'), (select claim_id from claim2 limit 1), 'retry', 0, 'timeout again'), 'the last retry settles');
select is((select status from private.genesis_jobs where id = (select id from ids where name = 'a2')), 'failed', 'out of attempts, it fails');
select isnt(public.genesis_job_enqueue('test.a', '{}', p_idempotency_key => 'k'), (select id from ids where name = 'a2'), 'a failed job frees its key');

-- Lease expiry: redelivered, then failed as lease_expired when out of attempts.
delete from private.genesis_jobs;
insert into ids values ('lease', public.genesis_job_enqueue('test.lease', '{}', p_max_attempts => 2));
select is((select count(*)::int from public.genesis_jobs_claim(array['test.lease'], 1, 60)), 1, 'the first attempt is claimed');
update private.genesis_jobs set lease_until = now() - interval '1 second' where id = (select id from ids where name = 'lease');
select is((select redelivery from public.genesis_jobs_claim(array['test.lease'], 1, 60)), true, 'a job whose lease ran out comes back as a redelivery');
update private.genesis_jobs set lease_until = now() - interval '1 second' where id = (select id from ids where name = 'lease');
select is((select count(*)::int from public.genesis_jobs_claim(array['test.lease'], 1, 60)), 0, 'out of attempts with the lease gone, it is not handed out');
select is((select status || ':' || last_error from private.genesis_jobs where id = (select id from ids where name = 'lease')), 'failed:lease_expired', 'it fails as lease_expired');

-- Cancel and purge.
insert into ids values ('cancel', public.genesis_job_enqueue('test.c', '{}'));
select ok(public.genesis_job_cancel((select id from ids where name = 'cancel')), 'a pending job cancels');
update private.genesis_jobs set finished_at = now() - interval '30 days';
select is(private.genesis_jobs_purge(), 2, 'finished jobs older than 14 days are purged');

-- Schedules. cron.job is read through a function so this file parses without pg_cron.
create function pg_temp.cron_has(p_name text) returns boolean language plpgsql as $$
declare found boolean;
begin
  execute 'select exists (select 1 from cron.job where jobname = $1)' into found using p_name;
  return found;
end $$;
select throws_ok($$ select public.genesis_schedule_job('Bad Name', '* * * * *', 'x') $$, '22023', null, 'a schedule name is lowercase');
select throws_ok($$ select private.genesis_jobs_call('../admin') $$, '22023', null, 'a job name is never a path');
select case when to_regnamespace('cron') is null
  then skip('pg_cron is not installed', 1)
  else ok(public.genesis_schedule_job('genesis-jobs-test', '*/5 * * * *', 'digests') > 0, 'schedules through pg_cron') end;
select case when to_regnamespace('cron') is null
  then skip('pg_cron is not installed', 1)
  else ok(pg_temp.cron_has('genesis-job:genesis-jobs-test'), 'a schedule is the cron job genesis-job:<name>') end;
create temp table unscheduled as select case when to_regnamespace('cron') is null then null else public.genesis_unschedule_job('genesis-jobs-test') end as removed;
select case when to_regnamespace('cron') is null
  then skip('pg_cron is not installed', 1)
  else ok((select removed from unscheduled)
          and not pg_temp.cron_has('genesis-job:genesis-jobs-test'), 'unschedules it') end;
select case when to_regnamespace('cron') is null
  then skip('pg_cron is not installed', 1)
  else ok(not public.genesis_unschedule_job('genesis-jobs-purge'), 'never touches a cron job it did not make') end;

-- A call is signed, never carrying the secret. Needs Vault, pg_net and pgcrypto; skipped without.
-- pg_net's queue, read through a function so this file parses without pg_net.
create function pg_temp.last_call_signed() returns boolean language plpgsql as $$
declare ok boolean;
begin
  execute $q$select url = 'http://127.0.0.1:9/api/jobs/digests'
                and headers->>'Authorization' ~ '^GenesisJob t=[0-9]+,sig=[0-9a-f]{64}$'
                and headers::text !~ 'genesis-test-secret'
           from net.http_request_queue order by id desc limit 1$q$ into ok;
  return ok;
end $$;
create temp table call_ready as select to_regclass('vault.secrets') is not null and to_regnamespace('net') is not null
  and to_regprocedure('extensions.hmac(text, text, text)') is not null as ready;
select case when not (select ready from call_ready)
  then skip('Vault, pg_net or pgcrypto is not installed', 1)
  else lives_ok($$ select vault.create_secret('http://127.0.0.1:9/api/jobs/', 'genesis_jobs_url'), vault.create_secret('genesis-test-secret', 'genesis_jobs_secret'), private.genesis_jobs_call('digests') $$, 'a call queues a request') end;
select case when not (select ready from call_ready)
  then skip('Vault, pg_net or pgcrypto is not installed', 1)
  else ok(pg_temp.last_call_signed(), 'posts to <url>/<job>, signed, with no secret in the queue') end;

insert into private.genesis_jobs select * from saved_jobs;
select * from finish();
rollback;
