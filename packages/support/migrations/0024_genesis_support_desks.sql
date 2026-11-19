-- @feat:support-desks
-- Genesis support 0024: desks, each tenant's own help desk (after 0004_genesis_support_tickets.sql
-- and 0022_genesis_support_staff_tools.sql; 0005 and 0006, the support-chat block, are optional).
--
-- 0004 gave every ticket a tenant and every tenant its agents, and let a business take tickets
-- once `support-helpdesk` is enabled for it in genesis-supabase 0004's tenant_features. This file
-- makes that a desk a tenant runs, and lets a ticket move between desks:
--
--   the switch      public.support_desks: a tenant's help desk on or off, set by its tenant admins
--                   with support_set_desk, every change kept in public.support_desk_log (who, when,
--                   why). A desk row decides; without one, tenant_features does, as before. The
--                   app's own tenant (the default) is always on. With the `support.desks` setting
--                   off (genesis-config; the `standard` and `min` presets), it is 0004 exactly:
--                   tenant_features alone decides, nobody switches a desk, nothing is routed and
--                   no ticket moves.
--   routing         A question sent to no tenant in particular (the messenger with no tenant) by
--                   someone who belongs to exactly one tenant whose desk is on, and who handles no
--                   desk themselves, goes to that tenant's desk. Anything else goes where it went
--                   before (the tenant sent, else the app's own). The app may decide instead with
--                   its hook private.genesis_support_desk_for(person uuid, ticket_type text)
--                   returns uuid (null: the rule above). 0004's tenant check still runs after it.
--   moving          support_escalate_ticket (to the app's own desk), support_return_ticket (back
--                   to the desk that last escalated it) and support_move_ticket (to any desk the
--                   requester belongs to whose desk is on). Only a handler of the ticket moves it.
--                   The same ticket and thread: its person keeps seeing it, the other desk now
--                   handles it (and reads the thread, internal notes included), nobody has it until
--                   someone takes it, it shows unread there, and a pending one opens again (waiting
--                   on the person at one desk is nothing the next desk has done). 0004's "a ticket
--                   keeps its tenant" lets only these move one, each for its own ticket.
--   requesters      0022's support_requester_tenants gains each tenant's `role` for the person
--                   (the app's private.genesis_tenant_role hook, else admin, agent or member).
--   the inbox       support_my_desks (the desks the signed-in login works, for a desk picker),
--                   support_ticket_desk (where a ticket is, whether it can go up or back, its last
--                   move) and support_desk_move_targets (where it can be moved).
--
-- Desks' names come from 0022's private.genesis_tenant_label hook; the app's own desk has none
-- (the client names it). Notifying a desk's agents of a moved ticket is 0025's.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0024_genesis_support_desks.test.sql`).

create schema if not exists private;

-- Settings, by preset ------------------------------------------------------------------------------

-- A boolean setting: genesis-config's value (0020's reader: locked in the file > the database >
-- the file), else the preset's default (the manifest's preset, `max` without one). Without
-- genesis-supabase's settings, the `max` default.
create or replace function private.genesis_support_setting_on(setting_key text, on_max boolean, on_standard boolean, on_min boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw jsonb;
  preset text;
begin
  if to_regprocedure('private.genesis_support_setting(text)') is not null then
    raw := private.genesis_support_setting(setting_key);
    if jsonb_typeof(raw) = 'boolean' then
      return raw::text::boolean;
    end if;
  end if;
  if to_regclass('public.genesis_app_manifest') is not null then
    begin
      execute 'select m.preset from public.genesis_app_manifest m limit 1' into preset;
    exception when others then
      preset := null;
    end;
  end if;
  return case coalesce(preset, 'max') when 'standard' then on_standard when 'min' then on_min else on_max end;
end;
$$;

revoke execute on function private.genesis_support_setting_on(text, boolean, boolean, boolean) from public, anon, authenticated;

-- support.desks: max on, standard and min off.
create or replace function private.genesis_support_desks_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_support_setting_on('support.desks', true, false, false)
$$;

revoke execute on function private.genesis_support_desks_on() from public, anon, authenticated;

-- The switch --------------------------------------------------------------------------------------

create table public.support_desks (
  tenant_id uuid primary key,
  enabled boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.support_desks is
  'A tenant''s own help desk, on or off. No row: genesis-supabase''s tenant_features decides. Written only by support_set_desk. Genesis support.';

alter table public.support_desks enable row level security;

-- What happened at a desk: switched on or off, or a ticket moved. `tenant_id` is the desk a switch
-- is about, or the desk a ticket left; `to_tenant` where it went.
create table public.support_desk_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  ticket_id uuid references public.tickets (id) on delete cascade,
  to_tenant uuid,
  action text not null
    constraint support_desk_log_action check (action in ('turned_on', 'turned_off', 'escalated', 'returned', 'moved')),
  reason text
    constraint support_desk_log_reason check (reason is null or char_length(reason) <= 1000),
  actor uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  constraint support_desk_log_shape check (
    (action in ('turned_on', 'turned_off') and ticket_id is null and to_tenant is null)
    or (action in ('escalated', 'returned', 'moved') and ticket_id is not null and to_tenant is not null))
);

comment on table public.support_desk_log is
  'Every change at a help desk: switched on or off, and each ticket escalated, returned or moved. Written only by the desk functions. Genesis support.';

create index support_desk_log_tenant_idx on public.support_desk_log (tenant_id, at desc);
create index support_desk_log_ticket_idx on public.support_desk_log (ticket_id, at desc) where ticket_id is not null;

alter table public.support_desk_log enable row level security;

-- Both are read through the functions below: no policies, no grants.
revoke all on public.support_desks, public.support_desk_log from anon, authenticated;

-- Is this tenant's help desk on? The app's own always. A desk row decides (while support.desks is
-- on); without one, or with the setting off, an enabled `support-helpdesk` row in tenant_features
-- (0004's rule).
create or replace function private.genesis_support_helpdesk_on(tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  switched boolean;
begin
  if tenant is null then
    return false;
  end if;
  if tenant = private.genesis_support_default_tenant_id() then
    return true;
  end if;
  if private.genesis_support_desks_on() then
    select d.enabled into switched from public.support_desks d where d.tenant_id = tenant;
  end if;
  if switched is not null then
    return switched;
  end if;
  if to_regclass('public.tenant_features') is null then
    return false;
  end if;
  return exists (select 1 from public.tenant_features f
                  where f.tenant_id = tenant and f.feature_id = 'support-helpdesk' and f.enabled);
end;
$$;

revoke execute on function private.genesis_support_helpdesk_on(uuid) from public, anon, authenticated;

-- A tenant's admins turn its desk on or off. Never the app's own (always on).
create or replace function public.support_set_desk(tenant uuid, enabled boolean, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text := nullif(btrim(coalesce(reason, '')), '');
  was boolean;
begin
  if me is null or tenant is null or enabled is null
     or not private.genesis_support_tenant_admin(tenant, me) then
    raise exception 'support_set_desk: only the tenant''s admins' using errcode = '42501';
  end if;
  if tenant = private.genesis_support_default_tenant_id() then
    raise exception 'support_set_desk: the app''s own desk is always on' using errcode = '22023';
  end if;
  if not private.genesis_support_desks_on() then
    raise exception 'support_set_desk: desks are off in this app (support.desks)' using errcode = '55000';
  end if;
  if char_length(why) > 1000 then
    raise exception 'support_set_desk: say why in at most 1000 characters' using errcode = '22023';
  end if;
  was := private.genesis_support_helpdesk_on(tenant);
  insert into public.support_desks as d (tenant_id, enabled, updated_by, updated_at)
  values (tenant, support_set_desk.enabled, me, now())
  on conflict (tenant_id) do update
    set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if was is distinct from support_set_desk.enabled then
    insert into public.support_desk_log (tenant_id, action, reason, actor)
    values (tenant, case when support_set_desk.enabled then 'turned_on' else 'turned_off' end, why, me);
  end if;
end;
$$;

comment on function public.support_set_desk(uuid, boolean, text) is
  'Turns a tenant''s own help desk on or off, kept in support_desk_log. Its tenant admins only. Genesis support.';

revoke execute on function public.support_set_desk(uuid, boolean, text) from public, anon;
grant execute on function public.support_set_desk(uuid, boolean, text) to authenticated;

-- Routing -----------------------------------------------------------------------------------------

-- Does this login handle tickets anywhere (the app's own desk, or one of its tenants')?
create or replace function private.genesis_support_handles_a_desk(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select person is not null and (
    private.genesis_support_agent(private.genesis_support_default_tenant_id(), person)
    or exists (select 1 from private.genesis_support_tenants_of(person) v
                where private.genesis_support_agent(v.tenant_id, person)))
$$;

revoke execute on function private.genesis_support_handles_a_desk(uuid) from public, anon, authenticated;

-- A question sent to no tenant in particular goes to the sender's one desk that is on. Runs before
-- 0004's genesis_support_ticket_tenant (triggers fire by name), which checks whatever it picks.
create or replace function private.genesis_support_desk_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dflt uuid := private.genesis_support_default_tenant_id();
  hooked uuid;
  desks uuid[];
begin
  if me is null or new.tenant_id is not null or coalesce(new.user_id, me) is distinct from me then
    return new;
  end if;
  if to_regprocedure('private.genesis_support_desk_for(uuid,text)') is not null then
    hooked := private.genesis_support_desk_for(me, new.type);
    if hooked is not null then
      new.tenant_id := hooked;
      return new;
    end if;
  end if;
  if new.type is distinct from 'question' or not private.genesis_support_desks_on()
     or private.genesis_support_handles_a_desk(me) then
    return new;
  end if;
  select array_agg(distinct v.tenant_id) into desks
    from private.genesis_support_tenants_of(me) v
   where v.tenant_id is distinct from dflt
     and private.genesis_support_helpdesk_on(v.tenant_id);
  if cardinality(desks) = 1 then
    new.tenant_id := desks[1];
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_desk_route() from public, anon, authenticated;

drop trigger if exists genesis_support_desk_route on public.tickets;
create trigger genesis_support_desk_route
  before insert on public.tickets
  for each row execute function private.genesis_support_desk_route();

-- Moving ------------------------------------------------------------------------------------------

-- 0004's "a ticket keeps its tenant", except for the ticket a desk function is moving right now
-- (named for the rest of its own transaction).
create or replace function private.genesis_support_tenant_fixed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id and old.tenant_id is not null then
    if tg_table_name = 'tickets' and current_setting('genesis_support.moving_ticket', true) = old.id::text then
      return new;
    end if;
    raise exception 'support: a ticket keeps its tenant' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_tenant_fixed() from public, anon, authenticated;

-- Moves a ticket to another desk: the same thread, handled there now, unread, nobody's, open again
-- if it was pending. Logged.
create or replace function private.genesis_support_move(ticket uuid, to_desk uuid, action text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_desk uuid;
  conv uuid;
begin
  select t.tenant_id into from_desk from public.tickets t where t.id = ticket;
  perform set_config('genesis_support.moving_ticket', ticket::text, true);
  update public.tickets
     set tenant_id = to_desk, staff_read_at = null,
         status = case when status = 'pending' then 'open' else status end
   where id = ticket;
  perform set_config('genesis_support.moving_ticket', '', true);
  -- With the support-chat block: nobody has it at the new desk.
  if to_regprocedure('private.genesis_support_chat_conversation_of(uuid)') is not null then
    conv := private.genesis_support_chat_conversation_of(ticket);
    if conv is not null then
      update genesis_chat.conversations set assignee_id = null where id = conv and assignee_id is not null;
      perform genesis_chat.broadcast('genesis-chat:conv:' || conv, 'conversation', jsonb_build_object('conversation_id', conv));
    end if;
  end if;
  insert into public.support_desk_log (tenant_id, ticket_id, to_tenant, action, reason, actor)
  values (from_desk, ticket, to_desk, action, nullif(btrim(coalesce(reason, '')), ''), auth.uid());
end;
$$;

revoke execute on function private.genesis_support_move(uuid, uuid, text, text) from public, anon, authenticated;

-- The desk an escalated ticket goes back to: the one that last sent it up.
create or replace function private.genesis_support_returns_to(ticket uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.tenant_id from public.support_desk_log l
   where l.ticket_id = ticket and l.action = 'escalated'
   order by l.at desc, l.id desc
   limit 1
$$;

revoke execute on function private.genesis_support_returns_to(uuid) from public, anon, authenticated;

-- Can this ticket go to that desk: its desk is on, and the ticket's person is still in it (the
-- app's own desk takes anyone's)?
create or replace function private.genesis_support_can_take(ticket uuid, desk uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select desk is not null and private.genesis_support_helpdesk_on(desk)
     and (desk = private.genesis_support_default_tenant_id()
          or exists (select 1 from public.tickets t
                       join private.genesis_support_tenants_of(t.user_id) v on v.tenant_id = desk
                      where t.id = ticket))
$$;

revoke execute on function private.genesis_support_can_take(uuid, uuid) from public, anon, authenticated;

-- The checks every move shares; returns the ticket's current desk.
create or replace function private.genesis_support_move_check(fn text, ticket uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  desk uuid;
begin
  select t.tenant_id into desk from public.tickets t where t.id = ticket for update;
  if desk is null or me is null or not private.genesis_support_handler(ticket, me) then
    raise exception '%: only a handler of the ticket', fn using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception '%: say why in at most 1000 characters', fn using errcode = '22023';
  end if;
  if not private.genesis_support_desks_on() then
    raise exception '%: desks are off in this app (support.desks)', fn using errcode = '55000';
  end if;
  return desk;
end;
$$;

revoke execute on function private.genesis_support_move_check(text, uuid, text) from public, anon, authenticated;

-- A desk's handler sends a ticket up to the app's own desk.
create or replace function public.support_escalate_ticket(ticket uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  desk uuid := private.genesis_support_move_check('support_escalate_ticket', ticket, reason);
  dflt uuid := private.genesis_support_default_tenant_id();
begin
  if desk = dflt then
    raise exception 'support_escalate_ticket: it is at the app''s own desk already' using errcode = '22023';
  end if;
  perform private.genesis_support_move(ticket, dflt, 'escalated', reason);
end;
$$;

comment on function public.support_escalate_ticket(uuid, text) is
  'A desk''s handler sends a ticket up to the app''s own desk: the same thread, handled there now. Genesis support.';

-- The app's own desk hands an escalated ticket back to the desk that sent it up, while that desk is
-- on and the person is still in it.
create or replace function public.support_return_ticket(ticket uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  desk uuid := private.genesis_support_move_check('support_return_ticket', ticket, reason);
  back uuid;
begin
  if desk is distinct from private.genesis_support_default_tenant_id() then
    raise exception 'support_return_ticket: it isn''t at the app''s own desk' using errcode = '22023';
  end if;
  back := private.genesis_support_returns_to(ticket);
  if back is null then
    raise exception 'support_return_ticket: it didn''t come from another desk' using errcode = '22023';
  end if;
  if not private.genesis_support_can_take(ticket, back) then
    raise exception 'support_return_ticket: that desk is off, or the person has left it' using errcode = '55000';
  end if;
  perform private.genesis_support_move(ticket, back, 'returned', reason);
end;
$$;

comment on function public.support_return_ticket(uuid, text) is
  'The app''s own desk hands an escalated ticket back to the desk that sent it up. Genesis support.';

-- A handler moves a ticket to another desk: any the person belongs to whose desk is on, or the
-- app's own (which is escalating, and logged as that).
create or replace function public.support_move_ticket(ticket uuid, to_tenant uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  desk uuid := private.genesis_support_move_check('support_move_ticket', ticket, reason);
  dflt uuid := private.genesis_support_default_tenant_id();
begin
  if to_tenant is null or to_tenant = desk then
    raise exception 'support_move_ticket: name another desk' using errcode = '22023';
  end if;
  if not private.genesis_support_can_take(ticket, to_tenant) then
    raise exception 'support_move_ticket: that desk is off, or the person isn''t in it' using errcode = '55000';
  end if;
  perform private.genesis_support_move(ticket, to_tenant,
    case when to_tenant = dflt then 'escalated'
         when desk = dflt and to_tenant = private.genesis_support_returns_to(ticket) then 'returned'
         else 'moved' end,
    reason);
end;
$$;

comment on function public.support_move_ticket(uuid, uuid, text) is
  'A handler moves a ticket to another desk the person belongs to whose desk is on (or the app''s own). Genesis support.';

revoke execute on function public.support_escalate_ticket(uuid, text) from public, anon;
revoke execute on function public.support_return_ticket(uuid, text) from public, anon;
revoke execute on function public.support_move_ticket(uuid, uuid, text) from public, anon;
grant execute on function public.support_escalate_ticket(uuid, text) to authenticated;
grant execute on function public.support_return_ticket(uuid, text) to authenticated;
grant execute on function public.support_move_ticket(uuid, uuid, text) to authenticated;

-- The inbox ---------------------------------------------------------------------------------------

-- The desks the signed-in login works: the app's own (its staff and agents) and every tenant they
-- admin (on or off, so its admins find the switch) or are an agent of, with how many of its
-- tickets are still open (not addressed or won't fix, not the login's own): a desk turned off keeps
-- the ones it has, and its agents still need to reach them.
create or replace function public.support_my_desks()
returns table (tenant_id uuid, label text, is_default boolean, enabled boolean, manage boolean, open_tickets integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dflt uuid := private.genesis_support_default_tenant_id();
begin
  if me is null then
    return;
  end if;
  return query
    with candidates as (
      select dflt as id
      union
      select v.tenant_id from private.genesis_support_tenants_of(me) v
    ), worked as (
      select c.id,
             c.id = dflt as is_default,
             c.id is distinct from dflt and private.genesis_support_tenant_admin(c.id, me) as manage
        from candidates c
       where c.id is not null and private.genesis_support_agent(c.id, me)
    )
    select w.id,
           case when w.is_default then null else private.genesis_support_tenant_label(w.id) end,
           w.is_default,
           private.genesis_support_helpdesk_on(w.id),
           w.manage,
           (select count(*)::integer from public.tickets t
             where t.tenant_id = w.id and t.user_id is distinct from me
               and t.status not in ('addressed', 'wont_fix'))
      from worked w
     order by w.is_default desc, 2 nulls last, 1;
end;
$$;

comment on function public.support_my_desks() is
  'The help desks the signed-in login works: the app''s own, and each tenant''s they admin or are an agent of, with whether it is on, whether they manage it, and its open tickets. Genesis support.';

revoke execute on function public.support_my_desks() from public, anon;
grant execute on function public.support_my_desks() to authenticated;

-- Where a ticket is, for its handlers: its desk, whether it can go up to the app's own desk or back
-- to the desk it came from, and its last move. No row for anyone else.
create or replace function public.support_ticket_desk(ticket uuid)
returns table (tenant_id uuid, label text, is_default boolean, can_escalate boolean, can_return boolean,
               returns_to uuid, returns_to_label text, last_action text, last_from uuid, last_to uuid,
               last_by uuid, last_by_name text, last_reason text, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t public.tickets;
  dflt uuid := private.genesis_support_default_tenant_id();
  back uuid;
  last public.support_desk_log;
begin
  select * into t from public.tickets x where x.id = ticket;
  if t.id is null or me is null or not private.genesis_support_handler(t.id, me) then
    return;
  end if;
  back := case when t.tenant_id = dflt then private.genesis_support_returns_to(t.id) end;
  select * into last from public.support_desk_log l where l.ticket_id = t.id order by l.at desc, l.id desc limit 1;
  return query select
    t.tenant_id,
    case when t.tenant_id = dflt then null else private.genesis_support_tenant_label(t.tenant_id) end,
    t.tenant_id = dflt,
    t.tenant_id <> dflt,
    back is not null and private.genesis_support_can_take(t.id, back),
    back,
    private.genesis_support_tenant_label(back),
    last.action,
    last.tenant_id,
    last.to_tenant,
    last.actor,
    case when last.id is not null then private.genesis_support_person_name(last.actor) end,
    last.reason,
    last.at;
end;
$$;

comment on function public.support_ticket_desk(uuid) is
  'A ticket''s desk for its handlers: where it is, whether it can be escalated or returned, and its last move. Genesis support.';

revoke execute on function public.support_ticket_desk(uuid) from public, anon;
grant execute on function public.support_ticket_desk(uuid) to authenticated;

-- Where a handler can move a ticket: the app's own desk and every desk the person belongs to that
-- is on, less the one it is at.
create or replace function public.support_desk_move_targets(ticket uuid)
returns table (tenant_id uuid, label text, is_default boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t public.tickets;
  dflt uuid := private.genesis_support_default_tenant_id();
begin
  select * into t from public.tickets x where x.id = ticket;
  if t.id is null or me is null or not private.genesis_support_handler(t.id, me) then
    return;
  end if;
  return query
    select d.id, case when d.id = dflt then null else private.genesis_support_tenant_label(d.id) end, d.id = dflt
      from (select dflt as id
            union
            select v.tenant_id from private.genesis_support_tenants_of(t.user_id) v) d
     where d.id is not null and d.id is distinct from t.tenant_id
       and private.genesis_support_can_take(t.id, d.id)
     order by d.id = dflt desc, 2 nulls last, 1;
end;
$$;

comment on function public.support_desk_move_targets(uuid) is
  'The desks a ticket''s handler can move it to: the app''s own and each desk its person belongs to that is on. Genesis support.';

revoke execute on function public.support_desk_move_targets(uuid) from public, anon;
grant execute on function public.support_desk_move_targets(uuid) to authenticated;

-- A desk's log, newest first, for its admins (switches and moves in or out).
create or replace function public.support_desk_history(tenant uuid default null, max_rows integer default 50)
returns table (id bigint, tenant_id uuid, ticket_id uuid, to_tenant uuid, action text, reason text, actor uuid, actor_name text, at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  me uuid := auth.uid();
begin
  if me is null or not (private.genesis_support_tenant_admin(resolved, me) or private.genesis_support_agent(resolved, me)) then
    raise exception 'support_desk_history: only the desk''s agents' using errcode = '42501';
  end if;
  return query
    select l.id, l.tenant_id, l.ticket_id, l.to_tenant, l.action, l.reason, l.actor, private.genesis_support_person_name(l.actor), l.at
      from public.support_desk_log l
     where l.tenant_id = resolved or l.to_tenant = resolved
     order by l.at desc, l.id desc
     limit greatest(1, least(coalesce(max_rows, 50), 200));
end;
$$;

comment on function public.support_desk_history(uuid, integer) is
  'A desk''s log (switched on or off, tickets in and out), newest first. Its agents only. Genesis support.';

revoke execute on function public.support_desk_history(uuid, integer) from public, anon;
grant execute on function public.support_desk_history(uuid, integer) to authenticated;

-- The requester's tenants, with how they are there ----------------------------------------------

-- 0022's support_requester_tenants, with each tenant's role for the person: what the app's
-- optional hook private.genesis_tenant_role(tenant uuid, person uuid) returns text says
-- ("Owner", "Team", "Client"), else `admin` for a tenant admin, `agent` for one of its agents and
-- `member` for anyone else. Asked only by someone who handles one of the person's tickets
-- (private.genesis_support_handler); empty otherwise. A changed return type, so dropped and made again.
create or replace function private.genesis_support_tenant_role(tenant uuid, person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hooked text;
begin
  if tenant is null or person is null then
    return null;
  end if;
  if to_regprocedure('private.genesis_tenant_role(uuid,uuid)') is not null then
    begin
      hooked := nullif(btrim(private.genesis_tenant_role(tenant, person)), '');
    exception when others then
      hooked := null;
    end;
    if hooked is not null then
      return left(hooked, 60);
    end if;
  end if;
  return case when private.genesis_support_tenant_admin(tenant, person) then 'admin'
              when private.genesis_support_agent(tenant, person) then 'agent'
              else 'member' end;
end;
$$;

revoke execute on function private.genesis_support_tenant_role(uuid, uuid) from public, anon, authenticated;

drop function if exists public.support_requester_tenants(uuid);
create function public.support_requester_tenants(person uuid)
returns table (tenant_id uuid, label text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  staff boolean;
begin
  if me is null or person is null then
    return;
  end if;
  if not exists (select 1 from public.tickets t
                  where t.user_id = person and private.genesis_support_handler(t.id, me)) then
    return;
  end if;
  staff := private.genesis_support_agent(private.genesis_support_default_tenant_id(), me);
  return query
    select v.tenant_id, private.genesis_support_tenant_label(v.tenant_id), private.genesis_support_tenant_role(v.tenant_id, person)
      from (select distinct x.tenant_id from private.genesis_support_tenants_of(person) x) v
     where v.tenant_id is distinct from private.genesis_support_default_tenant_id()
       and (staff or private.genesis_support_agent(v.tenant_id, me))
     order by 2 nulls last, 1;
end;
$$;

comment on function public.support_requester_tenants(uuid) is
  'The tenants (with a label and the person''s role there) a requester belongs to, for someone who handles one of their tickets. Genesis support.';

revoke execute on function public.support_requester_tenants(uuid) from public, anon;
grant execute on function public.support_requester_tenants(uuid) to authenticated;

-- 0025's notification of a moved ticket, when 0025 came first (it makes this trigger itself after 0024).
do $$
begin
  if to_regprocedure('private.genesis_support_moved_notify()') is not null then
    drop trigger if exists genesis_support_moved_notify on public.support_desk_log;
    create trigger genesis_support_moved_notify
      after insert on public.support_desk_log
      for each row execute function private.genesis_support_moved_notify();
  end if;
end;
$$;
