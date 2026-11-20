-- @feat:support-chat
-- Genesis support 0034: managing a desk's agents, threads on chat by setting, and the report's
-- requester labels from one hook (after 0015_genesis_support_agent_tools_bounds.sql,
-- 0022_genesis_support_staff_tools.sql and 0030_genesis_support_notifications.sql).
--
-- People and logins. ticket_agents holds a tenant's person record (the app's
-- private.genesis_viewer_people maps a login to its records); a login is its own person only where
-- the app has no records (zero config). Every function here speaks both: `person_id` is what
-- support_set_agent takes, `user_id` the login.
--
--   who manages agents   private.genesis_support_manages_agents(tenant, login): the tenant's
--                        admins, its admin agents (ticket_agents.role = 'admin') and, for the
--                        app's own desk, the app's staff. A null tenant is the app's own desk in
--                        every function. support_set_agent and the new support_can_manage_agents
--                        both ask it, so the screens show the admin exactly to whom the database
--                        allows it.
--   support_agents_list  now returns each agent's login, person record, `role` (admin for a tenant
--                        admin, or the app's staff at its own desk, whatever their row says; else
--                        their ticket_agents row's; else admin for someone who manages agents, else
--                        agent) and `removable` (true only for a ticket_agents row the caller may
--                        delete whose removal takes their access: never for an admin by hook).
--                        support.agentListScan is read through genesis-supabase's
--                        private.genesis_setting (0023), as support 0033 moves every reader there.
--   support_people_search(tenant, q, lim)
--                        a desk's agents (who may link an email ticket to its person; adding an
--                        agent still needs the rule above) find people in its tenant by name or
--                        email: the app's optional hook
--                        private.genesis_people_search(tenant uuid, q text, lim integer)
--                          returns table (person_id uuid, login uuid)
--                        searches its own people (with its own indexes); without it, the people
--                        support already knows at that desk: its agents, the app's staff and
--                        tenant admin lists, and the 500 most recent requesters. Either way the
--                        cost follows the desk, never the number of logins; every candidate must
--                        be one of the tenant's people (its record through genesis_viewer_people,
--                        or, at the app's own desk with no records, the login itself). Never an
--                        anonymous login; at most 25.
--   chat threads         support_chat_conversation, which clients ask to pick a thread, answers null
--                        while support.chatThreads is off (support_chat_threads_on), so threads
--                        stay on support_replies for every client.
--   requester labels     support_agent_report asks only the set-based hook 0015 added:
--                          private.genesis_support_requester_labels(reports uuid[])
--                            returns table (report_id uuid, label text)
--                        0014's one-ticket private.genesis_support_requester_label(report) is no
--                        longer called: the report raises a warning while it is the only one (it
--                        can be the set-based hook's body: `select r,
--                        private.genesis_support_requester_label(r) from unnest(reports) r`).
--                        Every open ticket is labelled, so the answer has no by_requester_capped.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0034_genesis_support_agent_admin.test.sql`).

create schema if not exists private;

-- People and who manages agents -------------------------------------------------------------------

-- A login's person record in a tenant, through the app's private.genesis_viewer_people (0004's
-- tenants_of); at the app's own desk, the login itself when the app has no record for it there.
-- Null when the login isn't one of the tenant's people.
create or replace function private.genesis_support_person_in(tenant uuid, login uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_person uuid;
begin
  if tenant is null or login is null then
    return null;
  end if;
  select v.person_id into found_person from private.genesis_support_tenants_of(login) v where v.tenant_id = tenant order by v.person_id limit 1;
  if found_person is null and tenant = private.genesis_support_default_tenant_id() then
    return login;
  end if;
  return found_person;
end;
$$;

revoke execute on function private.genesis_support_person_in(uuid, uuid) from public, anon, authenticated;

create or replace function private.genesis_support_manages_agents(tenant uuid, login uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or login is null then
    return false;
  end if;
  return private.genesis_support_tenant_admin(tenant, login)
      or exists (select 1 from public.ticket_agents a
                  join private.genesis_support_tenants_of(login) v
                    on v.tenant_id = a.tenant_id and v.person_id = a.person_id
                 where a.tenant_id = tenant and a.role = 'admin')
      or (tenant = private.genesis_support_default_tenant_id() and private.genesis_support_staff_hook(login));
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

-- 0004's support_set_agent: a null tenant is the app's own desk, and its rule is the function above.
-- `person` is the tenant's person record (a support_people_search or support_agents_list person_id),
-- or a login, which stands for its record in that tenant (through genesis_viewer_people) when it
-- has one there.
create or replace function public.support_set_agent(tenant uuid, person uuid, role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  record_id uuid;
begin
  if me is null or person is null or not private.genesis_support_manages_agents(resolved, me) then
    raise exception 'support_set_agent: not allowed' using errcode = '42501';
  end if;
  -- A login stands for its person record here.
  select v.person_id into record_id from private.genesis_support_tenants_of(person) v where v.tenant_id = resolved order by v.person_id limit 1;
  person := coalesce(record_id, person);
  if role is null then
    delete from public.ticket_agents a where a.tenant_id = resolved and a.person_id = person;
    return;
  end if;
  if role not in ('agent', 'admin') then
    raise exception 'support_set_agent: role is agent or admin' using errcode = '22023';
  end if;
  insert into public.ticket_agents (tenant_id, person_id, role, created_by)
  values (resolved, person, role, me)
  on conflict (tenant_id, person_id) do update set role = excluded.role;
end;
$$;

-- The desk's agents, with their role and whether the caller can remove them -----------------------

drop function if exists public.support_agents_list(uuid);
create function public.support_agents_list(tenant uuid default null)
returns table (user_id uuid, person_id uuid, full_name text, role text, removable boolean)
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
    with agent_rows as (
      -- Agent rows, by person record, with the login each belongs to.
      select private.genesis_support_person_login(a.person_id) as login, a.person_id as person, a.role as row_role
        from public.ticket_agents a where a.tenant_id = resolved
    ), logins as (
      -- Agents by login (the caller, the staff list, every login with the scan), with their record here.
      select l.login, private.genesis_support_person_in(resolved, l.login) as person, null::text as row_role
        from (select me as login
              union select unnest(listed)
              -- Every login, only when the app turns it on (support.agentListScan): slow on a big app.
              union select x.id from auth.users x where scan) l
       where l.login is not null and l.login not in (select r.login from agent_rows r where r.login is not null)
    )
    select n.login, n.person, private.genesis_support_person_name(n.login),
           case when n.hooked then 'admin'
                else coalesce(n.row_role, case when private.genesis_support_manages_agents(resolved, n.login) then 'admin' else 'agent' end) end,
           -- Removing a row takes nothing from someone the app's hooks make an admin here: not removable.
           manages and n.row_role is not null and not n.hooked
      from (select a.*,
                   private.genesis_support_tenant_admin(resolved, a.login)
                   or (resolved = private.genesis_support_default_tenant_id() and private.genesis_support_staff_hook(a.login)) as hooked
              from (select * from agent_rows union all select * from logins) a) n
      join auth.users u on u.id = n.login
     where (to_jsonb(u) ->> 'is_anonymous') is distinct from 'true'
       and private.genesis_support_agent(resolved, n.login)
     order by 3 nulls last, n.login
     limit 200;
end;
$$;

comment on function public.support_agents_list(uuid) is
  'The logins that handle a tenant''s tickets, with their person record there, a name, their role and whether the caller can remove them (null tenant: the app''s own). Only for the tenant''s agents. Genesis support.';

revoke execute on function public.support_agents_list(uuid) from public, anon;
grant execute on function public.support_agents_list(uuid) to authenticated;

-- People in a desk's tenant, for its agents --------------------------------------------------------

create or replace function public.support_people_search(tenant uuid, q text, lim integer default 10)
returns table (person_id uuid, user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  words text := btrim(coalesce(q, ''));
  cap integer := greatest(1, least(coalesce(lim, 10), 25));
  pattern text;
  candidates uuid[] := '{}';
  more uuid[];
begin
  -- One rule for search and linking: anyone who handles this desk's tickets (who may link an email
  -- ticket to its person with support_link_requester). At the app's own desk too: the candidates
  -- are the people that desk already handles (or the app's own search), never every login.
  -- Adding an agent (support_set_agent) is the narrower rule above.
  if not private.genesis_support_agent(resolved, auth.uid()) then
    raise exception 'support_people_search: only the desk''s agents' using errcode = '42501';
  end if;
  if char_length(words) < 2 or char_length(words) > 100 then
    raise exception 'support_people_search: search with 2 to 100 characters' using errcode = '22023';
  end if;
  pattern := '%' || replace(replace(replace(words, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if to_regprocedure('private.genesis_people_search(uuid,text,integer)') is not null then
    -- The app searches its own people; it answers for its matches, and the checks below still run.
    select coalesce(array_agg(distinct h.login), '{}') into candidates
      from (select x.login from private.genesis_people_search(resolved, words, 100) x where x.login is not null limit 100) h;
  else
    -- The people support knows at this desk.
    select coalesce(array_agg(distinct k.login), '{}') into candidates from (
      select private.genesis_support_person_login(a.person_id) as login from public.ticket_agents a where a.tenant_id = resolved
      union
      select r.user_id from (select t.user_id from public.tickets t
                              where t.tenant_id = resolved and t.user_id is not null
                              order by t.updated_at desc limit 500) r
    ) k where k.login is not null;
    if resolved = private.genesis_support_default_tenant_id() and to_regprocedure('private.genesis_support_staff_list()') is not null then
      begin
        execute 'select coalesce(array_agg(s), ''{}'') from private.genesis_support_staff_list() s where s is not null' into more;
        candidates := candidates || more;
      exception when others then
        raise warning 'support_people_search: private.genesis_support_staff_list() failed: %', sqlerrm;
      end;
    end if;
    if to_regprocedure('private.genesis_tenant_admin_list(uuid)') is not null then
      begin
        execute 'select coalesce(array_agg(s), ''{}'') from private.genesis_tenant_admin_list($1) s where s is not null' into more using resolved;
        candidates := candidates || more;
      exception when others then
        raise warning 'support_people_search: private.genesis_tenant_admin_list(tenant) failed: %', sqlerrm;
      end;
    end if;
  end if;
  return query
    select n.person, n.login, n.name, n.email
      from (
        select u.id as login, private.genesis_support_person_in(resolved, u.id) as person,
               private.genesis_support_person_name(u.id) as name, u.email::text as email
          from auth.users u
         where u.id = any (candidates)
           and (to_jsonb(u) ->> 'is_anonymous') is distinct from 'true'
      ) n
     where n.person is not null and (n.name ilike pattern or n.email ilike pattern)
     order by n.name nulls last, n.email, n.login
     limit cap;
end;
$$;

comment on function public.support_people_search(uuid, text, integer) is
  'People in a desk''s tenant whose name or email matches, with their person record there, for the desk''s agents (at most 25): the app''s private.genesis_people_search, else the people support knows at that desk. Genesis support.';

revoke execute on function public.support_people_search(uuid, text, integer) from public, anon;
grant execute on function public.support_people_search(uuid, text, integer) to authenticated;

-- support.chatThreads: threads on genesis-chat, decided on the server ----------------------------

-- support.chatThreads, through genesis-supabase's one resolver (0023); without it, or before the
-- manifest is synced, on. Readable by anyone signed in: it says only whether threads run on chat.
create or replace function public.support_chat_threads_on()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('private.genesis_setting(text,uuid)') is null then
    return true;
  end if;
  return private.genesis_setting('support.chatThreads') is distinct from 'false'::jsonb;
end;
$$;

comment on function public.support_chat_threads_on() is
  'Whether support threads run on genesis-chat (the support.chatThreads setting). Genesis support.';

revoke execute on function public.support_chat_threads_on() from public, anon;
grant execute on function public.support_chat_threads_on() to authenticated, service_role;

-- 0005's conversation lookup, which clients ask to pick the thread: null while support.chatThreads
-- is off, so every client stays on support_replies (which the block keeps mirrored) whatever it
-- was given.
create or replace function public.support_chat_conversation(report uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id from genesis_chat.conversations c
   where public.support_chat_threads_on()
     and c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = report::text
$$;

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
  elsif to_regprocedure('private.genesis_support_requester_label(uuid)') is not null then
    raise warning 'support_agent_report: private.genesis_support_requester_label(report) is no longer called; define private.genesis_support_requester_labels(reports uuid[]) (it can wrap the one-ticket hook)';
  end if;
  return result || jsonb_build_object('by_requester', groups);
end;
$$;

comment on function public.support_agent_report(uuid, timestamptz, timestamptz) is
  'A tenant''s help desk over a date range, for its agents: opened, closed, median first response and time to close, open now, and open by requester (the app''s private.genesis_support_requester_labels hook). Genesis support.';

revoke execute on function public.support_agent_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.support_agent_report(uuid, timestamptz, timestamptz) to authenticated;

