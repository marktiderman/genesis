-- Genesis Chat 0008: history deleted for me stays deleted
--
-- Builds on 0001–0007 (never edited once released). Needs nothing from your app.
--
-- Several places still reached history a member deleted for themselves (0007's `cleared_seq`):
--
-- 1. Read receipts (0006): Delete for me leaves the member's read place (`last_read_seq`) where it
--    was, and posting or reading later moved it past what they deleted unread, so its sender saw
--    "Read" (or "Read by N") on what they were never shown. Now the public read place, the one
--    everyone in the conversation reads, is held: it never passes a message someone else sent
--    that the member deleted unread, until they read someone else's message after it. There is
--    still one public number, so nothing shows that the member used Delete for me beyond what a
--    correct receipt says ("not read"). Their true read place is kept, only when it differs, in
--    `member_state.read_seq`, which only they read: their unread counts, mentions, the inbox's
--    `last_read_seq` and `mark_read`'s answer use it, so their own view is unchanged. No row is
--    rewritten: nothing is held until a read place next moves. Exact in a direct conversation;
--    in a group, a sender whose last message is in the deleted history can see "Read" once the
--    member reads someone else's later message, since one public place can't say "read 3 but
--    not 2". The read time (`last_read_at`) and the `read` hint move only for a message after the
--    deleted history.
-- 2. Pushes (0007's `push_targets`): a member who deleted the conversation was told of a message
--    whenever the conversation had come back, even of a message from the deleted history (a push
--    sent late, from the outbox, after a newer message). Now they hear only of a message after
--    their `cleared_seq`, and still only of one that brings the conversation back.
-- 3. Files (0007's `can_read_object`): the uploader's own recent file (a day) was readable whether
--    or not it was in a message, so a photo of their own in history they deleted stayed reachable.
--    That fallback is now for a file not yet in any message (an upload before its message is sent);
--    a file in a message is readable only through the message, which follows Delete for me.
-- 4. Reports (0001's `report_message`): a report copied the message and the ten before it into a
--    snapshot its reporter reads, whatever they had deleted for themselves, and messages deleted
--    for everyone or hidden by moderation too. A message in history you deleted, or one hidden from
--    you by moderation, can't be reported now, and the context holds only messages after that
--    history that aren't deleted and that moderation doesn't hide from you (0002's
--    `messages_hide_moderated`: its sender and observers still see a hidden message).
-- 5. Writes (0001's `react`, `pin_message`, `save_message`, `edit_message`, `delete_message`):
--    each refuses a message in history you deleted for yourself, as it refuses one you can't see.
--    Forgetting a saved message still works. `send_message` isn't changed: a reply to, or a thread
--    on, a message in that history is still accepted (it shows nothing of the message, which reads
--    only through its own row).

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

-- The member's own read place, only while the public one (members.last_read_seq) is held behind
-- it; null otherwise. Private: member_state is read by its member only.
alter table genesis_chat.member_state add column read_seq bigint;

comment on column genesis_chat.member_state.read_seq is
  'This member''s true read place, kept only while members.last_read_seq (what others read for receipts) is held before a message they deleted unread. Null: the same as last_read_seq. Genesis Chat.';

-- Where a member's public read place goes when their read place moves from p_from (the public
-- place now) to p_to: to p_to, unless that passes a message someone else sent that they deleted
-- unread (at or below their `cleared_seq`, counted as read_passed counts) and they haven't read
-- someone else's message after it; then to just before the first such message.
create function genesis_chat.receipt_place(p_conversation_id uuid, p_user_id uuid, p_from bigint, p_to bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_to <= p_from then p_from
    when gap.first_seq is null then p_to
    when genesis_chat.read_passed(p_conversation_id, p_user_id, p_from, p_to) then p_to
    else gap.first_seq - 1
  end
  from (
    select min(m.seq) as first_seq from genesis_chat.messages m
     where m.conversation_id = p_conversation_id
       and m.seq > p_from
       and m.seq <= least(p_to, coalesce((select s.cleared_seq from genesis_chat.member_state s
                                           where s.conversation_id = p_conversation_id and s.user_id = p_user_id), 0))
       and m.kind <> 'system' and m.visibility = 'everyone'
       and m.moderation is distinct from 'hidden' and m.deleted_at is null
       and m.sender_id is distinct from p_user_id
  ) gap
$$;
revoke execute on function genesis_chat.receipt_place(uuid, uuid, bigint, bigint) from public, anon, authenticated;

-- Holds the public read place on every move of it (mark_read, posting, an observer's read), and
-- keeps the true place in member_state.read_seq while they differ. A member with no Delete for me
-- has no member_state row, or no cleared_seq, and is left alone. Fires after 0006's
-- members_read_moved (triggers run in name order), which stamps last_read_at only for a message
-- after the deleted history.
create function genesis_chat.read_held()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st genesis_chat.member_state;
  wanted bigint;
  held bigint;
begin
  select * into st from genesis_chat.member_state s
   where s.conversation_id = new.conversation_id and s.user_id = new.user_id;
  if st.cleared_seq is null and st.read_seq is null then
    return new;
  end if;
  wanted := greatest(new.last_read_seq, coalesce(st.read_seq, old.last_read_seq));
  held := genesis_chat.receipt_place(new.conversation_id, new.user_id, old.last_read_seq, wanted);
  new.last_read_seq := held;
  update genesis_chat.member_state s
     set read_seq = case when held < wanted then wanted end
   where s.conversation_id = new.conversation_id and s.user_id = new.user_id
     and s.read_seq is distinct from (case when held < wanted then wanted end);
  return new;
end;
$$;
revoke execute on function genesis_chat.read_held() from public, anon, authenticated;
create trigger members_read_held before update of last_read_seq on genesis_chat.members
  for each row execute function genesis_chat.read_held();

-- What a member counts as unread (0007's member_unread): after their true read place.
create or replace function genesis_chat.member_unread(p_conversation_id uuid, p_user_id uuid, p_last_read_seq bigint, p_cleared_seq bigint, p_marked_unread boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(genesis_chat.unread_count(p_conversation_id, p_user_id,
                    greatest(p_last_read_seq, coalesce(p_cleared_seq, 0),
                             coalesce((select s.read_seq from genesis_chat.member_state s
                                        where s.conversation_id = p_conversation_id and s.user_id = p_user_id), 0))),
                  case when p_marked_unread then 1 else 0 end)
$$;

-- The inbox (0007's): your own read place and mentions read from your true read place.
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
         c.last_seq, greatest(me.last_read_seq, coalesce(ps.read_seq, 0)),
         genesis_chat.member_unread(c.id, me.user_id, me.last_read_seq, ps.cleared_seq, coalesce(ps.marked_unread, false)),
         exists (select 1 from genesis_chat.messages m
                  where m.conversation_id = c.id and m.seq > greatest(me.last_read_seq, coalesce(ps.read_seq, 0), coalesce(ps.cleared_seq, 0)) and me.user_id = any (m.mentions)
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

-- Reading (0007's mark_read) answers with your true read place.
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
    -- Your own read place: the public one may be held (see members_read_held).
    result := greatest(result, coalesce((select s.read_seq from genesis_chat.member_state s
                                          where s.conversation_id = p_conversation_id and s.user_id = me), 0));
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
   -- Not a message in the history they deleted, nor one that doesn't bring the conversation back
   -- (say, a reply in a thread whose root they deleted).
   where not exists (select 1 from genesis_chat.member_state s
                      where s.conversation_id = msg.conversation_id and s.user_id = r.user_id and s.cleared_seq is not null
                        and (msg.seq <= s.cleared_seq
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

-- A report (0001's report_message): never of a message in history you deleted for yourself or one
-- moderation hides from you, and its context only the messages after that history that aren't
-- deleted and that moderation doesn't hide from you.
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
    and genesis_chat.can_view(m.conversation_id) and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id))
    and m.seq > genesis_chat.my_cleared_seq(m.conversation_id)
    and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id));
  if msg.id is null then
    raise exception 'You can''t report this message' using errcode = '42501';
  end if;
  if (select count(*) from genesis_chat.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports; try again later' using errcode = 'GS429';
  end if;
  cleared := genesis_chat.my_cleared_seq(msg.conversation_id);
  insert into genesis_chat.reports (message_id, conversation_id, reporter_id, reason, note, snapshot)
  values (msg.id, msg.conversation_id, auth.uid(), p_reason, p_note, jsonb_build_object(
    'message', jsonb_build_object('id', msg.id, 'sender_id', msg.sender_id, 'body', msg.body, 'created_at', msg.created_at),
    'context', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'sender_id', c.sender_id, 'body', c.body, 'created_at', c.created_at) order by c.seq)
                         from (select * from genesis_chat.messages
                                where conversation_id = msg.conversation_id and seq < msg.seq and visibility = 'everyone'
                                  and seq > cleared and deleted_at is null
                                  and (moderation is distinct from 'hidden' or sender_id = auth.uid()
                                       or genesis_chat.i_observe(conversation_id))
                                order by seq desc limit 10) c), '[]')))
  returning id into id_;
  return id_;
end;
$$;

-- Edits your own message (0001's edit_message), never one in history you deleted for yourself.
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
     or not genesis_chat.can_view(msg.conversation_id) or genesis_chat.cleared_for_me(msg.id) then
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

-- Deletes a message (0001's delete_message), never one in history you deleted for yourself.
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
  role_ := coalesce(genesis_chat.my_role(msg.conversation_id), '');
  if not (msg.sender_id = auth.uid() and role_ <> ''
          or role_ in ('owner', 'admin')
          or (role_ = 'observer' and genesis_chat.can_post(msg.conversation_id)))
     or genesis_chat.cleared_for_me(msg.id) then
    raise exception 'You can''t delete this message' using errcode = '42501';
  end if;
  delete from genesis_chat.attachments where message_id = msg.id;
  delete from genesis_chat.reactions where message_id = msg.id;
  delete from genesis_chat.pins where message_id = msg.id;
  update genesis_chat.messages set body = '', mentions = '{}', meta = '{}', deleted_at = now()
   where id = msg.id and deleted_at is null;
end;
$$;

-- Adds or takes away your reaction (0001's react), never on a message in history you deleted for yourself.
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
     and m.seq > genesis_chat.my_cleared_seq(m.conversation_id);
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

-- Pins or unpins a message (0001's pin_message), never one in history you deleted for yourself.
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
  role_ := coalesce(genesis_chat.my_role(msg.conversation_id), '');
  select k.max_members = 2 into direct from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
   where c.id = msg.conversation_id;
  if msg.id is null or not (role_ in ('owner', 'admin') or (coalesce(direct, false) and role_ = 'member'))
     or genesis_chat.cleared_for_me(msg.id) then
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

-- Saves a message for yourself (0001's save_message), never one in history you deleted for
-- yourself; forgetting one still works.
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
