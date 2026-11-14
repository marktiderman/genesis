-- @feat:support-chat
-- Genesis support 0018: the agent queue as a list a data provider pages (after
-- 0009_genesis_support_inbox.sql).
--
--   public.support_agent_queue(tenant, inbox_view)
--     A tenant's tickets for its agents, with the same columns as 0009's support_agent_tickets,
--     but every row: no limit and no keyset paging of its own, so PostgREST pages it (`range`),
--     counts it (`count=exact`) and filters it (status, search) like a table. A Genesis view reads
--     it as its source (genesis-support's `supportQueueSource()`), so its pages, counts and
--     segments cover every ticket, not the latest 50. inbox_view, with 0013's
--     support_agent_tickets' meanings exactly (its pgTAP test checks the two agree): `mine` (active
--     and assigned to me), `unassigned` (active and nobody's), `pending` (waiting on the
--     requester), `closed` (addressed, wont_fix) or `all` (every ticket). Active means neither
--     pending nor closed. support_agent_tickets itself can't be the source: it caps a page at 200
--     rows and pages by keyset, where a provider pages by range and counts. Each row says since
--     when the requester has waited (`waiting_since`), as support_agent_tickets does.
--
-- A null tenant means the app's own. Only an agent of the tenant may read it (42501 otherwise),
-- through 0009's private.genesis_support_inbox_tenant; an agent's own ticket stays out.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0018_genesis_support_agent_queue.test.sql`).

create or replace function public.support_agent_queue(tenant uuid default null, inbox_view text default 'all')
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
  waiting_since timestamptz
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
  return query
    select t.id, t.tenant_id, t.user_id, t.type, t.title, t.message, t.status,
           coalesce(t.severity, t.context ->> 'severity'),
           t.created_at, t.updated_at, t.last_staff_reply_at, t.last_user_reply_at, t.user_read_at, t.staff_read_at,
           to_jsonb(t) ->> 'requester_email', to_jsonb(t) ->> 'requester_name',
           c.id, c.assignee_id,
           greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at),
           left(coalesce(
             (select m.body from genesis_chat.messages m
               where m.conversation_id = c.id and m.visibility = 'everyone' and m.kind = 'text'
                 and m.deleted_at is null and m.moderation is distinct from 'hidden'
                 and nullif(btrim(m.body), '') is not null
               order by m.seq desc limit 1),
             t.message), 160),
           t.staff_read_at is null or coalesce(t.last_user_reply_at > t.staff_read_at, false),
           -- Since when the requester has waited for an answer, as 0013's support_agent_tickets.
           case
             when t.status in ('pending', 'addressed', 'wont_fix') then null
             when t.last_staff_reply_at is null then t.created_at
             else (select min(m.created_at) from genesis_chat.messages m
                    where m.conversation_id = c.id and m.visibility = 'everyone' and m.kind = 'text'
                      and m.sender_role <> 'observer' and m.deleted_at is null
                      and m.created_at > t.last_staff_reply_at)
           end
      from public.tickets t
      left join genesis_chat.conversations c
        on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
     where t.tenant_id = resolved
       and t.user_id is distinct from me
       and case inbox_view
             when 'mine' then c.assignee_id = me and t.status not in ('pending', 'addressed', 'wont_fix')
             when 'unassigned' then c.assignee_id is null and t.status not in ('pending', 'addressed', 'wont_fix')
             when 'pending' then t.status = 'pending'
             when 'closed' then t.status in ('addressed', 'wont_fix')
             else true
           end
     order by greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at) desc, t.id desc;
end;
$$;

comment on function public.support_agent_queue(uuid, text) is
  'A tenant''s tickets for its agents, every row, for a data provider to page and count. Genesis support.';
revoke execute on function public.support_agent_queue(uuid, text) from public, anon;
grant execute on function public.support_agent_queue(uuid, text) to authenticated;
