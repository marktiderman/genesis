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
--    already read each other's `last_read_seq` (members_read); the hint carries nothing more.
--    An observer's reads are never sent.

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
  if new.role <> 'observer' and new.last_read_at is distinct from old.last_read_at then
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
