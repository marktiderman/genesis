-- @feat:chat
-- Who belongs to which tenant, for the Genesis blocks that ask (genesis-chat from its 0004:
-- every conversation is in a tenant). The starter is single-tenant: every login is in the one
-- tenant below, and is its own person record.
--
-- This is the hook genesis-supabase's 0016 documents:
--   private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
-- An app with organizations returns one row per organization the login belongs to (and, if it
-- has personal records, the personal one, whose tenant can be the record's own id). Replace this
-- with your own in a later migration when you add tenants.

create schema if not exists private;

create or replace function private.genesis_viewer_people(viewer uuid)
returns table (tenant_id uuid, person_id uuid)
language sql
stable
set search_path = ''
as $$
  select '00000000-0000-4000-8000-00000000a771'::uuid, viewer where viewer is not null
$$;

revoke execute on function private.genesis_viewer_people(uuid) from public, anon, authenticated;

comment on function private.genesis_viewer_people(uuid) is
  'The starter is single-tenant: every login is in one tenant and is its own person record. Genesis starter.';
