-- @feat:support-chat
-- Genesis support 0018: the agent queue as a list a data provider pages (after
-- 0009_genesis_support_inbox.sql).
--
--   public.support_agent_queue(tenant, inbox_view, statuses, page_limit, page_offset)
--     A tenant's tickets for its agents, with the same columns as 0009's support_agent_tickets plus
--     `total_count`, and no keyset paging of its own, so a provider pages, counts and filters it.
--     A Genesis view reads it as its source (genesis-support's `supportQueueSource()`), so its
--     pages, counts and segments cover every ticket, not the latest 50. inbox_view, with 0013's
--     support_agent_tickets' meanings exactly (its pgTAP test checks the two agree): `mine` (active
--     and assigned to me), `unassigned` (active and nobody's), `pending` (waiting on the
--     requester), `closed` (addressed, wont_fix) or `all` (every ticket). Active means neither
--     pending nor closed. support_agent_tickets itself can't be the source: it caps a page at 200
--     rows and pages by keyset, where a provider pages by range and counts. Each row says since
--     when the requester has waited (`waiting_since`), as support_agent_tickets does.
--
--     statuses (optional) keeps the tickets whose status is one of them (the Open segment, a
--     status chip), applied before paging.
--
--     Paging happens inside: with page_limit (and page_offset), the function picks that page of the
--     queue (newest activity first) and counts the whole queue (`total_count`) from the tickets'
--     own columns, and only then reads each page row's latest message (`preview`) and waiting
--     time, so a page costs its rows, not the tenant's history. page_limit 0 is a count alone: one
--     row whose only value is `total_count`, and no preview built. The provider passes the page
--     when nothing would be filtered, searched or sorted after the function (a `pages` source).
--     A text search or another sort reads every row (no page_limit), by design: PostgREST can
--     only search or sort what the function returned, so those reads build every row's preview.
--
-- A null tenant means the app's own. Only an agent of the tenant may read it (42501 otherwise),
-- through 0009's private.genesis_support_inbox_tenant; an agent's own ticket stays out.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0018_genesis_support_agent_queue.test.sql`).

-- A ticket's preview: its conversation's latest visible text message, else the ticket's message.
-- Its own function so the pgTAP test can count how many rows a page read it for.
create or replace function private.genesis_support_queue_preview(conversation uuid, fallback text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return left(coalesce(
    (select m.body from genesis_chat.messages m
      where m.conversation_id = conversation and m.visibility = 'everyone' and m.kind = 'text'
        and m.deleted_at is null and m.moderation is distinct from 'hidden'
        and nullif(btrim(m.body), '') is not null
      order by m.seq desc limit 1),
    fallback), 160);
end;
$$;

revoke execute on function private.genesis_support_queue_preview(uuid, text) from public, anon, authenticated;

create or replace function public.support_agent_queue(
  tenant uuid default null,
  inbox_view text default 'all',
  statuses text[] default null,
  page_limit integer default null,
  page_offset integer default 0
)
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  type text,
  title text,
  message text,
  status text,
  severity text,
  created_at timestamptz,
  updated_at timestamptz,
  last_staff_reply_at timestamptz,
  last_user_reply_at timestamptz,
  user_read_at timestamptz,
  staff_read_at timestamptz,
  requester_email text,
  requester_name text,
  conversation_id uuid,
  assignee_id uuid,
  activity_at timestamptz,
  preview text,
  agent_unread boolean,
  waiting_since timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  resolved uuid := private.genesis_support_inbox_tenant(tenant);
begin
  if inbox_view is null or inbox_view not in ('mine', 'unassigned', 'pending', 'closed', 'all') then
    raise exception 'support_agent_queue: inbox_view is mine, unassigned, pending, closed or all' using errcode = '22023';
  end if;
  if page_limit < 0 or page_offset < 0 then
    raise exception 'support_agent_queue: page_limit and page_offset are zero or more' using errcode = '22023';
  end if;
  -- A count alone: one row carrying it, from the tickets' own columns, and nothing else built.
  if page_limit = 0 then
    return query
      select null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::text,
             null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz,
             null::text, null::text, null::uuid, null::uuid, null::timestamptz, null::text, null::boolean, null::timestamptz,
             count(*)
        from public.tickets t
        left join genesis_chat.conversations c
          on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
       where t.tenant_id = resolved
         and t.user_id is distinct from me
         and (statuses is null or t.status = any (statuses))
         and case inbox_view
               when 'mine' then c.assignee_id = me and t.status not in ('pending', 'addressed', 'wont_fix')
               when 'unassigned' then c.assignee_id is null and t.status not in ('pending', 'addressed', 'wont_fix')
               when 'pending' then t.status = 'pending'
               when 'closed' then t.status in ('addressed', 'wont_fix')
               else true
             end;
    return;
  end if;
  return query
    -- The page, from the tickets' own columns: which tickets, in what order, and how many in all.
    with page as (
      select t.id as ticket_id, c.id as conv_id, c.assignee_id as assignee,
             greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at) as activity,
             count(*) over () as total
        from public.tickets t
        left join genesis_chat.conversations c
          on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
       where t.tenant_id = resolved
         and t.user_id is distinct from me
         and (statuses is null or t.status = any (statuses))
         and case inbox_view
               when 'mine' then c.assignee_id = me and t.status not in ('pending', 'addressed', 'wont_fix')
               when 'unassigned' then c.assignee_id is null and t.status not in ('pending', 'addressed', 'wont_fix')
               when 'pending' then t.status = 'pending'
               when 'closed' then t.status in ('addressed', 'wont_fix')
               else true
             end
       order by activity desc, t.id desc
       offset coalesce(page_offset, 0)
       limit page_limit
    )
    -- Then each page row's details, the latest message and the wait among them.
    select t.id, t.tenant_id, t.user_id, t.type, t.title, t.message, t.status,
           coalesce(t.severity, t.context ->> 'severity'),
           t.created_at, t.updated_at, t.last_staff_reply_at, t.last_user_reply_at, t.user_read_at, t.staff_read_at,
           to_jsonb(t) ->> 'requester_email', to_jsonb(t) ->> 'requester_name',
           p.conv_id, p.assignee,
           p.activity,
           private.genesis_support_queue_preview(p.conv_id, t.message),
           t.staff_read_at is null or coalesce(t.last_user_reply_at > t.staff_read_at, false),
           -- Since when the requester has waited for an answer, as 0013's support_agent_tickets.
           case
             when t.status in ('pending', 'addressed', 'wont_fix') then null
             when t.last_staff_reply_at is null then t.created_at
             else (select min(m.created_at) from genesis_chat.messages m
                    where m.conversation_id = p.conv_id and m.visibility = 'everyone' and m.kind = 'text'
                      and m.sender_role <> 'observer' and m.deleted_at is null
                      and m.created_at > t.last_staff_reply_at)
           end,
           p.total
      from page p
      join public.tickets t on t.id = p.ticket_id
     order by p.activity desc, p.ticket_id desc;
end;
$$;

comment on function public.support_agent_queue(uuid, text, text[], integer, integer) is
  'A tenant''s tickets for its agents, filtered by status and paged inside when given, with the whole queue''s total_count (page_limit 0: the count alone). Genesis support.';
revoke execute on function public.support_agent_queue(uuid, text, text[], integer, integer) from public, anon;
grant execute on function public.support_agent_queue(uuid, text, text[], integer, integer) to authenticated;
