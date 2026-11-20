-- @feat:support-feedback
-- Genesis support 0025: support's default notifications, through genesis-notifications (after
-- 0004_genesis_support_tickets.sql; genesis-notifications' 0001_genesis_notifications.sql, the
-- support-chat block's 0022 (names) and the help desk's 0024 (desks) are optional, before or after).
--
-- Three types, which the app adds to its `defineNotifications` with `supportNotificationTypes()`
-- (`@marktiderman/genesis-support`), synced into notification_types as every type is:
--
--   support.message  someone wrote to support (a new ticket, a message in its thread from its
--                    person, or a ticket moved to a desk): the desk's agents, while nobody has it.
--                    Once someone who still handles it has it, genesis-chat already tells them each
--                    message, so nobody else is told. Never the person who wrote. Only while the
--                    `support.staffAlerts` setting is on (the `max` and `standard` presets).
--   support.reply    support answered: the ticket's person (one email per ticket however many
--                    replies, through a collapse key). Not for an email ticket, whose replies already
--                    go out as email (runSupportEmail), nor for the verify prompt.
--   support.verify   the verify prompt (0003): the person is asked whether the fix works.
--
-- Data every type carries: ticket_id, title (120 characters), excerpt (300), body (the whole text, up
-- to 4,000, for the email), by (a name, never an email address: it shows on lock screens), new, and
-- desk (the tenant, when it isn't the app's own) with escalated / returned / moved for a move.
--
-- Whom support.message tells: the app's hook private.genesis_support_staff_to_notify(ticket uuid)
-- returns uuid[] when it has one (the app answers for whom it names: they are told without another
-- check), else the agents of the ticket's tenant among its ticket_agents rows, the app's staff list
-- and tenant admin list hooks (private.genesis_support_staff_list(),
-- private.genesis_tenant_admin_list(tenant)): never a scan of every login unless support.agentListScan.
--
-- A notification that can't be sent (genesis-notifications not installed, the types not synced yet)
-- is a warning in the log, never a failed ticket or message.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0025_genesis_support_notifications.test.sql`).

create schema if not exists private;

-- support.staffAlerts: max and standard on, min off. 0024's reader when it is there; else 0020's
-- (genesis_support_setting_bool) with the preset's default; without either, on.
create or replace function private.genesis_support_staff_alerts_on()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  preset text;
begin
  if to_regprocedure('private.genesis_support_setting_on(text,boolean,boolean,boolean)') is not null then
    return private.genesis_support_setting_on('support.staffAlerts', true, true, false);
  end if;
  if to_regclass('public.genesis_app_manifest') is not null then
    begin
      execute 'select m.preset from public.genesis_app_manifest m limit 1' into preset;
    exception when others then
      preset := null;
    end;
  end if;
  if to_regprocedure('private.genesis_support_setting_bool(text,boolean)') is null then
    return coalesce(preset, 'max') <> 'min';
  end if;
  return coalesce(private.genesis_support_setting_bool('support.staffAlerts', coalesce(preset, 'max') <> 'min'), true);
end;
$$;

revoke execute on function private.genesis_support_staff_alerts_on() from public, anon, authenticated;

-- A name to show, never an email address (notification data shows on lock screens).
-- 0022's reader (the app's genesis_person_name hook, else the login's metadata) when it is there.
create or replace function private.genesis_support_notify_name(person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  name text;
begin
  if person is null then
    return 'Someone';
  end if;
  if to_regprocedure('private.genesis_support_person_name(uuid)') is not null then
    name := private.genesis_support_person_name(person);
  else
    select left(nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''), 200)
      into name from auth.users u where u.id = person;
  end if;
  return coalesce(name, 'Someone');
end;
$$;

revoke execute on function private.genesis_support_notify_name(uuid) from public, anon, authenticated;

-- A desk's name for the person (0022's tenant label hook), or null for the app's own.
create or replace function private.genesis_support_notify_label(tenant uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or tenant = private.genesis_support_default_tenant_id()
     or to_regprocedure('private.genesis_support_tenant_label(uuid)') is null then
    return null;
  end if;
  return private.genesis_support_tenant_label(tenant);
end;
$$;

revoke execute on function private.genesis_support_notify_label(uuid) from public, anon, authenticated;

-- Tells these logins, never failing the caller. The ticket's tenant goes with it (its sender
-- identity and defaults), unless it is the app's own.
create or replace function private.genesis_support_notify(type text, users uuid[], data jsonb, idempotency_key text, ticket uuid, collapse_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients jsonb;
  tenant uuid;
begin
  if to_regprocedure('public.genesis_notify(text,jsonb,jsonb,text,text,text,integer,uuid,jsonb,text)') is null then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('user_id', u)) into recipients
    from (select distinct u from unnest(users) u where u is not null) x;
  if recipients is null then
    return;
  end if;
  select nullif(t.tenant_id, private.genesis_support_default_tenant_id()) into tenant from public.tickets t where t.id = ticket;
  begin
    perform public.genesis_notify(type, recipients, data, idempotency_key, ticket::text, collapse_key, null, tenant);
  exception when others then
    raise warning 'genesis-support: notification % (%) not sent: %', type, idempotency_key, sqlerrm;
  end;
end;
$$;

revoke execute on function private.genesis_support_notify(text, uuid[], jsonb, text, uuid, text) from public, anon, authenticated;

-- Whom to tell about a ticket: the app's hook, else its desk's agents, unless someone who still
-- handles it has it (genesis-chat tells them). Never its own person, never an anonymous login.
-- Candidates come from what names agents (never a scan of every login, in the writer's
-- transaction): the tenant's ticket_agents rows, the app's staff list (the optional hook
-- private.genesis_support_staff_list() returns setof uuid, as 0022's agent list reads it) for the
-- app's own desk, and its tenant admins (the optional hook
-- private.genesis_tenant_admin_list(tenant uuid) returns setof uuid). Each is checked as an agent of
-- the tenant. support.agentListScan (0022) adds every login, for an app that wants it. At most 200.
create or replace function private.genesis_support_staff_to_tell(ticket uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  assignee uuid;
  listed uuid[] := '{}';
  admins uuid[] := '{}';
  scan boolean := false;
begin
  select * into t from public.tickets x where x.id = ticket;
  if t.id is null then
    return '{}';
  end if;
  if to_regprocedure('private.genesis_support_staff_to_notify(uuid)') is not null then
    -- The app answers for whom its hook names: they are told as they are.
    return coalesce((select array_agg(u) from unnest(private.genesis_support_staff_to_notify(ticket)) u
                      where u is distinct from t.user_id), '{}');
  end if;
  if to_regprocedure('private.genesis_support_chat_conversation_of(uuid)') is not null then
    select c.assignee_id into assignee from genesis_chat.conversations c
     where c.id = private.genesis_support_chat_conversation_of(ticket);
    if assignee is not null and private.genesis_support_handler(ticket, assignee) then
      return '{}';
    end if;
  end if;
  if t.tenant_id = private.genesis_support_default_tenant_id()
     and to_regprocedure('private.genesis_support_staff_list()') is not null then
    begin
      execute 'select coalesce(array_agg(s), ''{}'') from private.genesis_support_staff_list() s where s is not null' into listed;
    exception when others then
      raise warning 'genesis-support: private.genesis_support_staff_list() failed: %', sqlerrm;
    end;
  end if;
  if to_regprocedure('private.genesis_tenant_admin_list(uuid)') is not null then
    begin
      execute 'select coalesce(array_agg(s), ''{}'') from private.genesis_tenant_admin_list($1) s where s is not null' into admins using t.tenant_id;
    exception when others then
      raise warning 'genesis-support: private.genesis_tenant_admin_list(tenant) failed: %', sqlerrm;
    end;
  end if;
  if to_regprocedure('private.genesis_support_setting_bool(text,boolean)') is not null then
    scan := private.genesis_support_setting_bool('support.agentListScan', false);
  end if;
  return coalesce((
    select array_agg(c.id order by c.id)
      from (
        select u.id
          from auth.users u
         where u.id in (
                 select a.person_id from public.ticket_agents a where a.tenant_id = t.tenant_id
                 union select unnest(listed)
                 union select unnest(admins)
                 union select x.id from auth.users x where scan
               )
           and u.id is distinct from t.user_id
           and (to_jsonb(u) ->> 'is_anonymous') is distinct from 'true'
           and private.genesis_support_agent(t.tenant_id, u.id)
         order by u.id
         limit 200
      ) c
  ), '{}');
end;
$$;

revoke execute on function private.genesis_support_staff_to_tell(uuid) from public, anon, authenticated;

-- What every support notification carries about its ticket.
create or replace function private.genesis_support_notify_data(t public.tickets, words text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'ticket_id', t.id,
           'title', left(coalesce(nullif(btrim(t.title), ''), btrim(t.message)), 120),
           'excerpt', left(btrim(coalesce(words, '')), 300),
           'body', left(btrim(coalesce(words, '')), 4000))
         || case when t.tenant_id is distinct from private.genesis_support_default_tenant_id()
                 then jsonb_build_object('desk', t.tenant_id) else '{}'::jsonb end
$$;

revoke execute on function private.genesis_support_notify_data(public.tickets, text) from public, anon, authenticated;

-- Who wrote a ticket, as a name: the login's, or an email ticket's sender's name.
create or replace function private.genesis_support_requester_name(t public.tickets)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.user_id is not null then private.genesis_support_notify_name(t.user_id)
              else coalesce(nullif(btrim(to_jsonb(t) ->> 'requester_name'), ''), 'Someone') end
$$;

revoke execute on function private.genesis_support_requester_name(public.tickets) from public, anon, authenticated;

-- A new ticket: its desk ---------------------------------------------------------------------------

create or replace function private.genesis_support_ticket_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.genesis_support_staff_alerts_on() then
    return null;
  end if;
  perform private.genesis_support_notify('support.message', private.genesis_support_staff_to_tell(new.id),
    private.genesis_support_notify_data(new, new.message)
      || jsonb_build_object('by', private.genesis_support_requester_name(new), 'new', true),
    'ticket:' || new.id::text, new.id, null);
  return null;
exception when others then
  raise warning 'genesis-support: notification for ticket % not sent: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function private.genesis_support_ticket_notify() from public, anon, authenticated;

drop trigger if exists genesis_support_ticket_notify on public.tickets;
create trigger genesis_support_ticket_notify
  after insert on public.tickets
  for each row execute function private.genesis_support_ticket_notify();

-- A ticket moved to another desk (0024): that desk, as of a new ticket ------------------------------

create or replace function private.genesis_support_moved_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
begin
  -- Only a ticket's move (a switch has no ticket).
  if new.ticket_id is null or not private.genesis_support_staff_alerts_on() then
    return null;
  end if;
  select * into t from public.tickets x where x.id = new.ticket_id;
  if t.id is null then
    return null;
  end if;
  perform private.genesis_support_notify('support.message', private.genesis_support_staff_to_tell(t.id),
    -- A move between tenants' desks keeps the first desk's words to itself.
    private.genesis_support_notify_data(t, coalesce(case when new.action <> 'moved' then nullif(btrim(new.reason), '') end, t.message))
      || jsonb_build_object('by', case when new.actor is not null and new.action <> 'moved' then private.genesis_support_notify_name(new.actor)
                                       else private.genesis_support_requester_name(t) end,
                            'new', true, new.action, true),
    'moved:' || new.id::text, t.id, null);
  return null;
exception when others then
  raise warning 'genesis-support: notification for moved ticket % not sent: %', new.ticket_id, sqlerrm;
  return null;
end;
$$;

revoke execute on function private.genesis_support_moved_notify() from public, anon, authenticated;

-- On the log, written after the move (the ticket at its new desk, nobody's). With 0024 applied
-- already; otherwise 0024 makes the trigger when it finds this function.
do $$
begin
  if to_regclass('public.support_desk_log') is not null then
    drop trigger if exists genesis_support_moved_notify on public.support_desk_log;
    create trigger genesis_support_moved_notify
      after insert on public.support_desk_log
      for each row execute function private.genesis_support_moved_notify();
  end if;
end;
$$;

-- A message in a ticket's thread: its desk, or its person ------------------------------------------
--
-- On support_replies, which holds every message the person can see whether the thread runs on
-- genesis-chat or not (the chat block mirrors each one there; an internal note never is).

create or replace function private.genesis_support_reply_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  verify boolean := coalesce(to_jsonb(new) ->> 'prompt', '') = 'verify';
begin
  select * into t from public.tickets x where x.id = new.report_id;
  if t.id is null then
    return null;
  end if;
  if verify then
    if t.user_id is not null then
      perform private.genesis_support_notify('support.verify', array[t.user_id],
        private.genesis_support_notify_data(t, new.body) || jsonb_build_object('from', private.genesis_support_notify_label(t.tenant_id)),
        'verify:' || new.id::text, t.id, 'support-verify:' || t.id::text);
    end if;
  elsif new.from_staff then
    if t.user_id is not null and coalesce(to_jsonb(t) ->> 'channel', '') <> 'email' then
      perform private.genesis_support_notify('support.reply', array[t.user_id],
        private.genesis_support_notify_data(t, new.body)
          || jsonb_build_object('by', private.genesis_support_notify_name(new.author_id),
                                'from', private.genesis_support_notify_label(t.tenant_id)),
        'reply:' || new.id::text, t.id, 'support-reply:' || t.id::text);
    end if;
  elsif private.genesis_support_staff_alerts_on() then
    perform private.genesis_support_notify('support.message', private.genesis_support_staff_to_tell(t.id),
      private.genesis_support_notify_data(t, new.body)
        || jsonb_build_object('by', private.genesis_support_requester_name(t), 'new', false),
      'reply:' || new.id::text, t.id, null);
  end if;
  return null;
exception when others then
  raise warning 'genesis-support: notification for reply % not sent: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function private.genesis_support_reply_notify() from public, anon, authenticated;

drop trigger if exists genesis_support_reply_notify on public.support_replies;
create trigger genesis_support_reply_notify
  after insert on public.support_replies
  for each row execute function private.genesis_support_reply_notify();
