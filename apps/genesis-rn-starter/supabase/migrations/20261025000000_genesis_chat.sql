-- Genesis Chat: conversations, members, messages, attachments, reactions and read state
--
-- The server half of `@marktiderman/genesis-chat`, in the app's own Supabase, in the
-- genesis_chat schema:
--
--   kinds          the kinds of conversation the app uses (direct, group, and its own:
--                  a cohort, a support ticket…), each with its rules: how many members,
--                  who posts, who adds members, whether threads are on, who else may read
--   conversations  a place messages live, optionally tied to one of the app's records
--                  (subject_type + subject_id, e.g. a group), with a running sequence
--   members        who is in it (owner, admin, member), how far they have read, and their
--                  own settings (muted, notify level, archived, pinned)
--   messages       text (markdown) with mentions, a reply, one level of thread, a topic,
--                  edits and tombstoned deletes; numbered per conversation by the server,
--                  made idempotent by the sender's client_id
--   attachments    images, files, voice notes, videos and links, or the app's own kinds
--                  (a form, a lesson), each with its media metadata (duration, waveform,
--                  poster, thumbhash, transcript)
--   reactions      emoji, any number per person per message
--   pins, saved    a conversation's pinned messages; a person's own saved messages
--   reports        a reported message, with a snapshot of it and its context
--   effects        an outbox: push, transcription and storage removal, worked by a runner
--
-- Access, enforced here by row level security:
--   - A conversation is its members'. Members read it; who posts follows the kind.
--   - A kind may name an observer check, a function (conversation_id uuid, user_id uuid)
--     returns boolean of the app's: those it says yes to read the conversation without
--     being in it (a practice's staff, a support team), and post when the kind lets
--     observers post. Messages with visibility 'observers' (internal notes) are read only
--     by observers.
--   - A kind may name a start check, a function (member_ids uuid[], subject_type text,
--     subject_id text, user_id uuid) returns boolean of the app's: whether that person
--     may start a conversation of the kind with those people. Without one, only the
--     server (service role) starts conversations of the kind.
--   - Everything else goes through the functions below. anon reaches nothing.
--
-- Register the app's rules in a migration of your own, after this one:
--
--   create function public.chat_may_dm(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
--   returns boolean language sql stable security definer set search_path = '' as $$
--     select exists (select 1 from public.team t1 join public.team t2 using (org_id)
--                    where t1.user_id = chat_may_dm.user_id and t2.user_id = member_ids[1])
--   $$;
--   revoke execute on function public.chat_may_dm(uuid[], text, text, uuid) from public, anon, authenticated;
--   select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
--     p_start_check => 'public.chat_may_dm(uuid[], text, text, uuid)');
--
-- Media: files go in the private `genesis-chat` bucket under
-- `<conversation id>/<uploader id>/<name>.<ext>`, uploaded by someone who may post there,
-- read by whoever reads the message that carries them. Restrictive policies keep the
-- bucket to these rules whatever other storage policies the app has.
--
-- Live updates: each new or changed message, reaction and membership is broadcast to
-- private Realtime topics, `genesis-chat:conv:<id>` (its readers) and
-- `genesis-chat:user:<id>` (a member's inbox), as a hint carrying ids only; clients
-- fetch through row level security. Typing and presence are broadcast by clients on
-- the conversation topic and never stored.
--
-- Side effects: a message queues a `push` effect, a voice or video attachment a
-- `transcribe` effect, a deleted file a `storage.remove` effect. A runner claims them
-- (claim_effects), does them, and settles them (complete_effect). Nothing is sent
-- from a trigger.
--
-- Account deletion: a login's memberships, messages, reactions and saved messages go
-- with it, and its files are queued for removal.
--
-- Use: `genesis add chat` copies this file into supabase/migrations under a new
-- timestamped name. Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_chat.test.sql`).

create schema if not exists genesis_chat;

comment on schema genesis_chat is 'Genesis Chat: conversations, members, messages and attachments. Reached through RLS and the functions in this schema.';

grant usage on schema genesis_chat to authenticated, service_role;

-- ── Kinds ─────────────────────────────────────────────────────────────────────

create table genesis_chat.kinds (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(label) between 1 and 80),
  max_members integer check (max_members is null or max_members >= 2),
  who_posts text not null default 'members' check (who_posts in ('members', 'admins')),
  membership text not null default 'app' check (membership in ('app', 'admins')),
  threads boolean not null default true,
  observer_check regprocedure,
  observers_post boolean not null default false,
  start_check regprocedure,
  edit_window interval,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table genesis_chat.kinds is 'The kinds of conversation and their rules. Written by register_kind (the service role or a migration). Genesis Chat.';
comment on column genesis_chat.kinds.membership is 'Who adds and removes members: the app only (sync_members), or also the conversation''s owners and admins.';
comment on column genesis_chat.kinds.observer_check is 'f(conversation_id uuid, user_id uuid) returns boolean: who reads without being a member.';
comment on column genesis_chat.kinds.start_check is 'f(member_ids uuid[], subject_type text, subject_id text, user_id uuid) returns boolean: who may start one.';

alter table genesis_chat.kinds enable row level security;
create policy kinds_read on genesis_chat.kinds for select to authenticated using (true);
grant select on genesis_chat.kinds to authenticated;
grant select, insert, update, delete on genesis_chat.kinds to service_role;

create or replace function genesis_chat.register_kind(
  p_kind text,
  p_label text,
  p_max_members integer default null,
  p_who_posts text default 'members',
  p_membership text default 'app',
  p_threads boolean default true,
  p_observer_check regprocedure default null,
  p_observers_post boolean default false,
  p_start_check regprocedure default null,
  p_edit_window interval default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_observer_check is not null and (
       pg_get_function_identity_arguments(p_observer_check) !~ '^[a-z_]* ?uuid, [a-z_]* ?uuid$'
       or (select prorettype from pg_proc where oid = p_observer_check) <> 'boolean'::regtype) then
    raise exception 'An observer check takes (conversation_id uuid, user_id uuid) and returns boolean' using errcode = '22023';
  end if;
  if p_start_check is not null and (
       pg_get_function_identity_arguments(p_start_check) !~ '^[a-z_]* ?uuid\[\], [a-z_]* ?text, [a-z_]* ?text, [a-z_]* ?uuid$'
       or (select prorettype from pg_proc where oid = p_start_check) <> 'boolean'::regtype) then
    raise exception 'A start check takes (member_ids uuid[], subject_type text, subject_id text, user_id uuid) and returns boolean' using errcode = '22023';
  end if;
  insert into genesis_chat.kinds as k (kind, label, max_members, who_posts, membership, threads,
                                       observer_check, observers_post, start_check, edit_window)
  values (p_kind, p_label, p_max_members, p_who_posts, p_membership, p_threads,
          p_observer_check, p_observers_post, p_start_check, p_edit_window)
  on conflict (kind) do update set
    label = excluded.label, max_members = excluded.max_members, who_posts = excluded.who_posts,
    membership = excluded.membership, threads = excluded.threads, observer_check = excluded.observer_check,
    observers_post = excluded.observers_post, start_check = excluded.start_check,
    edit_window = excluded.edit_window, updated_at = now();
end;
$$;

revoke execute on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval) from public, anon, authenticated;
grant execute on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval) to service_role;

comment on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval) is
  'Adds or replaces a kind of conversation and its rules. Run from a migration or the service role. Genesis Chat.';

-- Two kinds every app has. Neither may be started by a person until the app registers
-- a start check for it.
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2);
select genesis_chat.register_kind('group', 'Group', p_membership => 'admins');

-- ── Conversations and members ──────────────────────────────────────────────────

create table genesis_chat.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null references genesis_chat.kinds (kind) on update cascade,
  title text check (title is null or length(title) between 1 and 120),
  subject_type text check (subject_type is null or subject_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  subject_id text check (subject_id is null or length(subject_id) between 1 and 200),
  direct_key text unique,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192),
  status text check (status is null or status in ('open', 'pending', 'solved', 'closed')),
  assignee_id uuid references auth.users (id) on delete set null,
  last_seq bigint not null default 0,
  last_message_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint conversations_subject_pair check ((subject_type is null) = (subject_id is null))
);

create unique index conversations_one_per_subject on genesis_chat.conversations (kind, subject_type, subject_id)
  where subject_type is not null;
create index conversations_assignee_idx on genesis_chat.conversations (assignee_id) where assignee_id is not null;
create index conversations_created_by_idx on genesis_chat.conversations (created_by);
create index conversations_kind_recent_idx on genesis_chat.conversations (kind, last_message_at desc);

comment on table genesis_chat.conversations is 'A place messages live. Read by its members and its kind''s observers. Genesis Chat.';
comment on column genesis_chat.conversations.settings is 'Per conversation overrides: {"who_posts": "admins"} makes it one-way. Genesis Chat.';

create table genesis_chat.members (
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'observer')),
  last_read_seq bigint not null default 0,
  muted_until timestamptz,
  notify text not null default 'all' check (notify in ('all', 'mentions', 'none')),
  archived boolean not null default false,
  pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create index members_user_idx on genesis_chat.members (user_id) where left_at is null;

comment on table genesis_chat.members is
  'Who is in a conversation. An observer row only keeps an observer''s read state and settings: it grants nothing. Genesis Chat.';

-- ── Messages ──────────────────────────────────────────────────────────────────

create table genesis_chat.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  seq bigint not null,
  client_id uuid not null default gen_random_uuid(),
  sender_id uuid references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('owner', 'admin', 'member', 'observer', 'system')),
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null default '' check (length(body) <= 10000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  reply_to_id uuid references genesis_chat.messages (id) on delete set null,
  thread_root_id uuid references genesis_chat.messages (id) on delete cascade,
  thread_count integer not null default 0,
  thread_last_at timestamptz,
  topic text check (topic is null or length(topic) between 1 and 120),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'observers')),
  silent boolean not null default false,
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4096),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_seq_unique unique (conversation_id, seq),
  constraint messages_client_unique unique (sender_id, client_id),
  constraint messages_system_sender check ((kind = 'system') = (sender_role = 'system'))
);

create index messages_thread_idx on genesis_chat.messages (thread_root_id, seq) where thread_root_id is not null;
create index messages_topic_idx on genesis_chat.messages (conversation_id, topic, seq) where topic is not null;
create index messages_reply_idx on genesis_chat.messages (reply_to_id) where reply_to_id is not null;
create index messages_sender_idx on genesis_chat.messages (sender_id);

comment on table genesis_chat.messages is 'Messages, numbered per conversation (seq). Written through send_message, edit_message and delete_message. Genesis Chat.';

create table genesis_chat.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references genesis_chat.messages (id) on delete cascade,
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  position smallint not null default 0 check (position between 0 and 19),
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{0,39}$'),
  ref jsonb not null default '{}' check (jsonb_typeof(ref) = 'object' and pg_column_size(ref) <= 2048),
  provider text not null default 'storage' check (provider in ('storage', 'mux', 'cloudflare', 'external', 'none')),
  path text check (path is null or length(path) <= 400),
  provider_id text check (provider_id is null or length(provider_id) <= 200),
  playback_id text check (playback_id is null or length(playback_id) <= 200),
  url text check (url is null or (length(url) <= 2000 and url ~ '^https://')),
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed')),
  name text check (name is null or length(name) <= 200),
  mime text check (mime is null or length(mime) <= 120),
  bytes bigint check (bytes is null or bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  waveform smallint[] check (waveform is null or cardinality(waveform) <= 128),
  poster_path text check (poster_path is null or length(poster_path) <= 400),
  thumbhash text check (thumbhash is null or length(thumbhash) <= 64),
  transcript text check (transcript is null or length(transcript) <= 100000),
  transcript_status text check (transcript_status is null or transcript_status in ('pending', 'ready', 'failed', 'off')),
  created_at timestamptz not null default now(),
  constraint attachments_storage_path check (provider <> 'storage' or path is not null)
);

create index attachments_message_idx on genesis_chat.attachments (message_id, position);
create index attachments_conversation_idx on genesis_chat.attachments (conversation_id, kind);
create index attachments_path_idx on genesis_chat.attachments (path) where path is not null;
create index attachments_poster_idx on genesis_chat.attachments (poster_path) where poster_path is not null;

comment on table genesis_chat.attachments is 'What a message carries: a file in the genesis-chat bucket, a hosted video, a link or an app reference (ref). Genesis Chat.';

create table genesis_chat.reactions (
  message_id uuid not null references genesis_chat.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index reactions_user_idx on genesis_chat.reactions (user_id);

create table genesis_chat.pins (
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  message_id uuid not null references genesis_chat.messages (id) on delete cascade,
  pinned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);
create index pins_message_idx on genesis_chat.pins (message_id);
create index pins_pinned_by_idx on genesis_chat.pins (pinned_by);

create table genesis_chat.saved (
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null references genesis_chat.messages (id) on delete cascade,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index saved_message_idx on genesis_chat.saved (message_id);

create table genesis_chat.reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references genesis_chat.messages (id) on delete set null,
  conversation_id uuid not null references genesis_chat.conversations (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'safety', 'other')),
  note text check (note is null or length(note) <= 1000),
  snapshot jsonb not null check (pg_column_size(snapshot) <= 65536),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create index reports_conversation_idx on genesis_chat.reports (conversation_id, created_at desc);
create index reports_reporter_idx on genesis_chat.reports (reporter_id);
create index reports_message_idx on genesis_chat.reports (message_id);
create index reports_resolved_by_idx on genesis_chat.reports (resolved_by);

comment on table genesis_chat.reports is 'Reported messages, with a snapshot of the message and the ten before it. Read by the reporter and the conversation''s observers. Genesis Chat.';

-- ── The outbox ────────────────────────────────────────────────────────────────

create table genesis_chat.effects (
  id bigint generated always as identity primary key,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{0,39}$'),
  key text not null unique check (length(key) <= 300),
  payload jsonb not null default '{}',
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index effects_due_idx on genesis_chat.effects (run_after) where done_at is null;

comment on table genesis_chat.effects is 'Side effects to do (push, transcribe, storage.remove), each once by key. Worked through claim_effects and complete_effect by the service role. Genesis Chat.';

alter table genesis_chat.effects enable row level security;
grant select, insert, update, delete on genesis_chat.effects to service_role;

create or replace function genesis_chat.enqueue(p_kind text, p_key text, p_payload jsonb, p_run_after timestamptz default now())
returns void
language sql
security definer
set search_path = ''
as $$
  insert into genesis_chat.effects (kind, key, payload, run_after)
  values (p_kind, p_key, coalesce(p_payload, '{}'), coalesce(p_run_after, now()))
  on conflict (key) do nothing;
$$;
revoke execute on function genesis_chat.enqueue(text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function genesis_chat.enqueue(text, text, jsonb, timestamptz) to service_role;

-- ── Access ────────────────────────────────────────────────────────────────────

-- Is this person a current member (owner, admin or member) of the conversation?
create or replace function genesis_chat.is_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from genesis_chat.members m
    where m.conversation_id = p_conversation_id and m.user_id = p_user_id
      and m.left_at is null and m.role <> 'observer')
$$;

-- Does the conversation's kind say this person reads it without being in it?
create or replace function genesis_chat.observes(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  check_fn regprocedure;
  result boolean;
begin
  if p_user_id is null then
    return false;
  end if;
  select k.observer_check into check_fn
  from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
  where c.id = p_conversation_id;
  if check_fn is null then
    return false;
  end if;
  execute format('select %s($1::uuid, $2::uuid)', check_fn::regproc) into result using p_conversation_id, p_user_id;
  return coalesce(result, false);
end;
$$;

-- May the signed-in person read the conversation?
create or replace function genesis_chat.can_view(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select genesis_chat.is_member(p_conversation_id) or genesis_chat.observes(p_conversation_id)
$$;

-- The signed-in person's part in the conversation: owner, admin, member, observer or null.
create or replace function genesis_chat.my_role(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.role from genesis_chat.members m
      where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
        and m.left_at is null and m.role <> 'observer'),
    case when genesis_chat.observes(p_conversation_id) then 'observer' end)
$$;

-- May the signed-in person post in the conversation?
create or replace function genesis_chat.can_post(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case genesis_chat.my_role(c.id)
             when 'owner' then true
             when 'admin' then true
             when 'member' then coalesce(c.settings ->> 'who_posts', k.who_posts) = 'members'
             when 'observer' then k.observers_post
             else false
           end
    from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
    where c.id = p_conversation_id and c.archived_at is null), false)
$$;

-- Does the signed-in person observe the conversation? (For policies: observes() itself is
-- the server's, since it answers for anyone.)
create or replace function genesis_chat.i_observe(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select genesis_chat.observes(p_conversation_id, auth.uid())
$$;

revoke execute on function genesis_chat.is_member(uuid, uuid), genesis_chat.observes(uuid, uuid) from public, anon, authenticated;
revoke execute on function genesis_chat.i_observe(uuid) from public, anon;
grant execute on function genesis_chat.i_observe(uuid) to authenticated, service_role;
grant execute on function genesis_chat.is_member(uuid, uuid), genesis_chat.observes(uuid, uuid) to service_role;
revoke execute on function genesis_chat.can_view(uuid), genesis_chat.my_role(uuid), genesis_chat.can_post(uuid) from public, anon;
grant execute on function genesis_chat.can_view(uuid), genesis_chat.my_role(uuid), genesis_chat.can_post(uuid) to authenticated, service_role;

-- ── Row level security ────────────────────────────────────────────────────────
-- Reads only; every write goes through a function below.

alter table genesis_chat.conversations enable row level security;
alter table genesis_chat.members enable row level security;
alter table genesis_chat.messages enable row level security;
alter table genesis_chat.attachments enable row level security;
alter table genesis_chat.reactions enable row level security;
alter table genesis_chat.pins enable row level security;
alter table genesis_chat.saved enable row level security;
alter table genesis_chat.reports enable row level security;

create policy conversations_read on genesis_chat.conversations for select to authenticated
  using (genesis_chat.can_view(id));

-- Members see who else is in it; observers see the members too.
create policy members_read on genesis_chat.members for select to authenticated
  using (user_id = auth.uid() or (role <> 'observer' and left_at is null and genesis_chat.can_view(conversation_id)));

create policy messages_read on genesis_chat.messages for select to authenticated
  using (genesis_chat.can_view(conversation_id)
         and (visibility = 'everyone' or genesis_chat.i_observe(conversation_id)));

create policy attachments_read on genesis_chat.attachments for select to authenticated
  using (exists (select 1 from genesis_chat.messages m where m.id = message_id));

create policy reactions_read on genesis_chat.reactions for select to authenticated
  using (exists (select 1 from genesis_chat.messages m where m.id = message_id));

create policy pins_read on genesis_chat.pins for select to authenticated
  using (genesis_chat.can_view(conversation_id));

create policy saved_read on genesis_chat.saved for select to authenticated
  using (user_id = auth.uid());

create policy reports_read on genesis_chat.reports for select to authenticated
  using (reporter_id = auth.uid() or genesis_chat.i_observe(conversation_id));

grant select on genesis_chat.conversations, genesis_chat.members, genesis_chat.messages, genesis_chat.attachments,
  genesis_chat.reactions, genesis_chat.pins, genesis_chat.saved, genesis_chat.reports to authenticated;
grant select, insert, update, delete on genesis_chat.conversations, genesis_chat.members, genesis_chat.messages,
  genesis_chat.attachments, genesis_chat.reactions, genesis_chat.pins, genesis_chat.saved, genesis_chat.reports to service_role;

-- ── Live updates ──────────────────────────────────────────────────────────────

-- Sends a hint to a private Realtime topic. Chat never fails because Realtime can't
-- take a message: a missed hint is caught up on the next fetch.
create or replace function genesis_chat.broadcast(p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return;
  end if;
  execute 'select realtime.send($1, $2, $3, true)' using p_payload, p_event, p_topic;
exception when others then
  null;
end;
$$;
revoke execute on function genesis_chat.broadcast(text, text, jsonb) from public, anon, authenticated;

-- May the signed-in person join this Realtime topic? Its readers join a conversation's
-- topic (and broadcast typing and presence there); only you join your own inbox topic.
create or replace function genesis_chat.can_join_topic(p_topic text, p_write boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_topic is null then
    return false;
  end if;
  if p_topic ~ '^genesis-chat:user:[0-9a-f-]{36}$' then
    return not p_write and split_part(p_topic, ':', 3) = me::text;
  end if;
  if p_topic ~ '^genesis-chat:conv:[0-9a-f-]{36}$' then
    return genesis_chat.can_view(split_part(p_topic, ':', 3)::uuid);
  end if;
  return false;
end;
$$;
revoke execute on function genesis_chat.can_join_topic(text, boolean) from public, anon;
grant execute on function genesis_chat.can_join_topic(text, boolean) to authenticated;

do $do$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy genesis_chat_join on realtime.messages for select to authenticated
        using (genesis_chat.can_join_topic(realtime.topic()))
    $p$;
    execute $p$
      create policy genesis_chat_signal on realtime.messages for insert to authenticated
        with check (realtime.messages.extension in ('broadcast', 'presence')
                    and genesis_chat.can_join_topic(realtime.topic(), true))
    $p$;
  end if;
end;
$do$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

-- The next number in the conversation, taken under the conversation's row lock, so
-- numbers are dense and in commit order per conversation.
create or replace function genesis_chat.number_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_chat.conversations
     set last_seq = last_seq + 1, last_message_at = new.created_at, updated_at = now()
   where id = new.conversation_id
  returning last_seq into new.seq;
  if new.seq is null then
    raise exception 'No such conversation' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function genesis_chat.number_message() from public, anon, authenticated;
create trigger messages_number before insert on genesis_chat.messages
  for each row execute function genesis_chat.number_message();

-- A message posted: the sender has read up to it, the thread root counts it, push is
-- queued (a moment later, so a burst collapses), and readers get a hint.
create or replace function genesis_chat.message_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  fanout integer;
begin
  if new.sender_id is not null then
    update genesis_chat.members set last_read_seq = greatest(last_read_seq, new.seq)
     where conversation_id = new.conversation_id and user_id = new.sender_id;
  end if;
  if new.thread_root_id is not null then
    update genesis_chat.messages set thread_count = thread_count + 1, thread_last_at = new.created_at
     where id = new.thread_root_id;
  end if;
  if new.kind = 'text' and not new.silent and new.visibility = 'everyone' then
    perform genesis_chat.enqueue('push', 'push:' || new.id,
      jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id), now() + interval '2 seconds');
  end if;
  perform genesis_chat.broadcast('genesis-chat:conv:' || new.conversation_id, 'message',
    jsonb_build_object('id', new.id, 'seq', new.seq, 'conversation_id', new.conversation_id, 'op', 'insert'));
  if new.visibility = 'everyone' then
    select count(*) into fanout from genesis_chat.members
     where conversation_id = new.conversation_id and left_at is null;
    if fanout <= 500 then
      for member in select user_id from genesis_chat.members
                     where conversation_id = new.conversation_id and left_at is null loop
        perform genesis_chat.broadcast('genesis-chat:user:' || member.user_id, 'inbox',
          jsonb_build_object('conversation_id', new.conversation_id, 'seq', new.seq));
      end loop;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.message_posted() from public, anon, authenticated;
create trigger messages_posted after insert on genesis_chat.messages
  for each row execute function genesis_chat.message_posted();

create or replace function genesis_chat.message_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at
     or new.thread_count is distinct from old.thread_count then
    perform genesis_chat.broadcast('genesis-chat:conv:' || new.conversation_id, 'message',
      jsonb_build_object('id', new.id, 'seq', new.seq, 'conversation_id', new.conversation_id, 'op', 'update'));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.message_changed() from public, anon, authenticated;
create trigger messages_changed after update on genesis_chat.messages
  for each row execute function genesis_chat.message_changed();

-- Voice and video get a transcript; a deleted file is removed from storage.
create or replace function genesis_chat.attachment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('voice', 'video') and new.transcript_status = 'pending' then
    perform genesis_chat.enqueue('transcribe', 'transcribe:' || new.id,
      jsonb_build_object('attachment_id', new.id, 'conversation_id', new.conversation_id));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.attachment_added() from public, anon, authenticated;
create trigger attachments_added after insert on genesis_chat.attachments
  for each row execute function genesis_chat.attachment_added();

create or replace function genesis_chat.attachment_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.provider = 'storage' and old.path is not null then
    perform genesis_chat.enqueue('storage.remove', 'storage.remove:' || old.path,
      jsonb_build_object('bucket', 'genesis-chat', 'path', old.path));
  end if;
  if old.poster_path is not null then
    perform genesis_chat.enqueue('storage.remove', 'storage.remove:' || old.poster_path,
      jsonb_build_object('bucket', 'genesis-chat', 'path', old.poster_path));
  end if;
  if old.provider in ('mux', 'cloudflare') and old.provider_id is not null then
    perform genesis_chat.enqueue('video.remove', 'video.remove:' || old.provider || ':' || old.provider_id,
      jsonb_build_object('provider', old.provider, 'provider_id', old.provider_id));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.attachment_removed() from public, anon, authenticated;
create trigger attachments_removed after delete on genesis_chat.attachments
  for each row execute function genesis_chat.attachment_removed();

create or replace function genesis_chat.reaction_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_ genesis_chat.reactions := coalesce(new, old);
  conv uuid;
begin
  select m.conversation_id into conv from genesis_chat.messages m where m.id = row_.message_id;
  if conv is not null then
    perform genesis_chat.broadcast('genesis-chat:conv:' || conv, 'reaction',
      jsonb_build_object('message_id', row_.message_id, 'conversation_id', conv));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.reaction_changed() from public, anon, authenticated;
create trigger reactions_changed after insert or delete on genesis_chat.reactions
  for each row execute function genesis_chat.reaction_changed();

create or replace function genesis_chat.membership_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_ genesis_chat.members := coalesce(new, old);
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.left_at is not distinct from old.left_at then
    return null;
  end if;
  perform genesis_chat.broadcast('genesis-chat:user:' || row_.user_id, 'inbox',
    jsonb_build_object('conversation_id', row_.conversation_id));
  perform genesis_chat.broadcast('genesis-chat:conv:' || row_.conversation_id, 'members',
    jsonb_build_object('conversation_id', row_.conversation_id));
  return null;
end;
$$;
revoke execute on function genesis_chat.membership_changed() from public, anon, authenticated;
create trigger members_changed after insert or update or delete on genesis_chat.members
  for each row execute function genesis_chat.membership_changed();

create or replace function genesis_chat.touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function genesis_chat.touch() from public, anon, authenticated;
create trigger conversations_touch before update on genesis_chat.conversations
  for each row when (new.last_seq is not distinct from old.last_seq)
  execute function genesis_chat.touch();

-- ── Storage ───────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('genesis-chat', 'genesis-chat', false, 104857600, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/x-m4a',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The extensions a chat file may have: never SVG or HTML, which a browser runs as a page.
create or replace function genesis_chat.allowed_extension(p_ext text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_ext, '')) = any (array[
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif',
    'm4a', 'aac', 'mp3', 'ogg', 'oga', 'opus', 'weba', 'webm',
    'mp4', 'mov', 'pdf', 'txt', 'csv', 'docx', 'xlsx', 'pptx'])
$$;
revoke execute on function genesis_chat.allowed_extension(text) from public, anon;
grant execute on function genesis_chat.allowed_extension(text) to authenticated, service_role;

-- May the signed-in person upload `object_name`? Only `<conversation they post in>/<own id>/<name>.<ext>`.
create or replace function genesis_chat.can_upload(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or object_name is null
     or object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9]{1,5}$'
     or split_part(object_name, '/', 2) <> me::text
     or not genesis_chat.allowed_extension(split_part(split_part(object_name, '/', 3), '.', 2)) then
    return false;
  end if;
  return genesis_chat.can_post(split_part(object_name, '/', 1)::uuid);
end;
$$;

-- May the signed-in person read `object_name`? Whoever reads a message that carries it;
-- its uploader for a day before it is sent.
create or replace function genesis_chat.can_read_object(object_name text, object_owner text, uploaded_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from genesis_chat.attachments a
      join genesis_chat.messages m on m.id = a.message_id
      where (a.path = object_name or a.poster_path = object_name)
        and m.deleted_at is null
        and genesis_chat.can_view(m.conversation_id)
        and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id)))
    or (object_owner = auth.uid()::text and split_part(object_name, '/', 2) = auth.uid()::text
        and uploaded_at > now() - interval '1 day'))
$$;

revoke execute on function genesis_chat.can_upload(text), genesis_chat.can_read_object(text, text, timestamptz) from public, anon;
grant execute on function genesis_chat.can_upload(text), genesis_chat.can_read_object(text, text, timestamptz) to authenticated;

create policy genesis_chat_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'genesis-chat' and (select genesis_chat.can_upload(name)));
create policy genesis_chat_read on storage.objects
  for select to authenticated
  using (bucket_id = 'genesis-chat' and genesis_chat.can_read_object(name, owner_id, created_at));

-- Restrictive: inside this bucket only the rules above hold, whatever the app's other
-- storage policies, for every role but the service role.
create policy genesis_chat_only_read on storage.objects
  as restrictive for select to public
  using (bucket_id <> 'genesis-chat' or genesis_chat.can_read_object(name, owner_id, created_at));
create policy genesis_chat_only_upload on storage.objects
  as restrictive for insert to public
  with check (bucket_id <> 'genesis-chat' or (select genesis_chat.can_upload(name)));
create policy genesis_chat_no_update on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'genesis-chat')
  with check (bucket_id <> 'genesis-chat');
create policy genesis_chat_no_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'genesis-chat');

-- ── Starting conversations and membership ─────────────────────────────────────

-- Starts a conversation of `p_kind` with these people, if the kind's start check says
-- the signed-in person may. A direct conversation with someone is found again, not
-- made twice. The starter owns a group; both people are members of a direct one.
create or replace function genesis_chat.start_conversation(
  p_kind text,
  p_member_ids uuid[],
  p_title text default null,
  p_subject_type text default null,
  p_subject_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  k genesis_chat.kinds;
  others uuid[];
  allowed boolean;
  key text;
  conv uuid;
begin
  if me is null then
    raise exception 'Sign in to start a conversation' using errcode = '42501';
  end if;
  select * into k from genesis_chat.kinds where kind = p_kind;
  if k.kind is null then
    raise exception 'No such kind of conversation: %', p_kind using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into others
    from unnest(coalesce(p_member_ids, '{}')) x where x is not null and x <> me;
  if cardinality(others) = 0 then
    raise exception 'Choose someone to talk to' using errcode = '22023';
  end if;
  if k.max_members is not null and cardinality(others) + 1 > k.max_members then
    raise exception 'A % has at most % members', lower(k.label), k.max_members using errcode = '22023';
  end if;
  if k.start_check is null then
    raise exception 'You can''t start this kind of conversation' using errcode = '42501';
  end if;
  execute format('select %s($1::uuid[], $2::text, $3::text, $4::uuid)', k.start_check::regproc)
    into allowed using others, p_subject_type, p_subject_id, me;
  if not coalesce(allowed, false) then
    raise exception 'You can''t start a conversation with these people' using errcode = '42501';
  end if;

  if k.max_members = 2 then
    key := p_kind || ':' || least(me, others[1])::text || ':' || greatest(me, others[1])::text;
    perform pg_advisory_xact_lock(hashtextextended(key, 0));
    select id into conv from genesis_chat.conversations where direct_key = key;
    if conv is not null then
      insert into genesis_chat.members (conversation_id, user_id, role)
      select conv, u, 'member' from unnest(array[me, others[1]]) u
      on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at =
        case when genesis_chat.members.left_at is null then genesis_chat.members.joined_at else now() end;
      return conv;
    end if;
  end if;

  insert into genesis_chat.conversations (kind, title, subject_type, subject_id, direct_key, created_by)
  values (p_kind, nullif(btrim(p_title), ''), p_subject_type, p_subject_id, key, me)
  returning id into conv;
  insert into genesis_chat.members (conversation_id, user_id, role)
  values (conv, me, case when k.max_members = 2 then 'member' else 'owner' end);
  insert into genesis_chat.members (conversation_id, user_id, role)
  select conv, u, 'member' from unnest(others) u;
  return conv;
end;
$$;

-- The server's side: the conversation for one of the app's records, made once.
create or replace function genesis_chat.ensure_conversation(
  p_kind text,
  p_subject_type text,
  p_subject_id text,
  p_title text default null,
  p_settings jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if p_subject_type is null or p_subject_id is null then
    raise exception 'A subject (type and id) is required' using errcode = '22023';
  end if;
  select id into conv from genesis_chat.conversations
   where kind = p_kind and subject_type = p_subject_type and subject_id = p_subject_id;
  if conv is null then
    insert into genesis_chat.conversations (kind, subject_type, subject_id, title, settings)
    values (p_kind, p_subject_type, p_subject_id, nullif(btrim(p_title), ''), coalesce(p_settings, '{}'))
    on conflict (kind, subject_type, subject_id) where subject_type is not null do nothing
    returning id into conv;
    if conv is null then
      select id into conv from genesis_chat.conversations
       where kind = p_kind and subject_type = p_subject_type and subject_id = p_subject_id;
    end if;
  elsif p_title is not null then
    update genesis_chat.conversations set title = nullif(btrim(p_title), '')
     where id = conv and title is distinct from nullif(btrim(p_title), '');
  end if;
  return conv;
end;
$$;

-- The server's side: the members holding `p_role` become exactly `p_user_ids`. Others
-- with that role leave (keeping their history out of reach); those listed join or come
-- back with that role. Returns how many rows changed.
create or replace function genesis_chat.sync_members(p_conversation_id uuid, p_user_ids uuid[], p_role text default 'member')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
  n integer;
  k genesis_chat.kinds;
begin
  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'A member is an owner, admin or member' using errcode = '22023';
  end if;
  select kd.* into k from genesis_chat.conversations c join genesis_chat.kinds kd on kd.kind = c.kind
   where c.id = p_conversation_id;
  if k.kind is null then
    raise exception 'No such conversation' using errcode = '23503';
  end if;
  update genesis_chat.members set left_at = now()
   where conversation_id = p_conversation_id and role = p_role and left_at is null
     and not (user_id = any (coalesce(p_user_ids, '{}')));
  get diagnostics n = row_count; changed := changed + n;
  insert into genesis_chat.members as m (conversation_id, user_id, role)
  select p_conversation_id, u, p_role from (select distinct u from unnest(coalesce(p_user_ids, '{}')) u where u is not null) s
  on conflict (conversation_id, user_id) do update
    set role = excluded.role, left_at = null,
        joined_at = case when m.left_at is null then m.joined_at else now() end
    where m.role is distinct from excluded.role or m.left_at is not null;
  get diagnostics n = row_count; changed := changed + n;
  if k.max_members is not null and (select count(*) from genesis_chat.members
       where conversation_id = p_conversation_id and left_at is null and role <> 'observer') > k.max_members then
    raise exception 'A % has at most % members', lower(k.label), k.max_members using errcode = '22023';
  end if;
  return changed;
end;
$$;

-- Owners and admins add people to a conversation whose kind lets them, if the kind's
-- start check says they may be with them.
create or replace function genesis_chat.add_members(p_conversation_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c genesis_chat.conversations;
  k genesis_chat.kinds;
  adding uuid[];
  allowed boolean;
begin
  select * into c from genesis_chat.conversations where id = p_conversation_id;
  select * into k from genesis_chat.kinds where kind = c.kind;
  if c.id is null or genesis_chat.my_role(c.id) not in ('owner', 'admin') or k.membership <> 'admins' then
    raise exception 'You can''t add people to this conversation' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into adding from unnest(coalesce(p_user_ids, '{}')) x where x is not null;
  if k.start_check is null then
    raise exception 'You can''t add people to this conversation' using errcode = '42501';
  end if;
  execute format('select %s($1::uuid[], $2::text, $3::text, $4::uuid)', k.start_check::regproc)
    into allowed using adding, c.subject_type, c.subject_id, me;
  if not coalesce(allowed, false) then
    raise exception 'You can''t add these people' using errcode = '42501';
  end if;
  insert into genesis_chat.members as m (conversation_id, user_id, role)
  select c.id, u, 'member' from unnest(adding) u
  on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at = now()
    where m.left_at is not null or m.role = 'observer';
  if k.max_members is not null and (select count(*) from genesis_chat.members
       where conversation_id = c.id and left_at is null and role <> 'observer') > k.max_members then
    raise exception 'A % has at most % members', lower(k.label), k.max_members using errcode = '22023';
  end if;
end;
$$;

-- Leave a conversation, or (an owner or admin) remove someone from it, where the kind
-- lets its admins manage members. Nobody leaves a conversation the app keeps.
create or replace function genesis_chat.remove_member(p_conversation_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid := coalesce(p_user_id, auth.uid());
  k genesis_chat.kinds;
  target_role text;
begin
  select kd.* into k from genesis_chat.conversations c join genesis_chat.kinds kd on kd.kind = c.kind
   where c.id = p_conversation_id;
  select role into target_role from genesis_chat.members
   where conversation_id = p_conversation_id and user_id = target and left_at is null and role <> 'observer';
  if k.kind is null or target_role is null or k.membership <> 'admins' or k.max_members = 2
     or (target <> me and (genesis_chat.my_role(p_conversation_id) not in ('owner', 'admin')
                           or (target_role = 'owner' and genesis_chat.my_role(p_conversation_id) <> 'owner'))) then
    raise exception 'You can''t remove this person' using errcode = '42501';
  end if;
  update genesis_chat.members set left_at = now() where conversation_id = p_conversation_id and user_id = target;
end;
$$;

-- An owner sets someone's role (owner, admin or member).
create or replace function genesis_chat.set_role(p_conversation_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'A member is an owner, admin or member' using errcode = '22023';
  end if;
  if genesis_chat.my_role(p_conversation_id) is distinct from 'owner' then
    raise exception 'Only an owner changes roles' using errcode = '42501';
  end if;
  update genesis_chat.members set role = p_role
   where conversation_id = p_conversation_id and user_id = p_user_id and left_at is null and role <> 'observer';
  if not found then
    raise exception 'They aren''t in this conversation' using errcode = '22023';
  end if;
end;
$$;

-- Owners and admins rename a conversation or change its settings (one-way: who_posts).
create or replace function genesis_chat.update_conversation(p_conversation_id uuid, p_title text default null, p_settings jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if genesis_chat.my_role(p_conversation_id) not in ('owner', 'admin') then
    raise exception 'Only an owner or admin changes this conversation' using errcode = '42501';
  end if;
  if p_settings is not null and p_settings ? 'who_posts' and p_settings ->> 'who_posts' not in ('members', 'admins') then
    raise exception 'who_posts is members or admins' using errcode = '22023';
  end if;
  update genesis_chat.conversations
     set title = coalesce(nullif(btrim(p_title), ''), title),
         settings = case when p_settings is null then settings else settings || p_settings end
   where id = p_conversation_id;
end;
$$;

-- Observers who may post (a support team), or owners and admins, set a ticket's status
-- and who has it.
create or replace function genesis_chat.set_status(p_conversation_id uuid, p_status text, p_assignee_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_ text := genesis_chat.my_role(p_conversation_id);
begin
  if not (role_ in ('owner', 'admin') or (role_ = 'observer' and genesis_chat.can_post(p_conversation_id))) then
    raise exception 'You can''t change this conversation''s status' using errcode = '42501';
  end if;
  update genesis_chat.conversations set status = p_status, assignee_id = p_assignee_id where id = p_conversation_id;
  perform genesis_chat.broadcast('genesis-chat:conv:' || p_conversation_id, 'conversation',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

-- ── Messages ──────────────────────────────────────────────────────────────────

-- Sends a message. Sending the same client_id again returns the first one, so a retry
-- never posts twice. Attachments: [{ "kind", "path" | "provider" + "provider_id" |
-- "url" | "ref", "name", "mime", "bytes", "width", "height", "duration_ms",
-- "waveform", "poster_path", "thumbhash", "status" }]. A file must be one the sender
-- uploaded into this conversation's folder.
create or replace function genesis_chat.send_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body text default '',
  p_attachments jsonb default '[]',
  p_reply_to_id uuid default null,
  p_thread_root_id uuid default null,
  p_topic text default null,
  p_mentions uuid[] default '{}',
  p_visibility text default 'everyone',
  p_silent boolean default false
)
returns genesis_chat.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  msg genesis_chat.messages;
  role_ text;
  k genesis_chat.kinds;
  a jsonb;
  i integer := 0;
  folder text := p_conversation_id::text || '/' || auth.uid()::text || '/';
  file_path text;
  attachment_count integer := coalesce(jsonb_array_length(case when jsonb_typeof(p_attachments) = 'array' then p_attachments end), 0);
begin
  if me is null then
    raise exception 'Sign in to send a message' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'A message needs a client_id' using errcode = '22023';
  end if;
  select * into msg from genesis_chat.messages where sender_id = me and client_id = p_client_id;
  if msg.id is not null then
    if msg.conversation_id <> p_conversation_id then
      raise exception 'That client_id was used in another conversation' using errcode = '22023';
    end if;
    return msg;
  end if;
  if not genesis_chat.can_post(p_conversation_id) then
    raise exception 'You can''t post in this conversation' using errcode = '42501';
  end if;
  role_ := genesis_chat.my_role(p_conversation_id);
  select kd.* into k from genesis_chat.conversations c join genesis_chat.kinds kd on kd.kind = c.kind
   where c.id = p_conversation_id;
  if p_attachments is not null and jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'Attachments are a list' using errcode = '22023';
  end if;
  if attachment_count > 20 then
    raise exception 'A message carries at most 20 attachments' using errcode = '22023';
  end if;
  if btrim(coalesce(p_body, '')) = '' and attachment_count = 0 then
    raise exception 'A message needs text or an attachment' using errcode = '22023';
  end if;
  if p_visibility not in ('everyone', 'observers') then
    raise exception 'Visibility is everyone or observers' using errcode = '22023';
  end if;
  if p_visibility = 'observers' and not genesis_chat.observes(p_conversation_id) then
    raise exception 'Only observers write internal notes' using errcode = '42501';
  end if;
  if p_reply_to_id is not null and not exists (
       select 1 from genesis_chat.messages where id = p_reply_to_id and conversation_id = p_conversation_id) then
    raise exception 'The message you reply to isn''t in this conversation' using errcode = '22023';
  end if;
  if p_thread_root_id is not null then
    if not k.threads then
      raise exception 'This conversation has no threads' using errcode = '22023';
    end if;
    if not exists (select 1 from genesis_chat.messages where id = p_thread_root_id
                    and conversation_id = p_conversation_id and thread_root_id is null and deleted_at is null) then
      raise exception 'A thread starts on a message in this conversation' using errcode = '22023';
    end if;
  end if;

  insert into genesis_chat.messages (conversation_id, client_id, sender_id, sender_role, body, mentions,
                                     reply_to_id, thread_root_id, topic, visibility, silent)
  values (p_conversation_id, p_client_id, me, role_, coalesce(p_body, ''),
          coalesce((select array_agg(distinct u) from unnest(coalesce(p_mentions, '{}')) u
                    where genesis_chat.is_member(p_conversation_id, u)), '{}'),
          p_reply_to_id, p_thread_root_id, nullif(btrim(p_topic), ''), p_visibility, coalesce(p_silent, false))
  returning * into msg;

  for a in select value from jsonb_array_elements(coalesce(p_attachments, '[]')) loop
    file_path := a ->> 'path';
    if coalesce(a ->> 'provider', 'storage') = 'storage' then
      if file_path is null or left(file_path, length(folder)) <> folder
         or not exists (select 1 from storage.objects o where o.bucket_id = 'genesis-chat'
                          and o.name = file_path and o.owner_id = me::text) then
        raise exception 'Upload the file into this conversation before sending it' using errcode = '22023';
      end if;
    end if;
    if a ->> 'poster_path' is not null and (left(a ->> 'poster_path', length(folder)) <> folder
         or not exists (select 1 from storage.objects o where o.bucket_id = 'genesis-chat'
                          and o.name = a ->> 'poster_path' and o.owner_id = me::text)) then
      raise exception 'Upload the poster into this conversation before sending it' using errcode = '22023';
    end if;
    insert into genesis_chat.attachments (message_id, conversation_id, position, kind, ref, provider, path, provider_id,
                                          url, status, name, mime, bytes, width, height, duration_ms, waveform,
                                          poster_path, thumbhash, transcript_status)
    values (msg.id, p_conversation_id, i, a ->> 'kind', coalesce(a -> 'ref', '{}'),
            coalesce(a ->> 'provider', 'storage'), file_path, a ->> 'provider_id', a ->> 'url',
            case when a ->> 'status' = 'pending' then 'pending' else 'ready' end,
            a ->> 'name', a ->> 'mime', (a ->> 'bytes')::bigint, (a ->> 'width')::integer, (a ->> 'height')::integer,
            (a ->> 'duration_ms')::integer,
            case when jsonb_typeof(a -> 'waveform') = 'array'
                 then (select array_agg(least(greatest(x::integer, 0), 100)::smallint) from jsonb_array_elements_text(a -> 'waveform') x) end,
            a ->> 'poster_path', a ->> 'thumbhash',
            case when a ->> 'kind' in ('voice', 'video') then 'pending' end);
    i := i + 1;
  end loop;
  return msg;
end;
$$;

-- Edits your own message (within the kind's edit window, if it has one).
create or replace function genesis_chat.edit_message(p_message_id uuid, p_body text, p_mentions uuid[] default '{}')
returns genesis_chat.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  window_ interval;
begin
  select * into msg from genesis_chat.messages where id = p_message_id;
  if msg.id is null or msg.sender_id is distinct from auth.uid() or msg.deleted_at is not null or msg.kind <> 'text'
     or not genesis_chat.can_view(msg.conversation_id) then
    raise exception 'You can''t edit this message' using errcode = '42501';
  end if;
  select k.edit_window into window_ from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
   where c.id = msg.conversation_id;
  if window_ is not null and msg.created_at < now() - window_ then
    raise exception 'This message can no longer be edited' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' and not exists (select 1 from genesis_chat.attachments where message_id = msg.id) then
    raise exception 'A message needs text or an attachment' using errcode = '22023';
  end if;
  update genesis_chat.messages
     set body = coalesce(p_body, ''), edited_at = now(),
         mentions = coalesce((select array_agg(distinct u) from unnest(coalesce(p_mentions, '{}')) u
                              where genesis_chat.is_member(msg.conversation_id, u)), '{}')
   where id = msg.id
  returning * into msg;
  return msg;
end;
$$;

-- Deletes a message: its sender, the conversation's owners and admins, or observers who
-- may post (moderators). The row stays as a placeholder; text, mentions and files go.
create or replace function genesis_chat.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  role_ text;
begin
  select * into msg from genesis_chat.messages where id = p_message_id;
  if msg.id is null then
    raise exception 'No such message' using errcode = '42501';
  end if;
  role_ := genesis_chat.my_role(msg.conversation_id);
  if not (msg.sender_id = auth.uid() and role_ is not null
          or role_ in ('owner', 'admin')
          or (role_ = 'observer' and genesis_chat.can_post(msg.conversation_id))) then
    raise exception 'You can''t delete this message' using errcode = '42501';
  end if;
  delete from genesis_chat.attachments where message_id = msg.id;
  delete from genesis_chat.reactions where message_id = msg.id;
  delete from genesis_chat.pins where message_id = msg.id;
  update genesis_chat.messages set body = '', mentions = '{}', meta = '{}', deleted_at = now()
   where id = msg.id and deleted_at is null;
end;
$$;

-- The server's side: an event in the conversation (someone joined, a form was answered).
create or replace function genesis_chat.post_system_message(p_conversation_id uuid, p_body text, p_meta jsonb default '{}', p_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  id_ uuid;
begin
  if p_key is not null then
    select id into id_ from genesis_chat.messages
     where conversation_id = p_conversation_id and sender_id is null and client_id = p_key;
    if id_ is not null then
      return id_;
    end if;
  end if;
  insert into genesis_chat.messages (conversation_id, client_id, sender_id, sender_role, kind, body, meta)
  values (p_conversation_id, coalesce(p_key, gen_random_uuid()), null, 'system', 'system', coalesce(p_body, ''), coalesce(p_meta, '{}'))
  returning id into id_;
  return id_;
end;
$$;

-- Adds or takes away your reaction.
create or replace function genesis_chat.react(p_message_id uuid, p_emoji text, p_on boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  select m.conversation_id into conv from genesis_chat.messages m
   where m.id = p_message_id and m.deleted_at is null
     and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id));
  if conv is null or not genesis_chat.can_post(conv) then
    raise exception 'You can''t react to this message' using errcode = '42501';
  end if;
  if p_on then
    if (select count(distinct emoji) from genesis_chat.reactions where message_id = p_message_id and user_id = auth.uid()) >= 10 then
      raise exception 'At most 10 reactions each' using errcode = '22023';
    end if;
    insert into genesis_chat.reactions (message_id, user_id, emoji) values (p_message_id, auth.uid(), p_emoji)
    on conflict do nothing;
  else
    delete from genesis_chat.reactions where message_id = p_message_id and user_id = auth.uid() and emoji = p_emoji;
  end if;
end;
$$;

-- Marks the conversation read up to `p_seq` (or its latest). Only moves forward. An
-- observer gets a row of their own to keep their place.
create or replace function genesis_chat.mark_read(p_conversation_id uuid, p_seq bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  latest bigint;
  result bigint;
begin
  select last_seq into latest from genesis_chat.conversations where id = p_conversation_id;
  if latest is null or not genesis_chat.can_view(p_conversation_id) then
    raise exception 'You aren''t in this conversation' using errcode = '42501';
  end if;
  if genesis_chat.is_member(p_conversation_id) then
    update genesis_chat.members set last_read_seq = greatest(last_read_seq, least(coalesce(p_seq, latest), latest))
     where conversation_id = p_conversation_id and user_id = me
    returning last_read_seq into result;
  else
    insert into genesis_chat.members as m (conversation_id, user_id, role, last_read_seq)
    values (p_conversation_id, me, 'observer', least(coalesce(p_seq, latest), latest))
    on conflict (conversation_id, user_id) do update
      set last_read_seq = greatest(m.last_read_seq, excluded.last_read_seq)
    returning last_read_seq into result;
  end if;
  return result;
end;
$$;

-- Your own settings for a conversation: muted until, notify level, archived, pinned.
create or replace function genesis_chat.set_my_settings(
  p_conversation_id uuid,
  p_muted_until timestamptz default null,
  p_notify text default null,
  p_archived boolean default null,
  p_pinned boolean default null,
  p_clear_mute boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notify is not null and p_notify not in ('all', 'mentions', 'none') then
    raise exception 'Notify is all, mentions or none' using errcode = '22023';
  end if;
  update genesis_chat.members
     set muted_until = case when p_clear_mute then null else coalesce(p_muted_until, muted_until) end,
         notify = coalesce(p_notify, notify),
         archived = coalesce(p_archived, archived),
         pinned = coalesce(p_pinned, pinned)
   where conversation_id = p_conversation_id and user_id = auth.uid() and left_at is null;
  if not found then
    raise exception 'You aren''t in this conversation' using errcode = '42501';
  end if;
end;
$$;

-- Pins or unpins a message: owners and admins, or anyone in a direct conversation.
create or replace function genesis_chat.pin_message(p_message_id uuid, p_on boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  role_ text;
  direct boolean;
begin
  select * into msg from genesis_chat.messages where id = p_message_id and deleted_at is null and visibility = 'everyone';
  role_ := genesis_chat.my_role(msg.conversation_id);
  select k.max_members = 2 into direct from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
   where c.id = msg.conversation_id;
  if msg.id is null or not (role_ in ('owner', 'admin') or (coalesce(direct, false) and role_ = 'member')) then
    raise exception 'You can''t pin this message' using errcode = '42501';
  end if;
  if p_on then
    insert into genesis_chat.pins (conversation_id, message_id, pinned_by) values (msg.conversation_id, msg.id, auth.uid())
    on conflict do nothing;
  else
    delete from genesis_chat.pins where message_id = msg.id;
  end if;
  perform genesis_chat.broadcast('genesis-chat:conv:' || msg.conversation_id, 'conversation',
    jsonb_build_object('conversation_id', msg.conversation_id));
end;
$$;

-- Saves a message for yourself, or forgets it.
create or replace function genesis_chat.save_message(p_message_id uuid, p_on boolean default true, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_on then
    if not exists (select 1 from genesis_chat.messages m where m.id = p_message_id and m.deleted_at is null
                     and genesis_chat.can_view(m.conversation_id)
                     and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id))) then
      raise exception 'You can''t save this message' using errcode = '42501';
    end if;
    insert into genesis_chat.saved (user_id, message_id, note) values (auth.uid(), p_message_id, p_note)
    on conflict (user_id, message_id) do update set note = excluded.note;
  else
    delete from genesis_chat.saved where user_id = auth.uid() and message_id = p_message_id;
  end if;
end;
$$;

-- Reports a message, keeping a copy of it and the ten messages before it.
create or replace function genesis_chat.report_message(p_message_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  id_ uuid;
begin
  select * into msg from genesis_chat.messages m where m.id = p_message_id
    and genesis_chat.can_view(m.conversation_id) and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id));
  if msg.id is null then
    raise exception 'You can''t report this message' using errcode = '42501';
  end if;
  if (select count(*) from genesis_chat.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports; try again later' using errcode = 'GS429';
  end if;
  insert into genesis_chat.reports (message_id, conversation_id, reporter_id, reason, note, snapshot)
  values (msg.id, msg.conversation_id, auth.uid(), p_reason, p_note, jsonb_build_object(
    'message', jsonb_build_object('id', msg.id, 'sender_id', msg.sender_id, 'body', msg.body, 'created_at', msg.created_at),
    'context', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'sender_id', c.sender_id, 'body', c.body, 'created_at', c.created_at) order by c.seq)
                         from (select * from genesis_chat.messages
                                where conversation_id = msg.conversation_id and seq < msg.seq and visibility = 'everyone'
                                order by seq desc limit 10) c), '[]')))
  returning id into id_;
  return id_;
end;
$$;

-- ── The inbox ─────────────────────────────────────────────────────────────────

-- Your conversations, pinned first then newest activity, with the latest message you
-- can read and how many you haven't (counted to 99). `p_kind` narrows it to one kind;
-- `p_archived` shows the archived ones instead.
create or replace function genesis_chat.inbox(
  p_kind text default null,
  p_archived boolean default false,
  p_limit integer default 50,
  p_before timestamptz default null
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
         (select count(*)::integer from (
            select 1 from genesis_chat.messages m
             where m.conversation_id = c.id and m.seq > me.last_read_seq and m.deleted_at is null
               and m.sender_id is distinct from me.user_id and m.visibility = 'everyone'
             limit 99) u),
         exists (select 1 from genesis_chat.messages m
                  where m.conversation_id = c.id and m.seq > me.last_read_seq and me.user_id = any (m.mentions)),
         coalesce(me.muted_until > now(), false), me.pinned, me.archived, c.last_message_at,
         (select jsonb_build_object('id', m.id, 'seq', m.seq, 'sender_id', m.sender_id, 'kind', m.kind,
                                    'body', left(m.body, 160), 'deleted', m.deleted_at is not null, 'created_at', m.created_at,
                                    'attachment', (select a.kind from genesis_chat.attachments a where a.message_id = m.id order by a.position limit 1))
            from genesis_chat.messages m
           where m.conversation_id = c.id and m.visibility = 'everyone' and m.thread_root_id is null
           order by m.seq desc limit 1)
    from genesis_chat.members me
    join genesis_chat.conversations c on c.id = me.conversation_id
    join genesis_chat.kinds k on k.kind = c.kind
   where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
     and me.archived = coalesce(p_archived, false)
     and (p_kind is null or c.kind = p_kind)
     and (p_before is null or coalesce(c.last_message_at, c.created_at) < p_before)
   order by me.pinned desc, coalesce(c.last_message_at, c.created_at) desc, c.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- The conversations of `p_kind` you observe (a support queue), newest first, with your
-- place in each if you have kept one.
create or replace function genesis_chat.observed(p_kind text, p_status text default null, p_limit integer default 50, p_before timestamptz default null)
returns table (
  conversation_id uuid,
  title text,
  subject_type text,
  subject_id text,
  status text,
  assignee_id uuid,
  last_seq bigint,
  last_read_seq bigint,
  last_message_at timestamptz,
  last_message jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.subject_type, c.subject_id, c.status, c.assignee_id, c.last_seq,
         coalesce((select m.last_read_seq from genesis_chat.members m where m.conversation_id = c.id and m.user_id = auth.uid()), 0),
         c.last_message_at,
         (select jsonb_build_object('id', m.id, 'seq', m.seq, 'sender_id', m.sender_id, 'body', left(m.body, 160),
                                    'visibility', m.visibility, 'created_at', m.created_at)
            from genesis_chat.messages m where m.conversation_id = c.id order by m.seq desc limit 1)
    from genesis_chat.conversations c
   where c.kind = p_kind and (p_status is null or c.status = p_status)
     and (p_before is null or coalesce(c.last_message_at, c.created_at) < p_before)
     and genesis_chat.observes(c.id)
   order by coalesce(c.last_message_at, c.created_at) desc, c.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- How many messages wait for you across every conversation not muted (for a badge).
create or replace function genesis_chat.unread_total(p_user_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(least(c.last_seq - me.last_read_seq, 99)), 0)::integer
    from genesis_chat.members me join genesis_chat.conversations c on c.id = me.conversation_id
   where me.user_id = case when auth.role() = 'service_role' then coalesce(p_user_id, auth.uid()) else auth.uid() end
     and me.left_at is null and me.role <> 'observer' and me.archived = false
     and coalesce(me.muted_until <= now(), true) and c.last_seq > me.last_read_seq
$$;

-- ── The runner's side ─────────────────────────────────────────────────────────

-- Claims up to `p_limit` due effects of these kinds (all kinds when null) for five
-- minutes. A claimed effect not settled in time is claimed again.
create or replace function genesis_chat.claim_effects(p_kinds text[] default null, p_limit integer default 50)
returns setof genesis_chat.effects
language sql
security definer
set search_path = ''
as $$
  update genesis_chat.effects e
     set locked_until = now() + interval '5 minutes', attempts = e.attempts + 1
   where e.id in (
     select id from genesis_chat.effects
      where done_at is null and run_after <= now() and (locked_until is null or locked_until < now())
        and attempts < 8 and (p_kinds is null or kind = any (p_kinds))
      order by run_after, id
      limit least(greatest(coalesce(p_limit, 50), 1), 500)
      for update skip locked)
  returning e.*;
$$;

-- Settles a claimed effect: done, or (with an error) tried again later, backing off.
create or replace function genesis_chat.complete_effect(p_id bigint, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update genesis_chat.effects
     set done_at = case when p_error is null then now() end,
         last_error = left(p_error, 2000),
         locked_until = null,
         run_after = case when p_error is null then run_after else now() + (interval '30 seconds' * power(2, least(attempts, 8))) end
   where id = p_id;
$$;

-- Who to push a message to: current members other than the sender who haven't muted
-- the conversation or turned it to mentions-only (unless mentioned), plus the
-- assignee; with each one's unread total for the badge.
create or replace function genesis_chat.push_targets(p_message_id uuid)
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
         (select coalesce(sum(least(c2.last_seq - m2.last_read_seq, 99)), 0)::integer
            from genesis_chat.members m2 join genesis_chat.conversations c2 on c2.id = m2.conversation_id
           where m2.user_id = r.user_id and m2.left_at is null and m2.role <> 'observer' and not m2.archived
             and coalesce(m2.muted_until <= now(), true) and c2.last_seq > m2.last_read_seq)
    from recipients r cross join msg
$$;

-- Updates what the server learned about an attachment: a video ready to play, a poster,
-- a duration, a transcript.
create or replace function genesis_chat.update_attachment(p_attachment_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update genesis_chat.attachments set
    status = coalesce(p_patch ->> 'status', status),
    provider_id = coalesce(p_patch ->> 'provider_id', provider_id),
    playback_id = coalesce(p_patch ->> 'playback_id', playback_id),
    url = coalesce(p_patch ->> 'url', url),
    poster_path = coalesce(p_patch ->> 'poster_path', poster_path),
    thumbhash = coalesce(p_patch ->> 'thumbhash', thumbhash),
    duration_ms = coalesce((p_patch ->> 'duration_ms')::integer, duration_ms),
    width = coalesce((p_patch ->> 'width')::integer, width),
    height = coalesce((p_patch ->> 'height')::integer, height),
    transcript = coalesce(p_patch ->> 'transcript', transcript),
    transcript_status = coalesce(p_patch ->> 'transcript_status', transcript_status)
  where id = p_attachment_id;
  perform genesis_chat.broadcast('genesis-chat:conv:' || a.conversation_id, 'message',
    jsonb_build_object('id', a.message_id, 'conversation_id', a.conversation_id, 'op', 'update'))
  from genesis_chat.attachments a where a.id = p_attachment_id;
end;
$$;

-- ── Grants, by name ───────────────────────────────────────────────────────────

revoke execute on function
  genesis_chat.start_conversation(text, uuid[], text, text, text),
  genesis_chat.add_members(uuid, uuid[]),
  genesis_chat.remove_member(uuid, uuid),
  genesis_chat.set_role(uuid, uuid, text),
  genesis_chat.update_conversation(uuid, text, jsonb),
  genesis_chat.set_status(uuid, text, uuid),
  genesis_chat.send_message(uuid, uuid, text, jsonb, uuid, uuid, text, uuid[], text, boolean),
  genesis_chat.edit_message(uuid, text, uuid[]),
  genesis_chat.delete_message(uuid),
  genesis_chat.react(uuid, text, boolean),
  genesis_chat.mark_read(uuid, bigint),
  genesis_chat.set_my_settings(uuid, timestamptz, text, boolean, boolean, boolean),
  genesis_chat.pin_message(uuid, boolean),
  genesis_chat.save_message(uuid, boolean, text),
  genesis_chat.report_message(uuid, text, text),
  genesis_chat.inbox(text, boolean, integer, timestamptz),
  genesis_chat.observed(text, text, integer, timestamptz),
  genesis_chat.unread_total(uuid)
from public, anon;

grant execute on function
  genesis_chat.start_conversation(text, uuid[], text, text, text),
  genesis_chat.add_members(uuid, uuid[]),
  genesis_chat.remove_member(uuid, uuid),
  genesis_chat.set_role(uuid, uuid, text),
  genesis_chat.update_conversation(uuid, text, jsonb),
  genesis_chat.set_status(uuid, text, uuid),
  genesis_chat.send_message(uuid, uuid, text, jsonb, uuid, uuid, text, uuid[], text, boolean),
  genesis_chat.edit_message(uuid, text, uuid[]),
  genesis_chat.delete_message(uuid),
  genesis_chat.react(uuid, text, boolean),
  genesis_chat.mark_read(uuid, bigint),
  genesis_chat.set_my_settings(uuid, timestamptz, text, boolean, boolean, boolean),
  genesis_chat.pin_message(uuid, boolean),
  genesis_chat.save_message(uuid, boolean, text),
  genesis_chat.report_message(uuid, text, text),
  genesis_chat.inbox(text, boolean, integer, timestamptz),
  genesis_chat.observed(text, text, integer, timestamptz),
  genesis_chat.unread_total(uuid)
to authenticated, service_role;

revoke execute on function
  genesis_chat.ensure_conversation(text, text, text, text, jsonb),
  genesis_chat.sync_members(uuid, uuid[], text),
  genesis_chat.post_system_message(uuid, text, jsonb, uuid),
  genesis_chat.claim_effects(text[], integer),
  genesis_chat.complete_effect(bigint, text),
  genesis_chat.push_targets(uuid),
  genesis_chat.update_attachment(uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  genesis_chat.ensure_conversation(text, text, text, text, jsonb),
  genesis_chat.sync_members(uuid, uuid[], text),
  genesis_chat.post_system_message(uuid, text, jsonb, uuid),
  genesis_chat.claim_effects(text[], integer),
  genesis_chat.complete_effect(bigint, text),
  genesis_chat.push_targets(uuid),
  genesis_chat.update_attachment(uuid, jsonb)
to service_role;
