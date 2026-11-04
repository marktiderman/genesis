-- @feat:support-helpdesk
-- Genesis support 0009: the agent inbox's read path (after 0006_genesis_support_chat_tenants.sql).
--
-- An agent's queue needs a ticket with its conversation's assignee, in one tenant, so the two
-- functions here read both tables for whoever handles that tenant:
--
--   public.support_agent_tickets(tenant, inbox_view, before_at, before_id, max_rows, only_id)
--     A tenant's tickets, latest activity first. inbox_view: `mine` (open and assigned to me),
--     `unassigned` (open and nobody's) or `all` (every ticket, closed ones too). Closed means
--     status `addressed` or `wont_fix`. Page with the last row's activity_at and id. only_id
--     reads one ticket of the queue, for a link to it.
--   public.support_agent_ticket_counts(tenant)
--     How many tickets each of those views holds, a row per view.
--
-- A null tenant means the app's own. Who may call: an agent of the tenant (private.genesis_support_agent:
-- an agent row while the app's hook lists them, a tenant admin, or in the app's own tenant its
-- staff), anyone else is refused. An agent's own ticket stays out of their queue, as they can't
-- handle it. Whom the app's report hook names (0003) reach a ticket by its id, not through a queue.
--
-- The preview is the latest message the requester can see, never an internal note or a hidden one.
--
-- A later change that adds a column or argument drops and recreates the function: replacing it with
-- another signature would leave two, which PostgREST can't choose between.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0009_genesis_support_inbox.test.sql`).

create index if not exists tickets_tenant_activity_idx
  on public.tickets (tenant_id, greatest(created_at, last_user_reply_at, last_staff_reply_at) desc, id desc);

-- May this login read this tenant's queue? Returns the tenant (null means the app's own), or refuses.
create or replace function private.genesis_support_inbox_tenant(tenant uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
begin
  if not private.genesis_support_agent(resolved, auth.uid()) then
    raise exception 'support inbox: only an agent of this tenant' using errcode = '42501';
  end if;
  return resolved;
end;
$$;

revoke execute on function private.genesis_support_inbox_tenant(uuid) from public, anon, authenticated;

create or replace function public.support_agent_tickets(
  tenant uuid default null,
  inbox_view text default 'all',
  before_at timestamptz default null,
  before_id uuid default null,
  max_rows integer default 50,
  only_id uuid default null
)
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  type text,
  title text,
  message text,
  status text,
  feature_id text,
  route text,
  app_version text,
  severity text,
  channel text,
  requester_email text,
  requester_name text,
  platform text,
  device jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_staff_reply_at timestamptz,
  last_user_reply_at timestamptz,
  user_read_at timestamptz,
  staff_read_at timestamptz,
  pin jsonb,
  about_label text,
  conversation_id uuid,
  assignee_id uuid,
  activity_at timestamptz,
  preview text,
  agent_unread boolean
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
  if inbox_view is null or inbox_view not in ('mine', 'unassigned', 'all') then
    raise exception 'support_agent_tickets: inbox_view is mine, unassigned or all' using errcode = '22023';
  end if;
  return query
    select t.id, t.tenant_id, t.user_id, t.type, t.title, t.message, t.status, t.feature_id, t.route, t.app_version,
           coalesce(t.severity, t.context ->> 'severity'), to_jsonb(t) ->> 'channel',
           to_jsonb(t) ->> 'requester_email', to_jsonb(t) ->> 'requester_name', t.platform, t.device,
           t.created_at, t.updated_at,
           t.last_staff_reply_at, t.last_user_reply_at, t.user_read_at, t.staff_read_at,
           t.context -> 'pin', t.context ->> 'about_label',
           c.id, c.assignee_id,
           greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at),
           left(coalesce(
             (select m.body from genesis_chat.messages m
               where m.conversation_id = c.id and m.visibility = 'everyone' and m.kind = 'text'
                 and m.deleted_at is null and m.moderation is distinct from 'hidden'
                 and nullif(btrim(m.body), '') is not null
               order by m.seq desc limit 1),
             t.message), 160),
           t.staff_read_at is null or coalesce(t.last_user_reply_at > t.staff_read_at, false)
      from public.tickets t
      left join genesis_chat.conversations c
        on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
     where t.tenant_id = resolved
       and t.user_id is distinct from me
       and (only_id is null or t.id = only_id)
       and case inbox_view
             when 'mine' then c.assignee_id = me and t.status not in ('addressed', 'wont_fix')
             when 'unassigned' then c.assignee_id is null and t.status not in ('addressed', 'wont_fix')
             else true
           end
       and (before_at is null
            or (greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at), t.id)
               < (before_at, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     order by greatest(t.created_at, t.last_user_reply_at, t.last_staff_reply_at) desc, t.id desc
     limit least(greatest(coalesce(max_rows, 50), 1), 200);
end;
$$;

comment on function public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid) is
  'A tenant''s tickets for its agents, with assignee and preview, latest activity first. Genesis support.';

create or replace function public.support_agent_ticket_counts(tenant uuid default null)
returns table (inbox_view text, tickets integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  resolved uuid := private.genesis_support_inbox_tenant(tenant);
begin
  return query
    select v.name, count(t.id)::integer
      from (values ('mine'), ('unassigned'), ('all')) as v(name)
      left join (public.tickets t
                 left join genesis_chat.conversations c
                   on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text)
        on t.tenant_id = resolved and t.user_id is distinct from me
       and case v.name
             when 'mine' then c.assignee_id = me and t.status not in ('addressed', 'wont_fix')
             when 'unassigned' then c.assignee_id is null and t.status not in ('addressed', 'wont_fix')
             else true
           end
     group by v.name;
end;
$$;

comment on function public.support_agent_ticket_counts(uuid) is
  'How many tickets a tenant''s agent has in the mine, unassigned and all views. Genesis support.';

revoke execute on function public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid) from public, anon;
grant execute on function public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid) to authenticated;
revoke execute on function public.support_agent_ticket_counts(uuid) from public, anon;
grant execute on function public.support_agent_ticket_counts(uuid) to authenticated;
