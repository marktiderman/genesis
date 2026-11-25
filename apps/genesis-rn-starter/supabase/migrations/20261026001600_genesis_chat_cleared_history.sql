-- Genesis Chat 0008: history deleted for me stays deleted
--
-- Builds on 0001–0007 (never edited once released). Needs nothing from your app.
--
-- Places that still reached history a member deleted for themselves (0007's `cleared_seq`):
--
-- 1. Read receipts. Delete for me leaves the member's read place (`last_read_seq`) where it was,
--    so when it next moved past a later message, a message they had deleted unread counted as
--    read: its sender saw "Read" on what the member was never shown. Now:
--    - `member_state.cleared_read_seq` keeps where the member had read to when they deleted, so the
--      messages deleted unread are known: after it, up to `cleared_seq`.
--    - `member_reads(conversation)` is the members' read places as a sender may count them, and
--      what the client reads (`members()`): another member's place stops before what they deleted
--      unread when your latest message is in it, so it shows "Delivered", never "Read". The server
--      is the one source of it; the client keeps comparing your message's seq with a read place.
--    - `read_passed` (0006's, which sets `last_read_at` and sends the read hint) counts only a
--      message after the member's `cleared_seq`.
-- 2. Pushes (0007's `push_targets`): a member who deleted the conversation was told of a message
--    whenever the conversation had come back, even of a message from the deleted history (a push
--    sent late, from the outbox, after a newer message). Now they hear only of a message after
--    their `cleared_seq`, and still only of one that brings the conversation back.
-- 3. Files (0007's `can_read_object`): the uploader's own recent file (a day) was readable whether
--    or not it was in a message, so a photo of their own in history they deleted stayed reachable.
--    That fallback is now for a file not yet in any message (an upload before its message is sent);
--    a file in a message is readable only through the message, which follows Delete for me.
-- 4. Reports (0001's `report_message`): its snapshot, which the reporter can read, kept the ten
--    messages before the reported one whatever the reporter had deleted. It now leaves out deleted
--    messages and history the reporter deleted for themselves, and a message in that history can't
--    be reported.
-- 5. Reactions, pins and saves (0001's `react`, `pin_message`, `save_message`): adding one to a
--    message in history you deleted for yourself is refused, as the read policy (0007's
--    messages_cleared_for_me) hides it; taking your own reaction off, unpinning and forgetting a
--    saved message still work.

-- Whether a read place moving from p_from to p_to passed a message someone else sent that this
-- member was shown: any kind but system, to everyone, not hidden by moderation, not deleted, and
-- not in history they deleted for themselves.
create or replace function genesis_chat.read_passed(p_conversation_id uuid, p_user_id uuid, p_from bigint, p_to bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_to > p_from and exists (
    select 1 from genesis_chat.messages m
     where m.conversation_id = p_conversation_id
       and m.seq > p_from and m.seq <= p_to
       and m.seq > coalesce((select s.cleared_seq from genesis_chat.member_state s
                              where s.conversation_id = p_conversation_id and s.user_id = p_user_id), 0)
       and m.kind <> 'system' and m.visibility = 'everyone'
       and m.moderation is distinct from 'hidden' and m.deleted_at is null
       and m.sender_id is distinct from p_user_id
  )
$$;
revoke execute on function genesis_chat.read_passed(uuid, uuid, bigint, bigint) from public, anon, authenticated;

-- A push's recipients and badge (0007's push_targets): someone who deleted the conversation for
-- themselves hears only of a message after what they deleted that brings it back to their inbox.
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
   -- Not a message in the history they deleted, nor a reply in a thread whose root they deleted
   -- (judged by the message itself, so a later message elsewhere doesn't qualify it), nor one while
   -- the conversation isn't back in their inbox.
   where not exists (select 1 from genesis_chat.member_state s
                      where s.conversation_id = msg.conversation_id and s.user_id = r.user_id and s.cleared_seq is not null
                        and (msg.seq <= s.cleared_seq
                             or (msg.thread_root_id is not null
                                 and coalesce((select root.seq from genesis_chat.messages root where root.id = msg.thread_root_id), 0) <= s.cleared_seq)
                             or not genesis_chat.readable_after(msg.conversation_id, r.user_id, s.cleared_seq)))
$$;

-- A file (0007's can_read_object): one in a message only through that message, so never one from
-- history you deleted for yourself; your own recent upload only until it's in a message.
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
        and uploaded_at > now() - interval '1 day'
        and not exists (select 1 from genesis_chat.attachments a
                         where (a.provider = 'storage' and a.path = object_name) or a.poster_path = object_name)))
$$;


-- ── Read receipts: what a member deleted unread ────────────────────────────────

alter table genesis_chat.member_state add column cleared_read_seq bigint;
comment on column genesis_chat.member_state.cleared_read_seq is
  'Where this member had read to when they deleted the conversation for themselves: what they deleted unread is after it, up to cleared_seq, and never reads as read to its sender (member_reads). Kept from the first such deletion while some of it is unread. Null (a deletion before 0008): treated as 0, so none of it reads as read. Genesis Chat.';

-- Delete for me (0007's body), now keeping where the member had read to.
create or replace function genesis_chat.delete_conversation_for_me(p_conversation_id uuid, p_seq bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  latest bigint;
  read_ bigint;
begin
  update genesis_chat.members m
     set pinned = false, archived = false
   where m.conversation_id = p_conversation_id and m.user_id = me and m.left_at is null and m.role <> 'observer'
  returning m.last_read_seq into read_;
  if not found then
    raise exception 'You aren''t in this conversation' using errcode = '42501';
  end if;
  select c.last_seq into latest from genesis_chat.conversations c where c.id = p_conversation_id;
  insert into genesis_chat.member_state as s (conversation_id, user_id, cleared_seq, cleared_read_seq, marked_unread)
  values (p_conversation_id, me, greatest(least(coalesce(p_seq, latest), latest), 0), read_, false)
  on conflict (conversation_id, user_id) do update
    set cleared_seq = greatest(coalesce(s.cleared_seq, 0), excluded.cleared_seq),
        -- An earlier deletion with history still unread keeps its start, so that history never
        -- reads as read (at worst a message read since shows "Delivered").
        cleared_read_seq = case when s.cleared_seq is not null and coalesce(s.cleared_read_seq, 0) < s.cleared_seq
                                then coalesce(s.cleared_read_seq, 0) else excluded.cleared_read_seq end,
        marked_unread = false;
  perform genesis_chat.broadcast('genesis-chat:user:' || me, 'inbox',
    jsonb_build_object('conversation_id', p_conversation_id));
end;
$$;

-- Your latest message in a conversation (member_reads' max(seq)), without reading all of it.
create index messages_conversation_sender_idx on genesis_chat.messages (conversation_id, sender_id, seq);

-- The members of a conversation you can see, with their read places as you may count them: what
-- `members()` reads. Another member's place stops at where they had read to when they deleted the
-- conversation for themselves while your latest message is in what they deleted unread, so it reads
-- "Delivered", never "Read" (and no read time). Your own place is your own. Nothing for a
-- conversation you can't see.
create function genesis_chat.member_reads(p_conversation_id uuid)
returns table (conversation_id uuid, user_id uuid, role text, last_read_seq bigint, last_read_at timestamptz, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select max(m.seq) as seq from genesis_chat.messages m
     where m.conversation_id = p_conversation_id and m.sender_id = auth.uid()
       and m.kind <> 'system' and m.visibility = 'everyone'
       and m.moderation is distinct from 'hidden' and m.deleted_at is null
  )
  select me.conversation_id, me.user_id, me.role,
         case when h.unread then least(me.last_read_seq, coalesce(s.cleared_read_seq, 0)) else me.last_read_seq end,
         case when h.unread then null else me.last_read_at end,
         me.joined_at
    from genesis_chat.members me
    left join genesis_chat.member_state s on s.conversation_id = me.conversation_id and s.user_id = me.user_id
    cross join mine
    cross join lateral (
      select coalesce(me.user_id is distinct from auth.uid() and s.cleared_seq is not null
                      and mine.seq > coalesce(s.cleared_read_seq, 0) and mine.seq <= s.cleared_seq, false) as unread
    ) h
   where me.conversation_id = p_conversation_id and me.left_at is null and me.role <> 'observer'
     and genesis_chat.can_view(p_conversation_id)
   order by me.joined_at, me.user_id
$$;

revoke execute on function genesis_chat.member_reads(uuid) from public, anon;
grant execute on function genesis_chat.member_reads(uuid) to authenticated, service_role;

-- ── Reports: not what the reporter deleted ─────────────────────────────────────

-- Reports a message (0001's body), keeping a copy of it and the ten messages before it that the
-- reporter can still read: not deleted, not in history they deleted for themselves.
create or replace function genesis_chat.report_message(p_message_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg genesis_chat.messages;
  id_ uuid;
  cleared bigint;
begin
  select * into msg from genesis_chat.messages m where m.id = p_message_id
    and genesis_chat.can_view(m.conversation_id) and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id));
  -- The reporter's cutoff, read once: it admits the message and bounds the context alike.
  cleared := genesis_chat.my_cleared_seq(msg.conversation_id);
  if msg.id is null or msg.seq <= cleared then
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
                                where conversation_id = msg.conversation_id and seq < msg.seq and seq > cleared
                                  and visibility = 'everyone' and deleted_at is null
                                order by seq desc limit 10) c), '[]')))
  returning id into id_;
  return id_;
end;
$$;

-- ── Reactions, pins and saves: not in history you deleted ──────────────────────

-- 0001's react: adding a reaction to a message in history you deleted for yourself is refused;
-- taking your own off still works, as forgetting a saved message does.
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
     and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id))
     and (not p_on or m.seq > genesis_chat.my_cleared_seq(m.conversation_id));
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

-- 0001's pin_message: pinning a message in history you deleted for yourself is refused; unpinning
-- still works, as forgetting a saved message does.
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
  select * into msg from genesis_chat.messages m where m.id = p_message_id and m.deleted_at is null and m.visibility = 'everyone'
    and (not p_on or m.seq > genesis_chat.my_cleared_seq(m.conversation_id));
  role_ := coalesce(genesis_chat.my_role(msg.conversation_id), '');
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

-- 0001's save_message: saving refuses a message in history you deleted for yourself (forgetting a
-- saved one is always allowed).
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
                     and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id))
                     and m.seq > genesis_chat.my_cleared_seq(m.conversation_id)) then
      raise exception 'You can''t save this message' using errcode = '42501';
    end if;
    insert into genesis_chat.saved (user_id, message_id, note) values (auth.uid(), p_message_id, p_note)
    on conflict (user_id, message_id) do update set note = excluded.note;
  else
    delete from genesis_chat.saved where user_id = auth.uid() and message_id = p_message_id;
  end if;
end;
$$;
