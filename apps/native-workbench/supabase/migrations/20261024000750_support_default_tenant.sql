-- @feat:support-feedback
-- This app's own tenant, for genesis-support (needed before 0004_genesis_support_tickets.sql).
--
-- The starter is a single-tenant app: every ticket and idea belongs to this one tenant, and your
-- support staff (private.genesis_support_staff) handle them. A multi-tenant app returns its own
-- organization's id here instead, and lists its tenants in private.genesis_viewer_people.
create schema if not exists private;

create or replace function private.genesis_support_default_tenant()
returns uuid
language sql
stable
set search_path = ''
as $$
  select '00000000-0000-4000-8000-0000000000a1'::uuid
$$;

revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
