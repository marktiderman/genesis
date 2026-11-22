-- Genesis Chat 0006: read receipts
--
-- Builds on 0001–0005 (never edited once released). Needs nothing from your app, and no other
-- package's migrations depend on where it runs after chat 0005.
--
-- 1. `members.last_read_at`: when the member last read someone else's message, that is, when
--    their read place (`last_read_seq`) last moved past a message another person sent. Posting
--    moves your read place past your own message, which sets nothing. Null until it happens,
--    on rows written before this migration, and for observers. A sender's "Read 9:41" is this.
-- 2. When it moves, the conversation's live topic gets a `read` hint ({conversation_id, user_id,
--    seq, at}), so "Delivered" turns to "Read" while the sender has the thread open. Members
--    already read each other's `last_read_seq` (members_read); the hint carries nothing more,
--    and clients treat it only as a cue to read the members again, never as the read place.
--    An observer's reads are never sent. Conversations of more than 32 members get no hint
--    (each read would reach every open thread, O(n²) deliveries per message): their "Read by N"
--    updates when the members are next read (opening the thread, a refresh).
-- 3. Clients may broadcast only what clients send: `activity` (typing, recording) and presence.
--    Every other event on a conversation's topic (`message`, `read`, `members`, …) comes from the
--    database's own triggers through `genesis_chat.broadcast`, so a member can't forge another
--    member's read receipt (or a message hint) on everyone's screen.
-- 4. A hidden (moderated) or deleted message doesn't count as read: its sender mustn't see "Read"
--    on what the other person was never shown.
--
-- Privacy: with this migration every member and observer of a conversation can see when each
-- member last read it (`last_read_at`), as they already see how far (`last_read_seq`).

alter table genesis_chat.members add column last_read_at timestamptz;

comment on column genesis_chat.members.last_read_at is
  'When this member''s read place last moved past someone else''s message (read receipts). Genesis Chat.';

create function genesis_chat.read_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'observer' and new.last_read_seq > old.last_read_seq and exists (
    select 1 from genesis_chat.messages m
     where m.conversation_id = new.conversation_id
       and m.seq > old.last_read_seq and m.seq <= new.last_read_seq
       and m.kind = 'text' and m.visibility = 'everyone'
       and m.moderation is distinct from 'hidden' and m.deleted_at is null
       and m.sender_id is distinct from new.user_id
  ) then
    new.last_read_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function genesis_chat.read_moved() from public, anon, authenticated;
create trigger members_read_moved before update of last_read_seq on genesis_chat.members
  for each row execute function genesis_chat.read_moved();

create function genesis_chat.read_hint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'observer' and new.last_read_at is distinct from old.last_read_at and (
    select count(*) from genesis_chat.members m
     where m.conversation_id = new.conversation_id and m.left_at is null
  ) <= 32 then
    perform genesis_chat.broadcast('genesis-chat:conv:' || new.conversation_id, 'read',
      jsonb_build_object('conversation_id', new.conversation_id, 'user_id', new.user_id,
                         'seq', new.last_read_seq, 'at', new.last_read_at));
  end if;
  return null;
end;
$$;
revoke execute on function genesis_chat.read_hint() from public, anon, authenticated;
create trigger members_read_hint after update of last_read_seq on genesis_chat.members
  for each row execute function genesis_chat.read_hint();

-- Only client events from clients: the server's own hints go out through genesis_chat.broadcast
-- (SECURITY DEFINER), which this policy doesn't govern.
do $do$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists genesis_chat_signal on realtime.messages';
    execute $p$
      create policy genesis_chat_signal on realtime.messages for insert to authenticated
        with check ((realtime.messages.extension = 'presence'
                     or (realtime.messages.extension = 'broadcast' and realtime.messages.event = 'activity'))
                    and genesis_chat.can_join_topic(realtime.topic(), true))
    $p$;
  end if;
end;
$do$;
