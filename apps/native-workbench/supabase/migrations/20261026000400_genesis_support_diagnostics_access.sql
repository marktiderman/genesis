-- @feat:support-feedback
-- Genesis support 0026: who reads a dump follows its ticket (after 0019_genesis_support_diagnostics.sql and 0023).
--
-- 0019 let support staff (public.support_is_staff(): the app's own tenant's agents, and since 0023
-- its platform admins when the app names no staff) read every dump, including one sent with a
-- ticket to a business's own help desk. Now:
--
--   - the person who sent a dump reads it, as before;
--   - a dump sent with a ticket (feedback_id) is read by whoever handles that ticket
--     (private.genesis_support_handler: the ticket's tenant's agents, or a handler the app's report
--     hook names for the app's own tickets), so a business's dumps stay with the business;
--   - a dump with no ticket (a shake, Send diagnostics) is read by support staff, as before.
--
-- public.support_diagnostics_by_short_id follows the same rule; the service role still sees all.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0026_genesis_support_diagnostics_access.test.sql`).

create schema if not exists private;

-- May the signed-in person read a dump that isn't theirs? (Public, for the policy: it answers only
-- for the caller.)
create or replace function public.support_dump_readable(feedback uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return false;
  end if;
  if feedback is not null then
    return private.genesis_support_handler(feedback, me);
  end if;
  return public.support_is_staff();
end;
$$;

comment on function public.support_dump_readable(uuid) is
  'Whether the signed-in person may read a dump sent with this ticket (null: a dump with no ticket). Genesis support.';

revoke execute on function public.support_dump_readable(uuid) from public, anon;
grant execute on function public.support_dump_readable(uuid) to authenticated;

drop policy if exists support_diagnostics_read on public.support_diagnostics;
create policy support_diagnostics_read on public.support_diagnostics
  for select to authenticated
  using (user_id = (select auth.uid()) or public.support_dump_readable(feedback_id));

create or replace function public.support_diagnostics_by_short_id(short text)
returns table (id uuid, short_id text, user_id uuid, created_at timestamptz, trigger text, feedback_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.short_id, d.user_id, d.created_at, d.trigger, d.feedback_id
  from public.support_diagnostics d
  where d.short_id = upper(btrim(short))
    and (auth.role() = 'service_role' or public.support_dump_readable(d.feedback_id))
  order by d.created_at desc
  limit 20
$$;

comment on function public.support_diagnostics_by_short_id(text) is
  'Every dump with this short id the caller may read (a ticket''s dump: its handlers; a dump with no ticket: staff), with its owner and time. Genesis support.';

revoke execute on function public.support_diagnostics_by_short_id(text) from public, anon;
grant execute on function public.support_diagnostics_by_short_id(text) to authenticated, service_role;
