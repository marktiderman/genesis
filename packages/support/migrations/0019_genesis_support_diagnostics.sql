-- @feat:support-feedback
-- Genesis support 0019: the context dump's table (after 0004_genesis_support_tickets.sql).
--
--   1. public.support_diagnostics: one row per dump (`genesis.diagnostics/1`, sent by
--      createDiagnostics from @marktiderman/genesis-support), linked to a ticket by
--      feedback_id when it came with feedback. An on-demand or shake dump has none, and one
--      ticket can have several. The id is made on the device, so the feedback can name its dump
--      before either is sent; short_id (the first 8 hex digits, upper case) is what a person
--      quotes to support.
--   2. Who sees what: the person inserts and reads their own dumps, and may delete them; staff
--      (public.support_is_staff(), the app's own tenant's agents and the staff hook) read every
--      dump. Nobody updates one. A dump links only to the sender's own ticket.
--   3. Size: the report is JSON, at most 512 KB as text (the client caps it to 256 KB first).
--   4. Rate: 10 dumps an hour per person, counted in private.support_rate_events (kind
--      'diagnostics'), refused with GS429 like reports and replies.
--   5. Lookups by short id, for staff: public.support_diagnostics_by_short_id(short) lists every
--      dump with that short id with its owner and time. A short id is 8 hex digits of an id the
--      device makes, so two dumps can share one (by chance, or because someone chose an id): staff
--      see whose each is rather than trusting the first.
--   6. public.support_ticket_tenant_allowed(person, tenant), for a server writing a ticket with the
--      service role (genesis-support/server's Supabase store): the tickets trigger checks the
--      tenant only when a person is signed in, so the server asks this first. True for the app's
--      own tenant (or none); otherwise the person must belong to the tenant and its help desk be on.
--   7. Retention: public.support_purge_diagnostics(older_than, max_rows) deletes dumps older than
--      90 days by default, a bounded batch per call, for the service role. The
--      genesis-support-cleanup function calls it on its schedule; or schedule it with pg_cron:
--        select cron.schedule('genesis-support-diagnostics', '17 3 * * *',
--          $$select public.support_purge_diagnostics()$$);
--   A dump goes with its person (on delete cascade); deleting a ticket keeps its dumps, unlinked.
--
-- Privacy: a dump holds no email, name or token (the client and the server scrub it; the person
-- is an id and a role). Screenshots never travel in a dump: they stay on the ticket, opt-in.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0019_genesis_support_diagnostics.test.sql`).

create schema if not exists private;

-- 1. The table ----------------------------------------------------------------------------------

create table public.support_diagnostics (
  id uuid primary key default gen_random_uuid(),
  short_id text generated always as (upper(left(replace(id::text, '-', ''), 8))) stored,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feedback_id uuid references public.tickets (id) on delete set null,
  trigger text not null
    constraint support_diagnostics_trigger check (trigger in ('manual', 'shake', 'feedback', 'crash')),
  app_version text
    constraint support_diagnostics_app_version_length check (char_length(app_version) <= 200),
  platform text
    constraint support_diagnostics_platform_length check (char_length(platform) <= 40),
  report jsonb not null
    constraint support_diagnostics_report_shape check (
      jsonb_typeof(report) = 'object'
      and report ->> 'schema' = 'genesis.diagnostics/1'
      and octet_length(report::text) <= 524288
    )
);

create index support_diagnostics_user on public.support_diagnostics (user_id, created_at desc);
create index support_diagnostics_feedback on public.support_diagnostics (feedback_id) where feedback_id is not null;
create index support_diagnostics_short_id on public.support_diagnostics (short_id);
create index support_diagnostics_created on public.support_diagnostics (created_at);

comment on table public.support_diagnostics is
  'Context dumps (genesis.diagnostics/1) a person sent, linked to a ticket when they came with feedback. Their own; staff read all. Genesis support.';

-- A new dump: the sender's own (the session's, unless the service role writes for someone),
-- stamped now, linked only to the sender's own ticket, and at most 10 an hour.
create or replace function private.genesis_support_new_diagnostics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.user_id is null then
    raise exception 'support_diagnostics: no person' using errcode = '42501';
  end if;
  new.created_at := now();
  if new.feedback_id is not null
     and not exists (select 1 from public.tickets t where t.id = new.feedback_id and t.user_id = new.user_id) then
    raise exception 'support_diagnostics: not your report' using errcode = '42501';
  end if;
  perform private.genesis_support_rate_limit(new.user_id, 'diagnostics', 10, interval '1 hour');
  return new;
end;
$$;

create trigger genesis_support_new_diagnostics
  before insert on public.support_diagnostics
  for each row execute function private.genesis_support_new_diagnostics();

revoke execute on function private.genesis_support_new_diagnostics() from public, anon, authenticated;

-- 2. Row level security -------------------------------------------------------------------------

alter table public.support_diagnostics enable row level security;

create policy support_diagnostics_insert_own on public.support_diagnostics
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy support_diagnostics_read on public.support_diagnostics
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.support_is_staff()));
create policy support_diagnostics_delete_own on public.support_diagnostics
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.support_diagnostics from public, anon, authenticated;
grant select on table public.support_diagnostics to authenticated;
grant insert (id, feedback_id, trigger, app_version, platform, report) on table public.support_diagnostics to authenticated;
grant delete on table public.support_diagnostics to authenticated;

revoke all on table public.support_diagnostics from service_role;
grant select, insert, delete on table public.support_diagnostics to service_role;

-- 3. Retention ----------------------------------------------------------------------------------

-- Deletes dumps older than `older_than` (default 90 days), at most `max_rows` (1 to 10000) per
-- call, oldest first; returns how many went. Service role only.
create or replace function public.support_purge_diagnostics(older_than interval default interval '90 days', max_rows integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if older_than is null or older_than < interval '1 day' then
    raise exception 'support_purge_diagnostics: keep dumps at least a day' using errcode = '22023';
  end if;
  with doomed as (
    select d.id from public.support_diagnostics d
    where d.created_at < now() - older_than
    order by d.created_at
    limit greatest(1, least(coalesce(max_rows, 1000), 10000))
  )
  delete from public.support_diagnostics d using doomed where d.id = doomed.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.support_purge_diagnostics(interval, integer) is
  'Deletes context dumps older than older_than (default 90 days), a batch at a time. Service role only. Genesis support.';

revoke execute on function public.support_purge_diagnostics(interval, integer) from public, anon, authenticated;
grant execute on function public.support_purge_diagnostics(interval, integer) to service_role;

-- 4. Staff lookups by short id ----------------------------------------------------------------

create or replace function public.support_diagnostics_by_short_id(short text)
returns table (id uuid, short_id text, user_id uuid, created_at timestamptz, trigger text, feedback_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.short_id, d.user_id, d.created_at, d.trigger, d.feedback_id
  from public.support_diagnostics d
  where d.short_id = upper(btrim(short))
    and (public.support_is_staff() or auth.role() = 'service_role')
  order by d.created_at desc
  limit 20
$$;

comment on function public.support_diagnostics_by_short_id(text) is
  'Staff: every dump with this short id, with its owner and time (short ids can repeat). Genesis support.';

revoke execute on function public.support_diagnostics_by_short_id(text) from public, anon;
grant execute on function public.support_diagnostics_by_short_id(text) to authenticated, service_role;

-- 5. The tenant check for service-role writes -------------------------------------------------

create or replace function public.support_ticket_tenant_allowed(person uuid, tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select tenant is null
    or tenant is not distinct from private.genesis_support_default_tenant_id()
    or (person is not null
        and exists (select 1 from private.genesis_support_tenants_of(person) v where v.tenant_id = tenant)
        and private.genesis_support_helpdesk_on(tenant))
$$;

comment on function public.support_ticket_tenant_allowed(uuid, uuid) is
  'Whether a ticket for this person may go to this tenant (the app''s own, or one they belong to with its help desk on). Service role only. Genesis support.';

revoke execute on function public.support_ticket_tenant_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_ticket_tenant_allowed(uuid, uuid) to service_role;
