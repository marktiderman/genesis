-- Genesis support: feedback reports, screenshots, staff replies, an idea board and votes
--
-- The server half of the support block (`@marktiderman/genesis-support`), in the app's
-- own Supabase:
--
--   public.support_reports      what a person sends (a bug, an idea, a question or praise)
--                               with the context the app collected (version signature,
--                               route, device), a status and an optional FeatureId
--   public.support_attachments  a report's screenshots, kept in the private
--                               `genesis-support` storage bucket under <user id>/<report id>/
--   public.support_replies      the conversation on a report, between the person and staff
--   public.support_ideas        the idea board: anyone signed in suggests and reads, staff
--                               set the status (shipped links the FeatureId that delivered it)
--   public.support_idea_votes   one vote per person per idea
--   public.support_attachment_purges
--                               storage objects to remove after their attachment row went
--                               (a deleted report or account); the genesis-support-cleanup
--                               function removes them through the Storage API
--
-- Access, enforced here by row level security and column privileges:
--   - A person sees, edits (while it is open) and deletes their own reports, replies on
--     them and sees their own screenshots. Nobody else does, except staff.
--   - Every signed-in person reads the idea board. A person edits their own idea while it
--     is open. Votes: one per person and idea, and a person sees only their own; the count
--     is on the idea, kept by a trigger. Supabase anonymous sign-ins (`is_anonymous`) may
--     report but never vote or suggest, so minting throwaway logins can't stuff the board.
--   - Staff read every report and screenshot, reply, set statuses and hide ideas. Beyond
--     reading and replying, staff act only through the functions below.
--   - anon (no session) reaches nothing.
--
-- The app hook, like the tenant-admin hook in 0004: staff are whoever
-- `private.genesis_support_staff(person uuid) returns boolean` says. Without it nobody is
-- staff, so a fresh install fails closed. It runs with this file's (the owner's) rights,
-- so it reads your membership table whatever its RLS:
--
--   create function private.genesis_support_staff(person uuid) returns boolean
--   language sql stable set search_path = '' as $$
--     select exists (select 1 from public.staff s where s.user_id = person)
--   $$;
--   revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;
--
-- Limits (each raises SQLSTATE GS429): 20 reports and 60 replies per person per hour,
-- 10 ideas per person per day, 5 screenshots per report. They count what was sent, in a log
-- deleting doesn't touch, under a per-person lock, so deleting and sending again doesn't reset
-- them. Text and jsonb are capped by checks.
--
-- The bucket stays private whatever other storage policies the app has: restrictive policies
-- hold every role but the service role to this file's rules inside `genesis-support`.
--
-- Account deletion (0001): every row here goes with the login (reports, the replies on
-- them, screenshots and votes cascade; ideas and replies on other people's reports keep
-- their text without the person). A deleted screenshot's storage object is queued in
-- support_attachment_purges, because Supabase refuses direct deletes from storage.objects.
-- Supabase documents that a login owning Storage objects can't be deleted (see 0001): where
-- that holds, delete the person's reports first (their screenshots are queued) and run the
-- cleanup function, then delete the account. Not verified against a hosted project.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped
-- name. Never edit it once applied; change it with a new migration. It stands alone (it
-- doesn't need 0001 to 0005).
--
-- Verify: the pgTAP test beside this file (`tests/0006_genesis_support.test.sql`).

create schema if not exists private;

-- Helpers -----------------------------------------------------------------------------

-- Is the signed-in person staff? Missing hook, nobody signed in, or a null answer: false.
-- In public so policies can call it; it answers only about the caller.
create or replace function public.support_is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or to_regprocedure('private.genesis_support_staff(uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_support_staff(me), false);
end;
$$;

comment on function public.support_is_staff() is
  'True when the signed-in person is support staff (private.genesis_support_staff). Genesis support.';

-- Is the signed-in person a Supabase anonymous sign-in? Read from auth.users, not from the
-- JWT, so a custom access-token hook that drops the claim can't hide it. Answers only about the caller.
create or replace function public.support_is_anonymous()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), true)
$$;

comment on function public.support_is_anonymous() is
  'True when the signed-in person is a Supabase anonymous sign-in (or nobody). Genesis support.';

-- What each person sent, for the limits: kept when the report is deleted, gone with the login.
create table private.support_rate_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  at timestamptz not null default clock_timestamp()
);

create index support_rate_events_lookup on private.support_rate_events (user_id, kind, at desc);

-- Counts the person's sends of `kind` within `window_size`, refuses past `max_count`, then
-- records this one. A per-person lock makes parallel sends wait their turn.
create or replace function private.genesis_support_rate_limit(person uuid, kind text, max_count integer, window_size interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if person is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('genesis_support:' || person::text, 0));
  delete from private.support_rate_events e where e.user_id = person and e.at < clock_timestamp() - interval '2 days';
  if (select count(*) from private.support_rate_events e
      where e.user_id = person and e.kind = genesis_support_rate_limit.kind and e.at > clock_timestamp() - window_size) >= max_count then
    raise exception 'support: too many % sent; try again later', kind using errcode = 'GS429';
  end if;
  insert into private.support_rate_events (user_id, kind) values (person, kind);
end;
$$;

-- updated_at moves when what was said or decided changes, not when a thread is read or a
-- vote is counted.
create or replace function private.genesis_support_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'user_read_at', 'staff_read_at', 'last_user_reply_at', 'last_staff_reply_at', 'vote_count'])
     is distinct from (to_jsonb(old) - array['updated_at', 'user_read_at', 'staff_read_at', 'last_user_reply_at', 'last_staff_reply_at', 'vote_count']) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Reports -----------------------------------------------------------------------------

create table public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null default 'bug'
    constraint support_reports_type check (type in ('bug', 'idea', 'question', 'praise')),
  title text
    constraint support_reports_title_length check (char_length(title) <= 300),
  message text not null
    constraint support_reports_message_length check (char_length(btrim(message)) between 1 and 20000),
  -- The screen, as a path: never a query string or fragment (tokens, codes and emails live there).
  route text
    constraint support_reports_route_shape check (char_length(route) <= 2000 and route !~ '[?#]'),
  -- The version signature (`1.4.0 (37) · preview · 3f2a9c1b`).
  app_version text
    constraint support_reports_app_version_length check (char_length(app_version) <= 200),
  platform text
    constraint support_reports_platform_length check (char_length(platform) <= 40),
  device jsonb not null default '{}'::jsonb
    constraint support_reports_device_shape check (jsonb_typeof(device) = 'object' and pg_column_size(device) <= 4096),
  context jsonb not null default '{}'::jsonb
    constraint support_reports_context_shape check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 16384),
  status text not null default 'open'
    constraint support_reports_status check (status in ('open', 'submitted', 'in_progress', 'addressed', 'wont_fix')),
  -- The FeatureId (features.ts) the report is about, set by staff.
  feature_id text
    constraint support_reports_feature_id_format check (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100),
  last_user_reply_at timestamptz,
  last_staff_reply_at timestamptz,
  -- Read receipts: when the person, and when any staff member, last read the thread.
  user_read_at timestamptz,
  staff_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_reports_user on public.support_reports (user_id, created_at desc);
create index support_reports_status on public.support_reports (status, created_at desc);

comment on table public.support_reports is
  'Feedback a person sent from the app, with its context and status. Their own; staff read all. Genesis support.';

create trigger genesis_support_touch
  before update on public.support_reports
  for each row execute function private.genesis_support_touch();

-- A new report starts open, about no feature, with no replies, whatever was sent; a
-- person sends at most 20 an hour.
create or replace function private.genesis_support_new_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'open';
  new.feature_id := null;
  new.last_user_reply_at := null;
  new.last_staff_reply_at := null;
  new.user_read_at := null;
  new.staff_read_at := null;
  new.created_at := now();
  new.updated_at := now();
  perform private.genesis_support_rate_limit(new.user_id, 'report', 20, interval '1 hour');
  return new;
end;
$$;

create trigger genesis_support_new_report
  before insert on public.support_reports
  for each row execute function private.genesis_support_new_report();

-- Attachments -------------------------------------------------------------------------

create table public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.support_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bucket text not null default 'genesis-support'
    constraint support_attachments_bucket check (bucket = 'genesis-support'),
  -- <user id>/<report id>/<name>.<png|jpg|jpeg|webp>
  path text not null unique
    constraint support_attachments_path_shape check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(png|jpg|jpeg|webp)$'),
  content_type text not null
    constraint support_attachments_content_type check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer
    constraint support_attachments_byte_size check (byte_size between 1 and 5242880),
  width integer
    constraint support_attachments_width check (width between 1 and 10000),
  height integer
    constraint support_attachments_height check (height between 1 and 10000),
  created_at timestamptz not null default now()
);

create index support_attachments_report on public.support_attachments (report_id);
create index support_attachments_user on public.support_attachments (user_id);

comment on table public.support_attachments is
  'Screenshots of a report, in the private genesis-support bucket. Genesis support.';

-- An attachment names an object the person already uploaded under their own report's folder.
create or replace function private.genesis_support_new_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.bucket := 'genesis-support';
  new.created_at := now();
  if new.path is null or split_part(new.path, '/', 1) <> new.user_id::text or split_part(new.path, '/', 2) <> new.report_id::text then
    raise exception 'support: an attachment lives under <user id>/<report id>/' using errcode = '42501';
  end if;
  if not exists (select 1 from public.support_reports r where r.id = new.report_id and r.user_id = new.user_id) then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'genesis-support' and o.name = new.path) then
    raise exception 'support: upload the file before recording it' using errcode = '23503';
  end if;
  if (select count(*) from public.support_attachments a where a.report_id = new.report_id) >= 5 then
    raise exception 'support: at most 5 screenshots per report' using errcode = 'GS429';
  end if;
  return new;
end;
$$;

create trigger genesis_support_new_attachment
  before insert on public.support_attachments
  for each row execute function private.genesis_support_new_attachment();

-- Objects whose attachment row is gone, for the cleanup function (service role) to remove
-- through the Storage API. Nobody else reads it.
create table public.support_attachment_purges (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now()
);

comment on table public.support_attachment_purges is
  'Storage objects to remove after their support attachment was deleted. Service role only. Genesis support.';

create or replace function private.genesis_support_queue_purge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.support_attachment_purges (bucket, path) values (old.bucket, old.path);
  return null;
end;
$$;

create trigger genesis_support_queue_purge
  after delete on public.support_attachments
  for each row execute function private.genesis_support_queue_purge();

-- Replies -----------------------------------------------------------------------------

create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.support_reports (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  from_staff boolean not null default false,
  body text not null
    constraint support_replies_body_length check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index support_replies_report on public.support_replies (report_id, created_at);
create index support_replies_author on public.support_replies (author_id, created_at desc);

comment on table public.support_replies is
  'The conversation on a report, between the person and staff. Genesis support.';

-- Who wrote it, and whether as staff, come from the session, never from the request.
create or replace function private.genesis_support_new_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  staff boolean := public.support_is_staff();
begin
  select r.user_id into owner from public.support_reports r where r.id = new.report_id;
  if me is null or owner is null or (owner <> me and not staff) then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  new.author_id := me;
  -- On their own report a staff member writes as the person.
  new.from_staff := staff and owner <> me;
  new.created_at := clock_timestamp();
  perform private.genesis_support_rate_limit(me, 'reply', 60, interval '1 hour');
  return new;
end;
$$;

create trigger genesis_support_new_reply
  before insert on public.support_replies
  for each row execute function private.genesis_support_new_reply();

-- A reply moves the thread on: the writer's side has read it, the other side has something new.
create or replace function private.genesis_support_reply_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.from_staff then
    update public.support_reports
      set last_staff_reply_at = new.created_at, staff_read_at = new.created_at
      where id = new.report_id;
  else
    update public.support_reports
      set last_user_reply_at = new.created_at, user_read_at = new.created_at
      where id = new.report_id;
  end if;
  return null;
end;
$$;

create trigger genesis_support_reply_posted
  after insert on public.support_replies
  for each row execute function private.genesis_support_reply_posted();

-- Ideas and votes ---------------------------------------------------------------------

create table public.support_ideas (
  id uuid primary key default gen_random_uuid(),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null
    constraint support_ideas_title_length check (char_length(btrim(title)) between 3 and 140),
  body text
    constraint support_ideas_body_length check (char_length(body) <= 4000),
  -- hidden: taken off the board by staff (spam, a duplicate); its author and staff still see it.
  status text not null default 'open'
    constraint support_ideas_status check (status in ('open', 'planned', 'in_progress', 'shipped', 'declined', 'hidden')),
  -- The FeatureId (features.ts) that delivers it, set by staff.
  feature_id text
    constraint support_ideas_feature_id_format check (feature_id ~ '^[a-z][a-z0-9]*([-_.][a-z0-9]+)*$' and char_length(feature_id) <= 100),
  shipped_at timestamptz,
  vote_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_ideas_board on public.support_ideas (status, vote_count desc, created_at desc);
create index support_ideas_author on public.support_ideas (author_id, created_at desc);

comment on table public.support_ideas is
  'The idea board: ideas every signed-in person reads and votes on, with a status staff set. Genesis support.';

create trigger genesis_support_touch
  before update on public.support_ideas
  for each row execute function private.genesis_support_touch();

create or replace function private.genesis_support_new_idea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'open';
  new.feature_id := null;
  new.shipped_at := null;
  new.vote_count := 0;
  new.created_at := now();
  new.updated_at := now();
  perform private.genesis_support_rate_limit(new.author_id, 'idea', 10, interval '1 day');
  return new;
end;
$$;

create trigger genesis_support_new_idea
  before insert on public.support_ideas
  for each row execute function private.genesis_support_new_idea();

create table public.support_idea_votes (
  idea_id uuid not null references public.support_ideas (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index support_idea_votes_user on public.support_idea_votes (user_id, created_at desc);

comment on table public.support_idea_votes is
  'One vote per person per idea. A person sees only their own; the count is on the idea. Genesis support.';

create or replace function private.genesis_support_count_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.support_ideas set vote_count = vote_count + 1 where id = new.idea_id;
  else
    update public.support_ideas set vote_count = greatest(vote_count - 1, 0) where id = old.idea_id;
  end if;
  return null;
end;
$$;

create trigger genesis_support_count_vote
  after insert or delete on public.support_idea_votes
  for each row execute function private.genesis_support_count_vote();

-- Row level security ------------------------------------------------------------------

alter table public.support_reports enable row level security;
alter table public.support_attachments enable row level security;
alter table public.support_attachment_purges enable row level security;
alter table public.support_replies enable row level security;
alter table public.support_ideas enable row level security;
alter table public.support_idea_votes enable row level security;

create policy support_reports_read on public.support_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.support_is_staff()));
create policy support_reports_send on public.support_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- Only until staff pick it up or answer: nobody's reply ends up under words it didn't answer.
create policy support_reports_edit on public.support_reports
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'open' and last_staff_reply_at is null)
  with check (user_id = (select auth.uid()) and status = 'open' and last_staff_reply_at is null);
create policy support_reports_delete on public.support_reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy support_attachments_read on public.support_attachments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.support_is_staff()));
create policy support_attachments_add on public.support_attachments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy support_replies_read on public.support_replies
  for select to authenticated
  using (
    (select public.support_is_staff())
    or exists (select 1 from public.support_reports r where r.id = report_id and r.user_id = (select auth.uid()))
  );
create policy support_replies_send on public.support_replies
  for insert to authenticated
  with check (
    (select public.support_is_staff())
    or exists (select 1 from public.support_reports r where r.id = report_id and r.user_id = (select auth.uid()))
  );

create policy support_ideas_read on public.support_ideas
  for select to authenticated
  using (status <> 'hidden' or author_id = (select auth.uid()) or (select public.support_is_staff()));
create policy support_ideas_suggest on public.support_ideas
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not (select public.support_is_anonymous())
  );
-- Only until the first vote: nobody's vote moves to an idea they didn't vote for.
create policy support_ideas_edit on public.support_ideas
  for update to authenticated
  using (author_id = (select auth.uid()) and status = 'open' and vote_count = 0)
  with check (author_id = (select auth.uid()) and status = 'open' and vote_count = 0);

create policy support_idea_votes_read on public.support_idea_votes
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy support_idea_votes_cast on public.support_idea_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select public.support_is_anonymous())
    and exists (select 1 from public.support_ideas i where i.id = idea_id and i.status in ('open', 'planned', 'in_progress'))
  );
create policy support_idea_votes_withdraw on public.support_idea_votes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The storage bucket: private, images only, 5 MB each ---------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('genesis-support', 'genesis-support', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- May the signed-in person upload `object_name`? Only `<own id>/<own open report>/<name>.<image>`,
-- within an hour of sending the report, and at most 5 objects in its folder. A function, so the
-- policy can count the folder.
create or replace function public.support_can_upload(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  folder text;
begin
  if me is null or object_name is null
     or object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(png|jpg|jpeg|webp)$'
     or split_part(object_name, '/', 1) <> me::text then
    return false;
  end if;
  if not exists (select 1 from public.support_reports r
                 where r.id::text = split_part(object_name, '/', 2) and r.user_id = me and r.status = 'open'
                   and r.created_at > now() - interval '1 hour') then
    return false;
  end if;
  folder := split_part(object_name, '/', 1) || '/' || split_part(object_name, '/', 2) || '/';
  return (select count(*) from storage.objects o where o.bucket_id = 'genesis-support' and left(o.name, length(folder)) = folder) < 5;
end;
$$;

comment on function public.support_can_upload(text) is
  'Whether the signed-in person may upload this support screenshot path. Genesis support.';

-- May the signed-in person read `object_name`? Their own while it is attached (or within an
-- hour of uploading it, before the attachment row lands); staff, only while it is attached.
-- A deleted report's screenshots can't be opened again, before the cleanup removes them.
create or replace function public.support_can_read(object_name text, uploaded_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.support_attachments a where a.path = object_name)
      and (split_part(object_name, '/', 1) = auth.uid()::text or public.support_is_staff())
    or (split_part(object_name, '/', 1) = auth.uid()::text and uploaded_at > now() - interval '1 hour')
  )
$$;

comment on function public.support_can_read(text, timestamptz) is
  'Whether the signed-in person may read this support screenshot. Genesis support.';

-- Upload only into <your id>/<your open report>/; read your own, or any attached one as staff.
-- No update policy (nothing is overwritten or moved) and no delete policy (removal is the
-- cleanup function's, through the Storage API).
create policy genesis_support_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'genesis-support' and (select public.support_can_upload(name)));
create policy genesis_support_read on storage.objects
  for select to authenticated
  using (bucket_id = 'genesis-support' and public.support_can_read(name, created_at));

-- Restrictive: whatever permissive storage policies the app already has (a "read everything",
-- an "owners may update"), inside this bucket only the rules above hold, for every role but
-- the service role (which bypasses row level security).
create policy genesis_support_only_read on storage.objects
  as restrictive for select to public
  using (bucket_id <> 'genesis-support' or public.support_can_read(name, created_at));
create policy genesis_support_only_upload on storage.objects
  as restrictive for insert to public
  with check (bucket_id <> 'genesis-support' or (select public.support_can_upload(name)));
create policy genesis_support_no_update on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'genesis-support')
  with check (bucket_id <> 'genesis-support');
create policy genesis_support_no_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'genesis-support');

-- Functions ---------------------------------------------------------------------------

-- Reading a thread: the person (on their own report) or staff mark it read.
create or replace function public.support_mark_read(report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  select r.user_id into owner from public.support_reports r where r.id = report;
  if me is null or owner is null then
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
  if owner = me then
    update public.support_reports set user_read_at = clock_timestamp() where id = report;
  elsif public.support_is_staff() then
    update public.support_reports set staff_read_at = clock_timestamp() where id = report;
  else
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
end;
$$;

comment on function public.support_mark_read(uuid) is
  'Marks a report''s thread read for its person, or for staff. Genesis support.';

-- Staff: a report's status, and the FeatureId it is about (null keeps it, '' clears it).
create or replace function public.support_set_report_status(report uuid, status text, feature text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.support_is_staff() then
    raise exception 'support_set_report_status: only staff' using errcode = '42501';
  end if;
  update public.support_reports r
    set status = support_set_report_status.status,
        feature_id = case when feature = '' then null else coalesce(feature, r.feature_id) end
    where r.id = report;
  if not found then
    raise exception 'support_set_report_status: no such report' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.support_set_report_status(uuid, text, text) is
  'Staff set a report''s status and the FeatureId it is about. Genesis support.';

-- Staff: an idea's status (shipped stamps shipped_at), and the FeatureId that delivers it
-- (null keeps it, '' clears it).
create or replace function public.support_set_idea_status(idea uuid, status text, feature text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.support_is_staff() then
    raise exception 'support_set_idea_status: only staff' using errcode = '42501';
  end if;
  update public.support_ideas i
    set status = support_set_idea_status.status,
        feature_id = case when feature = '' then null else coalesce(feature, i.feature_id) end,
        shipped_at = case when support_set_idea_status.status = 'shipped' then coalesce(i.shipped_at, now()) end
    where i.id = idea;
  if not found then
    raise exception 'support_set_idea_status: no such idea' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.support_set_idea_status(uuid, text, text) is
  'Staff set an idea''s status (shipped stamps shipped_at) and the FeatureId that delivers it. Genesis support.';

-- "You asked, we shipped": shipped ideas the caller suggested or voted for, newest first.
create or replace function public.support_shipped_for_me(max_rows integer default 50)
returns table (id uuid, title text, body text, status text, feature_id text, shipped_at timestamptz, vote_count integer, created_at timestamptz, mine boolean, voted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.title, i.body, i.status, i.feature_id, i.shipped_at, i.vote_count, i.created_at,
         i.author_id = (select auth.uid()),
         exists (select 1 from public.support_idea_votes v where v.idea_id = i.id and v.user_id = (select auth.uid()))
  from public.support_ideas i
  where i.status = 'shipped'
    and (i.author_id = (select auth.uid())
         or exists (select 1 from public.support_idea_votes v where v.idea_id = i.id and v.user_id = (select auth.uid())))
  order by i.shipped_at desc nulls last, i.id
  limit greatest(1, least(coalesce(max_rows, 50), 200))
$$;

comment on function public.support_shipped_for_me(integer) is
  'Shipped ideas the caller suggested or voted for, with their FeatureIds. Genesis support.';

-- The ideas the caller suggested (who suggested an idea isn't readable by others).
create or replace function public.support_my_idea_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id from public.support_ideas i where i.author_id = (select auth.uid())
$$;

comment on function public.support_my_idea_ids() is
  'The ids of the ideas the caller suggested. Genesis support.';

-- For the cleanup function: objects in the bucket no attachment names, older than
-- `older_than` (an upload whose attachment row never landed). Service role only.
create or replace function public.support_orphan_objects(older_than interval default interval '1 day', max_rows integer default 500)
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'genesis-support'
    and o.created_at <= now() - older_than
    and not exists (select 1 from public.support_attachments a where a.path = o.name)
  order by o.created_at
  limit greatest(1, least(coalesce(max_rows, 500), 1000))
$$;

comment on function public.support_orphan_objects(interval, integer) is
  'Screenshots uploaded but never recorded, for the cleanup function. Service role only. Genesis support.';

-- Privileges by name ------------------------------------------------------------------
-- Supabase's default privileges give anon and authenticated everything on a new public
-- table and function, and Postgres gives every function to public: take them back, then
-- grant what's needed, column by column where a column is the server's to set.

revoke all on table public.support_reports from public, anon, authenticated;
grant select on table public.support_reports to authenticated;
grant insert (type, title, message, route, app_version, platform, device, context) on table public.support_reports to authenticated;
grant update (type, title, message) on table public.support_reports to authenticated;
grant delete on table public.support_reports to authenticated;

revoke all on table public.support_attachments from public, anon, authenticated;
grant select on table public.support_attachments to authenticated;
grant insert (report_id, path, content_type, byte_size, width, height) on table public.support_attachments to authenticated;

revoke all on table public.support_attachment_purges from public, anon, authenticated;
revoke all on sequence public.support_attachment_purges_id_seq from public, anon, authenticated;

revoke all on table public.support_replies from public, anon, authenticated;
-- Not author_id: a person never learns staff members' ids (from_staff says who wrote it).
grant select (id, report_id, from_staff, body, created_at) on table public.support_replies to authenticated;
grant insert (report_id, body) on table public.support_replies to authenticated;

revoke all on table public.support_ideas from public, anon, authenticated;
-- Not author_id: ideas aren't linked to who suggested them (support_my_idea_ids answers "mine").
grant select (id, title, body, status, feature_id, shipped_at, vote_count, created_at, updated_at) on table public.support_ideas to authenticated;
grant insert (title, body) on table public.support_ideas to authenticated;
grant update (title, body) on table public.support_ideas to authenticated;

revoke all on table public.support_idea_votes from public, anon, authenticated;
grant select on table public.support_idea_votes to authenticated;
grant insert (idea_id) on table public.support_idea_votes to authenticated;
grant delete on table public.support_idea_votes to authenticated;

-- The service role (server jobs: the cleanup and notify functions, a staff tool). No
-- truncate (it would skip the triggers), references or trigger.
revoke all on table public.support_reports from service_role;
grant select, insert, update, delete on table public.support_reports to service_role;
revoke all on table public.support_attachments from service_role;
grant select, insert, update, delete on table public.support_attachments to service_role;
revoke all on table public.support_attachment_purges from service_role;
grant select, delete on table public.support_attachment_purges to service_role;
revoke all on table public.support_replies from service_role;
grant select, insert, update, delete on table public.support_replies to service_role;
revoke all on table public.support_ideas from service_role;
grant select, insert, update, delete on table public.support_ideas to service_role;
revoke all on table public.support_idea_votes from service_role;
grant select, insert, delete on table public.support_idea_votes to service_role;

revoke execute on function public.support_is_staff() from public, anon;
grant execute on function public.support_is_staff() to authenticated, service_role;
revoke execute on function public.support_mark_read(uuid) from public, anon;
grant execute on function public.support_mark_read(uuid) to authenticated;
revoke execute on function public.support_set_report_status(uuid, text, text) from public, anon;
grant execute on function public.support_set_report_status(uuid, text, text) to authenticated;
revoke execute on function public.support_set_idea_status(uuid, text, text) from public, anon;
grant execute on function public.support_set_idea_status(uuid, text, text) to authenticated;
revoke execute on function public.support_shipped_for_me(integer) from public, anon;
grant execute on function public.support_shipped_for_me(integer) to authenticated;
revoke execute on function public.support_my_idea_ids() from public, anon;
grant execute on function public.support_my_idea_ids() to authenticated;
revoke execute on function public.support_is_anonymous() from public, anon;
grant execute on function public.support_is_anonymous() to authenticated;
-- The storage policies call these for every role they hold, anon included; each answers
-- false without a session.
revoke execute on function public.support_can_upload(text) from public;
grant execute on function public.support_can_upload(text) to anon, authenticated;
revoke execute on function public.support_can_read(text, timestamptz) from public;
grant execute on function public.support_can_read(text, timestamptz) to anon, authenticated;
revoke execute on function public.support_orphan_objects(interval, integer) from public, anon, authenticated;
grant execute on function public.support_orphan_objects(interval, integer) to service_role;

revoke all on table private.support_rate_events from public, anon, authenticated;

-- Only the triggers above call these.
revoke execute on function private.genesis_support_rate_limit(uuid, text, integer, interval) from public, anon, authenticated;
revoke execute on function private.genesis_support_touch() from public, anon, authenticated;
revoke execute on function private.genesis_support_new_report() from public, anon, authenticated;
revoke execute on function private.genesis_support_new_attachment() from public, anon, authenticated;
revoke execute on function private.genesis_support_queue_purge() from public, anon, authenticated;
revoke execute on function private.genesis_support_new_reply() from public, anon, authenticated;
revoke execute on function private.genesis_support_reply_posted() from public, anon, authenticated;
revoke execute on function private.genesis_support_new_idea() from public, anon, authenticated;
revoke execute on function private.genesis_support_count_vote() from public, anon, authenticated;
