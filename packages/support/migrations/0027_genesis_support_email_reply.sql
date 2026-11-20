-- @feat:support-email
-- Genesis support 0027: reply by email, the database half (after 0004_genesis_support_tickets.sql;
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
--   once       the same email (its Message-ID) is posted once; asking again returns the same id.
--   a loop     at most 20 email replies a ticket an hour (two auto-answering mailboxes stop there):
--              the rest are refused with GS429, which the route logs and drops.
--
-- A refusal is 42501 (who), 22023 (what) or GS429 (too many), never a partial post.
--
-- One private table, private.genesis_support_email_posts: each email reply's Message-ID hash, the
-- message it became and when, per ticket (a day's worth for the limit; the hashes for dedupe). It
-- goes with its ticket.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0027_genesis_support_email_reply.test.sql`).

create schema if not exists private;

create table if not exists private.genesis_support_email_posts (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  email_id text not null,
  posted_id uuid not null,
  at timestamptz not null default now(),
  primary key (ticket_id, email_id)
);
create index if not exists genesis_support_email_posts_recent_idx on private.genesis_support_email_posts (ticket_id, at desc);
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
      select (genesis_chat.send_message(conv, _email_id::uuid, _body)).id into posted;
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
  delete from private.genesis_support_email_posts p where p.ticket_id = t.id and p.at < now() - interval '1 day' and p.email_id <> _email_id;
  insert into private.genesis_support_email_posts (ticket_id, email_id, posted_id) values (t.id, _email_id, posted)
  on conflict do nothing;
  return posted;
end;
$$;

comment on function public.support_email_reply(uuid, uuid, text, text, text) is
  'Posts a reply sent by email to a ticket''s reply address, as the login it was sent to. Service role only (the inbound email route). Genesis support.';

revoke execute on function public.support_email_reply(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.support_email_reply(uuid, uuid, text, text, text) to service_role;
