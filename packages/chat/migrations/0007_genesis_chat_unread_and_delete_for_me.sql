-- Genesis Chat 0007: Mark as Unread and Delete for me
--
-- Builds on 0001–0006 (never edited once released). Needs nothing from your app.
--
-- Both live in `member_state`, a member's private row beside `members`: only that member reads it
-- (`members` is readable by everyone in the conversation, so it can't hold either).
--
-- 1. `marked_unread`: a member can mark a conversation unread, as Messages and Mail do. Only they
--    see it: their inbox counts it as at least one unread, and so do their badges (`unread_total`,
--    `push_targets`), until they read it again (`mark_read` clears it). It never moves their read
--    place back, so a sender's "Read" (0006) stays true. Set with
--    `set_my_settings(p_marked_unread => …)`.
-- 2. `cleared_seq`: Delete for me. `delete_conversation_for_me` sets it to the latest message they
--    saw (`p_seq`, or the conversation's latest), which takes the conversation out of that member's
--    inbox and their history out of their thread: they read only messages after it (a restrictive
--    read policy, so every read path agrees; search, files, link previews and pins too). The next
--    message they can read on the main timeline brings the conversation back with only what came
--    after; an observers-only note, a thread reply or a hidden message doesn't. Nobody else's inbox,
--    thread or read receipts change, and nothing is deleted.
-- Both RPCs send the member's own devices an `inbox` hint, so every open inbox refetches.

create table genesis_chat.member_state (
  conversation_id uuid not null,
  user_id uuid not null,
  marked_unread boolean not null default false,
  cleared_seq bigint,
  primary key (conversation_id, user_id),
  foreign key (conversation_id, user_id) references genesis_chat.members (conversation_id, user_id) on delete cascade
);

comment on table genesis_chat.member_state is
  'A member''s private state in a conversation: Mark as Unread and Delete for me. Only that member reads it; written by set_my_settings, mark_read and delete_conversation_for_me. Genesis Chat.';
comment on column genesis_chat.member_state.marked_unread is
  'Marked as unread by this member; only they see it, and reading clears it. Genesis Chat.';
comment on column genesis_chat.member_state.cleared_seq is
  'Delete for me: this member sees only messages after this seq, and the conversation leaves their inbox until one they can read arrives. Null: never deleted. Genesis Chat.';

alter table genesis_chat.member_state enable row level security;
create policy member_state_read on genesis_chat.member_state for select to authenticated
  using (user_id = auth.uid());
grant select on genesis_chat.member_state to authenticated;
grant select, insert, update, delete on genesis_chat.member_state to service_role;

-- The history a member deleted for themselves is gone from what they read. Restrictive, so it
-- narrows 0001's read policy (and 0002's moderation one) without replacing them.
create policy messages_cleared_for_me on genesis_chat.messages
  as restrictive for select to authenticated
  using (seq > coalesce((select s.cleared_seq from genesis_chat.member_state s
                          where s.conversation_id = messages.conversation_id and s.user_id = auth.uid()), 0));

-- Whether a member has a message they can read on the main timeline after p_seq: what brings a
-- conversation they deleted back to their inbox. Not an observers-only note, a thread reply, a
-- deleted message or one moderation hid (unless they sent it).
create function genesis_chat.readable_after(p_conversation_id uuid, p_user_id uuid, p_seq bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from genesis_chat.messages m
     where m.conversation_id = p_conversation_id and m.seq > coalesce(p_seq, 0)
       and m.visibility = 'everyone' and m.thread_root_id is null and m.deleted_at is null
       and (m.moderation is distinct from 'hidden' or m.sender_id = p_user_id))
$$;

revoke execute on function genesis_chat.readable_after(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function genesis_chat.readable_after(uuid, uuid, bigint) to service_role;

-- Delete for me: the conversation leaves your inbox, and its history your thread, until a new
-- message. `p_seq` is the latest message you saw (the inbox row you deleted): a message that came
-- in after it isn't deleted unseen. It never moves back, and it unpins and unarchives the
-- conversation for you, so a new message brings it back to the inbox, as Messages does.
create function genesis_chat.delete_conversation_for_me(p_conversation_id uuid, p_seq bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  latest bigint;
begin
  update genesis_chat.members m
     set pinned = false, archived = false
   where m.conversation_id = p_conversation_id and m.user_id = me and m.left_at is null and m.role <> 'observer';
  if not found then
    raise exception 'You aren''t in this conversation' using errcode = '42501';
  end if;
  select c.last_seq into latest from genesis_chat.conversations c where c.id = p_conversation_id;
  insert into genesis_chat.member_state as s (conversation_id, user_id, cleared_seq, marked_unread)
  values (p_conversation_id, me, greatest(least(coalesce(p_seq, latest), latest), 0), false)
  on conflict (conversation_id, user_id) do update
    set cleared_seq = greatest(coalesce(s.cleared_seq, 0), excluded.cleared_seq), marked_unread = false;
  perform genesis_chat.broadcast('genesis-chat:user:' || me, 'inbox',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

-- Your own settings, now with Mark as Unread. Same arguments as 0001's, plus p_marked_unread.
drop function genesis_chat.set_my_settings(uuid, timestamptz, text, boolean, boolean, boolean);
create function genesis_chat.set_my_settings(
  p_conversation_id uuid,
  p_muted_until timestamptz default null,
  p_notify text default null,
  p_archived boolean default null,
  p_pinned boolean default null,
  p_clear_mute boolean default false,
  p_marked_unread boolean default null
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
  if p_marked_unread is not null then
    insert into genesis_chat.member_state as s (conversation_id, user_id, marked_unread)
    values (p_conversation_id, auth.uid(), p_marked_unread)
    on conflict (conversation_id, user_id) do update set marked_unread = excluded.marked_unread;
  end if;
  -- Your other devices' inboxes refetch (pinned, archived, muted and marked unread all show there).
  perform genesis_chat.broadcast('genesis-chat:user:' || auth.uid(), 'inbox',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

-- Reading clears Mark as Unread (0001's body, plus that).
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
    update genesis_chat.member_state set marked_unread = false
     where conversation_id = p_conversation_id and user_id = me and marked_unread;
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

-- What a member counts as unread: messages after both where they read and what they deleted,
-- and at least one when they marked it unread.
create function genesis_chat.member_unread(p_conversation_id uuid, p_user_id uuid, p_last_read_seq bigint, p_cleared_seq bigint, p_marked_unread boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(genesis_chat.unread_count(p_conversation_id, p_user_id, greatest(p_last_read_seq, coalesce(p_cleared_seq, 0))),
                  case when p_marked_unread then 1 else 0 end)
$$;

revoke execute on function genesis_chat.member_unread(uuid, uuid, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function genesis_chat.member_unread(uuid, uuid, bigint, bigint, boolean) to service_role;

-- The inbox (0002's), counting Mark as Unread and leaving out what you deleted until something newer.
create or replace function genesis_chat.inbox(
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
         genesis_chat.member_unread(c.id, me.user_id, me.last_read_seq, ps.cleared_seq, coalesce(ps.marked_unread, false)),
         exists (select 1 from genesis_chat.messages m
                  where m.conversation_id = c.id and m.seq > greatest(me.last_read_seq, coalesce(ps.cleared_seq, 0)) and me.user_id = any (m.mentions)
                    and m.moderation is distinct from 'hidden'),
         coalesce(me.muted_until > now(), false), me.pinned, me.archived, c.last_message_at,
         (select jsonb_build_object('id', m.id, 'seq', m.seq, 'sender_id', m.sender_id, 'kind', m.kind,
                                    'body', left(m.body, 160), 'deleted', m.deleted_at is not null, 'created_at', m.created_at,
                                    'attachment', (select a.kind from genesis_chat.attachments a where a.message_id = m.id order by a.position limit 1))
            from genesis_chat.messages m
           where m.conversation_id = c.id and m.visibility = 'everyone' and m.thread_root_id is null and m.seq > coalesce(ps.cleared_seq, 0)
             and (m.moderation is distinct from 'hidden' or m.sender_id = me.user_id)
           order by m.seq desc limit 1)
    from genesis_chat.members me
    join genesis_chat.conversations c on c.id = me.conversation_id
    join genesis_chat.kinds k on k.kind = c.kind
    left join genesis_chat.member_state ps on ps.conversation_id = me.conversation_id and ps.user_id = me.user_id
   where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
     and me.archived = coalesce(p_archived, false)
     and (ps.cleared_seq is null or genesis_chat.readable_after(c.id, me.user_id, ps.cleared_seq))
     and (p_kind is null or c.kind = p_kind)
     and (p_kinds is null or c.kind = any (p_kinds))
     and (p_exclude_kinds is null or not (c.kind = any (p_exclude_kinds)))
     and (p_before is null or coalesce(c.last_message_at, c.created_at) < p_before)
   order by me.pinned desc, coalesce(c.last_message_at, c.created_at) desc, c.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- The badge (0002's), counted the same way.
create or replace function genesis_chat.unread_total(p_user_id uuid default null, p_exclude_kinds text[] default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(genesis_chat.member_unread(c.id, me.user_id, me.last_read_seq, ps.cleared_seq, coalesce(ps.marked_unread, false))), 0)::integer
    from genesis_chat.members me join genesis_chat.conversations c on c.id = me.conversation_id
    left join genesis_chat.member_state ps on ps.conversation_id = me.conversation_id and ps.user_id = me.user_id
   where me.user_id = case when auth.role() = 'service_role' then coalesce(p_user_id, auth.uid()) else auth.uid() end
     and me.left_at is null and me.role <> 'observer' and me.archived = false
     and coalesce(me.muted_until <= now(), true)
     and (ps.cleared_seq is null or genesis_chat.readable_after(c.id, me.user_id, ps.cleared_seq))
     and (c.last_seq > greatest(me.last_read_seq, coalesce(ps.cleared_seq, 0)) or ps.marked_unread)
     and (p_exclude_kinds is null or not (c.kind = any (p_exclude_kinds)))
$$;

-- A push's badge (0002's push_targets), counted the same way, and nobody told of a message in a
-- conversation they deleted unless it brings it back.
create or replace function genesis_chat.push_targets(p_message_id uuid, p_badge_exclude_kinds text[] default null)
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
         (select coalesce(sum(genesis_chat.member_unread(c2.id, m2.user_id, m2.last_read_seq, p2.cleared_seq, coalesce(p2.marked_unread, false))), 0)::integer
            from genesis_chat.members m2 join genesis_chat.conversations c2 on c2.id = m2.conversation_id
            left join genesis_chat.member_state p2 on p2.conversation_id = m2.conversation_id and p2.user_id = m2.user_id
           where m2.user_id = r.user_id and m2.left_at is null and m2.role <> 'observer' and not m2.archived
             and coalesce(m2.muted_until <= now(), true)
             and (p2.cleared_seq is null or genesis_chat.readable_after(c2.id, m2.user_id, p2.cleared_seq))
             and (c2.last_seq > greatest(m2.last_read_seq, coalesce(p2.cleared_seq, 0)) or p2.marked_unread)
             and (p_badge_exclude_kinds is null or not (c2.kind = any (p_badge_exclude_kinds))))
    from recipients r cross join msg
   -- Someone who deleted the conversation for themselves hears only of a message that brings it
   -- back to their inbox (not, say, a reply in a thread whose root they deleted).
   where not exists (select 1 from genesis_chat.member_state s
                      where s.conversation_id = msg.conversation_id and s.user_id = r.user_id and s.cleared_seq is not null
                        and not genesis_chat.readable_after(msg.conversation_id, r.user_id, s.cleared_seq))
$$;

-- Search (0003's search_messages) never finds what you deleted for yourself.
create or replace function genesis_chat.search_messages(p_query text, p_conversation_id uuid default null, p_limit integer default 30)
returns table (message_id uuid, conversation_id uuid, seq bigint, sender_id uuid, created_at timestamptz, snippet text, in_transcript boolean, thread_root_id uuid)
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
    select me.conversation_id, coalesce(ps.cleared_seq, 0) as cleared_seq from genesis_chat.members me
      left join genesis_chat.member_state ps on ps.conversation_id = me.conversation_id and ps.user_id = me.user_id
     where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
       and (p_conversation_id is null or me.conversation_id = p_conversation_id)
    union
    select p_conversation_id, 0::bigint where p_conversation_id is not null and genesis_chat.i_observe(p_conversation_id)
  ), hits as (
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', translate(m.body, '«»', '‹›'), q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»') as snippet, false as in_transcript,
           m.thread_root_id
      from genesis_chat.messages m join mine using (conversation_id)
     where m.search @@ q and m.deleted_at is null and m.seq > mine.cleared_seq
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
       and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id))
    union all
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', translate(a.transcript, '«»', '‹›'), q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»'), true,
           m.thread_root_id
      from genesis_chat.attachments a
      join genesis_chat.messages m on m.id = a.message_id
      join mine on mine.conversation_id = m.conversation_id
     where a.transcript is not null and a.transcript_search @@ q and m.deleted_at is null and m.seq > mine.cleared_seq
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
       and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id))
  )
  select distinct on (h.created_at, h.id) h.id, h.conversation_id, h.seq, h.sender_id, h.created_at, h.snippet, h.in_transcript, h.thread_root_id
    from hits h
   order by h.created_at desc, h.id
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Where the signed-in person's deleted history ends in a conversation (0: nothing deleted).
create function genesis_chat.my_cleared_seq(p_conversation_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.cleared_seq from genesis_chat.member_state s
                    where s.conversation_id = p_conversation_id and s.user_id = auth.uid()), 0)
$$;

revoke execute on function genesis_chat.my_cleared_seq(uuid) from public, anon;
grant execute on function genesis_chat.my_cleared_seq(uuid) to authenticated, service_role;

-- A file (0005's can_read_object): never one from history you deleted for yourself.
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
      where ((a.provider = 'storage' and a.path = object_name) or a.poster_path = object_name)
        and m.deleted_at is null
        and genesis_chat.can_view(m.conversation_id)
        and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id))
        and m.seq > genesis_chat.my_cleared_seq(m.conversation_id))
    or (object_owner = auth.uid()::text and split_part(object_name, '/', 2) = auth.uid()::text
        and uploaded_at > now() - interval '1 day'))
$$;

-- A message's link previews (0002's link_previews_for): nothing for history you deleted for yourself.
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
     and m.seq > genesis_chat.my_cleared_seq(m.conversation_id)
$$;

-- A pinned message from history you deleted for yourself isn't one of your pins. Restrictive, so
-- it narrows 0001's pins_read.
create function genesis_chat.cleared_for_me(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from genesis_chat.messages m
                   join genesis_chat.member_state s on s.conversation_id = m.conversation_id and s.user_id = auth.uid()
                  where m.id = p_message_id and m.seq <= s.cleared_seq)
$$;

revoke execute on function genesis_chat.cleared_for_me(uuid) from public, anon;
grant execute on function genesis_chat.cleared_for_me(uuid) to authenticated, service_role;

create policy pins_cleared_for_me on genesis_chat.pins
  as restrictive for select to authenticated
  using (not genesis_chat.cleared_for_me(message_id));

revoke execute on function
  genesis_chat.delete_conversation_for_me(uuid, bigint),
  genesis_chat.set_my_settings(uuid, timestamptz, text, boolean, boolean, boolean, boolean)
from public, anon;

grant execute on function
  genesis_chat.delete_conversation_for_me(uuid, bigint),
  genesis_chat.set_my_settings(uuid, timestamptz, text, boolean, boolean, boolean, boolean)
to authenticated, service_role;
