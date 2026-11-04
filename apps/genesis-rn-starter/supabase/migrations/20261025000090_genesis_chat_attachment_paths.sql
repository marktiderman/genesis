-- Genesis Chat 0005: only a file in storage has a path
--
-- Builds on 0001–0004 (never edited once released). Needs nothing from your app, and no other
-- package's migrations depend on where it runs after chat 0001.
--
-- An attachment's `path` names an object in the genesis-chat bucket, and only attachments with
-- `provider = 'storage'` are checked against what their sender uploaded. So:
--
-- 1. Any other provider now has no path, by a check on the table, whichever function writes the
--    row. send_message refuses one with 23514; a scheduled message holding one records it as its
--    `error` when it comes due, as with any refusal. Genesis's own clients never send one.
-- 2. Reading an object counts `path` only on storage attachments. `poster_path` still counts on
--    any provider: a hosted video's poster lives in the bucket, and send_message has always
--    checked it against the sender's uploads.
-- 3. Paths already on rows with another provider are cleared, and kept in
--    `genesis_chat.attachment_paths_cleared` for the service role, in case you want to look at
--    them. Nothing else about those rows changes: a link keeps its `url`, a video its provider id.
--    Removing a row of that kind never removed a stored file, so nothing was deleted by them.

create table genesis_chat.attachment_paths_cleared (
  attachment_id uuid primary key,
  message_id uuid not null,
  conversation_id uuid not null,
  provider text not null,
  path text not null,
  cleared_at timestamptz not null default now()
);
alter table genesis_chat.attachment_paths_cleared enable row level security;
revoke all on genesis_chat.attachment_paths_cleared from public, anon, authenticated;
grant select on genesis_chat.attachment_paths_cleared to service_role;

insert into genesis_chat.attachment_paths_cleared (attachment_id, message_id, conversation_id, provider, path)
select id, message_id, conversation_id, provider, path
  from genesis_chat.attachments
 where provider <> 'storage' and path is not null;

update genesis_chat.attachments set path = null where provider <> 'storage' and path is not null;

alter table genesis_chat.attachments
  add constraint attachments_path_only_in_storage check (provider = 'storage' or path is null);

-- May the signed-in person read `object_name`? Whoever reads a message that carries it as a file
-- in storage or a poster; its uploader for a day before it is sent.
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
        and (m.visibility = 'everyone' or genesis_chat.observes(m.conversation_id)))
    or (object_owner = auth.uid()::text and split_part(object_name, '/', 2) = auth.uid()::text
        and uploaded_at > now() - interval '1 day'))
$$;
