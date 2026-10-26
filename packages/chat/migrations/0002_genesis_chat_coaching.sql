-- Genesis Chat 0002: topics, scheduled send, availability, broadcast, search, link previews,
-- moderation, retention and legal hold
--
-- Builds on 0001 (never edited once released). Adds, in the genesis_chat schema:
--
--   kind_options    per kind: moderate new messages, keep messages for a retention period
--   topics          named sub-threads of a conversation (a cohort's lesson threads): a title,
--                   an order, closed or open; messages already carry `topic`
--   scheduled       a message written now and sent later, by its sender, as its sender
--   availability    a person's away message and working hours, shown to the people they
--                   share a conversation with (the "replies Mon–Fri" line)
--   link_previews   a cache of Open Graph data for links in messages, filled by the runner;
--                   read through link_previews_for(message), never directly
--   messages        gain `moderation` (null | flagged | hidden) and a search vector
--   conversations   gain `legal_hold`, which stops retention from removing anything
--
-- Functions for people: topics (set_topic), scheduled send (schedule_message,
-- cancel_scheduled), availability (set_availability, availability_for), broadcast with
-- private replies (broadcast_message), search (search_messages) and link previews
-- (link_previews_for). Functions for the
-- server: posting what's due (due_scheduled, post_scheduled), moderation results
-- (moderate_message), link previews (save_link_preview), retention (purge_expired) and kind
-- options (set_kind_options).
--
-- New effects in the outbox: `moderate` (a message in a kind that moderates, sent or edited)
-- and `unfurl` (a message with a link). The runner in /server works them. In a kind that
-- moderates, a message's push waits for its verdict and a hidden message is never pushed.
--
-- Replaces three of 0001's functions with the same signatures, to leave hidden messages out:
-- unread_count, push_targets and inbox.
--
-- Use: `genesis add chat` copies this after 0001. Verify: tests/0002_genesis_chat_coaching.test.sql.

-- ── Kind options ──────────────────────────────────────────────────────────────

create table genesis_chat.kind_options (
  kind text primary key references genesis_chat.kinds (kind) on update cascade on delete cascade,
  moderate boolean not null default false,
  retention interval check (retention is null or retention >= interval '1 day'),
  updated_at timestamptz not null default now()
);

comment on table genesis_chat.kind_options is
  'Per kind: moderate new messages; how long messages are kept (null: forever). Written by set_kind_options. Genesis Chat.';

alter table genesis_chat.kind_options enable row level security;
create policy kind_options_read on genesis_chat.kind_options for select to authenticated using (true);
grant select on genesis_chat.kind_options to authenticated;
grant select, insert, update, delete on genesis_chat.kind_options to service_role;

create or replace function genesis_chat.set_kind_options(p_kind text, p_moderate boolean default false, p_retention interval default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into genesis_chat.kind_options (kind, moderate, retention) values (p_kind, coalesce(p_moderate, false), p_retention)
  on conflict (kind) do update set moderate = excluded.moderate, retention = excluded.retention, updated_at = now();
$$;
revoke execute on function genesis_chat.set_kind_options(text, boolean, interval) from public, anon, authenticated;
grant execute on function genesis_chat.set_kind_options(text, boolean, interval) to service_role;

-- ── New columns ───────────────────────────────────────────────────────────────

alter table genesis_chat.messages
  add column moderation text check (moderation is null or moderation in ('flagged', 'hidden')),
  add column search tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored;

create index messages_search_idx on genesis_chat.messages using gin (search);
create index messages_created_idx on genesis_chat.messages (conversation_id, created_at);

alter table genesis_chat.attachments
  add column transcript_search tsvector generated always as (to_tsvector('simple', coalesce(transcript, ''))) stored;
create index attachments_transcript_search_idx on genesis_chat.attachments using gin (transcript_search)
  where transcript is not null;

alter table genesis_chat.conversations
  add column legal_hold boolean not null default false;

-- A hidden message is read only by its sender and the conversation's observers (moderators).
-- Restrictive, so it narrows 0001's read policy without replacing it.
create policy messages_hide_moderated on genesis_chat.messages
  as restrictive for select to authenticated
  using (moderation is distinct from 'hidden' or sender_id = auth.uid() or genesis_chat.i_observe(conversation_id));

-- ── Topics ────────────────────────────────────────────────────────────────────

create table genesis_chat.topics (
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  topic text not null check (length(topic) between 1 and 120),
  title text not null check (length(title) between 1 and 160),
  position integer not null default 0,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, topic)
);
create index topics_created_by_idx on genesis_chat.topics (created_by);

comment on table genesis_chat.topics is
  'Named sub-threads of a conversation; a message joins one through messages.topic. A closed topic takes no new messages. Genesis Chat.';

alter table genesis_chat.topics enable row level security;
create policy topics_read on genesis_chat.topics for select to authenticated using (genesis_chat.can_view(conversation_id));
grant select on genesis_chat.topics to authenticated;
grant select, insert, update, delete on genesis_chat.topics to service_role;

-- Owners and admins (or the server) add, rename, reorder, close and reopen a topic.
create or replace function genesis_chat.set_topic(
  p_conversation_id uuid,
  p_topic text,
  p_title text default null,
  p_position integer default null,
  p_closed boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' and coalesce(genesis_chat.my_role(p_conversation_id), '') not in ('owner', 'admin') then
    raise exception 'Only an owner or admin manages topics' using errcode = '42501';
  end if;
  insert into genesis_chat.topics as t (conversation_id, topic, title, position, closed_at, created_by)
  values (p_conversation_id, btrim(p_topic), coalesce(nullif(btrim(p_title), ''), btrim(p_topic)), coalesce(p_position, 0),
          case when p_closed then now() end, auth.uid())
  on conflict (conversation_id, topic) do update set
    title = coalesce(nullif(btrim(p_title), ''), t.title),
    position = coalesce(p_position, t.position),
    closed_at = case when p_closed is null then t.closed_at when p_closed then coalesce(t.closed_at, now()) else null end;
  perform genesis_chat.broadcast('genesis-chat:conv:' || p_conversation_id, 'conversation',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

-- No new message in a closed topic (except from owners, admins and observers who post).
create or replace function genesis_chat.topic_open_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.topic is not null and new.kind = 'text' and exists (
       select 1 from genesis_chat.topics t
        where t.conversation_id = new.conversation_id and t.topic = new.topic and t.closed_at is not null)
     and new.sender_role not in ('owner', 'admin', 'observer') then
    raise exception 'This topic is closed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function genesis_chat.topic_open_check() from public, anon, authenticated;
create trigger messages_topic_open before insert on genesis_chat.messages
  for each row execute function genesis_chat.topic_open_check();

-- ── Scheduled send ────────────────────────────────────────────────────────────

create table genesis_chat.scheduled (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null default gen_random_uuid(),
  body text not null default '' check (length(body) <= 10000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and pg_column_size(attachments) <= 65536),
  reply_to_id uuid references genesis_chat.messages (id) on delete set null,
  topic text check (topic is null or length(topic) between 1 and 120),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  silent boolean not null default false,
  send_at timestamptz not null,
  sent_message_id uuid references genesis_chat.messages (id) on delete set null,
  cancelled_at timestamptz,
  error text check (error is null or length(error) <= 500),
  -- Tries that failed for a reason that may pass (a deadlock, a timeout); `error` is set
  -- after the fifth, or at once for a refusal.
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index scheduled_due_idx on genesis_chat.scheduled (send_at) where sent_message_id is null and cancelled_at is null and error is null;
create index scheduled_conversation_idx on genesis_chat.scheduled (conversation_id);
create index scheduled_reply_idx on genesis_chat.scheduled (reply_to_id) where reply_to_id is not null;
create index scheduled_sent_idx on genesis_chat.scheduled (sent_message_id) where sent_message_id is not null;

comment on table genesis_chat.scheduled is
  'Messages to send later. Read only by their sender; posted as the sender by post_scheduled when due. Genesis Chat.';

alter table genesis_chat.scheduled enable row level security;
create policy scheduled_read on genesis_chat.scheduled for select to authenticated using (sender_id = auth.uid());
grant select on genesis_chat.scheduled to authenticated;
grant select, insert, update, delete on genesis_chat.scheduled to service_role;

-- Schedules a message (between a minute and a year ahead) where you may post now. Files in
-- `p_attachments` must already be uploaded, as for send_message.
create or replace function genesis_chat.schedule_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_send_at timestamptz,
  p_body text default '',
  p_attachments jsonb default '[]',
  p_reply_to_id uuid default null,
  p_topic text default null,
  p_mentions uuid[] default '{}',
  p_silent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_ uuid;
begin
  if not genesis_chat.can_post(p_conversation_id) then
    raise exception 'You can''t post in this conversation' using errcode = '42501';
  end if;
  if p_send_at < now() + interval '1 minute' or p_send_at > now() + interval '1 year' then
    raise exception 'Schedule between a minute and a year from now' using errcode = '22023';
  end if;
  if btrim(coalesce(p_body, '')) = '' and coalesce(jsonb_array_length(p_attachments), 0) = 0 then
    raise exception 'A message needs text or an attachment' using errcode = '22023';
  end if;
  if (select count(*) from genesis_chat.scheduled
       where sender_id = auth.uid() and sent_message_id is null and cancelled_at is null) >= 100 then
    raise exception 'At most 100 scheduled messages' using errcode = 'GS429';
  end if;
  insert into genesis_chat.scheduled (conversation_id, sender_id, client_id, body, attachments, reply_to_id, topic, mentions, silent, send_at)
  values (p_conversation_id, auth.uid(), p_client_id, coalesce(p_body, ''), coalesce(p_attachments, '[]'), p_reply_to_id,
          nullif(btrim(p_topic), ''), coalesce(p_mentions, '{}'), coalesce(p_silent, false), p_send_at)
  on conflict (sender_id, client_id) do update set send_at = excluded.send_at
  returning id into id_;
  return id_;
end;
$$;

create or replace function genesis_chat.cancel_scheduled(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_chat.scheduled set cancelled_at = now()
   where id = p_id and sender_id = auth.uid() and sent_message_id is null and cancelled_at is null;
  if not found then
    raise exception 'Nothing to cancel' using errcode = '22023';
  end if;
end;
$$;

-- The server's side: what is due.
create or replace function genesis_chat.due_scheduled(p_limit integer default 100)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from genesis_chat.scheduled
   where send_at <= now() and sent_message_id is null and cancelled_at is null and error is null
   order by send_at, id
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

-- The server's side: posts one due message as its sender, with every check send_message makes
-- for them (they may have left the conversation since). Records the message, or the reason:
-- a refusal (no right to post, bad input, a constraint) is final at once; anything else (a
-- deadlock, a statement timeout) is tried again on the next run, up to five times.
create or replace function genesis_chat.post_scheduled(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s genesis_chat.scheduled;
  msg genesis_chat.messages;
  claims text := current_setting('request.jwt.claims', true);
begin
  select * into s from genesis_chat.scheduled where id = p_id for update skip locked;
  if s.id is null or s.sent_message_id is not null or s.cancelled_at is not null or s.error is not null then
    return s.sent_message_id;
  end if;
  -- Act as the sender for this one statement, so every rule is theirs.
  perform set_config('request.jwt.claims', json_build_object('sub', s.sender_id, 'role', 'authenticated')::text, true);
  begin
    msg := genesis_chat.send_message(s.conversation_id, s.client_id, s.body, s.attachments, s.reply_to_id, null,
                                     s.topic, s.mentions, 'everyone', s.silent);
    update genesis_chat.scheduled set sent_message_id = msg.id where id = s.id;
  exception when others then
    if left(sqlstate, 2) in ('22', '23', '42') or sqlstate = 'P0001' or s.attempts + 1 >= 5 then
      update genesis_chat.scheduled
         set attempts = attempts + 1,
             error = left(case when left(sqlstate, 2) in ('22', '23', '42') or sqlstate = 'P0001' then sqlerrm
                               else 'Gave up after 5 tries: ' || sqlerrm end, 500)
       where id = s.id;
    else
      update genesis_chat.scheduled set attempts = attempts + 1 where id = s.id;
    end if;
  end;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  return msg.id;
end;
$$;

-- ── Availability ──────────────────────────────────────────────────────────────

create table genesis_chat.availability (
  user_id uuid primary key references auth.users (id) on delete cascade,
  away_message text check (away_message is null or length(away_message) <= 280),
  away_until timestamptz,
  time_zone text check (time_zone is null or length(time_zone) <= 64),
  -- {"mon": [["09:00","17:00"]], "tue": [...], ...}; a missing day is not working.
  hours jsonb check (hours is null or (jsonb_typeof(hours) = 'object' and pg_column_size(hours) <= 2048)),
  updated_at timestamptz not null default now()
);

comment on table genesis_chat.availability is
  'A person''s away message and working hours, read through availability_for by people they share a conversation with. Genesis Chat.';

alter table genesis_chat.availability enable row level security;
create policy availability_own on genesis_chat.availability for select to authenticated using (user_id = auth.uid());
grant select on genesis_chat.availability to authenticated;
grant select, insert, update, delete on genesis_chat.availability to service_role;

create or replace function genesis_chat.set_availability(
  p_away_message text default null,
  p_away_until timestamptz default null,
  p_time_zone text default null,
  p_hours jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_time_zone is not null and not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone %', p_time_zone using errcode = '22023';
  end if;
  insert into genesis_chat.availability as a (user_id, away_message, away_until, time_zone, hours)
  values (auth.uid(), nullif(btrim(p_away_message), ''), p_away_until, p_time_zone, p_hours)
  on conflict (user_id) do update set away_message = excluded.away_message, away_until = excluded.away_until,
    time_zone = excluded.time_zone, hours = excluded.hours, updated_at = now();
end;
$$;

-- The availability of a conversation's members, for whoever reads it.
create or replace function genesis_chat.availability_for(p_conversation_id uuid)
returns table (user_id uuid, away_message text, away_until timestamptz, time_zone text, hours jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.away_message, a.away_until, a.time_zone, a.hours
    from genesis_chat.availability a
    join genesis_chat.members m on m.user_id = a.user_id and m.conversation_id = p_conversation_id
   where genesis_chat.can_view(p_conversation_id) and m.left_at is null and m.role <> 'observer'
$$;

-- ── Broadcast with private replies ────────────────────────────────────────────

-- Sends one message into each of these conversations where you may post (a coach to each
-- client's direct conversation), so every reply comes back privately. Idempotent per
-- conversation through `p_client_id` (each copy gets an id made from it). Returns the ids.
create or replace function genesis_chat.broadcast_message(
  p_conversation_ids uuid[],
  p_client_id uuid,
  p_body text default '',
  p_attachments jsonb default '[]',
  p_silent boolean default false
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
  ids uuid[] := '{}';
  msg genesis_chat.messages;
begin
  if cardinality(coalesce(p_conversation_ids, '{}')) > 500 then
    raise exception 'At most 500 conversations at once' using errcode = '22023';
  end if;
  if coalesce(jsonb_array_length(p_attachments), 0) > 0 then
    -- Files live in one conversation's folder; a broadcast carries text only (or links).
    raise exception 'A broadcast carries text only' using errcode = '22023';
  end if;
  foreach conv in array (select array_agg(distinct x) from unnest(p_conversation_ids) x where x is not null) loop
    if genesis_chat.can_post(conv) then
      msg := genesis_chat.send_message(conv, md5(p_client_id::text || ':' || conv::text)::uuid, p_body, '[]', null, null, null, '{}',
                                       'everyone', p_silent);
      ids := ids || msg.id;
    end if;
  end loop;
  return ids;
end;
$$;

-- ── Search ────────────────────────────────────────────────────────────────────

-- Messages (and voice or video transcripts) you can read that match `p_query`, newest first.
-- Within one conversation, or across all of yours.
create or replace function genesis_chat.search_messages(p_query text, p_conversation_id uuid default null, p_limit integer default 30)
returns table (message_id uuid, conversation_id uuid, seq bigint, sender_id uuid, created_at timestamptz, snippet text, in_transcript boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q tsquery;
begin
  if auth.uid() is null or length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  q := websearch_to_tsquery('simple', p_query);
  return query
  with mine as (
    select me.conversation_id from genesis_chat.members me
     where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
       and (p_conversation_id is null or me.conversation_id = p_conversation_id)
    union
    select p_conversation_id where p_conversation_id is not null and genesis_chat.i_observe(p_conversation_id)
  ), hits as (
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', m.body, q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»') as snippet, false as in_transcript
      from genesis_chat.messages m join mine using (conversation_id)
     where m.search @@ q and m.deleted_at is null
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
       and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid())
    union all
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', a.transcript, q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»'), true
      from genesis_chat.attachments a
      join genesis_chat.messages m on m.id = a.message_id
      join mine on mine.conversation_id = m.conversation_id
     where a.transcript is not null and a.transcript_search @@ q and m.deleted_at is null
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
  )
  select distinct on (h.created_at, h.id) h.id, h.conversation_id, h.seq, h.sender_id, h.created_at, h.snippet, h.in_transcript
    from hits h
   order by h.created_at desc, h.id
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- ── Link previews ─────────────────────────────────────────────────────────────

create table genesis_chat.link_previews (
  url text primary key check (length(url) <= 2000 and url ~ '^https://'),
  status text not null default 'ok' check (status in ('ok', 'failed', 'blocked')),
  title text check (title is null or length(title) <= 300),
  description text check (description is null or length(description) <= 600),
  image_url text check (image_url is null or (length(image_url) <= 2000 and image_url ~ '^https://')),
  site_name text check (site_name is null or length(site_name) <= 120),
  fetched_at timestamptz not null default now()
);

comment on table genesis_chat.link_previews is
  'Open Graph data for links in messages, fetched by the runner. A URL can carry a secret (a share link), so people read a row only through link_previews_for, for a message they can read. Genesis Chat.';

-- No policy and no select for people: the URLs come from private messages.
alter table genesis_chat.link_previews enable row level security;
grant select, insert, update, delete on genesis_chat.link_previews to service_role;

-- The links in a message's text that get a preview: its first three https links, without
-- any whose query looks like a credential (a reset token, a signed URL), which the server
-- must not fetch (it could use up a one-time link) or keep.
create or replace function genesis_chat.message_links(p_body text)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select u from (
    select distinct on (x.u) x.u, x.n
      from (select m[1] as u, row_number() over () as n
              from regexp_matches(coalesce(p_body, ''), '(https://[^\s<>()"'']{4,})', 'g') m) x
     where length(x.u) <= 2000
       and x.u !~* '[?&#;](access_token|id_token|refresh_token|token|auth|code|key|api_key|apikey|sig|signature|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential|otp|secret|password|session|sessionid)='
     order by x.u, x.n) y
   order by y.n
   limit 3
$$;
revoke execute on function genesis_chat.message_links(text) from public, anon, authenticated;
grant execute on function genesis_chat.message_links(text) to service_role;

-- The previews for the links in one message, for someone who can read that message (the
-- same rules as reading it: a member or observer, internal notes for observers, a hidden
-- message for its sender and observers). Nothing for anyone else.
create or replace function genesis_chat.link_previews_for(p_message_id uuid)
returns table (url text, status text, title text, description text, image_url text, site_name text, fetched_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.url, p.status, p.title, p.description, p.image_url, p.site_name, p.fetched_at
    from genesis_chat.messages m
    cross join lateral genesis_chat.message_links(m.body) l(u)
    join genesis_chat.link_previews p on p.url = l.u
   where m.id = p_message_id and m.deleted_at is null and auth.uid() is not null
     and genesis_chat.can_view(m.conversation_id)
     and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
     and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id))
$$;

create or replace function genesis_chat.save_link_preview(
  p_url text, p_status text, p_title text default null, p_description text default null,
  p_image_url text default null, p_site_name text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into genesis_chat.link_previews (url, status, title, description, image_url, site_name)
  values (p_url, p_status, left(p_title, 300), left(p_description, 600),
          case when p_image_url ~ '^https://' then left(p_image_url, 2000) end, left(p_site_name, 120))
  on conflict (url) do update set status = excluded.status, title = excluded.title, description = excluded.description,
    image_url = excluded.image_url, site_name = excluded.site_name, fetched_at = now();
$$;

-- ── Moderation ────────────────────────────────────────────────────────────────

-- In a kind that moderates, a message's push waits for the verdict: message_effects_0002
-- queues `push:<id>` to run at 'infinity' (0001's message_posted then finds the key taken),
-- and moderate_message releases it (clean or flagged) or settles it unsent (hidden). So a
-- push never carries text moderation hides. A runner without a moderator never sends those
-- pushes: give it one when a kind moderates.

-- The server's side: what moderation said. `hidden` takes the message from members' view and
-- files a report the conversation's observers see; `flagged` files the report only. A verdict
-- never lowers one already given (a retry, or an edit judged again, can't un-hide a message),
-- and the same verdict on the same text files one report however often it comes.
create or replace function genesis_chat.moderate_message(p_message_id uuid, p_result text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  next_ text;
begin
  if p_result is null or p_result not in ('clean', 'flagged', 'hidden') then
    raise exception 'Moderation is clean, flagged or hidden' using errcode = '22023';
  end if;
  select * into msg from genesis_chat.messages where id = p_message_id for update;
  if p_result = 'hidden' then
    update genesis_chat.effects set done_at = now(), locked_until = null, last_error = 'hidden by moderation'
     where key = 'push:' || p_message_id and done_at is null;
  else
    update genesis_chat.effects set run_after = now()
     where key = 'push:' || p_message_id and done_at is null and run_after = 'infinity';
  end if;
  if msg.id is null or p_result = 'clean' then
    return;
  end if;
  next_ := case when msg.moderation = 'hidden' or p_result = 'hidden' then 'hidden' else 'flagged' end;
  if next_ is distinct from msg.moderation then
    update genesis_chat.messages set moderation = next_ where id = msg.id;
    perform genesis_chat.broadcast('genesis-chat:conv:' || msg.conversation_id, 'message',
      jsonb_build_object('id', msg.id, 'seq', msg.seq, 'conversation_id', msg.conversation_id, 'op', 'update'));
  end if;
  if not exists (
       select 1 from genesis_chat.reports r
        where r.message_id = msg.id and r.reporter_id is null and r.snapshot ->> 'automatic' = 'true'
          and r.snapshot ->> 'result' = p_result
          and (r.snapshot ->> 'edited_at')::timestamptz is not distinct from msg.edited_at) then
    insert into genesis_chat.reports (message_id, conversation_id, reporter_id, reason, note, snapshot)
    values (msg.id, msg.conversation_id, null, 'safety', left(coalesce(p_reason, 'Automatic moderation'), 1000),
            jsonb_build_object('message', jsonb_build_object('id', msg.id, 'sender_id', msg.sender_id, 'body', msg.body,
                                                             'created_at', msg.created_at),
                               'automatic', true, 'result', p_result, 'edited_at', msg.edited_at));
  end if;
end;
$$;

-- Does this conversation's kind moderate?
create or replace function genesis_chat.moderates(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from genesis_chat.kind_options o join genesis_chat.conversations c on c.kind = o.kind
                  where c.id = p_conversation_id and o.moderate)
$$;
revoke execute on function genesis_chat.moderates(uuid) from public, anon, authenticated;
grant execute on function genesis_chat.moderates(uuid) to service_role;

-- New messages queue moderation (where the kind asks for it, holding the push until it is
-- done) and link previews (where the text has a link that has none yet).
create or replace function genesis_chat.message_effects_0002()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  link text;
begin
  if new.kind <> 'text' then
    return null;
  end if;
  if genesis_chat.moderates(new.conversation_id) then
    perform genesis_chat.enqueue('moderate', 'moderate:' || new.id,
      jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id));
    -- The push waits for the verdict, whichever of this and 0001's trigger runs first.
    if not new.silent and new.visibility = 'everyone' then
      insert into genesis_chat.effects (kind, key, payload, run_after)
      values ('push', 'push:' || new.id, jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id), 'infinity')
      on conflict (key) do update set run_after = 'infinity' where genesis_chat.effects.done_at is null;
    end if;
  end if;
  for link in select genesis_chat.message_links(new.body) loop
    if not exists (select 1 from genesis_chat.link_previews p where p.url = link and p.fetched_at > now() - interval '7 days') then
      perform genesis_chat.enqueue('unfurl', 'unfurl:' || md5(link) || ':' || to_char(now(), 'YYYY-MM-DD'),
        jsonb_build_object('url', link, 'message_id', new.id, 'conversation_id', new.conversation_id));
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function genesis_chat.message_effects_0002() from public, anon, authenticated;
create trigger messages_effects_0002 after insert on genesis_chat.messages
  for each row execute function genesis_chat.message_effects_0002();

-- An edited message is judged again (sending "hi" and editing it is no way around moderation).
create or replace function genesis_chat.message_edited_0002()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'text' and new.deleted_at is null and new.body is distinct from old.body and btrim(new.body) <> ''
     and genesis_chat.moderates(new.conversation_id) then
    perform genesis_chat.enqueue('moderate', 'moderate:' || new.id || ':' || coalesce(new.edited_at, now()),
      jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.message_edited_0002() from public, anon, authenticated;
create trigger messages_edited_0002 after update of body on genesis_chat.messages
  for each row execute function genesis_chat.message_edited_0002();

-- 0001's functions that read messages for someone, now leaving out hidden ones: no push
-- for a hidden message, no badge count for it, no inbox preview of it (except its sender's).
-- Same signatures; re-granted by name below.

create or replace function genesis_chat.unread_count(p_conversation_id uuid, p_user_id uuid, p_after bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from (
    select 1 from genesis_chat.messages m
     where m.conversation_id = p_conversation_id and m.seq > p_after and m.deleted_at is null
       and m.sender_id is distinct from p_user_id and m.visibility = 'everyone' and m.thread_root_id is null
       and m.moderation is distinct from 'hidden'
     limit 99) u
$$;

-- p_badge_exclude_kinds: kinds the app leaves out of its badge (as unread_total does), so the
-- push badge and the app's own badge agree.
drop function genesis_chat.push_targets(uuid);
create function genesis_chat.push_targets(p_message_id uuid, p_badge_exclude_kinds text[] default null)
returns table (user_id uuid, conversation_id uuid, title text, sender_id uuid, preview text, mentioned boolean, unread_total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with msg as (
    select m.*, c.title as conversation_title
      from genesis_chat.messages m join genesis_chat.conversations c on c.id = m.conversation_id
     where m.id = p_message_id and m.deleted_at is null and not m.silent and m.kind = 'text' and m.visibility = 'everyone'
       and m.moderation is distinct from 'hidden'
  ), recipients as (
    select me.user_id from msg join genesis_chat.members me on me.conversation_id = msg.conversation_id
     where me.left_at is null and me.role <> 'observer' and me.user_id is distinct from msg.sender_id
       and coalesce(me.muted_until <= now(), true) and me.notify <> 'none'
       and (me.notify = 'all' or me.user_id = any (msg.mentions))
    union
    select c.assignee_id from msg join genesis_chat.conversations c on c.id = msg.conversation_id
     where c.assignee_id is not null and c.assignee_id is distinct from msg.sender_id
  )
  select r.user_id, msg.conversation_id, msg.conversation_title, msg.sender_id,
         case when msg.body <> '' then left(msg.body, 180)
              else (select case a.kind when 'image' then 'Photo' when 'voice' then 'Voice message' when 'video' then 'Video'
                                       when 'file' then 'File' else 'Attachment' end
                      from genesis_chat.attachments a where a.message_id = msg.id order by a.position limit 1) end,
         r.user_id = any (msg.mentions),
         (select coalesce(sum(genesis_chat.unread_count(c2.id, m2.user_id, m2.last_read_seq)), 0)::integer
            from genesis_chat.members m2 join genesis_chat.conversations c2 on c2.id = m2.conversation_id
           where m2.user_id = r.user_id and m2.left_at is null and m2.role <> 'observer' and not m2.archived
             and coalesce(m2.muted_until <= now(), true) and c2.last_seq > m2.last_read_seq
             and (p_badge_exclude_kinds is null or not (c2.kind = any (p_badge_exclude_kinds))))
    from recipients r cross join msg
$$;

-- The inbox also narrows to several kinds, or leaves some out (an app's Messages without its
-- support tickets). Same columns as 0001's; the old call shape still works.
drop function genesis_chat.inbox(text, boolean, integer, timestamptz);
create function genesis_chat.inbox(
  p_kind text default null,
  p_archived boolean default false,
  p_limit integer default 50,
  p_before timestamptz default null,
  p_kinds text[] default null,
  p_exclude_kinds text[] default null
)
returns table (
  conversation_id uuid,
  kind text,
  title text,
  subject_type text,
  subject_id text,
  status text,
  role text,
  other_user_id uuid,
  member_count integer,
  last_seq bigint,
  last_read_seq bigint,
  unread integer,
  mentioned boolean,
  muted boolean,
  pinned boolean,
  archived boolean,
  last_message_at timestamptz,
  last_message jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind, c.title, c.subject_type, c.subject_id, c.status, me.role,
         (select o.user_id from genesis_chat.members o
           where o.conversation_id = c.id and o.user_id <> me.user_id and o.left_at is null and o.role <> 'observer'
             and k.max_members = 2 limit 1),
         (select count(*)::integer from genesis_chat.members o
           where o.conversation_id = c.id and o.left_at is null and o.role <> 'observer'),
         c.last_seq, me.last_read_seq,
         genesis_chat.unread_count(c.id, me.user_id, me.last_read_seq),
         exists (select 1 from genesis_chat.messages m
                  where m.conversation_id = c.id and m.seq > me.last_read_seq and me.user_id = any (m.mentions)
                    and m.moderation is distinct from 'hidden'),
         coalesce(me.muted_until > now(), false), me.pinned, me.archived, c.last_message_at,
         (select jsonb_build_object('id', m.id, 'seq', m.seq, 'sender_id', m.sender_id, 'kind', m.kind,
                                    'body', left(m.body, 160), 'deleted', m.deleted_at is not null, 'created_at', m.created_at,
                                    'attachment', (select a.kind from genesis_chat.attachments a where a.message_id = m.id order by a.position limit 1))
            from genesis_chat.messages m
           where m.conversation_id = c.id and m.visibility = 'everyone' and m.thread_root_id is null
             and (m.moderation is distinct from 'hidden' or m.sender_id = me.user_id)
           order by m.seq desc limit 1)
    from genesis_chat.members me
    join genesis_chat.conversations c on c.id = me.conversation_id
    join genesis_chat.kinds k on k.kind = c.kind
   where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
     and me.archived = coalesce(p_archived, false)
     and (p_kind is null or c.kind = p_kind)
     and (p_kinds is null or c.kind = any (p_kinds))
     and (p_exclude_kinds is null or not (c.kind = any (p_exclude_kinds)))
     and (p_before is null or coalesce(c.last_message_at, c.created_at) < p_before)
   order by me.pinned desc, coalesce(c.last_message_at, c.created_at) desc, c.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- The badge can leave kinds out too, to match an inbox that does.
drop function genesis_chat.unread_total(uuid);
create function genesis_chat.unread_total(p_user_id uuid default null, p_exclude_kinds text[] default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(genesis_chat.unread_count(c.id, me.user_id, me.last_read_seq)), 0)::integer
    from genesis_chat.members me join genesis_chat.conversations c on c.id = me.conversation_id
   where me.user_id = case when auth.role() = 'service_role' then coalesce(p_user_id, auth.uid()) else auth.uid() end
     and me.left_at is null and me.role <> 'observer' and me.archived = false
     and coalesce(me.muted_until <= now(), true) and c.last_seq > me.last_read_seq
     and (p_exclude_kinds is null or not (c.kind = any (p_exclude_kinds)))
$$;

-- ── Retention and legal hold ──────────────────────────────────────────────────

-- The server's side: removes messages older than their kind's retention, except in
-- conversations on legal hold. Files are queued for removal by 0001's attachment trigger.
-- Returns how many went (at most p_limit per call).
create or replace function genesis_chat.purge_expired(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with doomed as (
    select m.id from genesis_chat.messages m
      join genesis_chat.conversations c on c.id = m.conversation_id and not c.legal_hold
      join genesis_chat.kind_options o on o.kind = c.kind and o.retention is not null
     where m.created_at < now() - o.retention
     order by m.created_at
     limit least(greatest(coalesce(p_limit, 1000), 1), 10000)
  )
  delete from genesis_chat.messages m using doomed d where m.id = d.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Owners and admins (or the server) put a conversation on legal hold, or lift it.
create or replace function genesis_chat.set_legal_hold(p_conversation_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Legal hold is set by the server' using errcode = '42501';
  end if;
  update genesis_chat.conversations set legal_hold = coalesce(p_on, false) where id = p_conversation_id;
end;
$$;

-- ── Grants, by name ───────────────────────────────────────────────────────────

revoke execute on function
  genesis_chat.set_topic(uuid, text, text, integer, boolean),
  genesis_chat.schedule_message(uuid, uuid, timestamptz, text, jsonb, uuid, text, uuid[], boolean),
  genesis_chat.cancel_scheduled(uuid),
  genesis_chat.set_availability(text, timestamptz, text, jsonb),
  genesis_chat.availability_for(uuid),
  genesis_chat.broadcast_message(uuid[], uuid, text, jsonb, boolean),
  genesis_chat.search_messages(text, uuid, integer),
  genesis_chat.link_previews_for(uuid),
  genesis_chat.inbox(text, boolean, integer, timestamptz, text[], text[]),
  genesis_chat.unread_total(uuid, text[])
from public, anon;

grant execute on function
  genesis_chat.set_topic(uuid, text, text, integer, boolean),
  genesis_chat.schedule_message(uuid, uuid, timestamptz, text, jsonb, uuid, text, uuid[], boolean),
  genesis_chat.cancel_scheduled(uuid),
  genesis_chat.set_availability(text, timestamptz, text, jsonb),
  genesis_chat.availability_for(uuid),
  genesis_chat.broadcast_message(uuid[], uuid, text, jsonb, boolean),
  genesis_chat.search_messages(text, uuid, integer),
  genesis_chat.link_previews_for(uuid),
  genesis_chat.inbox(text, boolean, integer, timestamptz, text[], text[]),
  genesis_chat.unread_total(uuid, text[])
to authenticated, service_role;

revoke execute on function
  genesis_chat.due_scheduled(integer),
  genesis_chat.post_scheduled(uuid),
  genesis_chat.save_link_preview(text, text, text, text, text, text),
  genesis_chat.moderate_message(uuid, text, text),
  genesis_chat.purge_expired(integer),
  genesis_chat.set_legal_hold(uuid, boolean),
  genesis_chat.unread_count(uuid, uuid, bigint),
  genesis_chat.push_targets(uuid, text[])
from public, anon, authenticated;

grant execute on function
  genesis_chat.due_scheduled(integer),
  genesis_chat.post_scheduled(uuid),
  genesis_chat.save_link_preview(text, text, text, text, text, text),
  genesis_chat.moderate_message(uuid, text, text),
  genesis_chat.purge_expired(integer),
  genesis_chat.set_legal_hold(uuid, boolean),
  genesis_chat.unread_count(uuid, uuid, bigint),
  genesis_chat.push_targets(uuid, text[])
to service_role;
