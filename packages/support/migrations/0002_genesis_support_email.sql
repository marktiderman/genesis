-- Genesis support over email: email is a ticket channel (ADR 0011)
--
-- The `support-email` block of `@marktiderman/genesis-support`. Needs 0006_genesis_support.sql
-- (from `@marktiderman/genesis-supabase`); works with or without the support-chat block.
--
-- A report gains a channel and a requester:
--
--   public.support_reports.channel          'app' (default) or 'email'
--   public.support_reports.requester_email  the address an email ticket answers to
--   public.support_reports.requester_name   the name in its From header, when there was one
--   public.support_reports.email_token      the reply token in the ticket's reply address
--                                           (support+<token>@your-reply-domain)
--   An email ticket may have no login (user_id null): staff see it; a person sees only the
--   reports of their own login, as before. Nothing here links a login from an address (a From
--   header can be forged); staff do that by setting user_id.
--
--   public.support_email_messages
--     Every email in and out of a ticket: direction, the RFC 5322 Message-ID and what it answered,
--     addresses, subject, the text (inbound), Resend's id, the authentication results and, for
--     outbound, its sending status. Staff read it; the functions below write it.
--
-- Functions (service role):
--
--   support_receive_email(email jsonb) returns uuid
--     Files one received email: the ticket its reply address or In-Reply-To/References names,
--     else a new ticket (unless `onlyExisting` is true: then it files only a reply and returns
--     null for anything else, for mail that wasn't sent to a support address). The same
--     Message-ID twice is filed once. A reply reopens an answered ticket. Returns the report's id.
--   support_claim_outbound_emails(max_rows integer default 20) returns setof jsonb
--     Claims queued replies to send (a lease of 10 minutes), with what threading needs.
--   support_settle_outbound_email(message uuid, provider_id text, error text default null)
--     Marks one sent, or failed (retried up to 5 times, then left failed).
--
-- What changes in 0006's rules:
--
--   - A staff reply on a ticket with no login is allowed (it is from staff).
--   - Server code (no login: the service role, since anon reaches no support table) may add a
--     reply to an email ticket, as the requester (from_staff false) or as staff.
--   - A staff reply on an email ticket queues an outbound email (a trigger), whether it was
--     written in support_replies or in support-chat (which mirrors into support_replies).
--
-- Use: `genesis add support-email` copies this file after 0006. Never edit it once applied;
-- change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0002_genesis_support_email.test.sql`).

alter table public.support_reports alter column user_id drop not null;

alter table public.support_reports
  add column channel text not null default 'app'
    constraint support_reports_channel check (channel in ('app', 'email')),
  add column requester_email text
    constraint support_reports_requester_email_shape check (requester_email ~ '^[^@\s<>]+@[^@\s<>]+$' and char_length(requester_email) <= 320 and requester_email = lower(requester_email)),
  add column requester_name text
    constraint support_reports_requester_name_length check (char_length(requester_name) <= 200),
  add column email_token text unique default replace(gen_random_uuid()::text, '-', '')
    constraint support_reports_email_token_shape check (email_token ~ '^[0-9a-f]{32}$'),
  add constraint support_reports_who check (user_id is not null or (channel = 'email' and requester_email is not null));

comment on column public.support_reports.email_token is
  'The token in this ticket''s reply address (support+<token>@domain); unguessable, so a reply to it joins this ticket. Genesis support email.';

create table public.support_email_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.support_reports (id) on delete cascade,
  direction text not null constraint support_email_messages_direction check (direction in ('in', 'out')),
  -- The RFC 5322 Message-ID, without angle brackets. Unique for what came in; set on send for what goes out.
  message_id text constraint support_email_messages_message_id_length check (char_length(message_id) <= 998),
  in_reply_to text constraint support_email_messages_in_reply_to_length check (char_length(in_reply_to) <= 998),
  from_address text not null constraint support_email_messages_from_length check (char_length(from_address) <= 320),
  to_addresses text[] not null default '{}' constraint support_email_messages_to_count check (cardinality(to_addresses) <= 50),
  subject text not null default '' constraint support_email_messages_subject_length check (char_length(subject) <= 998),
  -- Inbound only; an outbound email's text is its reply's.
  text_body text constraint support_email_messages_text_length check (char_length(text_body) <= 100000),
  reply_id uuid references public.support_replies (id) on delete set null,
  provider_id text constraint support_email_messages_provider_length check (char_length(provider_id) <= 200),
  -- SPF, DKIM and DMARC results as Resend reported them, for staff to judge a sender.
  authentication jsonb constraint support_email_messages_auth_shape check (authentication is null or (jsonb_typeof(authentication) = 'object' and pg_column_size(authentication) <= 4096)),
  -- Names, types and sizes of attachments (not stored yet).
  attachments jsonb not null default '[]' constraint support_email_messages_attachments_shape check (jsonb_typeof(attachments) = 'array' and pg_column_size(attachments) <= 16384),
  status text not null default 'received'
    constraint support_email_messages_status check (status in ('received', 'queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  lease_until timestamptz,
  error text constraint support_email_messages_error_length check (char_length(error) <= 1000),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index support_email_messages_inbound_id on public.support_email_messages (message_id) where direction = 'in';
create index support_email_messages_report on public.support_email_messages (report_id, created_at);
create index support_email_messages_queue on public.support_email_messages (status, created_at) where status in ('queued', 'sending');

comment on table public.support_email_messages is
  'Every email in and out of a support ticket, with threading ids and, for outbound, its sending status. Staff read it. Genesis support email.';

alter table public.support_email_messages enable row level security;
revoke all on table public.support_email_messages from public, anon, authenticated;
grant select on table public.support_email_messages to authenticated;
create policy support_email_messages_staff on public.support_email_messages
  for select to authenticated
  using ((select public.support_is_staff()));

-- 0006's reply rule, with the two cases email adds. Everything else is as it was.
create or replace function private.genesis_support_new_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  report public.support_reports;
  staff boolean := public.support_is_staff();
begin
  select * into report from public.support_reports r where r.id = new.report_id;
  if report.id is null then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  if me is null then
    -- Server code (anon has no right on this table): only on an email ticket, as given.
    if report.channel <> 'email' then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := null;
    new.created_at := clock_timestamp();
    return new;
  end if;
  if report.user_id is null then
    if not staff then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    new.from_staff := true;
  else
    if report.user_id <> me and not staff then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    -- On their own report a staff member writes as the person.
    new.from_staff := staff and report.user_id <> me;
  end if;
  new.created_at := clock_timestamp();
  perform private.genesis_support_rate_limit(me, 'reply', 60, interval '1 hour');
  return new;
end;
$$;

-- A staff reply on an email ticket goes out by email, threaded under what came in last.
create or replace function private.genesis_support_email_reply_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.support_reports;
  last_in public.support_email_messages;
begin
  select * into report from public.support_reports r where r.id = new.report_id;
  if report.channel <> 'email' or not new.from_staff or report.requester_email is null then
    return null;
  end if;
  select * into last_in from public.support_email_messages m
   where m.report_id = report.id and m.direction = 'in' order by m.created_at desc limit 1;
  insert into public.support_email_messages (report_id, direction, in_reply_to, from_address, to_addresses, subject, reply_id, status)
  values (report.id, 'out', last_in.message_id, 'support', array[report.requester_email],
          left(case when coalesce(last_in.subject, report.title, '') ~* '^re:' then coalesce(last_in.subject, report.title)
                    else 'Re: ' || coalesce(nullif(last_in.subject, ''), report.title, 'Your request') end, 998),
          new.id, 'queued');
  return null;
end;
$$;

revoke execute on function private.genesis_support_email_reply_posted() from public, anon, authenticated;
revoke execute on function private.genesis_support_new_reply() from public, anon, authenticated;

create trigger genesis_support_email_reply_posted
  after insert on public.support_replies
  for each row execute function private.genesis_support_email_reply_posted();

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
  refs text[] := coalesce(array(select btrim(x, ' <>') from jsonb_array_elements_text(coalesce(email -> 'references', '[]')) x), '{}');
  sender text := lower(btrim(email -> 'from' ->> 'email'));
  sender_name text := left(nullif(btrim(email -> 'from' ->> 'name'), ''), 200);
  recipients text[] := coalesce(array(select lower(btrim(x)) from jsonb_array_elements_text(coalesce(email -> 'to', '[]')) x limit 50), '{}');
  subject text := left(coalesce(email ->> 'subject', ''), 998);
  body text := left(coalesce(nullif(btrim(email ->> 'text'), ''), '(no text)'), 10000);
  token text;
  report public.support_reports;
  existing uuid;
  reply uuid;
begin
  if jsonb_typeof(email) is distinct from 'object' or sender is null or sender !~ '^[^@\s<>]+@[^@\s<>]+$' or char_length(sender) > 320 then
    raise exception 'support_receive_email: needs from.email' using errcode = '22023';
  end if;
  if msg_id is not null then
    select m.report_id into existing from public.support_email_messages m where m.direction = 'in' and m.message_id = msg_id;
    if existing is not null then
      return existing;
    end if;
  end if;
  -- The reply address names the ticket; else what it answers.
  select substring(r from '\+([0-9a-f]{32})@') into token from unnest(recipients) r where r ~ '\+[0-9a-f]{32}@' limit 1;
  if token is not null then
    select * into report from public.support_reports where email_token = token and channel = 'email';
  end if;
  if report.id is null and (reply_to is not null or cardinality(refs) > 0) then
    select r.* into report from public.support_email_messages m join public.support_reports r on r.id = m.report_id
     where m.message_id = any (array_append(refs, reply_to)) and r.channel = 'email'
     order by m.created_at desc limit 1;
  end if;
  if report.id is null and coalesce((email ->> 'onlyExisting')::boolean, false) then
    return null;
  end if;
  if report.id is null then
    insert into public.support_reports (user_id, type, title, message, channel, requester_email, requester_name, platform)
    values (null, 'question', left(nullif(subject, ''), 300), body, 'email', sender, sender_name, 'email')
    returning * into report;
  else
    insert into public.support_replies (report_id, from_staff, body) values (report.id, false, body) returning id into reply;
    if report.status in ('addressed', 'wont_fix') then
      update public.support_reports set status = 'open' where id = report.id;
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

comment on function public.support_receive_email(jsonb) is
  'Files one received email (messageId, inReplyTo, references, from {email, name}, to, subject, text, providerId, authentication, attachments) on the ticket it answers, or a new ticket. Idempotent on messageId. Service role. Genesis support email.';

revoke execute on function public.support_receive_email(jsonb) from public, anon, authenticated;
grant execute on function public.support_receive_email(jsonb) to service_role;

create or replace function public.support_claim_outbound_emails(max_rows integer default 20)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select m.id from public.support_email_messages m
     where m.direction = 'out'
       and (m.status = 'queued' or (m.status = 'sending' and m.lease_until < now()))
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
    'text', rep.body, 'inReplyTo', c.in_reply_to,
    'references', coalesce((select jsonb_agg(x.message_id order by x.created_at) from public.support_email_messages x
                            where x.report_id = c.report_id and x.message_id is not null), '[]'),
    'token', r.email_token, 'attempts', c.attempts)
    from claimed c
    join public.support_reports r on r.id = c.report_id
    left join public.support_replies rep on rep.id = c.reply_id;
end;
$$;

comment on function public.support_claim_outbound_emails(integer) is
  'Claims up to max_rows queued ticket replies to send, leased for 10 minutes, with their text and threading ids. Service role. Genesis support email.';

revoke execute on function public.support_claim_outbound_emails(integer) from public, anon, authenticated;
grant execute on function public.support_claim_outbound_emails(integer) to service_role;

create or replace function public.support_settle_outbound_email(message uuid, provider_id text, error text default null, sent_message_id text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.support_email_messages m
     set status = case when error is null then 'sent' when m.attempts >= 5 then 'failed' else 'queued' end,
         provider_id = coalesce(left(support_settle_outbound_email.provider_id, 200), m.provider_id),
         message_id = coalesce(nullif(btrim(sent_message_id, ' <>'), ''), m.message_id),
         error = left(support_settle_outbound_email.error, 1000),
         sent_at = case when error is null then now() else m.sent_at end,
         lease_until = null
   where m.id = message and m.direction = 'out' and m.status = 'sending'
$$;

comment on function public.support_settle_outbound_email(uuid, text, text, text) is
  'Marks a claimed ticket reply sent (with Resend''s id and the Message-ID it went out with), or failed: queued again, up to 5 attempts. Service role. Genesis support email.';

revoke execute on function public.support_settle_outbound_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.support_settle_outbound_email(uuid, text, text, text) to service_role;
