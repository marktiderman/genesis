# @marktiderman/genesis-chat

Chat for Genesis apps, in the app's own Supabase: direct messages, groups and the app's own
kinds of conversation (a cohort, a support ticket), with photos, files, voice notes and videos,
replies, threads, reactions, read state, live updates and push.

| Entry | What it is |
|---|---|
| `@marktiderman/genesis-chat` | The headless core: types, `createChatClient`, the send outbox, thread logic, media rules. No React. |
| `/react` | Hooks for web and native: `ChatProvider`, `useInbox`, `useConversation`, `useSend`, `useMessageActions`. |
| `/web` | Renderers on genesis-ui: inbox, thread, composer (text, photos, voice), media. |
| `/native` | Renderers on genesis-ui-native: `InboxPage` and `ThreadPage` wired to chat, voice recording with expo-audio. |
| `/server` | `createChatRunner`: works the outbox (push, transcripts, storage cleanup). |
| `migrations/0001_genesis_chat.sql` | The schema, copied into your app by `genesis add chat`, with its pgTAP test. |

## Kinds and rules

A kind of conversation carries its rules (`genesis_chat.register_kind`): how many members, who
posts (members or admins), who manages members (the app, or the conversation's admins), whether
threads are on, a **start check** (who may start one, with whom) and an **observer check** (who
reads without being a member, such as a support team). Both checks are functions of your own,
registered in a migration after 0001; without a start check only your server starts that kind.

```sql
create function public.chat_may_dm(member_ids uuid[], subject_type text, subject_id text, user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team t1 join public.team t2 using (org_id)
                 where t1.user_id = chat_may_dm.user_id and t2.user_id = member_ids[1])
$$;
revoke execute on function public.chat_may_dm(uuid[], text, text, uuid) from public, anon, authenticated;
select genesis_chat.register_kind('direct', 'Direct message', p_max_members => 2,
  p_start_check => 'public.chat_may_dm(uuid[], text, text, uuid)');
```

A conversation tied to one of your records (a group, a ticket) is made by your server with
`genesis_chat.ensure_conversation(kind, subject_type, subject_id, title)`, and its members set with
`genesis_chat.sync_members(conversation, user_ids, role)`.

## Access

Members read a conversation; who posts follows its kind and settings (`{"who_posts": "admins"}`
makes it one-way). Observers read it and, where the kind allows, reply and leave internal notes
(`visibility: "observers"`) members never see. Files go in the private `genesis-chat` bucket under
`<conversation>/<uploader>/`, readable by whoever reads the message that carries them. anon
reaches nothing. The pgTAP test beside the migration proves each rule.

## Live updates

New and changed messages, reactions and memberships are broadcast as hints (ids only) to private
Realtime topics, `genesis-chat:conv:<id>` and `genesis-chat:user:<id>`; clients fetch through row
level security, and fetch what they missed after a reconnect. Typing and recording are broadcast
by clients and never stored.

## The outbox

A message queues a `push` effect, a voice note or video a `transcribe` effect, a deleted file a
`storage.remove` effect. `createChatRunner` (from `/server`) claims and settles them; nothing is sent
from a trigger.
