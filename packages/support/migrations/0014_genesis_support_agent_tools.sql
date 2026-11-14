-- @feat:support-chat
-- Genesis support 0014: the agent's tools: @mentions in internal notes, saved replies and
-- reports (after 0013_genesis_support_queues.sql).
--
--   1. Mentions. An internal note (a message only observers see) that names another agent as
--      `@[Name](user:<uuid>)`, genesis-chat's mention format, mentions them: a row in
--      public.ticket_mentions, which the mentioned agent reads, and a call to the app's optional
--      hook, which is how they're told (a push, an email, the app's own bell):
--
--        private.genesis_support_agent_mentioned(report uuid, agent uuid, author uuid, message uuid)
--          returns void                                                             (optional)
--
--      Only a handler of the ticket is mentioned (an agent of its tenant, or whom the app's report
--      hook names), never the note's author, at most 20 people a note. A hook that fails is
--      reported as a warning and the note still goes: a mention never costs the words.
--   2. Saved replies. public.support_saved_replies holds a tenant's replies (a title and the words;
--      `{first_name}`-style variables are the client's to fill). Its agents list them
--      (support_saved_replies), save one (support_save_reply: no id makes a new one) and delete
--      one (support_delete_saved_reply). Nobody reads the table directly. A title is unique in its
--      tenant (23505).
--   3. Reports. public.support_agent_report(tenant, from_at, to_at) returns, for one tenant's
--      agents, over [from_at, to_at) (default the last 30 days, at most 366 days): tickets opened,
--      tickets closed, the median first response (the first reply everyone sees, after a ticket
--      opened in the range) and the median time to close (tickets closed in the range), in
--      seconds, null with nothing to measure; how many are open now (active and pending); and,
--      when the app defines the optional hook below, the open ones by the requester's
--      organization, most first. Without the hook that list is empty.
--
--        private.genesis_support_requester_label(report uuid) returns text         (optional)
--          Whom the ticket's requester is with (their company, their workspace), or null.
--
-- Every function refuses (42501) anyone who isn't an agent of the tenant; a null tenant is the
-- app's own.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0014_genesis_support_agent_tools.test.sql`).

create schema if not exists private;

-- 1. Mentions ----------------------------------------------------------------------------

create table if not exists public.ticket_mentions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.tickets (id) on delete cascade,
  message_id uuid not null references genesis_chat.messages (id) on delete cascade,
  agent_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (message_id, agent_id)
);

create index if not exists ticket_mentions_agent_idx on public.ticket_mentions (agent_id, created_at desc);
create index if not exists ticket_mentions_report_idx on public.ticket_mentions (report_id);

comment on table public.ticket_mentions is
  'An agent named in a ticket''s internal note. Written only by the database; the mentioned agent reads their own. Genesis support.';

alter table public.ticket_mentions enable row level security;

drop policy if exists ticket_mentions_own on public.ticket_mentions;
create policy ticket_mentions_own on public.ticket_mentions
  for select to authenticated
  using (agent_id = (select auth.uid()));

revoke all on public.ticket_mentions from public, anon, authenticated;
grant select on public.ticket_mentions to authenticated;
grant select, insert, update, delete on public.ticket_mentions to service_role;

create or replace function private.genesis_support_note_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  agent uuid;
  hook boolean := to_regprocedure('private.genesis_support_agent_mentioned(uuid,uuid,uuid,uuid)') is not null;
begin
  if new.visibility <> 'observers' or new.deleted_at is not null or position('@[' in coalesce(new.body, '')) = 0 then
    return null;
  end if;
  rid := private.genesis_support_chat_report_of(new.conversation_id);
  if rid is null then
    return null;
  end if;
  for agent in
    select distinct lower(m[1])::uuid
      from regexp_matches(new.body, '@\[[^\]\n]{1,80}\]\(user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)', 'g') as m
     limit 20
  loop
    continue when agent is not distinct from new.sender_id or not private.genesis_support_handler(rid, agent);
    insert into public.ticket_mentions (report_id, message_id, agent_id, author_id)
    values (rid, new.id, agent, new.sender_id)
    on conflict (message_id, agent_id) do nothing;
    if found and hook then
      begin
        perform private.genesis_support_agent_mentioned(rid, agent, new.sender_id, new.id);
      exception when others then
        raise warning 'genesis-support: the app''s mention hook failed: %', sqlerrm;
      end;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists genesis_support_note_mentions on genesis_chat.messages;
create trigger genesis_support_note_mentions
  after insert on genesis_chat.messages
  for each row when (new.visibility = 'observers')
  execute function private.genesis_support_note_mentions();

revoke execute on function private.genesis_support_note_mentions() from public, anon, authenticated;

-- 2. Saved replies ------------------------------------------------------------------------

create table if not exists public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null constraint support_saved_replies_title check (char_length(btrim(title)) between 1 and 120),
  body text not null constraint support_saved_replies_body check (char_length(btrim(body)) between 1 and 10000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_saved_replies_tenant_title on public.support_saved_replies (tenant_id, lower(title));

comment on table public.support_saved_replies is
  'A tenant''s saved replies, which its agents insert into an answer. Read and written only through the support_*saved* functions. Genesis support.';

alter table public.support_saved_replies enable row level security;
revoke all on public.support_saved_replies from public, anon, authenticated;
grant select, insert, update, delete on public.support_saved_replies to service_role;

create or replace function public.support_saved_replies(tenant uuid default null)
returns table (id uuid, title text, body text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := private.genesis_support_inbox_tenant(tenant);
begin
  return query
    select s.id, s.title, s.body, s.updated_at
      from public.support_saved_replies s
     where s.tenant_id = resolved
     order by lower(s.title), s.id;
end;
$$;

create or replace function public.support_save_reply(saved uuid default null, tenant uuid default null, title text default null, body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  words text := btrim(coalesce(body, ''));
  heading text := btrim(coalesce(title, ''));
  out_id uuid;
begin
  if saved is null then
    owner := private.genesis_support_inbox_tenant(tenant);
  else
    select s.tenant_id into owner from public.support_saved_replies s where s.id = saved;
    if owner is null or not private.genesis_support_agent(owner, me) then
      raise exception 'support_save_reply: only an agent of this tenant' using errcode = '42501';
    end if;
  end if;
  if heading = '' or char_length(heading) > 120 or words = '' or char_length(words) > 10000 then
    raise exception 'support_save_reply: a title (at most 120 characters) and words (at most 10000)' using errcode = '22023';
  end if;
  if saved is null then
    insert into public.support_saved_replies (tenant_id, title, body, created_by)
    values (owner, heading, words, me)
    returning id into out_id;
  else
    update public.support_saved_replies s
       set title = heading, body = words, updated_at = now()
     where s.id = saved
    returning s.id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.support_delete_saved_reply(saved uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select s.tenant_id into owner from public.support_saved_replies s where s.id = saved;
  if owner is null or not private.genesis_support_agent(owner, auth.uid()) then
    raise exception 'support_delete_saved_reply: only an agent of this tenant' using errcode = '42501';
  end if;
  delete from public.support_saved_replies s where s.id = saved;
end;
$$;

comment on function public.support_saved_replies(uuid) is
  'A tenant''s saved replies, by title, for its agents. Genesis support.';
comment on function public.support_save_reply(uuid, uuid, text, text) is
  'An agent saves a reply of their tenant (no id makes a new one); returns its id. Genesis support.';
comment on function public.support_delete_saved_reply(uuid) is
  'An agent deletes a saved reply of their tenant. Genesis support.';

revoke execute on function public.support_saved_replies(uuid) from public, anon;
grant execute on function public.support_saved_replies(uuid) to authenticated;
revoke execute on function public.support_save_reply(uuid, uuid, text, text) from public, anon;
grant execute on function public.support_save_reply(uuid, uuid, text, text) to authenticated;
revoke execute on function public.support_delete_saved_reply(uuid) from public, anon;
grant execute on function public.support_delete_saved_reply(uuid) to authenticated;

-- 3. Reports ----------------------------------------------------------------------------

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
  if to_regprocedure('private.genesis_support_requester_label(uuid)') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('label', g.label, 'open', g.n) order by g.n desc, g.label), '[]'::jsonb)
      into groups
      from (select nullif(btrim(private.genesis_support_requester_label(t.id)), '') as label, count(*)::integer as n
              from public.tickets t
             where t.tenant_id = resolved and t.status not in ('addressed', 'wont_fix')
             group by 1) g;
  end if;
  return result || jsonb_build_object('by_requester', groups);
end;
$$;

comment on function public.support_agent_report(uuid, timestamptz, timestamptz) is
  'A tenant''s help desk over a date range, for its agents: opened, closed, median first response and time to close, open now, and open by requester. Genesis support.';

revoke execute on function public.support_agent_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.support_agent_report(uuid, timestamptz, timestamptz) to authenticated;
