-- @feat:support-chat
-- Genesis support 0022: who's who, for agents (after 0004_genesis_support_tickets.sql).
--
-- An agent's screens name people they can't read otherwise: the requester of a ticket (whose
-- profile row security hides), and the agents a ticket can be given to. Three functions answer
-- with names, each only for someone who handles the tickets in question:
--
--   public.support_agents_list(tenant)       the logins that handle a tenant's tickets (its
--                                             agents, its admins, and in the app's own tenant its
--                                             staff), with a name: who a ticket can be assigned
--                                             to. Null is the app's own tenant. Only that
--                                             tenant's agents may ask (42501 otherwise). At most
--                                             200, by name.
--   public.support_reporters(ids)            the name and email of the people among `ids` who
--                                             wrote a ticket the caller handles. Anyone else in
--                                             `ids` is left out, never refused, so a list of
--                                             mixed ids is safe to send.
--   public.support_requester_tenants(person) the tenants (with a label) the person belongs to,
--                                             for an agent's details panel ("Acme, Northside").
--                                             Staff of the app's own tenant see every tenant;
--                                             a tenant's agent only the tenants they handle too.
--                                             Only for someone who handles one of the person's
--                                             tickets; empty otherwise.
--
-- Names come from two optional hooks of the app's, each asked with this file's (the owner's)
-- rights, and fall back to the login's metadata:
--
--   private.genesis_person_name(person uuid) returns text      a person's display name
--     (default: auth.users' raw_user_meta_data full_name, else name, else null)
--   private.genesis_tenant_label(tenant uuid) returns text     a tenant's name ("Acme")
--     (default: null; the client shows nothing for it)
--
-- support_agents_list reads every login once to ask whether it handles the tenant: fine for the
-- staff screens it serves, not for a hot path.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0022_genesis_support_staff_tools.test.sql`).

create schema if not exists private;

-- A person's name: the app's hook, else the login's metadata, else null. A hook that errors gives
-- the fallback: a name is never worth failing a screen for.
create or replace function private.genesis_support_person_name(person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hooked text;
begin
  if person is null then
    return null;
  end if;
  if to_regprocedure('private.genesis_person_name(uuid)') is not null then
    begin
      hooked := nullif(btrim(private.genesis_person_name(person)), '');
    exception when others then
      hooked := null;
    end;
    if hooked is not null then
      return left(hooked, 200);
    end if;
  end if;
  return (
    select left(nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''), 200)
      from auth.users u where u.id = person
  );
end;
$$;

-- A tenant's label: the app's hook, else null.
create or replace function private.genesis_support_tenant_label(tenant uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or to_regprocedure('private.genesis_tenant_label(uuid)') is null then
    return null;
  end if;
  return left(nullif(btrim(private.genesis_tenant_label(tenant)), ''), 200);
exception when others then
  return null;
end;
$$;

revoke execute on function private.genesis_support_person_name(uuid) from public, anon, authenticated;
revoke execute on function private.genesis_support_tenant_label(uuid) from public, anon, authenticated;

-- Who handles a tenant's tickets ---------------------------------------------------------------

create or replace function public.support_agents_list(tenant uuid default null)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
begin
  if not private.genesis_support_agent(resolved, auth.uid()) then
    raise exception 'support_agents_list: only the tenant''s agents' using errcode = '42501';
  end if;
  return query
    select u.id, private.genesis_support_person_name(u.id)
      from auth.users u
     where private.genesis_support_agent(resolved, u.id)
     order by private.genesis_support_person_name(u.id) nulls last, u.id
     limit 200;
end;
$$;

comment on function public.support_agents_list(uuid) is
  'The logins that handle a tenant''s tickets, with a name (null tenant: the app''s own). Only for the tenant''s agents. Genesis support.';

revoke execute on function public.support_agents_list(uuid) from public, anon;
grant execute on function public.support_agents_list(uuid) to authenticated;

-- Who wrote ------------------------------------------------------------------------------------

create or replace function public.support_reporters(ids uuid[])
returns table (user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'support_reporters: not signed in' using errcode = '42501';
  end if;
  return query
    select u.id, private.genesis_support_person_name(u.id), u.email::text
      from auth.users u
     where u.id = any ((coalesce(ids, '{}'::uuid[]))[1:500])
       and exists (select 1 from public.tickets t
                    where t.user_id = u.id
                      and private.genesis_support_agent(t.tenant_id, me));
end;
$$;

comment on function public.support_reporters(uuid[]) is
  'The name and email of the people among ids who wrote a ticket the signed-in person handles. Genesis support.';

revoke execute on function public.support_reporters(uuid[]) from public, anon;
grant execute on function public.support_reporters(uuid[]) to authenticated;

-- The requester's tenants ----------------------------------------------------------------------

create or replace function public.support_requester_tenants(person uuid)
returns table (tenant_id uuid, label text)
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
                  where t.user_id = person and private.genesis_support_agent(t.tenant_id, me)) then
    return;
  end if;
  staff := private.genesis_support_agent(private.genesis_support_default_tenant_id(), me);
  return query
    select distinct v.tenant_id, private.genesis_support_tenant_label(v.tenant_id)
      from private.genesis_support_tenants_of(person) v
     where v.tenant_id is distinct from private.genesis_support_default_tenant_id()
       and (staff or private.genesis_support_agent(v.tenant_id, me))
     order by 2 nulls last, 1;
end;
$$;

comment on function public.support_requester_tenants(uuid) is
  'The tenants (with a label) a requester belongs to, for an agent who handles one of their tickets. Genesis support.';

revoke execute on function public.support_requester_tenants(uuid) from public, anon;
grant execute on function public.support_requester_tenants(uuid) to authenticated;
