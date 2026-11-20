-- @feat:support-email
-- Genesis support 0031: reply by email, the database half (after 0004_genesis_support_tickets.sql;
-- the support-chat block's 0005 and 0006 are optional).
--
-- public.support_email_reply(p_ticket, p_user, p_from, p_message_id, p_body): the inbound route
-- (`supportReplyRoute` in `@marktiderman/genesis-support/email`, service role only) posts what
-- someone wrote in answer to a support email, as the login the email went to, into the ticket's
-- thread, with every rule that login has in the app:
--
--   who        the ticket's person posts as themselves; anyone else only while they handle the
--              ticket (private.genesis_support_handler), and then as support. A banned login can't.
--   from       p_from must be the login's own address. The route passes only a From the receiving
--              server authenticated (DKIM aligned with the From domain, or SPF and DMARC passing),
--              so a forged From is dropped first, and a forwarded reply address doesn't let someone
--              else write as the login.
--   how        on genesis-chat when the support-chat block is installed (genesis_chat.send_message,
--              as that login for this one call, as a scheduled post is), else as a support_replies
--              row (0006's checks and limits, as that login).
--   once       the same email (its Message-ID) is posted once, for 60 days; asking again returns
--              the same id.
--   a loop     at most 20 email replies a ticket an hour (two auto-answering mailboxes stop there):
--              the rest are refused with GS429, which the route logs and drops.
--
-- A refusal is 42501 (who), 22023 (what) or GS429 (too many), never a partial post.
--
-- support.email (genesis-config; the max preset) is the channel's switch on the server: while it is
-- off, support_receive_email files nothing (it returns null) and support_claim_outbound_emails
-- sends nothing (queued replies wait), read through genesis-supabase's private.genesis_setting.
--
-- One private table, private.genesis_support_email_posts: each email reply's Message-ID hash, the
-- message it became and when, per ticket (60 days of them: an hour's for the limit, the rest for
-- dedupe). It goes with its ticket. An app's own support_email_reply, or a table of another shape by
-- that name, stops this file with what to do.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0031_genesis_support_email_reply.test.sql`).

create schema if not exists private;

-- An app's own support_email_reply (one written before this file) is never replaced quietly, and a
-- table by this name must be this file's.
do $$
declare
  existing text;
begin
  select coalesce(obj_description(p.oid, 'pg_proc'), '') into existing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'support_email_reply'
   limit 1;
  if existing is not null and existing not like '%Genesis support.%' then
    raise exception 'genesis support 0031: public.support_email_reply already exists and isn''t Genesis''s (an app''s own reply by email?). Drop or rename yours, and point your inbound route at this one (supportReplyRoute), then run this migration; see its header.';
  end if;
  if to_regclass('private.genesis_support_email_posts') is not null
     and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
           where a.attrelid = to_regclass('private.genesis_support_email_posts') and a.attnum > 0 and not a.attisdropped)
         is distinct from array['at', 'email_id', 'posted_id', 'ticket_id'] then
    raise exception 'genesis support 0031: private.genesis_support_email_posts exists with other columns; rename it, then run this migration.';
  end if;
end;
$$;

create table if not exists private.genesis_support_email_posts (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  email_id text not null,
  posted_id uuid not null,
  at timestamptz not null default now(),
  primary key (ticket_id, email_id)
);
create index if not exists genesis_support_email_posts_recent_idx on private.genesis_support_email_posts (ticket_id, at desc);
alter table private.genesis_support_email_posts enable row level security;
revoke all on private.genesis_support_email_posts from public, anon, authenticated;

create or replace function public.support_email_reply(p_ticket uuid, p_user uuid, p_from text, p_message_id text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  u auth.users;
  conv uuid;
  posted uuid;
  claims text := current_setting('request.jwt.claims', true);
  _body text := left(btrim(coalesce(p_body, '')), 10000);
  _email_id text;
  chat boolean := to_regprocedure('private.genesis_support_chat_conversation_of(uuid)') is not null
                  and to_regprocedure('private.genesis_support_chat_ensure(public.tickets)') is not null;
begin
  if _body = '' then
    raise exception 'An email reply needs text' using errcode = '22023';
  end if;
  if coalesce(btrim(p_message_id), '') = '' or char_length(p_message_id) > 998 then
    raise exception 'An email reply needs its Message-ID' using errcode = '22023';
  end if;
  _email_id := md5('support-email:' || btrim(p_message_id));
  select * into t from public.tickets x where x.id = p_ticket;
  select * into u from auth.users x where x.id = p_user;
  if t.id is null or u.id is null or t.user_id is null then
    raise exception 'No such conversation' using errcode = '42501';
  end if;
  -- Only from the address the email went to: the login's own.
  if u.email is null or lower(btrim(coalesce(p_from, ''))) is distinct from lower(u.email) then
    raise exception 'This reply isn''t from the address it was sent to' using errcode = '42501';
  end if;
  if u.banned_until is not null and u.banned_until > now() then
    raise exception 'This login can''t post' using errcode = '42501';
  end if;
  if p_user is distinct from t.user_id and not private.genesis_support_handler(t.id, p_user) then
    raise exception 'Only the person or the ticket''s support answers it' using errcode = '42501';
  end if;
  -- One delivery at a time per ticket, so two at once can't both pass the checks below.
  perform pg_advisory_xact_lock(hashtextextended('genesis-support-email-reply:' || t.id::text, 0));
  select p.posted_id into posted from private.genesis_support_email_posts p where p.ticket_id = t.id and p.email_id = _email_id;
  if posted is not null then
    return posted;
  end if;
  if (select count(*) from private.genesis_support_email_posts p where p.ticket_id = t.id and p.at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many email replies on this conversation; try again later' using errcode = 'GS429';
  end if;
  -- Act as that login for this one post, with their token's claims, so every rule is theirs.
  perform set_config('request.jwt.claims',
    json_build_object('sub', u.id, 'role', 'authenticated', 'email', u.email,
                      'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb))::text, true);
  perform set_config('request.jwt.claim.sub', u.id::text, true);
  begin
    if chat then
      conv := coalesce(private.genesis_support_chat_conversation_of(t.id), private.genesis_support_chat_ensure(t));
      -- The chat message's client id names the ticket too: one email answering two tickets is two messages.
      select (genesis_chat.send_message(conv, md5('support-email:' || t.id::text || ':' || btrim(p_message_id))::uuid, _body)).id into posted;
    else
      insert into public.support_replies (report_id, body) values (t.id, _body) returning id into posted;
    end if;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(nullif(claims, '')::jsonb ->> 'sub', ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(nullif(claims, '')::jsonb ->> 'sub', ''), true);
  -- Kept 60 days, so a mail server retrying (or someone resending) an old email posts nothing new.
  delete from private.genesis_support_email_posts p where p.ticket_id = t.id and p.at < now() - interval '60 days' and p.email_id <> _email_id;
  insert into private.genesis_support_email_posts (ticket_id, email_id, posted_id) values (t.id, _email_id, posted)
  on conflict do nothing;
  return posted;
end;
$$;

comment on function public.support_email_reply(uuid, uuid, text, text, text) is
  'Posts a reply sent by email to a ticket''s reply address, as the login it was sent to. Service role only (the inbound email route). Genesis support.';

revoke execute on function public.support_email_reply(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.support_email_reply(uuid, uuid, text, text, text) to service_role;

-- support.email: the channel itself ---------------------------------------------------------------

-- support.email, through genesis-supabase's one resolver (private.genesis_setting, 0023); without
-- it, or before the manifest is synced, on (zero config is the max preset).
create or replace function private.genesis_support_email_on()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('private.genesis_setting(text,uuid)') is null then
    return true;
  end if;
  return private.genesis_setting('support.email') is distinct from 'false'::jsonb;
end;
$$;

revoke execute on function private.genesis_support_email_on() from public, anon, authenticated;

-- 0008's inbound filing and outbound claim, each refusing while support.email is off.
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
  -- support.email off: mail isn't a ticket channel; nothing is filed.
  if not private.genesis_support_email_on() then
    return null;
  end if;
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
  -- support.email off: nothing goes out; queued replies wait.
  if not private.genesis_support_email_on() then
    return;
  end if;
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

revoke execute on function public.support_claim_outbound_emails(integer) from public, anon, authenticated;
grant execute on function public.support_claim_outbound_emails(integer) to service_role;
