-- @feat:support-chat
-- Genesis support 0005: the support-chat block on public.tickets (after 0004_genesis_support_tickets.sql
-- and genesis-chat's 0001–0003).
--
-- 0001_genesis_support_chat.sql written for the renamed table, and safe to run again: an app that
-- already applied 0001 gets the same objects back unchanged, and an app adding the block after
-- 0004 (every new app) gets it whole. 0006_genesis_support_chat_tenants.sql follows it and makes the
-- block tenant-aware. What 0001's header says about the block still holds; read it there.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test `tests/0001_genesis_support_chat.test.sql` (it covers this file too).

create schema if not exists private;

-- Helpers -----------------------------------------------------------------------------

-- Is this person support staff? After support 0004, only an agent of the app's own (default)
-- tenant: never staff of every tenant, so a business's tickets stay closed here even if 0006
-- (which makes these checks per ticket) hasn't run yet.
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

-- The `support` kind's observer check: a handler of the ticket (an agent of its tenant, see
-- support 0004) reads, and by the kind posts in, its conversation without being in it. Never
-- app-wide staff: this holds even before 0006 runs.
create or replace function private.genesis_support_chat_observer(conversation_id uuid, user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ticket uuid;
begin
  select c.subject_id::uuid into ticket from genesis_chat.conversations c
   where c.id = genesis_support_chat_observer.conversation_id
     and c.kind = 'support' and c.subject_type = 'support_report';
  if ticket is null then
    return false;
  end if;
  return private.genesis_support_handler(ticket, genesis_support_chat_observer.user_id);
end;
$$;

-- A report's status as a conversation status.
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
           when 'addressed' then 'solved'
           when 'wont_fix' then 'closed'
         end
$$;

-- A conversation status as a report status, keeping `current` when it already maps there
-- (open covers open and submitted).
create or replace function private.genesis_support_report_status(chat_status text, current_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when private.genesis_support_chat_status(current_status) is not distinct from chat_status then current_status
           else coalesce(case chat_status
                           when 'open' then 'open'
                           when 'pending' then 'in_progress'
                           when 'solved' then 'addressed'
                           when 'closed' then 'wont_fix'
                         end, current_status)
         end
$$;

-- The conversation's title: the report's, or the first line of its message.
create or replace function private.genesis_support_chat_title(title text, message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(title), ''), nullif(btrim(split_part(btrim(message), E'\n', 1)), ''), 'Support'), 120)
$$;

-- A report's conversation, or null.
create or replace function private.genesis_support_chat_conversation_of(report uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from genesis_chat.conversations c
   where c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = report::text
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

-- The kind --------------------------------------------------------------------------------

-- One member (the person who reported), staff as observers who post, no threads, and only
-- the database adds members.
select genesis_chat.register_kind('support', 'Support',
  p_max_members => 2,
  p_membership => 'app',
  p_threads => false,
  p_observer_check => 'private.genesis_support_chat_observer(uuid, uuid)',
  p_observers_post => true);

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

-- Reports -> conversations --------------------------------------------------------------

create or replace function private.genesis_support_chat_report_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.genesis_support_chat_ensure(new);
  return null;
end;
$$;

drop trigger if exists genesis_support_chat_report_added on public.tickets;
create trigger genesis_support_chat_report_added
  after insert on public.tickets
  for each row execute function private.genesis_support_chat_report_added();

-- Status and title go to the conversation; the person's read time to their place in it.
create or replace function private.genesis_support_chat_report_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid := private.genesis_support_chat_conversation_of(new.id);
  latest bigint;
begin
  if conv is null then
    return null;
  end if;
  if new.status is distinct from old.status or new.title is distinct from old.title or new.message is distinct from old.message then
    update genesis_chat.conversations
       set status = private.genesis_support_chat_status(new.status),
           title = private.genesis_support_chat_title(new.title, new.message)
     where id = conv
       and (status is distinct from private.genesis_support_chat_status(new.status)
            or title is distinct from private.genesis_support_chat_title(new.title, new.message));
    if found then
      perform genesis_chat.broadcast('genesis-chat:conv:' || conv, 'conversation', jsonb_build_object('conversation_id', conv));
    end if;
  end if;
  if new.user_read_at is not null and new.user_read_at is distinct from old.user_read_at then
    select coalesce(max(m.seq), 0) into latest from genesis_chat.messages m
     where m.conversation_id = conv and m.created_at <= new.user_read_at;
    update genesis_chat.members set last_read_seq = latest
     where conversation_id = conv and user_id = new.user_id and last_read_seq < latest;
  end if;
  return null;
end;
$$;

drop trigger if exists genesis_support_chat_report_changed on public.tickets;
create trigger genesis_support_chat_report_changed
  after update on public.tickets
  for each row execute function private.genesis_support_chat_report_changed();

create or replace function private.genesis_support_chat_report_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from genesis_chat.conversations c
   where c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = old.id::text;
  return null;
end;
$$;

drop trigger if exists genesis_support_chat_report_deleted on public.tickets;
create trigger genesis_support_chat_report_deleted
  after delete on public.tickets
  for each row execute function private.genesis_support_chat_report_deleted();

-- Conversations -> reports ----------------------------------------------------------------

-- Only a handler of the ticket (an agent of its tenant) is assigned it; the assignee is pushed
-- every message.
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

drop trigger if exists genesis_support_chat_assignee_check on genesis_chat.conversations;
create trigger genesis_support_chat_assignee_check
  before insert or update of assignee_id on genesis_chat.conversations
  for each row when (new.kind = 'support' and new.assignee_id is not null)
  execute function private.genesis_support_chat_assignee_check();

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

drop trigger if exists genesis_support_chat_status_changed on genesis_chat.conversations;
create trigger genesis_support_chat_status_changed
  after update of status on genesis_chat.conversations
  for each row when (new.kind = 'support' and new.subject_type = 'support_report'
                     and new.status is not null and new.status is distinct from old.status)
  execute function private.genesis_support_chat_status_changed();

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

drop trigger if exists genesis_support_chat_message_posted on genesis_chat.messages;
create trigger genesis_support_chat_message_posted
  after insert on genesis_chat.messages
  for each row execute function private.genesis_support_chat_message_posted();

-- The mirror, for one release: an edit or a delete in chat reaches support_replies.
create or replace function private.genesis_support_chat_message_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.support_replies') is null then
    return null;
  end if;
  if new.deleted_at is not null then
    delete from public.support_replies where chat_message_id = new.id;
  elsif btrim(new.body) <> '' then
    update public.support_replies set body = left(btrim(new.body), 10000)
     where chat_message_id = new.id and body is distinct from left(btrim(new.body), 10000);
  end if;
  return null;
end;
$$;

drop trigger if exists genesis_support_chat_message_changed on genesis_chat.messages;
create trigger genesis_support_chat_message_changed
  after update of body, deleted_at on genesis_chat.messages
  for each row when (new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at)
  execute function private.genesis_support_chat_message_changed();

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

drop trigger if exists genesis_support_chat_read on genesis_chat.members;
create trigger genesis_support_chat_read
  after insert or update of last_read_seq on genesis_chat.members
  for each row execute function private.genesis_support_chat_read();

-- support_replies -> chat (the mirror, for one release) --------------------------------

-- Which chat message a reply is (or came from). Not readable by people.
alter table public.support_replies
  add column if not exists chat_message_id uuid unique references genesis_chat.messages (id) on delete set null;

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

drop trigger if exists genesis_support_chat_reply_added on public.support_replies;
create trigger genesis_support_chat_reply_added
  after insert on public.support_replies
  for each row when (new.chat_message_id is null)
  execute function private.genesis_support_chat_reply_added();

-- For people ----------------------------------------------------------------------------

-- A report's conversation, for its person or staff (null for anyone else, or none). Also
-- how a client learns this block is installed.
create or replace function public.support_chat_conversation(report uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id from genesis_chat.conversations c
   where c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = report::text
$$;

comment on function public.support_chat_conversation(uuid) is
  'The genesis_chat conversation of a support report, if the caller may read it. Genesis support on chat.';

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

comment on function public.support_assign_report(uuid, uuid) is
  'Staff set who has a report (a staff member, who is pushed its messages, or null). Genesis support on chat.';

-- Existing reports and replies ------------------------------------------------------------

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

comment on function private.genesis_support_chat_backfill() is
  'Gives every support report its chat conversation and copies support_replies into it, adding only what is missing. Genesis support on chat.';

-- A ticket's tenant for genesis-chat 0004: chat finds this by its name (and 0006 registers it),
-- so a ticket's conversation takes the ticket's tenant whichever of the two migrations runs first.
-- Defined here because this block's backfill below already needs it under chat 0004.
create or replace function private.genesis_chat_resolve_support_report(subject_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.tenant_id from public.tickets t
   where t.id = case when subject_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                     then subject_id::uuid end
$$;

revoke execute on function private.genesis_chat_resolve_support_report(text) from public, anon, authenticated;

-- An app that applied genesis-chat 0004 before support's tickets had tenants: chat placed the
-- existing support conversations by their members (the reporter's tenant). Put each one in its
-- ticket's tenant before the backfill below meets it.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'genesis_chat' and table_name = 'conversations' and column_name = 'tenant_id') then
    execute $q$
      update genesis_chat.conversations c
         set tenant_id = private.genesis_chat_resolve_support_report(c.subject_id)
       where c.kind = 'support' and c.subject_type = 'support_report'
         and private.genesis_chat_resolve_support_report(c.subject_id) is not null
         and c.tenant_id is distinct from private.genesis_chat_resolve_support_report(c.subject_id)$q$;
  end if;
end;
$$;

select private.genesis_support_chat_backfill();

-- Privileges by name ------------------------------------------------------------------------

revoke execute on function public.support_chat_conversation(uuid) from public, anon;
grant execute on function public.support_chat_conversation(uuid) to authenticated, service_role;
revoke execute on function public.support_assign_report(uuid, uuid) from public, anon;
grant execute on function public.support_assign_report(uuid, uuid) to authenticated;

revoke execute on function private.genesis_support_chat_is_staff(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_observer(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_status(text) from public, anon, authenticated;
revoke execute on function private.genesis_support_report_status(text, text) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_title(text, text) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_conversation_of(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_report_of(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_ensure(public.tickets) from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_report_added() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_report_changed() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_report_deleted() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_assignee_check() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_status_changed() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_message_posted() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_message_changed() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_read() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_reply_added() from public, anon, authenticated;
revoke execute on function private.genesis_support_chat_backfill() from public, anon, authenticated;
