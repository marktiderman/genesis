-- @feat:support-feedback
-- Genesis support 0004: tickets, and tenancy (after 0006_genesis_support.sql and 0003).
--
-- A support report becomes a ticket, and every ticket belongs to a tenant, so each business on
-- the app can run its own help desk while the app runs its own support the same way.
--
--   1. public.support_reports is renamed public.tickets, and public.support_attachments
--      public.ticket_attachments. For one minor the old names stay as views over the new tables
--      (security_invoker, same column grants), so installed clients, the intake function and
--      app SQL keep working. Foreign-key columns keep `report_id` for now.
--   2. tickets.tenant_id and support_ideas.tenant_id: the tenant is whatever the app's
--      private.genesis_viewer_people hook returns (0016): one fixed id in a single-tenant app,
--      one per organization in a multi-tenant one. New rows get it from the value sent (checked),
--      else the viewer's only tenant, else the app's default tenant. Existing rows are filled in
--      from the app's optional private.genesis_support_tenant_for(report) hook, else the default.
--   3. Agents: public.ticket_agents (tenant, person). An agent of a tenant, a tenant admin, or,
--      in the default tenant only, whoever the app's staff hook names, handles that tenant's
--      tickets. Platform staff therefore see the app's own tickets and no one else's.
--   4. Reading and handling stay two checks: a ticket's requester reads it but never handles it.
--
-- Your app answers through these hooks (Genesis never defines them):
--
--   private.genesis_support_default_tenant() returns uuid                   (required)
--     The app's own tenant: where its own support lives, and where a ticket goes when the
--     sender's tenant isn't known. A single-tenant app returns its one tenant id.
--   private.genesis_support_tenant_for(report uuid) returns uuid           (optional)
--     For existing rows only: which tenant an old report belongs to.
--   private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
--     From 0016_genesis_viewer_people.sql: the tenants and person records a login has.
--   private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean  (optional, 0004)
--     Tenant admins handle tickets and manage agents.
--
-- With rows already stored and no default tenant hook, this migration stops and says so.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0004_genesis_support_tickets.test.sql`).

create schema if not exists private;

-- 1. Rename ------------------------------------------------------------------------------

alter table public.support_reports rename to tickets;
alter table public.support_attachments rename to ticket_attachments;

comment on table public.tickets is
  'Support tickets: a request from a person, with the app''s context, in a tenant. Genesis support.';
comment on table public.ticket_attachments is
  'Screenshots on a ticket, in the private genesis-support bucket. Genesis support.';

-- 2. Tenant hooks -------------------------------------------------------------------------

-- The app's default tenant, or null without the hook. Fails closed on a hook that errors.
create or replace function private.genesis_support_default_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('private.genesis_support_default_tenant()') is null then
    return null;
  end if;
  return private.genesis_support_default_tenant();
exception when others then
  return null;
end;
$$;

-- The tenants a login belongs to, from the app's viewer-people hook (0016). Empty without it.
create or replace function private.genesis_support_tenants_of(person uuid)
returns table (tenant_id uuid, person_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if person is null or to_regprocedure('private.genesis_viewer_people(uuid)') is null then
    return;
  end if;
  return query
    select distinct v.tenant_id, v.person_id
      from private.genesis_viewer_people(person) v
     where v.tenant_id is not null;
exception when others then
  return;
end;
$$;

-- Is this login a tenant admin there (0004's hook)? False without it.
create or replace function private.genesis_support_tenant_admin(tenant uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or person is null or to_regprocedure('private.genesis_tenant_admin(uuid,uuid)') is null then
    return false;
  end if;
  return coalesce(private.genesis_tenant_admin(tenant, person), false);
exception when others then
  return false;
end;
$$;

-- Is this login named by the app's staff hook (0006)? False without it.
create or replace function private.genesis_support_staff_hook(person uuid)
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

-- 3. Agents -------------------------------------------------------------------------------

create table public.ticket_agents (
  tenant_id uuid not null,
  person_id uuid not null,
  role text not null default 'agent',
    constraint ticket_agents_role check (role in ('agent', 'admin')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, person_id)
);

comment on table public.ticket_agents is
  'Who handles a tenant''s tickets, by the tenant''s person record. Written only through support_set_agent. Genesis support.';

alter table public.ticket_agents enable row level security;

-- Does this login handle tickets in this tenant? An agent row for one of the login's person
-- records there, a tenant admin, or, in the default tenant, the app's staff hook.
create or replace function private.genesis_support_agent(tenant uuid, person uuid)
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
  if exists (select 1 from public.ticket_agents a
              join private.genesis_support_tenants_of(person) v
                on v.tenant_id = a.tenant_id and v.person_id = a.person_id
             where a.tenant_id = tenant) then
    return true;
  end if;
  if private.genesis_support_tenant_admin(tenant, person) then
    return true;
  end if;
  return tenant = private.genesis_support_default_tenant_id()
     and private.genesis_support_staff_hook(person);
end;
$$;

-- The signed-in person, for policies and the client.
create or replace function public.support_is_agent(tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_support_agent(tenant, auth.uid())
$$;

comment on function public.support_is_agent(uuid) is
  'Whether the signed-in person handles tickets in this tenant. Genesis support.';

-- Staff now means: an agent of the app's own tenant. Kept for callers of 0006.
create or replace function public.support_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.genesis_support_agent(private.genesis_support_default_tenant_id(), auth.uid())
$$;

comment on function public.support_is_staff() is
  'True when the signed-in person handles the app''s own tickets (its default tenant). Genesis support.';

-- Add, change or remove an agent (role null removes). Tenant admins and the tenant's agent
-- admins may; in the default tenant, staff too. The person must be in the tenant.
create or replace function public.support_set_agent(tenant uuid, person uuid, role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or tenant is null or person is null then
    raise exception 'support_set_agent: not allowed' using errcode = '42501';
  end if;
  if not (
    private.genesis_support_tenant_admin(tenant, me)
    or exists (select 1 from public.ticket_agents a
                join private.genesis_support_tenants_of(me) v
                  on v.tenant_id = a.tenant_id and v.person_id = a.person_id
               where a.tenant_id = tenant and a.role = 'admin')
    or (tenant = private.genesis_support_default_tenant_id() and private.genesis_support_staff_hook(me))
  ) then
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

comment on function public.support_set_agent(uuid, uuid, text) is
  'Makes a tenant''s person an agent or agent admin, or removes them (role null). Genesis support.';

create policy ticket_agents_read on public.ticket_agents
  for select to authenticated
  using ((select public.support_is_agent(tenant_id)));

-- 4. Tenant columns -----------------------------------------------------------------------

alter table public.tickets add column tenant_id uuid;
alter table public.support_ideas add column tenant_id uuid;

create index tickets_tenant_idx on public.tickets (tenant_id, updated_at desc);
create index support_ideas_tenant_idx on public.support_ideas (tenant_id, status);

-- A new ticket's tenant: the one sent (if the sender is in it, or it is the default), else the
-- sender's only tenant, else the default. Server code (no sender) keeps what it sends, or the
-- default. The help desk must be on in that tenant (0004's switch, when installed).
create or replace function private.genesis_support_ticket_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dflt uuid := private.genesis_support_default_tenant_id();
  only_tenant uuid;
begin
  if new.tenant_id is null and me is not null then
    select min(v.tenant_id::text)::uuid into only_tenant
      from private.genesis_support_tenants_of(me) v
    having count(distinct v.tenant_id) = 1;
    new.tenant_id := only_tenant;
  end if;
  new.tenant_id := coalesce(new.tenant_id, dflt);
  if new.tenant_id is null then
    raise exception 'support: no tenant (the app defines private.genesis_support_default_tenant)'
      using errcode = '23502';
  end if;
  if me is not null and new.tenant_id is distinct from dflt then
    if not exists (select 1 from private.genesis_support_tenants_of(me) v where v.tenant_id = new.tenant_id) then
      raise exception 'support: not your tenant' using errcode = '42501';
    end if;
    if to_regprocedure('private.tenant_feature_on(uuid,text)') is not null
       and not private.tenant_feature_on(new.tenant_id, 'support-helpdesk') then
      raise exception 'support: the help desk is off here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_ticket_tenant() from public, anon, authenticated;

create trigger genesis_support_ticket_tenant
  before insert on public.tickets
  for each row execute function private.genesis_support_ticket_tenant();

create trigger genesis_support_ticket_tenant
  before insert on public.support_ideas
  for each row execute function private.genesis_support_ticket_tenant();

-- A ticket or idea never changes tenant.
create or replace function private.genesis_support_tenant_fixed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id and old.tenant_id is not null then
    raise exception 'support: a ticket keeps its tenant' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_tenant_fixed() from public, anon, authenticated;

create trigger genesis_support_tenant_fixed
  before update of tenant_id on public.tickets
  for each row execute function private.genesis_support_tenant_fixed();

create trigger genesis_support_tenant_fixed
  before update of tenant_id on public.support_ideas
  for each row execute function private.genesis_support_tenant_fixed();

-- Existing rows: the app's mapping hook, else the default tenant.
do $$
declare
  dflt uuid := private.genesis_support_default_tenant_id();
  mapped boolean := to_regprocedure('private.genesis_support_tenant_for(uuid)') is not null;
begin
  if mapped then
    execute 'update public.tickets t set tenant_id = private.genesis_support_tenant_for(t.id) where t.tenant_id is null';
  end if;
  update public.tickets set tenant_id = dflt where tenant_id is null and dflt is not null;
  update public.support_ideas set tenant_id = dflt where tenant_id is null and dflt is not null;
  if exists (select 1 from public.tickets where tenant_id is null)
     or exists (select 1 from public.support_ideas where tenant_id is null) then
    raise exception 'genesis support 0004: existing tickets or ideas have no tenant. Define private.genesis_support_default_tenant() (and, to place old tickets elsewhere, private.genesis_support_tenant_for(uuid)) before this migration.';
  end if;
end;
$$;

-- Every row has a tenant from here on.
alter table public.tickets add constraint tickets_tenant_required check (tenant_id is not null) not valid;
alter table public.tickets validate constraint tickets_tenant_required;
alter table public.support_ideas add constraint support_ideas_tenant_required check (tenant_id is not null) not valid;
alter table public.support_ideas validate constraint support_ideas_tenant_required;

-- 5. Handling: an agent of the ticket's tenant, or whom the app's hook names ---------------

-- The report hook (0003) answers only for tickets in a tenant the person belongs to, or the
-- default tenant: an app's hook can't hand one business's tickets to someone outside it.
create or replace function private.genesis_support_handler(report uuid, person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tenant uuid;
begin
  if person is null or report is null then
    return false;
  end if;
  select t.tenant_id into tenant from public.tickets t where t.id = report;
  if tenant is null then
    return false;
  end if;
  if private.genesis_support_agent(tenant, person) then
    return true;
  end if;
  if to_regprocedure('private.genesis_support_report_handler(uuid, uuid)') is null then
    return false;
  end if;
  if tenant is distinct from private.genesis_support_default_tenant_id()
     and not exists (select 1 from private.genesis_support_tenants_of(person) v where v.tenant_id = tenant) then
    return false;
  end if;
  return coalesce(private.genesis_support_report_handler(report, person), false);
end;
$$;

revoke execute on function private.genesis_support_handler(uuid, uuid) from public, anon, authenticated;

-- Reading: the requester, or a handler. No app-wide staff bypass.
drop policy if exists support_reports_read on public.tickets;
create policy support_reports_read on public.tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.support_handles(id));

drop policy if exists support_attachments_read on public.ticket_attachments;
create policy support_attachments_read on public.ticket_attachments
  for select to authenticated
  using (user_id = (select auth.uid()) or public.support_handles(report_id));

drop policy if exists support_replies_read on public.support_replies;
create policy support_replies_read on public.support_replies
  for select to authenticated
  using (
    public.support_handles(report_id)
    or exists (select 1 from public.tickets r where r.id = report_id and r.user_id = (select auth.uid()))
  );
drop policy if exists support_replies_send on public.support_replies;
create policy support_replies_send on public.support_replies
  for insert to authenticated
  with check (
    public.support_handles(report_id)
    or exists (select 1 from public.tickets r where r.id = report_id and r.user_id = (select auth.uid()))
  );

-- Is this the app's own tenant, or one the signed-in person belongs to?
create or replace function public.support_in_tenant(tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and tenant is not null and (
    tenant = private.genesis_support_default_tenant_id()
    or exists (select 1 from private.genesis_support_tenants_of(auth.uid()) v where v.tenant_id = tenant)
  )
$$;

comment on function public.support_in_tenant(uuid) is
  'Whether a tenant is the app''s own or one the signed-in person belongs to. Genesis support.';

-- Ideas: the app's own board is read by everyone signed in, as before; a business's board by
-- its members; hidden ideas by their author and the tenant's agents.
drop policy if exists support_ideas_read on public.support_ideas;
create policy support_ideas_read on public.support_ideas
  for select to authenticated
  using (
    (status <> 'hidden' and public.support_in_tenant(tenant_id))
    or author_id = (select auth.uid())
    or (select public.support_is_agent(tenant_id))
  );

-- Screenshots: the requester's own while attached (or within an hour of uploading), or a
-- handler of the ticket the attachment belongs to.
create or replace function public.support_can_read(object_name text, uploaded_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.ticket_attachments a
             where a.path = object_name
               and (split_part(object_name, '/', 1) = auth.uid()::text
                    or private.genesis_support_handler(a.report_id, auth.uid())))
    or (split_part(object_name, '/', 1) = auth.uid()::text and uploaded_at > now() - interval '1 hour')
  )
$$;

comment on function public.support_can_read(text, timestamptz) is
  'Whether the signed-in person may read this support screenshot (their own, or as a handler of its ticket). Genesis support.';

-- Marking a thread read: the requester, or a handler.
create or replace function public.support_mark_read(report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  exists_ticket boolean;
begin
  select r.user_id, true into owner, exists_ticket from public.tickets r where r.id = report;
  if me is null or exists_ticket is null then
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
  if owner = me then
    update public.tickets set user_read_at = clock_timestamp() where id = report;
  elsif private.genesis_support_handler(report, me) then
    update public.tickets set staff_read_at = clock_timestamp() where id = report;
  else
    raise exception 'support_mark_read: no such report' using errcode = '42501';
  end if;
end;
$$;

comment on function public.support_mark_read(uuid) is
  'Marks a ticket''s thread read for its requester, or for a handler. Genesis support.';

-- Idea status: the idea's tenant's agents.
create or replace function public.support_set_idea_status(idea uuid, status text, feature text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant uuid;
begin
  select i.tenant_id into tenant from public.support_ideas i where i.id = idea;
  if tenant is null or not private.genesis_support_agent(tenant, auth.uid()) then
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

-- Replies (0003's rule, on the renamed table): a handler writes as support on someone else's
-- ticket; server code only on an email ticket (support-email).
create or replace function private.genesis_support_new_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  report public.tickets;
  handles boolean;
begin
  select * into report from public.tickets r where r.id = new.report_id;
  if report.id is null then
    raise exception 'support: not your report' using errcode = '42501';
  end if;
  if me is null then
    if coalesce(to_jsonb(report) ->> 'channel', '') <> 'email' then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := null;
    new.created_at := clock_timestamp();
    return new;
  end if;
  handles := private.genesis_support_handler(new.report_id, me);
  if report.user_id is null then
    if not handles then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    new.from_staff := true;
  else
    if report.user_id <> me and not handles then
      raise exception 'support: not your report' using errcode = '42501';
    end if;
    new.author_id := me;
    new.from_staff := handles and report.user_id <> me;
  end if;
  new.created_at := clock_timestamp();
  if new.prompt is null then
    perform private.genesis_support_rate_limit(me, 'reply', 60, interval '1 hour');
  end if;
  return new;
end;
$$;

revoke execute on function private.genesis_support_new_reply() from public, anon, authenticated;

-- 6. Grants -------------------------------------------------------------------------------

-- A sender may name the tenant (checked by the trigger above).
grant insert (tenant_id) on table public.tickets to authenticated;
grant insert (tenant_id) on table public.support_ideas to authenticated;

revoke all on table public.ticket_agents from public, anon, authenticated;
grant select on table public.ticket_agents to authenticated;
grant select, insert, update, delete on table public.ticket_agents to service_role;

revoke execute on function private.genesis_support_default_tenant_id() from public, anon, authenticated;
revoke execute on function private.genesis_support_tenants_of(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_tenant_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_staff_hook(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_agent(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.support_is_agent(uuid) from public, anon;
grant execute on function public.support_is_agent(uuid) to authenticated, service_role;
revoke execute on function public.support_set_agent(uuid, uuid, text) from public, anon;
grant execute on function public.support_set_agent(uuid, uuid, text) to authenticated;
revoke execute on function public.support_is_staff() from public, anon;
grant execute on function public.support_is_staff() to authenticated, service_role;

revoke execute on function public.support_in_tenant(uuid) from public, anon;
grant execute on function public.support_in_tenant(uuid) to authenticated, service_role;
grant select (tenant_id) on table public.support_ideas to authenticated;

-- 7. The old names, for one minor ----------------------------------------------------------

create view public.support_reports with (security_invoker = true) as select * from public.tickets;
create view public.support_attachments with (security_invoker = true) as select * from public.ticket_attachments;

comment on view public.support_reports is
  'Deprecated: public.tickets under its old name, for one minor. Genesis support.';
comment on view public.support_attachments is
  'Deprecated: public.ticket_attachments under its old name, for one minor. Genesis support.';

revoke all on public.support_reports from public, anon, authenticated;
grant select, delete on public.support_reports to authenticated;
grant insert (type, title, message, route, app_version, platform, device, context, severity, tenant_id)
  on public.support_reports to authenticated;
grant update (type, title, message) on public.support_reports to authenticated;
grant select, insert, update, delete on public.support_reports to service_role;

revoke all on public.support_attachments from public, anon, authenticated;
grant select on public.support_attachments to authenticated;
grant insert (report_id, path, content_type, byte_size, width, height)
  on public.support_attachments to authenticated;
grant select, insert, update, delete on public.support_attachments to service_role;
