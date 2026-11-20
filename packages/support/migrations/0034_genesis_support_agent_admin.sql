-- @feat:support-chat
-- Genesis support 0034: managing a desk's agents, and the report's requester labels from one hook
-- (after 0015_genesis_support_agent_tools_bounds.sql and 0022_genesis_support_staff_tools.sql).
--
--   who manages agents   private.genesis_support_manages_agents(tenant, person): the tenant's
--                        admins, its admin agents (ticket_agents.role = 'admin') and, for the
--                        app's own desk, the app's staff. support_set_agent, the new
--                        support_can_manage_agents(tenant) (null: the app's own desk) and
--                        support_people_search all ask it, so the screens show the admin exactly
--                        to whom the database allows it.
--   support_agents_list  now also returns each login's `role` (its ticket_agents row's, else admin
--                        for someone who manages agents, else agent) and `removable` (true only
--                        for a ticket_agents row the caller may delete). support.agentListScan is
--                        read through genesis-supabase's private.genesis_setting (0023), as support
--                        0033 moves every reader there and drops 0020's.
--   support_people_search(tenant, q, lim)
--                        whoever manages a desk's agents finds the people in its tenant by name or
--                        email, to add an agent or link an email requester: the people the app's
--                        private.genesis_tenant_member(tenant, person) names, else its
--                        private.genesis_viewer_people; every login for the app's own desk. Never
--                        an anonymous login; at most 25.
--   requester labels     support_agent_report asks only the set-based hook 0015 added:
--                          private.genesis_support_requester_labels(reports uuid[])
--                            returns table (report_id uuid, label text)
--                        0014's one-ticket private.genesis_support_requester_label(report) is no
--                        longer called (it can be the set-based hook's body: `select r,
--                        private.genesis_support_requester_label(r) from unnest(reports) r`), and
--                        every open ticket is labelled, so the answer no longer has
--                        by_requester_capped.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0034_genesis_support_agent_admin.test.sql`).

create schema if not exists private;

-- Who manages a desk's agents -------------------------------------------------------------------

create or replace function private.genesis_support_manages_agents(tenant uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or person is null then
    return false;
  end if;
  return private.genesis_support_tenant_admin(tenant, person)
      or exists (select 1 from public.ticket_agents a
                  join private.genesis_support_tenants_of(person) v
                    on v.tenant_id = a.tenant_id and v.person_id = a.person_id
                 where a.tenant_id = tenant and a.role = 'admin')
      or (tenant = private.genesis_support_default_tenant_id() and private.genesis_support_staff_hook(person));
end;
$$;

revoke execute on function private.genesis_support_manages_agents(uuid, uuid) from public, anon, authenticated;

create or replace function public.support_can_manage_agents(tenant uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_support_manages_agents(coalesce(tenant, private.genesis_support_default_tenant_id()), auth.uid())
$$;

comment on function public.support_can_manage_agents(uuid) is
  'Whether the signed-in person may add or remove the desk''s agents (null: the app''s own desk), as support_set_agent decides. Genesis support.';

revoke execute on function public.support_can_manage_agents(uuid) from public, anon;
grant execute on function public.support_can_manage_agents(uuid) to authenticated;

-- 0004's support_set_agent, with its rule from the one function above.
create or replace function public.support_set_agent(tenant uuid, person uuid, role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or tenant is null or person is null or not private.genesis_support_manages_agents(tenant, me) then
    raise exception 'support_set_agent: not allowed' using errcode = '42501';
  end if;
  if role is null then
    delete from public.ticket_agents a where a.tenant_id = tenant and a.person_id = person;
    return;
  end if;
  if role not in ('agent', 'admin') then
    raise exception 'support_set_agent: role is agent or admin' using errcode = '22023';
  end if;
  insert into public.ticket_agents (tenant_id, person_id, role, created_by)
  values (tenant, person, role, me)
  on conflict (tenant_id, person_id) do update set role = excluded.role;
end;
$$;

-- The desk's agents, with their role and whether the caller can remove them -----------------------

drop function if exists public.support_agents_list(uuid);
create function public.support_agents_list(tenant uuid default null)
returns table (user_id uuid, full_name text, role text, removable boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  me uuid := auth.uid();
  scan boolean := false;
  listed uuid[] := '{}';
  manages boolean;
begin
  if not private.genesis_support_agent(resolved, me) then
    raise exception 'support_agents_list: only the tenant''s agents' using errcode = '42501';
  end if;
  manages := private.genesis_support_manages_agents(resolved, me);
  if to_regprocedure('private.genesis_setting(text,uuid)') is not null then
    scan := coalesce(private.genesis_setting('support.agentListScan') = 'true'::jsonb, false);
  end if;
  -- The app's list of staff logins, when it has one.
  if to_regprocedure('private.genesis_support_staff_list()') is not null then
    begin
      execute 'select coalesce(array_agg(s), ''{}'') from private.genesis_support_staff_list() s where s is not null' into listed;
    exception when others then
      raise warning 'support_agents_list: private.genesis_support_staff_list() failed: %', sqlerrm;
    end;
  end if;
  return query
    select n.id, n.name,
           coalesce(n.row_role, case when private.genesis_support_manages_agents(resolved, n.id) then 'admin' else 'agent' end),
           manages and n.row_role is not null
      from (
        select u.id, private.genesis_support_person_name(u.id) as name,
               (select a.role from public.ticket_agents a where a.tenant_id = resolved and a.person_id = u.id) as row_role
          from auth.users u
         where u.id in (
                 select me
                 union select a.person_id from public.ticket_agents a where a.tenant_id = resolved
                 union select unnest(listed)
                 -- Every login, only when the app turns it on (support.agentListScan): slow on a big app.
                 union select x.id from auth.users x where scan
               )
           and (to_jsonb(u) ->> 'is_anonymous') is distinct from 'true'
           and private.genesis_support_agent(resolved, u.id)
      ) n
     order by n.name nulls last, n.id
     limit 200;
end;
$$;

comment on function public.support_agents_list(uuid) is
  'The logins that handle a tenant''s tickets, with a name, their role and whether the caller can remove them (null tenant: the app''s own). Only for the tenant''s agents. Genesis support.';

revoke execute on function public.support_agents_list(uuid) from public, anon;
grant execute on function public.support_agents_list(uuid) to authenticated;

-- People in a desk's tenant, for whoever manages its agents ---------------------------------------

-- Is this login one of the tenant's people? The app's private.genesis_tenant_member(tenant, person)
-- when it has one, else its private.genesis_viewer_people (0004's tenants_of).
create or replace function private.genesis_support_tenant_member(tenant uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('private.genesis_tenant_member(uuid,uuid)') is not null then
    return coalesce(private.genesis_tenant_member(tenant, person), false);
  end if;
  return exists (select 1 from private.genesis_support_tenants_of(person) v where v.tenant_id = tenant);
end;
$$;

revoke execute on function private.genesis_support_tenant_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.support_people_search(tenant uuid, q text, lim integer default 10)
returns table (user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  own_desk boolean := resolved = private.genesis_support_default_tenant_id();
  words text := btrim(coalesce(q, ''));
  pattern text;
begin
  if not private.genesis_support_manages_agents(resolved, auth.uid()) then
    raise exception 'support_people_search: only whoever manages the desk''s agents' using errcode = '42501';
  end if;
  if char_length(words) < 2 or char_length(words) > 100 then
    raise exception 'support_people_search: search with 2 to 100 characters' using errcode = '22023';
  end if;
  pattern := '%' || replace(replace(replace(words, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select n.id, n.name, n.email
      from (
        select u.id, private.genesis_support_person_name(u.id) as name, u.email::text as email
          from auth.users u
         where (to_jsonb(u) ->> 'is_anonymous') is distinct from 'true'
           and (own_desk or private.genesis_support_tenant_member(resolved, u.id))
      ) n
     where n.name ilike pattern or n.email ilike pattern
     order by n.name nulls last, n.email, n.id
     limit greatest(1, least(coalesce(lim, 10), 25));
end;
$$;

comment on function public.support_people_search(uuid, text, integer) is
  'People in a desk''s tenant whose name or email matches, for whoever manages its agents (at most 25). Genesis support.';

revoke execute on function public.support_people_search(uuid, text, integer) from public, anon;
grant execute on function public.support_people_search(uuid, text, integer) to authenticated;

-- The report's requester labels -------------------------------------------------------------------

create or replace function public.support_agent_report(tenant uuid default null, from_at timestamptz default null, to_at timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := private.genesis_support_inbox_tenant(tenant);
  hi timestamptz := coalesce(to_at, now());
  lo timestamptz := coalesce(from_at, coalesce(to_at, now()) - interval '30 days');
  result jsonb;
  groups jsonb := '[]'::jsonb;
  open_ids uuid[];
begin
  if hi <= lo or hi - lo > interval '366 days' then
    raise exception 'support_agent_report: from_at comes before to_at, at most 366 days apart' using errcode = '22023';
  end if;
  select jsonb_build_object(
           'from_at', lo,
           'to_at', hi,
           'opened', (select count(*)::integer from public.tickets t
                       where t.tenant_id = resolved and t.created_at >= lo and t.created_at < hi),
           'closed', (select count(*)::integer from public.tickets t
                       where t.tenant_id = resolved and t.status in ('addressed', 'wont_fix')
                         and t.resolved_at >= lo and t.resolved_at < hi),
           'open_now', (select count(*)::integer from public.tickets t
                         where t.tenant_id = resolved and t.status not in ('addressed', 'wont_fix')),
           'median_first_response_seconds',
             (select percentile_cont(0.5) within group (order by extract(epoch from (f.first_at - t.created_at)))
                from public.tickets t
                cross join lateral (
                  select min(m.created_at) as first_at
                    from genesis_chat.conversations c
                    join genesis_chat.messages m on m.conversation_id = c.id
                   where c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
                     and m.sender_role = 'observer' and m.visibility = 'everyone' and m.kind = 'text'
                     and m.deleted_at is null) f
               where t.tenant_id = resolved and t.created_at >= lo and t.created_at < hi and f.first_at is not null),
           'median_close_seconds',
             (select percentile_cont(0.5) within group (order by extract(epoch from (t.resolved_at - t.created_at)))
                from public.tickets t
               where t.tenant_id = resolved and t.status in ('addressed', 'wont_fix')
                 and t.resolved_at >= lo and t.resolved_at < hi)
         )
    into result;
  if to_regprocedure('private.genesis_support_requester_labels(uuid[])') is not null then
    -- One call for every open ticket.
    select coalesce(array_agg(t.id), '{}') into open_ids
      from public.tickets t
     where t.tenant_id = resolved and t.status not in ('addressed', 'wont_fix');
    select coalesce(jsonb_agg(jsonb_build_object('label', g.label, 'open', g.n) order by g.n desc, g.label), '[]'::jsonb)
      into groups
      from (select nullif(btrim(l.label), '') as label, count(*)::integer as n
              from unnest(open_ids) as o(id)
              left join (select distinct on (x.report_id) x.report_id, x.label
                           from private.genesis_support_requester_labels(open_ids) x
                          order by x.report_id) l on l.report_id = o.id
             group by 1) g;
  end if;
  return result || jsonb_build_object('by_requester', groups);
end;
$$;

comment on function public.support_agent_report(uuid, timestamptz, timestamptz) is
  'A tenant''s help desk over a date range, for its agents: opened, closed, median first response and time to close, open now, and open by requester (the app''s private.genesis_support_requester_labels hook). Genesis support.';

revoke execute on function public.support_agent_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.support_agent_report(uuid, timestamptz, timestamptz) to authenticated;

