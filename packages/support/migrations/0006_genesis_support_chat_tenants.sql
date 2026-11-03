-- @feat:support-chat
-- Genesis support 0006: support-chat on tickets and tenants (after 0004_genesis_support_tickets.sql
-- and 0001_genesis_support_chat.sql).
--
-- 0004 renamed public.support_reports to public.tickets and gave every ticket a tenant. This
-- recreates the support-chat functions against the new table, and makes chat's staff checks
-- tenant-aware: the `support` kind's observers (who read and post in a ticket's conversation,
-- internal notes included) and its assignee are handlers of that ticket, that is agents of its
-- tenant or whom the app's hook names, never app-wide staff. The conversations' subject stays
-- `support_report` in this release (export TICKET_SUBJECT; never compare the literal).
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0006_genesis_support_chat_tenants.test.sql`).

-- The old app-wide staff check, kept for any app SQL that still calls it: from here it means an
-- agent of the app's own tenant only (as support_is_staff does), never staff of every tenant.
-- Nothing in support-chat calls it any more; the checks below are per ticket.
create or replace function private.genesis_support_chat_is_staff(person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if person is null then
    return false;
  end if;
  return private.genesis_support_agent(private.genesis_support_default_tenant_id(), person);
end;
$$;

revoke execute on function private.genesis_support_chat_is_staff(uuid) from public, anon, authenticated;

-- The `support` kind's observer check: a handler of the ticket (an agent of its tenant) reads,
-- and by the kind posts in, its conversation without being in it.
create or replace function private.genesis_support_chat_observer(conversation_id uuid, user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from genesis_chat.conversations c
                  where c.id = genesis_support_chat_observer.conversation_id
                    and c.kind = 'support' and c.subject_type = 'support_report') then
    return false;
  end if;
  -- A handler of this ticket (an agent of its tenant, or whom the app's hook names), not app-wide staff.
  return private.genesis_support_handler(private.genesis_support_chat_report_of(genesis_support_chat_observer.conversation_id),
                                         genesis_support_chat_observer.user_id);
end;
$$;

-- The report a conversation is about, or null (any other conversation).
create or replace function private.genesis_support_chat_report_of(conversation uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c genesis_chat.conversations;
begin
  select * into c from genesis_chat.conversations where id = conversation;
  if c.kind is distinct from 'support' or c.subject_type is distinct from 'support_report' then
    return null;
  end if;
  return (select r.id from public.tickets r where r.id = c.subject_id::uuid);
end;
$$;

-- The report's conversation, made once, its person its member and its status the report's.
create or replace function private.genesis_support_chat_ensure(report public.tickets)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  conv := genesis_chat.ensure_conversation('support', 'support_report', report.id::text,
                                           private.genesis_support_chat_title(report.title, report.message));
  perform genesis_chat.sync_members(conv, array[report.user_id], 'member');
  update genesis_chat.conversations
     set status = private.genesis_support_chat_status(report.status), created_by = coalesce(created_by, report.user_id)
   where id = conv
     and (status is distinct from private.genesis_support_chat_status(report.status) or created_by is null);
  return conv;
end;
$$;

-- Only a handler of the ticket (an agent of its tenant) is assigned it.
create or replace function private.genesis_support_chat_assignee_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not private.genesis_support_handler(case when new.subject_type = 'support_report' then new.subject_id::uuid end, new.assignee_id) then
    raise exception 'support: only an agent of the ticket''s tenant is assigned it' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A status set on the conversation (genesis_chat.set_status) moves the report's.
create or replace function private.genesis_support_chat_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets r
     set status = private.genesis_support_report_status(new.status, r.status)
   where r.id = new.subject_id::uuid
     and private.genesis_support_chat_status(r.status) is distinct from new.status;
  return null;
end;
$$;

-- A message moves the report on: the writer's side has read it, the other side has something
-- new. An internal note moves nothing the person sees. For one release, it is also mirrored
-- into support_replies for older clients (which applies 0006's checks and reply limit).
create or replace function private.genesis_support_chat_message_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := private.genesis_support_chat_report_of(new.conversation_id);
begin
  if rid is null or new.kind <> 'text' or new.visibility <> 'everyone' then
    return null;
  end if;
  if not (new.meta ? 'support_reply_id') and to_regclass('public.support_replies') is not null then
    insert into public.support_replies (report_id, body, chat_message_id)
    values (rid,
            coalesce(nullif(left(btrim(new.body), 10000), ''), 'Sent an attachment. Update the app to see it.'),
            new.id);
  end if;
  if new.sender_role = 'observer' then
    update public.tickets
       set last_staff_reply_at = greatest(coalesce(last_staff_reply_at, new.created_at), new.created_at),
           staff_read_at = greatest(coalesce(staff_read_at, new.created_at), new.created_at)
     where id = rid
       and (last_staff_reply_at is null or last_staff_reply_at < new.created_at
            or staff_read_at is null or staff_read_at < new.created_at);
  else
    update public.tickets
       set last_user_reply_at = greatest(coalesce(last_user_reply_at, new.created_at), new.created_at),
           user_read_at = greatest(coalesce(user_read_at, new.created_at), new.created_at)
     where id = rid
       and (last_user_reply_at is null or last_user_reply_at < new.created_at
            or user_read_at is null or user_read_at < new.created_at);
  end if;
  return null;
end;
$$;

-- Reading the conversation is reading the report: the person's place moves user_read_at,
-- a staff member's (an observer row) staff_read_at. Read to the end means read now.
create or replace function private.genesis_support_chat_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.tickets;
  latest bigint;
  read_at timestamptz;
begin
  if new.last_read_seq <= 0 or (tg_op = 'UPDATE' and new.last_read_seq <= old.last_read_seq) then
    return null;
  end if;
  select * into report from public.tickets r where r.id = private.genesis_support_chat_report_of(new.conversation_id);
  if report.id is null then
    return null;
  end if;
  select c.last_seq into latest from genesis_chat.conversations c where c.id = new.conversation_id;
  read_at := case when new.last_read_seq >= latest then clock_timestamp()
                  else (select m.created_at from genesis_chat.messages m
                         where m.conversation_id = new.conversation_id and m.seq = new.last_read_seq) end;
  if read_at is null then
    return null;
  end if;
  if new.user_id = report.user_id and new.role <> 'observer' then
    update public.tickets set user_read_at = read_at
     where id = report.id and (user_read_at is null or user_read_at < read_at);
  elsif new.role = 'observer' then
    update public.tickets set staff_read_at = read_at
     where id = report.id and (staff_read_at is null or staff_read_at < read_at);
  end if;
  return null;
end;
$$;

-- A reply written by an older client (0006 has checked who wrote it and counted it) becomes
-- a message in the report's conversation, as the person or as staff (an observer).
create or replace function private.genesis_support_chat_reply_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.tickets;
  conv uuid;
  msg uuid;
begin
  select * into report from public.tickets where id = new.report_id;
  conv := coalesce(private.genesis_support_chat_conversation_of(report.id), private.genesis_support_chat_ensure(report));
  insert into genesis_chat.messages (conversation_id, seq, client_id, sender_id, sender_role, body, created_at, meta)
  values (conv, 0, new.id, new.author_id, case when new.from_staff then 'observer' else 'member' end,
          left(new.body, 10000), new.created_at, jsonb_build_object('support_reply_id', new.id))
  on conflict do nothing
  returning id into msg;
  if msg is not null then
    update public.support_replies set chat_message_id = msg where id = new.id;
  end if;
  return null;
end;
$$;

-- Staff: who has a report (a staff member, or null for nobody).
create or replace function public.support_assign_report(report uuid, assignee uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if not private.genesis_support_handler(report, auth.uid()) then
    raise exception 'support_assign_report: only staff' using errcode = '42501';
  end if;
  conv := private.genesis_support_chat_conversation_of(report);
  if conv is null then
    raise exception 'support_assign_report: no such report' using errcode = 'P0002';
  end if;
  update genesis_chat.conversations set assignee_id = assignee where id = conv and assignee_id is distinct from assignee;
  perform genesis_chat.broadcast('genesis-chat:conv:' || conv, 'conversation', jsonb_build_object('conversation_id', conv));
end;
$$;

-- Every report gets its conversation; every reply not yet copied is copied in order, as its
-- writer, at its time. No push, no live hint, no link preview: history is not news.
create or replace function private.genesis_support_chat_backfill()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  effects_before bigint;
  report public.tickets;
  reply public.support_replies;
  conv uuid;
  msg uuid;
  has_0002 boolean := exists (select 1 from pg_trigger where tgrelid = 'genesis_chat.messages'::regclass and tgname = 'messages_effects_0002');
begin
  select count(*) into effects_before from genesis_chat.effects;
  alter table genesis_chat.messages disable trigger messages_posted;
  alter table genesis_chat.messages disable trigger genesis_support_chat_message_posted;
  if has_0002 then
    alter table genesis_chat.messages disable trigger messages_effects_0002;
  end if;
  alter table genesis_chat.members disable trigger members_changed;
  alter table genesis_chat.members disable trigger genesis_support_chat_read;

  for report in select * from public.tickets order by created_at, id loop
    perform private.genesis_support_chat_ensure(report);
  end loop;

  for reply in select * from public.support_replies p where p.chat_message_id is null order by p.report_id, p.created_at, p.id loop
    conv := private.genesis_support_chat_conversation_of(reply.report_id);
    select m.id into msg from genesis_chat.messages m where m.conversation_id = conv and m.client_id = reply.id;
    if msg is null then
      insert into genesis_chat.messages (conversation_id, seq, client_id, sender_id, sender_role, body, created_at, meta)
      values (conv, 0, reply.id, reply.author_id, case when reply.from_staff then 'observer' else 'member' end,
              left(reply.body, 10000), reply.created_at, jsonb_build_object('support_reply_id', reply.id))
      returning id into msg;
    end if;
    update public.support_replies set chat_message_id = msg where id = reply.id;
  end loop;

  -- The person's place: everything up to when they last read the report.
  update genesis_chat.members gm
     set last_read_seq = x.latest
    from (select c.id as conversation_id, r.user_id,
                 (select coalesce(max(m.seq), 0) from genesis_chat.messages m
                   where m.conversation_id = c.id and m.created_at <= r.user_read_at) as latest
            from public.tickets r
            join genesis_chat.conversations c
              on c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = r.id::text
           where r.user_read_at is not null) x
   where gm.conversation_id = x.conversation_id and gm.user_id = x.user_id and gm.last_read_seq < x.latest;

  alter table genesis_chat.messages enable trigger messages_posted;
  alter table genesis_chat.messages enable trigger genesis_support_chat_message_posted;
  if has_0002 then
    alter table genesis_chat.messages enable trigger messages_effects_0002;
  end if;
  alter table genesis_chat.members enable trigger members_changed;
  alter table genesis_chat.members enable trigger genesis_support_chat_read;
  if (select count(*) from genesis_chat.effects) <> effects_before then
    raise exception 'support: copying replies into chat queued side effects';
  end if;
end;
$$;

-- The tenant of a ticket conversation's subject, for genesis-chat (its tenant backfill and subject
-- resolver look for private.genesis_chat_resolve_<subject_type>). Null when there is no such ticket.
create or replace function private.genesis_chat_resolve_support_report(subject_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.tenant_id from public.tickets t
   where subject_id ~ '^[0-9a-fA-F-]{36}$' and t.id = subject_id::uuid
$$;

revoke execute on function private.genesis_chat_resolve_support_report(text) from public, anon, authenticated;

-- With genesis-chat's subject registry (chat 0004), register the ticket subject so a ticket's
-- conversation takes the ticket's tenant. Either order of the two migrations works: without the
-- registry this does nothing, and chat 0004 finds the resolver above by its name.
do $$
begin
  if to_regprocedure('genesis_chat.register_subject(text,text,regprocedure,text[])') is not null then
    perform genesis_chat.register_subject('support', 'support_report',
      'private.genesis_chat_resolve_support_report(text)'::regprocedure, array[]::text[]);
  end if;
end;
$$;
