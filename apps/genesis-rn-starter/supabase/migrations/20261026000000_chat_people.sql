-- @feat:chat
-- Names and avatars for chat (`ChatProvider loadPeople`, through `loadChatPeople` in
-- src/lib/chat.tsx). genesis-chat stores user ids only, and the starter has no profiles table:
-- a login's name and picture are its auth metadata (`name` or `full_name`, `avatar_url` or
-- `picture`), set at sign-up or by Sign in with Apple.
--
-- auth.users isn't readable through the API, so this function reads it for the caller, and
-- returns only:
--   - the name and avatar, never the email, phone or the rest of the metadata;
--   - for the caller, and for people with a membership (current or past, so old messages keep
--     their author's name) in a conversation the caller can read (genesis_chat.can_view: a
--     member, or an observer the kind's check lets in).
-- Anyone else is left out, so asking about a stranger's id returns no row. At most 200 ids.
--
-- An app with its own profiles drops this and passes its own `loadPeople`.

create or replace function public.chat_people(p_user_ids uuid[])
returns table (user_id uuid, name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name')), ''),
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')), '')
  from auth.users u
  where auth.uid() is not null
    and u.id = any (p_user_ids[1:200])
    and (
      u.id = auth.uid()
      or exists (
        select 1 from genesis_chat.members theirs
        where theirs.user_id = u.id and genesis_chat.can_view(theirs.conversation_id)
      )
    )
$$;

revoke execute on function public.chat_people(uuid[]) from public, anon;
grant execute on function public.chat_people(uuid[]) to authenticated, service_role;

comment on function public.chat_people(uuid[]) is
  'Name and avatar (auth metadata) for the caller and people in conversations the caller can read. Genesis starter chat.';
