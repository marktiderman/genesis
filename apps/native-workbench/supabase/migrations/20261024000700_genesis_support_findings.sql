-- Genesis support findings: severity, the verify loop and report handlers
--
-- Part of the `support-feedback` block of `@marktiderman/genesis-support`. Apply it after
-- `0006_genesis_support.sql` from `@marktiderman/genesis-supabase` (`genesis add
-- support-feedback` orders them).
--
--   severity        low, medium, high or critical, as the person (or an agent) sent it, in its
--                   own column (the intake function also keeps it in `context`).
--   handlers        Besides support staff, the app may name who else handles a report: they read
--                   it and its screenshots, reply as support and set its status. The app's hook
--                   `private.genesis_support_report_handler(report uuid, person uuid)` returns
--                   boolean; it is optional, and without it only staff handle reports. Handlers
--                   don't observe a report's support-chat thread (staff-only internal notes
--                   stay staff-only); their replies reach it as support.
--   verify loop     The person confirms a fix (verified_at) or reopens the report (back to
--                   in_progress, reopened_at) with support_verify_report. Marking a report
--                   addressed or wont_fix stamps resolved_at.
--   verify prompt   Off unless the app turns it on with its hook
--                   `private.genesis_support_verify_prompt_enabled()` returning true: then a
--                   report someone else marks addressed asks its person, in its thread, to check
--                   the fix (at most once an hour per report). That reply is the system's
--                   (support_replies.prompt = 'verify'): it doesn't count against anyone's reply
--                   limit. It is a staff reply, so it marks the report unread for its person,
--                   ends their editing, and with support-chat is pushed as the marker's message.
--                   If it can't be posted (a reply rule that refuses it, a limit), the status
--                   change still goes through without it.
--
-- The support-email block (`0002_genesis_support_email.sql`) also replaces
-- private.genesis_support_new_reply. This file's version keeps the email channel's rules when
-- that block is already installed; if support-email is added after this file, handlers can no
-- longer reply (status changes still work, without the prompt) until this file's
-- genesis_support_new_reply is applied again.
--
-- Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0003_genesis_support_findings.test.sql`).

create schema if not exists private;

alter table public.support_reports
  add column if not exists severity text constraint support_reports_severity check (severity in ('low', 'medium', 'high', 'critical')),
  add column if not exists resolved_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists reopened_at timestamptz;

comment on column public.support_reports.severity is
  'How bad it is, as the person sent it: low, medium, high or critical. Genesis support.';
comment on column public.support_reports.resolved_at is
  'When it was last marked addressed or wont_fix (cleared when it is reopened). Genesis support.';
comment on column public.support_reports.verified_at is
  'When its person confirmed the fix. Genesis support.';
comment on column public.support_reports.reopened_at is
  'When its person last said the fix did not work. Genesis support.';

-- The person sends it with the report.
grant insert (severity) on table public.support_reports to authenticated;

-- A reply the system posted, and which: only the database writes it (no column grant).
alter table public.support_replies
  add column if not exists prompt text constraint support_replies_prompt check (prompt in ('verify'));

comment on column public.support_replies.prompt is
  'Set on a reply the system posted: verify (asks the person to check a fix). Genesis support.';

-- Handlers ----------------------------------------------------------------------------

-- Staff, or whom the app's hook names for this report.
create or replace function private.genesis_support_handler(report uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if person is null or report is null then
    return false;
  end if;
  -- The staff hook is the app's (0006); without it, nobody is staff.
  if to_regprocedure('private.genesis_support_staff(uuid)') is not null then
    if coalesce(private.genesis_support_staff(person), false) then
      return true;
    end if;
  end if;
  if to_regprocedure('private.genesis_support_report_handler(uuid, uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_support_report_handler(report, person), false);
end;
$$;

revoke execute on function private.genesis_support_handler(uuid, uuid) from public, anon, authenticated;

-- Does the signed-in person handle this report? Policies and the client ask; it answers only
-- about the caller.
create or replace function public.support_handles(report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_support_handler(report, auth.uid())
$$;

comment on function public.support_handles(uuid) is
  'Whether the signed-in person handles this report (staff, or whom the app''s hook names). Genesis support.';
revoke execute on function public.support_handles(uuid) from public, anon;
grant execute on function public.support_handles(uuid) to authenticated;

drop policy if exists support_reports_read on public.support_reports;
create policy support_reports_read on public.support_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.support_is_staff()) or public.support_handles(id));

drop policy if exists support_attachments_read on public.support_attachments;
create policy support_attachments_read on public.support_attachments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.support_is_staff()) or public.support_handles(report_id));

drop policy if exists support_replies_read on public.support_replies;
create policy support_replies_read on public.support_replies
  for select to authenticated
  using (
    (select public.support_is_staff()) or public.support_handles(report_id)
    or exists (select 1 from public.support_reports r where r.id = report_id and r.user_id = (select auth.uid()))
  );
drop policy if exists support_replies_send on public.support_replies;
create policy support_replies_send on public.support_replies
  for insert to authenticated
  with check (
    (select public.support_is_staff()) or public.support_handles(report_id)
    or exists (select 1 from public.support_reports r where r.id = report_id and r.user_id = (select auth.uid()))
  );

-- Who wrote a reply, and whether as support, come from the session. A handler writes as support
-- on someone else's report. A reply the system posts (genesis_support_ask_to_verify, with
-- `prompt` set, which no person can write) isn't counted against the limit. With the support-email block installed, server code may write on
-- an email ticket and a ticket without a person takes support's replies only, as that block has it.
create or replace function private.genesis_support_new_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  report public.support_reports;
  handles boolean;
begin
  select * into report from public.support_reports r where r.id = new.report_id;
  if report.id is null then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  if me is null then
    -- Server code (anon has no right on this table): only on an email ticket (support-email).
    if coalesce(to_jsonb(report) ->> 'channel', '') <> 'email' then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := null;
    new.created_at := clock_timestamp();
    return new;
  end if;
  handles := private.genesis_support_handler(new.report_id, me);
  if report.user_id is null then
    if not handles then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    new.from_staff := true;
  else
    if report.user_id <> me and not handles then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    -- On their own report a staff member writes as the person.
    new.from_staff := handles and report.user_id <> me;
  end if;
  new.created_at := clock_timestamp();
  if new.prompt is null then
    perform private.genesis_support_rate_limit(me, 'reply', 60, interval '1 hour');
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_new_reply() from public, anon, authenticated;

-- Screenshots: a handler of the report the attachment row belongs to reads it too.
create or replace function public.support_can_read(object_name text, uploaded_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.support_attachments a
             where a.path = object_name
               and (split_part(object_name, '/', 1) = auth.uid()::text or public.support_is_staff()
                    or private.genesis_support_handler(a.report_id, auth.uid())))
    or (split_part(object_name, '/', 1) = auth.uid()::text and uploaded_at > now() - interval '1 hour')
  )
$$;

comment on function public.support_can_read(text, timestamptz) is
  'Whether the signed-in person may read this support screenshot (their own, or as staff or a handler). Genesis support.';

-- Status: staff, or a handler of the report.
create or replace function public.support_set_report_status(report uuid, status text, feature text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.genesis_support_handler(report, auth.uid()) then
    raise exception 'support_set_report_status: only staff' using errcode = '42501';
  end if;
  update public.support_reports r
    set status = support_set_report_status.status,
        feature_id = case when feature = '' then null else coalesce(feature, r.feature_id) end
    where r.id = report;
  if not found then
    raise exception 'support_set_report_status: no such report' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.support_set_report_status(uuid, text, text) is
  'Staff or a handler set a report''s status and the FeatureId it is about. Genesis support.';

-- The verify loop ---------------------------------------------------------------------

-- Addressed or wont_fix: stamped, and not yet verified. Back to open or in progress: cleared.
create or replace function private.genesis_support_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('addressed', 'wont_fix') and old.status is distinct from new.status then
    new.resolved_at := now();
    new.verified_at := null;
  elsif old.status in ('addressed', 'wont_fix') and new.status in ('open', 'submitted', 'in_progress') then
    new.resolved_at := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_resolution() from public, anon, authenticated;
drop trigger if exists genesis_support_resolution on public.support_reports;
create trigger genesis_support_resolution
  before update of status on public.support_reports
  for each row execute function private.genesis_support_resolution();

-- The verify prompt, only when the app's hook turns it on: someone other than the person marked
-- it addressed (a reply needs a session), so ask them to check it, at most once an hour per
-- report, so a status flipped back and forth can't flood the thread. The reply is the system's
-- (prompt = 'verify'): it doesn't count against the marker's reply limit. If a reply rule
-- refuses it (support-email's trigger applied after this file refuses a handler) or a limit
-- stops it, the status change still goes through, without the prompt.
create or replace function private.genesis_support_ask_to_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A status set directly is depth 1; through support-chat's conversation sync, 2. Deeper is a
  -- loop of triggers, never a person marking a fix.
  if pg_trigger_depth() > 2 then
    return null;
  end if;
  -- Two statements: one SQL expression may evaluate the call even when the hook is missing.
  if to_regprocedure('private.genesis_support_verify_prompt_enabled()') is null then
    return null;
  end if;
  if not coalesce(private.genesis_support_verify_prompt_enabled(), false) then
    return null;
  end if;
  if auth.uid() is null or auth.uid() = new.user_id
     or exists (select 1 from public.support_replies r
                 where r.report_id = new.id and r.prompt = 'verify' and r.created_at > now() - interval '1 hour') then
    return null;
  end if;
  begin
    insert into public.support_replies (report_id, body, prompt)
    values (new.id, 'This is marked fixed. Please check it: confirm the fix, or reopen it if it isn''t fixed.', 'verify');
  exception
    when insufficient_privilege or sqlstate 'GS429' then
      raise log 'genesis-support: the verify prompt for report % was not posted (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function private.genesis_support_ask_to_verify() from public, anon, authenticated;
drop trigger if exists genesis_support_ask_to_verify on public.support_reports;
create trigger genesis_support_ask_to_verify
  after update of status on public.support_reports
  for each row when (new.status = 'addressed' and old.status is distinct from 'addressed')
  execute function private.genesis_support_ask_to_verify();

-- The person confirms the fix, or reopens the report (with what's still wrong, in the thread).
create or replace function public.support_verify_report(report uuid, fixed boolean, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _r public.support_reports;
begin
  select * into _r from public.support_reports where id = report;
  if _r.id is null or _r.user_id is distinct from auth.uid() then
    raise exception 'support_verify_report: not your report' using errcode = '42501';
  end if;
  if _r.status <> 'addressed' then
    raise exception 'support_verify_report: it isn''t marked fixed' using errcode = '22023';
  end if;
  if nullif(btrim(note), '') is not null then
    insert into public.support_replies (report_id, body) values (report, btrim(note));
  end if;
  if fixed then
    update public.support_reports set verified_at = now() where id = report;
  else
    update public.support_reports set status = 'in_progress', reopened_at = now() where id = report;
  end if;
end;
$$;

comment on function public.support_verify_report(uuid, boolean, text) is
  'The person confirms a fix, or reopens their report with an optional note. Genesis support.';
revoke execute on function public.support_verify_report(uuid, boolean, text) from public, anon;
grant execute on function public.support_verify_report(uuid, boolean, text) to authenticated;
