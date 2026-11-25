-- Genesis Chat 0005: attachment paths are tightened
--
-- Builds on 0001–0004 (never edited once released). Needs nothing from your app, and no other
-- package's migrations depend on where it runs after chat 0001.
--
-- 1. An attachment has a `path` only when its provider is `storage`, by a check on the table.
--    send_message refuses anything else with 23514; a scheduled message holding one records that
--    as its `error` when it comes due, as with any refusal. Genesis's own clients never send one.
-- 2. Read access counts `path` only on storage attachments, and `poster_path` on any provider
--    (a hosted video's poster lives in the bucket).
-- 3. Paths on other providers are cleared, with the transcript of a voice row among them, and
--    kept in `genesis_chat.attachment_paths_cleared` for the service role. A link keeps its `url`,
--    and a video its provider id.
--
-- `attachment_paths_cleared` holds object paths, which contain user ids, and nothing removes them:
-- account deletion doesn't touch this table, and neither does retention. Look at it once after
-- this runs (usually it's empty), then drop it, `drop table genesis_chat.attachment_paths_cleared`,
-- and sooner if a person's data must go.

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

-- A function so its test can run it: rows are refused once the check below is on. Returns how many it cleared.
create function genesis_chat.clear_paths_outside_storage()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cleared integer;
begin
  insert into genesis_chat.attachment_paths_cleared (attachment_id, message_id, conversation_id, provider, path)
  select id, message_id, conversation_id, provider, path
    from genesis_chat.attachments
   where provider <> 'storage' and path is not null
  on conflict (attachment_id) do nothing;
  update genesis_chat.attachments
     set path = null,
         transcript = case when kind = 'voice' then null else transcript end
   where provider <> 'storage' and path is not null;
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;
revoke all on function genesis_chat.clear_paths_outside_storage() from public, anon, authenticated, service_role;

select genesis_chat.clear_paths_outside_storage();

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
