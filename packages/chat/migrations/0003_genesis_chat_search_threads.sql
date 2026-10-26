-- Genesis Chat 0003: a search hit inside a reply thread says which thread
--
-- Builds on 0001 and 0002 (never edited once released). genesis_chat.search_messages now also
-- returns thread_root_id, so the app opens the thread a reply lives in instead of reporting the
-- message missing. A return type can't change in place, so the function is dropped and made
-- again, with its grants given again by name.
--
-- Use: `genesis add chat` copies this after 0002. Verify: tests/0003_genesis_chat_search_threads.test.sql.

-- Messages (and voice or video transcripts) you can read that match `p_query`, newest first.
-- Within one conversation, or across all of yours. The snippet marks matches with « and »; the
-- text's own « and » become ‹ and › first, so a message can't fake a highlight. A reply in a
-- thread carries its thread_root_id.
drop function genesis_chat.search_messages(text, uuid, integer);
create function genesis_chat.search_messages(p_query text, p_conversation_id uuid default null, p_limit integer default 30)
returns table (message_id uuid, conversation_id uuid, seq bigint, sender_id uuid, created_at timestamptz, snippet text, in_transcript boolean, thread_root_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q tsquery;
begin
  if auth.uid() is null or length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  q := websearch_to_tsquery('simple', p_query);
  return query
  with mine as (
    select me.conversation_id from genesis_chat.members me
     where me.user_id = auth.uid() and me.left_at is null and me.role <> 'observer'
       and (p_conversation_id is null or me.conversation_id = p_conversation_id)
    union
    select p_conversation_id where p_conversation_id is not null and genesis_chat.i_observe(p_conversation_id)
  ), hits as (
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', translate(m.body, '«»', '‹›'), q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»') as snippet, false as in_transcript,
           m.thread_root_id
      from genesis_chat.messages m join mine using (conversation_id)
     where m.search @@ q and m.deleted_at is null
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
       and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id))
    union all
    select m.id, m.conversation_id, m.seq, m.sender_id, m.created_at,
           ts_headline('simple', translate(a.transcript, '«»', '‹›'), q, 'MaxWords=18, MinWords=6, StartSel=«, StopSel=»'), true,
           m.thread_root_id
      from genesis_chat.attachments a
      join genesis_chat.messages m on m.id = a.message_id
      join mine on mine.conversation_id = m.conversation_id
     where a.transcript is not null and a.transcript_search @@ q and m.deleted_at is null
       and (m.visibility = 'everyone' or genesis_chat.i_observe(m.conversation_id))
       and (m.moderation is distinct from 'hidden' or m.sender_id = auth.uid() or genesis_chat.i_observe(m.conversation_id))
  )
  select distinct on (h.created_at, h.id) h.id, h.conversation_id, h.seq, h.sender_id, h.created_at, h.snippet, h.in_transcript, h.thread_root_id
    from hits h
   order by h.created_at desc, h.id
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke execute on function genesis_chat.search_messages(text, uuid, integer) from public, anon;
grant execute on function genesis_chat.search_messages(text, uuid, integer) to authenticated, service_role;
