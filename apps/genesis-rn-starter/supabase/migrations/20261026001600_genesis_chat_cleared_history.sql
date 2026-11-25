-- Genesis Chat 0008: history deleted for me stays deleted
--
-- Builds on 0001–0007 (never edited once released). Needs nothing from your app.
--
-- Several places still reached history a member deleted for themselves (0007's `cleared_seq`):
--
-- 1. Read receipts (0006): Delete for me leaves the member's read place (`last_read_seq`) where it
--    was, and posting or reading later moves it past what they deleted unread, so its sender saw
--    "Read" (or "Read by N") on what they were never shown. `members.receipt_seq` is now the read
--    place receipts read: it follows `last_read_seq` but never passes a message the member
--    deleted unread, until they read someone else's message after it. Existing rows start at
--    `last_read_seq` (the receipts they showed before 0008): only reads from now on are held.
--    Exact in a direct conversation (the other person's last message is then after the deleted
--    history); in a group, a sender whose last message is in that history can see "Read" once the
--    member reads someone else's later message: one public read place can't say "read 3 but not
--    2" without publishing the private cleared range. `cleared_seq` itself stays private (`member_state`). `last_read_seq`
--    is unchanged (unread counts), and so is the read time (`last_read_at`) and the `read` hint,
--    which now move only for a message after the deleted history; the hint's `seq` is
--    `receipt_seq`.
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
--    for everyone too. A message in history you deleted can't be reported now, and the context
--    holds only messages after it that aren't deleted.
-- 5. Writes (0001's `react`, `pin_message`, `save_message`, `edit_message`, `delete_message`):
--    each refuses a message in history you deleted for yourself, as it refuses one you can't see.
--    Forgetting a saved message still works.

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

-- The read place receipts read. Everyone in the conversation reads it, as they read `last_read_seq`.
alter table genesis_chat.members add column receipt_seq bigint not null default 0;

comment on column genesis_chat.members.receipt_seq is
  'The read place a sender''s "Read" reads: last_read_seq, held before a message this member deleted unread (Delete for me) until they read someone else''s message after it. Genesis Chat.';

-- Where a member's receipt place goes when their read place moves from p_from (their receipt place
-- now) to p_to: to p_to, unless that passes a message someone else sent that they deleted unread
-- (at or below their `cleared_seq`, counted as read_passed counts) and they haven't read someone
-- else's message after it; then to just before the first such message.
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

-- Existing rows: their read place, so every receipt shows what it showed before 0008. The stored
-- rows can't tell history a member read before Delete for me from history they deleted unread
-- (both are at or below cleared_seq), so only reads from now on hold anything back.
update genesis_chat.members me
   set receipt_seq = me.last_read_seq
 where me.last_read_seq > 0;

-- From now on the trigger keeps it: on every move of the read place, and on any other write to it.
create function genesis_chat.receipt_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.receipt_seq := genesis_chat.receipt_place(new.conversation_id, new.user_id,
    case when tg_op = 'UPDATE' then old.receipt_seq else 0 end, new.last_read_seq);
  return new;
end;
$$;
revoke execute on function genesis_chat.receipt_moved() from public, anon, authenticated;
create trigger members_receipt_moved before insert or update of last_read_seq, receipt_seq on genesis_chat.members
  for each row execute function genesis_chat.receipt_moved();

-- 0006's read hint, carrying the receipt place.
create or replace function genesis_chat.read_hint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'observer'
     and genesis_chat.read_passed(new.conversation_id, new.user_id, old.last_read_seq, new.last_read_seq)
     and (
    select count(*) from genesis_chat.members m
     where m.conversation_id = new.conversation_id and m.left_at is null
  ) <= 32 then
    perform genesis_chat.broadcast('genesis-chat:conv:' || new.conversation_id, 'read',
      jsonb_build_object('conversation_id', new.conversation_id, 'user_id', new.user_id,
                         'seq', new.receipt_seq, 'at', new.last_read_at));
  end if;
  return null;
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

-- A report (0001's report_message): never of a message in history you deleted for yourself, and
-- its context only the messages after that history that aren't deleted.
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
    and m.seq > genesis_chat.my_cleared_seq(m.conversation_id);
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
