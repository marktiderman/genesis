-- @feat:support-chat
-- Genesis support 0013: pending tickets, active queues and a requester's earlier conversations
-- (after 0009_genesis_support_inbox.sql).
--
--   1. A ticket can be `pending`: an agent is waiting on the requester. It sits beside the other
--      statuses (open, submitted, in_progress, addressed, wont_fix keep their meaning), counts as
--      neither active nor closed, and goes back to `open` by itself when the requester writes
--      (their message in the conversation, a reply, an email). On the conversation it is chat's
--      `pending`, as in_progress already is; a ticket that is pending stays so when chat says
--      pending. Chat has one pending for both, so a pending set on the conversation (genesis_chat.set_status)
--      makes an active ticket in_progress, as before; set a ticket pending on the ticket (support_set_report_status).
--      Moving from closed to pending clears resolved_at, as reopening does.
--   2. The agent queues. Active means not pending and not closed (addressed, wont_fix).
--      public.support_agent_tickets takes two more views: `pending` (every pending ticket) and
--      `closed`. `mine` and `unassigned` now hold active tickets only (a pending one is in
--      `pending`); `all` still lists every ticket. Each row says since when the requester has
--      waited for an answer (`waiting_since`: the first of their messages after the last reply
--      everyone sees, or when the ticket came in if nobody has answered; null when pending,
--      closed, or answered). public.support_agent_ticket_counts counts active tickets only in
--      mine, unassigned and all (the same three rows as before).
--   3. public.support_agent_requester_tickets(report, max_rows): the same requester's other
--      tickets in the ticket's tenant, newest first, for an agent's details panel. Only an
--      agent of that tenant may ask (42501 otherwise, the same for a ticket that isn't there);
--      an agent's own tickets never show. An email ticket with no login matches on its address.
--
-- Numbered 0013: 0011 and 0012 are reserved by another change in flight.
--
-- support_agent_tickets gains a column, so it is dropped and made again (two signatures would leave
-- PostgREST unable to choose); its grants are made again below.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0013_genesis_support_queues.test.sql`).

create schema if not exists private;

-- 1. Pending ------------------------------------------------------------------------------

alter table public.tickets drop constraint if exists support_reports_status;
alter table public.tickets add constraint support_reports_status
  check (status in ('open', 'submitted', 'in_progress', 'pending', 'addressed', 'wont_fix'));

comment on column public.tickets.status is
  'open, submitted, in_progress (active), pending (waiting on the requester), addressed or wont_fix (closed). Genesis support.';

-- A ticket's status as a conversation status: pending is chat's pending, as in_progress is.
create or replace function private.genesis_support_chat_status(report_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case report_status
           when 'open' then 'open'
           when 'submitted' then 'open'
           when 'in_progress' then 'pending'
           when 'pending' then 'pending'
           when 'addressed' then 'solved'
           when 'wont_fix' then 'closed'
         end
$$;

-- Addressed or wont_fix: stamped, and not yet verified. Back to any other status: cleared.
create or replace function private.genesis_support_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('addressed', 'wont_fix') and old.status is distinct from new.status then
    new.resolved_at := now();
    new.verified_at := null;
  elsif old.status in ('addressed', 'wont_fix') and new.status in ('open', 'submitted', 'in_progress', 'pending') then
    new.resolved_at := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

-- The requester wrote: a pending ticket is active again.
create or replace function private.genesis_support_pending_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets set status = 'open' where id = new.id and status = 'pending';
  return null;
end;
$$;

drop trigger if exists genesis_support_pending_answered on public.tickets;
create trigger genesis_support_pending_answered
  after update of last_user_reply_at on public.tickets
  for each row when (new.status = 'pending' and new.last_user_reply_at is not null
                     and new.last_user_reply_at is distinct from old.last_user_reply_at)
  execute function private.genesis_support_pending_answered();

revoke execute on function private.genesis_support_chat_status(text) from public, anon, authenticated;
revoke execute on function private.genesis_support_resolution() from public, anon, authenticated;
revoke execute on function private.genesis_support_pending_answered() from public, anon, authenticated;

-- 2. The queues --------------------------------------------------------------------------

drop function if exists public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid);

create function public.support_agent_tickets(
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
  if inbox_view is null or inbox_view not in ('mine', 'unassigned', 'all', 'pending', 'closed') then
    raise exception 'support_agent_tickets: inbox_view is mine, unassigned, all, pending or closed' using errcode = '22023';
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
           t.staff_read_at is null or coalesce(t.last_user_reply_at > t.staff_read_at, false),
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
       and (only_id is null or t.id = only_id)
       and case inbox_view
             when 'mine' then c.assignee_id = me and t.status not in ('pending', 'addressed', 'wont_fix')
             when 'unassigned' then c.assignee_id is null and t.status not in ('pending', 'addressed', 'wont_fix')
             when 'pending' then t.status = 'pending'
             when 'closed' then t.status in ('addressed', 'wont_fix')
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
  'A tenant''s tickets for its agents, with assignee, preview and how long the requester has waited, latest activity first. Genesis support.';

-- Active tickets only: the same three rows as 0009, so a badge is what needs an answer.
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
       and t.status not in ('pending', 'addressed', 'wont_fix')
       and case v.name
             when 'mine' then c.assignee_id = me
             when 'unassigned' then c.assignee_id is null
             else true
           end
     group by v.name;
end;
$$;

comment on function public.support_agent_ticket_counts(uuid) is
  'How many active tickets (not pending, not closed) a tenant''s agent has in the mine, unassigned and all views. Genesis support.';

revoke execute on function public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid) from public, anon;
grant execute on function public.support_agent_tickets(uuid, text, timestamptz, uuid, integer, uuid) to authenticated;
revoke execute on function public.support_agent_ticket_counts(uuid) from public, anon;
grant execute on function public.support_agent_ticket_counts(uuid) to authenticated;

-- 3. A requester's earlier conversations ---------------------------------------------------

create index if not exists tickets_tenant_requester_idx on public.tickets (tenant_id, user_id, created_at desc);

create or replace function public.support_agent_requester_tickets(report uuid, max_rows integer default 20)
returns table (
  id uuid,
  title text,
  message text,
  status text,
  created_at timestamptz,
  activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  this public.tickets;
  email text;
begin
  select * into this from public.tickets x where x.id = report;
  if me is null or this.id is null or this.user_id is not distinct from me
     or not private.genesis_support_agent(this.tenant_id, me) then
    raise exception 'support_agent_requester_tickets: only an agent of this ticket''s tenant' using errcode = '42501';
  end if;
  email := lower(nullif(btrim(to_jsonb(this) ->> 'requester_email'), ''));
  return query
    select o.id, o.title, o.message, o.status, o.created_at, greatest(o.created_at, o.last_user_reply_at, o.last_staff_reply_at)
      from public.tickets o
     where o.tenant_id = this.tenant_id
       and o.id <> this.id
       and o.user_id is distinct from me
       and ((this.user_id is not null and o.user_id = this.user_id)
            or (this.user_id is null and email is not null and o.user_id is null
                and lower(to_jsonb(o) ->> 'requester_email') = email))
     order by o.created_at desc, o.id desc
     limit least(greatest(coalesce(max_rows, 20), 1), 100);
end;
$$;

comment on function public.support_agent_requester_tickets(uuid, integer) is
  'The same requester''s other tickets in a ticket''s tenant, newest first, for its agents. Genesis support.';

revoke execute on function public.support_agent_requester_tickets(uuid, integer) from public, anon;
grant execute on function public.support_agent_requester_tickets(uuid, integer) to authenticated;
