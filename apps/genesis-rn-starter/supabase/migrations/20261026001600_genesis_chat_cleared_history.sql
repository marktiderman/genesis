-- Genesis Chat 0008: history deleted for me stays deleted
--
-- Builds on 0001–0007 (never edited once released). Needs nothing from your app.
--
-- Three places still reached history a member deleted for themselves (0007's `cleared_seq`):
--
-- 1. Read receipts (0006's `read_passed`): Delete for me leaves the member's read place
--    (`last_read_seq`) where it was. When it next moved past a later message, a message they had
--    deleted unread still counted as read, so its sender saw "Read" on what they were never shown.
--    Only a message after the member's `cleared_seq` counts now.
-- 2. Pushes (0007's `push_targets`): a member who deleted the conversation was told of a message
--    whenever the conversation had come back, even of a message from the deleted history (a push
--    sent late, from the outbox, after a newer message). Now they hear only of a message after
--    their `cleared_seq`, and still only of one that brings the conversation back.
-- 3. Files (0007's `can_read_object`): the uploader's own recent file (a day) was readable whether
--    or not it was in a message, so a photo of their own in history they deleted stayed reachable.
--    That fallback is now for a file not yet in any message (an upload before its message is sent);
--    a file in a message is readable only through the message, which follows Delete for me.

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
