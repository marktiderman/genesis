-- Genesis support on chat: a report's conversation runs on genesis-chat
--
-- The `support-chat` block of `@marktiderman/genesis-support`. It needs both halves it joins:
-- the support tables (`0006_genesis_support.sql` from `@marktiderman/genesis-supabase`) and
-- the genesis_chat schema (`0001_genesis_chat.sql` and `0002_genesis_chat_coaching.sql` from
-- `@marktiderman/genesis-chat`). Apply it after all three.
--
-- A report stays the record: its type, status, message, screenshots and device context live
-- in public.support_reports as before. Its conversation (the person and staff replies) moves
-- to a genesis_chat conversation of kind `support`, one per report:
--
--   - the person who sent the report is its only member;
--   - staff (whoever `private.genesis_support_staff` says) read and reply as observers, and
--     write internal notes (`visibility: 'observers'`) the person never sees;
--   - so a report's thread gets live updates, voice notes, photos and files, push, an
--     assignee (who is pushed every message) and internal notes, from genesis-chat.
--
-- Kept in step, by triggers here:
--
--   report inserted        its conversation is made and the person made its member
--   report status          the conversation's status follows it (open and submitted: open,
--                          in_progress: pending, addressed: solved, wont_fix: closed); a staff
--                          tool that sets the conversation's status (genesis_chat.set_status)
--                          changes the report's the same way. The report is the source.
--   report title, message  the conversation's title
--   a message              the report's last_user_reply_at or last_staff_reply_at, and the
--                          writer's side read (an internal note moves neither)
--   reading the thread     genesis_chat.mark_read moves the report's user_read_at (the person)
--                          or staff_read_at (staff); support_mark_read moves the person's
--                          place in the conversation; so `unread` keeps working
--   assignee               only staff are assigned (support_assign_report, or set_status)
--   report deleted         the conversation goes, with its messages; its files are queued for
--                          removal by genesis-chat's own rules (the `storage.remove` effect),
--                          screenshots by 0006's. Account deletion deletes the reports, so the
--                          conversations go with them.
--
-- support_replies, for one release: clients from before this block still read and write
-- public.support_replies, so both are mirrored. A reply written there becomes a chat message
-- (pushed like any other); a chat message (not an internal note) becomes a reply there, with
-- an edit or delete carried over. A message with only a file says so in the mirrored reply.
-- While the mirror runs, 0006's limit (60 replies per person per hour) holds every message,
-- since each passes through support_replies. The next release removes the mirror: a
-- migration that drops the two mirror triggers below, moves the reply limit onto
-- genesis_chat.messages, and then may drop public.support_replies.
--
-- Existing reports: every report gets its conversation, and every reply in
-- support_replies is copied in order (staff replies as observers, the person's as the
-- member, keeping created_at), with no push, no live hint and no link preview (the copy
-- asserts it queued no effect). private.genesis_support_chat_backfill() does it and can run
-- again: it adds only what is missing.
--
-- One thing changes for the person: a chat message carries its sender's id, so the person
-- can learn the user id of the staff member who answered (support_replies hid it). Name
-- staff as "Support" in the app's resolveUser if that matters.
--
-- Use: `genesis add support-chat` copies this file after the three it needs. Never edit it
-- once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0001_genesis_support_chat.test.sql`).

create schema if not exists private;

-- Helpers -----------------------------------------------------------------------------

-- Is this person support staff? The app's hook (0006), or nobody when it isn't there yet.
create or replace function private.genesis_support_chat_is_staff(person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if person is null or to_regprocedure('private.genesis_support_staff(uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_support_staff(person), false);
end;
$$;

-- The `support` kind's observer check: staff read (and, by the kind, post in) a report's
-- conversation without being in it.
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
  return private.genesis_support_chat_is_staff(genesis_support_chat_observer.user_id);
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
  return (select r.id from public.support_reports r where r.id = c.subject_id::uuid);
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
create or replace function private.genesis_support_chat_ensure(report public.support_reports)
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

create trigger genesis_support_chat_report_added
  after insert on public.support_reports
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

create trigger genesis_support_chat_report_changed
  after update on public.support_reports
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

create trigger genesis_support_chat_report_deleted
  after delete on public.support_reports
  for each row execute function private.genesis_support_chat_report_deleted();

-- Conversations -> reports ----------------------------------------------------------------

-- Only staff are assigned a report (the assignee is pushed every message).
create or replace function private.genesis_support_chat_assignee_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not private.genesis_support_chat_is_staff(new.assignee_id) then
    raise exception 'support: only staff are assigned a report' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  update public.support_reports r
     set status = private.genesis_support_report_status(new.status, r.status)
   where r.id = new.subject_id::uuid
     and private.genesis_support_chat_status(r.status) is distinct from new.status;
  return null;
end;
$$;

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
    update public.support_reports
       set last_staff_reply_at = greatest(coalesce(last_staff_reply_at, new.created_at), new.created_at),
           staff_read_at = greatest(coalesce(staff_read_at, new.created_at), new.created_at)
     where id = rid
       and (last_staff_reply_at is null or last_staff_reply_at < new.created_at
            or staff_read_at is null or staff_read_at < new.created_at);
  else
    update public.support_reports
       set last_user_reply_at = greatest(coalesce(last_user_reply_at, new.created_at), new.created_at),
           user_read_at = greatest(coalesce(user_read_at, new.created_at), new.created_at)
     where id = rid
       and (last_user_reply_at is null or last_user_reply_at < new.created_at
            or user_read_at is null or user_read_at < new.created_at);
  end if;
  return null;
end;
$$;

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
  report public.support_reports;
  latest bigint;
  read_at timestamptz;
begin
  if new.last_read_seq <= 0 or (tg_op = 'UPDATE' and new.last_read_seq <= old.last_read_seq) then
    return null;
  end if;
  select * into report from public.support_reports r where r.id = private.genesis_support_chat_report_of(new.conversation_id);
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
    update public.support_reports set user_read_at = read_at
     where id = report.id and (user_read_at is null or user_read_at < read_at);
  elsif new.role = 'observer' then
    update public.support_reports set staff_read_at = read_at
     where id = report.id and (staff_read_at is null or staff_read_at < read_at);
  end if;
  return null;
end;
$$;

create trigger genesis_support_chat_read
  after insert or update of last_read_seq on genesis_chat.members
  for each row execute function private.genesis_support_chat_read();

-- support_replies -> chat (the mirror, for one release) --------------------------------

-- Which chat message a reply is (or came from). Not readable by people.
alter table public.support_replies
  add column chat_message_id uuid unique references genesis_chat.messages (id) on delete set null;

-- A reply written by an older client (0006 has checked who wrote it and counted it) becomes
-- a message in the report's conversation, as the person or as staff (an observer).
create or replace function private.genesis_support_chat_reply_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.support_reports;
  conv uuid;
  msg uuid;
begin
  select * into report from public.support_reports where id = new.report_id;
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
  if not public.support_is_staff() then
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
  report public.support_reports;
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

  for report in select * from public.support_reports order by created_at, id loop
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
            from public.support_reports r
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
revoke execute on function private.genesis_support_chat_ensure(public.support_reports) from public, anon, authenticated;
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
