-- @feat:support-feedback
-- Genesis support 0011: fixes to tickets (after 0004_genesis_support_tickets.sql).
--
--   1. The Data Studio's records of support rows follow the rename. 0004 renamed
--      public.support_reports to public.tickets and public.support_attachments to
--      public.ticket_attachments; the Data Studio (genesis-studio-server) still keyed its rows by
--      the old names, so a ticket's history and comments stopped at the rename.
--      private.genesis_support_rename_studio_keys() rewrites `resource` in genesis_studio.audit_log,
--      comments, outbox and outbox_dead_letter, and the `resource` inside the outbox's and dead
--      letter's `payload` (what a delivery sends downstream), only where those tables exist
--      (to_regclass), and returns how many rows moved. It runs once here; running it again changes nothing.
--   2. public.support_agent_unread_count(tenant) returns how many open tickets of a tenant hold a
--      message from the requester no agent has read: an agent's badge without reading the queue.
--      A null tenant means the app's own. Only an agent of the tenant may ask (42501 otherwise),
--      and an agent's own ticket isn't counted, as they can't handle it.
--
-- A notification for the verify prompt (0003: support_replies.prompt = 'verify') keys on that
-- column, never on the reply's words: the words are a sentence an app may translate or change.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0011_genesis_support_ticket_fixes.test.sql`).

create schema if not exists private;

-- 1. The Data Studio's keys --------------------------------------------------------------------

create or replace function private.genesis_support_rename_studio_keys()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer := 0;
  n integer;
  t text;
begin
  foreach t in array array['genesis_studio.audit_log', 'genesis_studio.comments', 'genesis_studio.outbox', 'genesis_studio.outbox_dead_letter'] loop
    if to_regclass(t) is null then
      continue;
    end if;
    execute format(
      'update %s set resource = case resource
                                  when ''public.support_reports'' then ''public.tickets''
                                  when ''support_reports'' then ''tickets''
                                  when ''public.support_attachments'' then ''public.ticket_attachments''
                                  when ''support_attachments'' then ''ticket_attachments''
                                end
        where resource in (''public.support_reports'', ''support_reports'', ''public.support_attachments'', ''support_attachments'')',
      t);
    get diagnostics n = row_count;
    moved := moved + n;
  end loop;
  -- What a delivery carries downstream names the resource too.
  foreach t in array array['genesis_studio.outbox', 'genesis_studio.outbox_dead_letter'] loop
    if to_regclass(t) is null then
      continue;
    end if;
    execute format(
      'update %s set payload = jsonb_set(payload, ''{resource}'', to_jsonb(case payload ->> ''resource''
                                  when ''public.support_reports'' then ''public.tickets''
                                  when ''support_reports'' then ''tickets''
                                  when ''public.support_attachments'' then ''public.ticket_attachments''
                                  when ''support_attachments'' then ''ticket_attachments''
                                end))
        where payload ->> ''resource'' in (''public.support_reports'', ''support_reports'', ''public.support_attachments'', ''support_attachments'')',
      t);
    get diagnostics n = row_count;
    moved := moved + n;
  end loop;
  return moved;
end;
$$;

comment on function private.genesis_support_rename_studio_keys() is
  'Moves the Data Studio''s audit and outbox rows from the old support table names to tickets and ticket_attachments. Genesis support.';
revoke execute on function private.genesis_support_rename_studio_keys() from public, anon, authenticated;

select private.genesis_support_rename_studio_keys();

-- 2. An agent's unread count -------------------------------------------------------------------

create or replace function public.support_agent_unread_count(tenant uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
begin
  if me is null or not private.genesis_support_agent(resolved, me) then
    raise exception 'support_agent_unread_count: only an agent of this tenant' using errcode = '42501';
  end if;
  return (
    select count(*)::integer
      from public.tickets t
     where t.tenant_id = resolved
       and t.user_id is distinct from me
       and t.status not in ('addressed', 'wont_fix')
       and (t.staff_read_at is null or coalesce(t.last_user_reply_at > t.staff_read_at, false))
  );
end;
$$;

comment on function public.support_agent_unread_count(uuid) is
  'How many open tickets of a tenant hold a requester''s message no agent has read, for its agents. Genesis support.';
revoke execute on function public.support_agent_unread_count(uuid) from public, anon;
grant execute on function public.support_agent_unread_count(uuid) to authenticated;
