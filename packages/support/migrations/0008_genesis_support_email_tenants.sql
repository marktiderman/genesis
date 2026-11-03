-- @feat:support-email
-- Genesis support 0008: support-email on tickets and tenants (after 0004_genesis_support_tickets.sql
-- and 0002_genesis_support_email.sql).
--
-- Recreates the support-email functions against public.tickets, lets the app route an inbound
-- email to a tenant by the address it was sent to, and gives a ticket's emails to its handlers
-- (agents of its tenant) instead of app-wide staff. The email table keeps its name in this release.
--
-- Your app may answer (Genesis never defines it):
--
--   private.genesis_support_email_tenant(recipients text[]) returns uuid    (optional)
--     The tenant an inbound email belongs to. Without it, or for null, the default tenant.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0008_genesis_support_email_tenants.test.sql`).

-- Which tenant an email to these addresses belongs to: the app's optional hook
-- private.genesis_support_email_tenant(recipients text[]) returns uuid, else null (the default
-- tenant, set by 0004's trigger). A tenant with the help desk off gets none.
create or replace function private.genesis_support_email_tenant_id(recipients text[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  routed uuid;
begin
  if to_regprocedure('private.genesis_support_email_tenant(text[])') is null then
    return null;
  end if;
  routed := private.genesis_support_email_tenant(recipients);
  -- A tenant with the help desk off takes no email: it goes to the app's own support.
  if routed is not null and not private.genesis_support_helpdesk_on(routed) then
    return null;
  end if;
  return routed;
end;
$$;

revoke execute on function private.genesis_support_email_tenant_id(text[]) from public, anon, authenticated;

-- A staff reply on an email ticket goes out by email, threaded under what came in last.
create or replace function private.genesis_support_email_reply_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.tickets;
  last_in public.support_email_messages;
begin
  select * into report from public.tickets r where r.id = new.report_id;
  if report.channel <> 'email' or not new.from_staff or report.requester_email is null then
    return null;
  end if;
  select * into last_in from public.support_email_messages m
   where m.report_id = report.id and m.direction = 'in' order by m.created_at desc limit 1;
  -- References: the thread's first message and its last ten, as they are now.
  insert into public.support_email_messages (report_id, direction, in_reply_to, from_address, to_addresses, subject, reply_id, status, text_body, reference_ids)
  values (report.id, 'out', last_in.message_id, 'support', array[report.requester_email],
          left(case when coalesce(last_in.subject, report.title, '') ~* '^re:' then coalesce(last_in.subject, report.title)
                    else 'Re: ' || coalesce(nullif(last_in.subject, ''), report.title, 'Your request') end, 998),
          new.id, 'queued',
          -- support-chat's stand-in for a file-only message means nothing in an email.
          case when new.body = 'Sent an attachment. Update the app to see it.' then 'We added a file to your request; reply to this email if you can''t open it from the link we sent.' else new.body end,
          (select coalesce(array_agg(x.message_id order by x.created_at), '{}') from (
             (select m.message_id, m.created_at from public.support_email_messages m where m.report_id = report.id and m.message_id is not null order by m.created_at asc limit 1)
             union
             (select m.message_id, m.created_at from public.support_email_messages m where m.report_id = report.id and m.message_id is not null order by m.created_at desc limit 10)) x));
  return null;
end;
$$;

create or replace function public.support_receive_email(email jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  msg_id text := nullif(btrim(email ->> 'messageId', ' <>'), '');
  reply_to text := nullif(btrim(email ->> 'inReplyTo', ' <>'), '');
  refs text[] := coalesce(array(select btrim(x, ' <>') from jsonb_array_elements_text(coalesce(email -> 'references', '[]')) x
                                 where btrim(x, ' <>') ~ '^[^<>\s]+$' and char_length(btrim(x, ' <>')) <= 998 limit 50), '{}');
  sender text := lower(btrim(email -> 'from' ->> 'email'));
  sender_name text := left(nullif(btrim(email -> 'from' ->> 'name'), ''), 200);
  recipients text[] := coalesce(array(select lower(btrim(x)) from jsonb_array_elements_text(coalesce(email -> 'to', '[]')) x limit 50), '{}');
  subject text := left(coalesce(email ->> 'subject', ''), 998);
  body text := left(coalesce(nullif(btrim(email ->> 'text'), ''),
                             nullif(btrim(regexp_replace(regexp_replace(coalesce(email ->> 'html', ''), '<(script|style)[^>]*>.*?</\1>', '', 'gis'), '<[^>]+>', ' ', 'g')), ''),
                             '(no text)'), 10000);
  token text;
  report public.tickets;
  existing uuid;
  reply uuid;
begin
  if jsonb_typeof(email) is distinct from 'object' or sender is null or sender !~ '^[^@\s<>]+@[^@\s<>]+$' or char_length(sender) > 320 then
    raise exception 'support_receive_email: needs from.email' using errcode = '22023';
  end if;
  -- Message-IDs that could carry header text are not kept.
  if msg_id !~ '^[^<>\s]+$' or char_length(msg_id) > 998 then msg_id := null; end if;
  if reply_to !~ '^[^<>\s]+$' or char_length(reply_to) > 998 then reply_to := null; end if;
  select m.report_id into existing from public.support_email_messages m
   where m.direction = 'in' and ((msg_id is not null and m.message_id = msg_id) or (email ->> 'providerId' is not null and m.provider_id = email ->> 'providerId'))
   limit 1;
  if existing is not null then
    return existing;
  end if;
  -- An automatic message (an out-of-office, a bounce) and a sender past 20 emails an hour are
  -- dropped: they neither open a ticket nor reopen one.
  if coalesce((email ->> 'autoSubmitted')::boolean, false)
     or sender ~ '^(mailer-daemon|postmaster|no-?reply)@'
     or (select count(*) from public.support_email_messages m where m.direction = 'in' and m.from_address = sender and m.created_at > now() - interval '1 hour') >= 20 then
    return null;
  end if;
  -- The reply address names the ticket; else what it answers.
  select substring(r from '\+([0-9a-f]{32})@') into token from unnest(recipients) r where r ~ '\+[0-9a-f]{32}@' limit 1;
  if token is not null then
    select * into report from public.tickets where email_token = token and channel = 'email';
  end if;
  if report.id is null and (reply_to is not null or cardinality(refs) > 0) then
    select r.* into report from public.support_email_messages m join public.tickets r on r.id = m.report_id
     where m.message_id = any (array_append(refs, reply_to)) and r.channel = 'email'
       -- A reply joins a thread only in the tenant its address belongs to.
       and r.tenant_id = coalesce(private.genesis_support_email_tenant_id(recipients), private.genesis_support_default_tenant_id())
     order by m.created_at desc limit 1;
  end if;
  if report.id is null and coalesce((email ->> 'onlyExisting')::boolean, false) then
    return null;
  end if;
  if report.id is null then
    insert into public.tickets (tenant_id, user_id, type, title, message, channel, requester_email, requester_name, platform)
    values (private.genesis_support_email_tenant_id(recipients), null, 'question', left(nullif(subject, ''), 300), body, 'email', sender, sender_name, 'email')
    returning * into report;
  else
    insert into public.support_replies (report_id, from_staff, body) values (report.id, false, body) returning id into reply;
    if report.status in ('addressed', 'wont_fix') then
      update public.tickets set status = 'open' where id = report.id;
    end if;
  end if;
  insert into public.support_email_messages (report_id, direction, message_id, in_reply_to, from_address, to_addresses, subject, text_body, reply_id, provider_id, authentication, attachments, status)
  values (report.id, 'in', msg_id, reply_to, sender, recipients, subject, left(email ->> 'text', 100000), reply,
          left(email ->> 'providerId', 200),
          case when jsonb_typeof(email -> 'authentication') = 'object' then email -> 'authentication' end,
          case when jsonb_typeof(email -> 'attachments') = 'array' then email -> 'attachments' else '[]' end,
          'received');
  return report.id;
end;
$$;

-- Staff link an email ticket to the login it belongs to (after checking who wrote it). With the
-- support-chat block, the person joins the ticket's conversation.
create or replace function public.support_link_requester(report uuid, person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked public.tickets;
begin
  if not private.genesis_support_handler(report, auth.uid()) then
    raise exception 'support_link_requester: only staff' using errcode = '42501';
  end if;
  -- A business's agent links only someone in that business (the app's own support, anyone).
  if not exists (
    select 1 from public.tickets t
     where t.id = report
       and (t.tenant_id = private.genesis_support_default_tenant_id()
            or exists (select 1 from private.genesis_support_tenants_of(person) v where v.tenant_id = t.tenant_id))
  ) then
    raise exception 'support_link_requester: that person is not in this ticket''s tenant' using errcode = '42501';
  end if;
  update public.tickets r set user_id = person
   where r.id = report and r.channel = 'email' and r.user_id is null
  returning * into linked;
  if linked.id is null then
    raise exception 'support_link_requester: no unlinked email ticket' using errcode = 'P0002';
  end if;
  if to_regprocedure('private.genesis_support_chat_ensure(public.tickets)') is not null then
    execute 'select private.genesis_support_chat_ensure($1)' using linked;
  end if;
end;
$$;

create or replace function public.support_claim_outbound_emails(max_rows integer default 20)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- A reply deleted before it went out is cancelled; one that kept failing is given up.
  update public.support_email_messages m set status = 'cancelled', lease_until = null
   where m.direction = 'out' and m.status in ('queued', 'sending') and m.reply_id is null;
  update public.support_email_messages m set status = 'failed', lease_until = null, error = coalesce(m.error, 'gave up after 5 attempts')
   where m.direction = 'out' and m.status = 'sending' and m.lease_until < now() and m.attempts >= 5;
  return query
  with picked as (
    select m.id from public.support_email_messages m
     where m.direction = 'out'
       and (m.status = 'queued' or (m.status = 'sending' and m.lease_until < now() and m.attempts < 5))
     order by m.created_at
     limit greatest(1, least(max_rows, 100))
     for update skip locked
  ), claimed as (
    update public.support_email_messages m
       set status = 'sending', lease_until = now() + interval '10 minutes', attempts = m.attempts + 1
      from picked where m.id = picked.id
    returning m.*
  )
  select jsonb_build_object(
    'id', c.id, 'reportId', c.report_id, 'to', c.to_addresses, 'subject', c.subject,
    'text', c.text_body, 'inReplyTo', c.in_reply_to, 'references', to_jsonb(c.reference_ids),
    'token', r.email_token, 'attempts', c.attempts)
    from claimed c
    join public.tickets r on r.id = c.report_id;
end;
$$;

-- A ticket's emails: its handlers (agents of its tenant), not app-wide staff.
drop policy if exists support_email_messages_staff on public.support_email_messages;
create policy support_email_messages_staff on public.support_email_messages
  for select to authenticated
  using (public.support_handles(report_id));

-- 0004's reply rule and read marking, again: 0002 defined its own, which a later install of
-- this block would otherwise leave in place.
-- Replies (0003's rule, on the renamed table): a handler writes as support on someone else's
-- ticket; server code only on an email ticket (support-email).
create or replace function private.genesis_support_new_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  report public.tickets;
  handles boolean;
begin
  select * into report from public.tickets r where r.id = new.report_id;
  if report.id is null then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  if me is null then
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

-- Marking a thread read: the requester, or a handler.
create or replace function public.support_mark_read(report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  exists_ticket boolean;
begin
  select r.user_id, true into owner, exists_ticket from public.tickets r where r.id = report;
  if me is null or exists_ticket is null then
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
  if owner = me then
    update public.tickets set user_read_at = clock_timestamp() where id = report;
  elsif private.genesis_support_handler(report, me) then
    update public.tickets set staff_read_at = clock_timestamp() where id = report;
  else
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
end;
$$;
