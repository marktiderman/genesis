-- Genesis media uploads: upload sessions
--
-- The default home of `@marktiderman/genesis-media/uploads`' upload sessions
-- (createSupabaseSessionStore), in the app's own Supabase, in the
-- genesis_media schema:
--
--   uploads       one session per upload: its owner, purpose, identity (size, and the
--                 whole object's SHA-256 once known), part size, storage key (unique: no two
--                 uploads ever share one), targets, the first target's multipart id, its
--                 state, what verification found, the objects (and versions) it made, copies
--                 under way, and the verification lease
--   upload_parts  the parts, reserved before they are written (etag null) and then received
--                 (with the target's etag): number, size, digest (RFC 9530)
--
-- An owner has at most one open session per identity, purpose and target set (a unique index),
-- so two tabs sending one file share it. Every change is a compare-and-set in one of the
-- functions below, so racing requests can't both win.
--
-- Every row belongs to an owner (owner_kind, owner_id). Only the service role writes: the
-- upload handler runs with it and binds every operation to its owner itself. A signed-in
-- person may only read their own sessions (owner_kind 'person', owner_id their auth.uid()),
-- never write them: a session records what verification found (state, copies), which a
-- person must not be able to claim. anon gets nothing.
--
-- Every function is for the service role only.
--
-- Expose `genesis_media` in the project's API schemas only if the handler uses the
-- Data API (it does through createSupabaseSessionStore). Grants are by name, never in bulk.

create schema if not exists genesis_media;
revoke all on schema genesis_media from public, anon;
grant usage on schema genesis_media to authenticated, service_role;

-- The target set in a fixed order, so the same set always compares equal.
create function genesis_media.targets_key(p_targets text[])
returns text
language sql
immutable
set search_path = ''
as $$ select string_agg(t, E'\n' order by t) from unnest(p_targets) t $$;

create table genesis_media.uploads (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  owner_kind text not null check (owner_kind ~ '^[a-z][a-z0-9_-]{0,31}$'),
  owner_id text not null check (char_length(owner_id) between 1 and 200),
  purpose text not null check (purpose ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  name text not null check (char_length(name) between 1 and 1024),
  content_type text not null,
  size bigint not null check (size >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  part_size bigint not null check (part_size > 0),
  key text not null unique check (char_length(key) between 1 and 1024),
  targets text[] not null check (cardinality(targets) between 1 and 8),
  target_upload_id text not null,
  state text not null default 'open' check (state in ('open', 'verifying', 'done', 'partial', 'identity_mismatch')),
  copies jsonb not null default '[]'::jsonb,
  failed jsonb not null default '[]'::jsonb,
  assembled jsonb not null default '{}'::jsonb,
  pending_copies jsonb not null default '{}'::jsonb,
  verifying_since timestamptz,
  lease_until timestamptz,
  lease_holder text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table genesis_media.uploads is 'Upload sessions of @marktiderman/genesis-media/uploads: one per upload, bound to its owner.';

-- One open session per owner, identity, purpose and target set: a second create (another tab)
-- conflicts here and resumes the first.
create unique index uploads_one_open_per_identity on genesis_media.uploads
  (owner_kind, owner_id, purpose, size, sha256, genesis_media.targets_key(targets))
  where state = 'open' and sha256 is not null;
-- The sweep: open sessions past their expiry, and stuck verifications.
create index uploads_open_expiry on genesis_media.uploads (expires_at) where state = 'open';
create index uploads_verifying on genesis_media.uploads (verifying_since) where state = 'verifying';

create table genesis_media.upload_parts (
  upload_id text not null references genesis_media.uploads (id) on delete cascade,
  n integer not null check (n between 1 and 10000),
  size bigint not null check (size >= 0),
  digest text not null check (digest ~ '^sha-256=:[A-Za-z0-9+/]{43}=:$'),
  -- Null while reserved and being written.
  etag text,
  -- The request that reserved it (a random token), and when: only it completes or releases it,
  -- and a reservation left long enough (its writer died) can be taken over.
  holder text,
  reserved_at timestamptz,
  primary key (upload_id, n)
);

alter table genesis_media.uploads enable row level security;
alter table genesis_media.upload_parts enable row level security;

create policy "owners read their uploads" on genesis_media.uploads
  for select to authenticated using (owner_kind = 'person' and owner_id = (select auth.uid())::text);

create policy "owners read their parts" on genesis_media.upload_parts
  for select to authenticated using (
    exists (select 1 from genesis_media.uploads u where u.id = upload_id)
  );

revoke all on table genesis_media.uploads from public, anon, authenticated;
revoke all on table genesis_media.upload_parts from public, anon, authenticated;
grant select on table genesis_media.uploads to authenticated;
grant select on table genesis_media.upload_parts to authenticated;
grant select, insert, update, delete on table genesis_media.uploads to service_role;
grant select, insert, update, delete on table genesis_media.upload_parts to service_role;

-- Reserves part p_n for these bytes before they are written, in one step with the check, for the
-- request p_holder (a random token per request): 'reserved' (it's the caller's to write and
-- complete); 'busy' (another request is writing these bytes now: nothing to write, ask again
-- soon); 'received' (already in, nothing to write); or 'conflict' (other bytes hold it; nothing
-- changes). A reservation older than p_stale_before (its writer died) is taken over: 'reserved'.
-- Only while the session is open: otherwise P0002. The session row is locked meanwhile, so a
-- finalize waits.
create function genesis_media.reserve_part(p_upload text, p_n integer, p_size bigint, p_digest text, p_holder text, p_now timestamptz, p_stale_before timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  had record;
begin
  perform 1 from genesis_media.uploads where id = p_upload and state = 'open' for update;
  if not found then
    raise exception 'no open upload %', p_upload using errcode = 'P0002';
  end if;
  insert into genesis_media.upload_parts (upload_id, n, size, digest, etag, holder, reserved_at)
  values (p_upload, p_n, p_size, p_digest, null, p_holder, p_now)
  on conflict (upload_id, n) do nothing;
  if found then
    return 'reserved';
  end if;
  select digest, etag, reserved_at into had from genesis_media.upload_parts where upload_id = p_upload and n = p_n;
  if had.digest <> p_digest then
    return 'conflict';
  end if;
  if had.etag is not null then
    return 'received';
  end if;
  if had.reserved_at > p_stale_before then
    return 'busy';
  end if;
  update genesis_media.upload_parts set holder = p_holder, reserved_at = p_now where upload_id = p_upload and n = p_n;
  return 'reserved';
end
$$;

-- Records the target's etag for a part p_holder reserved, while the session is still open (its
-- row is shared-locked, so a finalize can't move it on meanwhile). False when the reservation
-- went (taken over, or the session left open).
create function genesis_media.complete_part(p_upload text, p_n integer, p_holder text, p_etag text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from genesis_media.uploads where id = p_upload and state = 'open' for share;
  if not found then
    return false;
  end if;
  update genesis_media.upload_parts set etag = p_etag
  where upload_id = p_upload and n = p_n and holder = p_holder and etag is null;
  return found;
end
$$;

-- Drops p_holder's reservation when its write failed (it never received an etag).
create function genesis_media.release_part(p_upload text, p_n integer, p_holder text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from genesis_media.upload_parts where upload_id = p_upload and n = p_n and holder = p_holder and etag is null
$$;

-- Applies a patch when the session is still in one of p_when (any state when null) and, with
-- p_holder, while that worker holds the lease. A key in the patch with a null value clears that
-- field. True when it applied.
create function genesis_media.update_upload(p_id text, p_patch jsonb, p_when text[] default null, p_holder text default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update genesis_media.uploads set
    state = coalesce(p_patch->>'state', state),
    sha256 = coalesce(p_patch->>'sha256', sha256),
    copies = coalesce(p_patch->'copies', copies),
    failed = coalesce(p_patch->'failed', failed),
    assembled = coalesce(p_patch->'assembled', assembled),
    pending_copies = coalesce(p_patch->'pending_copies', pending_copies),
    expires_at = coalesce((p_patch->>'expires_at')::timestamptz, expires_at),
    verifying_since = case when p_patch ? 'verifying_since' then (p_patch->>'verifying_since')::timestamptz else verifying_since end,
    lease_until = case when p_patch ? 'lease_until' then (p_patch->>'lease_until')::timestamptz else lease_until end,
    lease_holder = case when p_patch ? 'lease_holder' then p_patch->>'lease_holder' else lease_holder end
  where id = p_id and (p_when is null or state = any (p_when)) and (p_holder is null or lease_holder = p_holder);
  return found;
end
$$;

-- Takes the verification lease for p_holder until p_until, when the session is verifying and no
-- lease is live at p_now. True when the caller holds it.
create function genesis_media.claim_verify(p_id text, p_until timestamptz, p_now timestamptz, p_holder text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update genesis_media.uploads set lease_until = p_until, lease_holder = p_holder
  where id = p_id and state = 'verifying' and (lease_until is null or lease_until <= p_now);
  return found;
end
$$;

-- Removes the session when it is still in one of p_when and, with p_lease_free_at, when no
-- verification lease is live then. True when it was removed.
create function genesis_media.remove_upload(p_id text, p_when text[], p_lease_free_at timestamptz default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from genesis_media.uploads where id = p_id and state = any (p_when)
    and (p_lease_free_at is null or lease_until is null or lease_until <= p_lease_free_at);
  return found;
end
$$;

-- Sessions for the sweep: open ones past expires_at, and verifying ones that entered verifying
-- before p_verifying_before with no live lease.
create function genesis_media.stale_uploads(p_now timestamptz, p_limit integer, p_verifying_before timestamptz)
returns setof genesis_media.uploads
language sql
stable
security invoker
set search_path = ''
as $$
  select * from genesis_media.uploads
  where (state = 'open' and expires_at <= p_now)
     or (state = 'verifying' and coalesce(verifying_since, created_at) <= p_verifying_before and (lease_until is null or lease_until <= p_now))
  order by created_at
  limit p_limit
$$;

revoke execute on function genesis_media.reserve_part(text, integer, bigint, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function genesis_media.complete_part(text, integer, text, text) from public, anon, authenticated;
revoke execute on function genesis_media.release_part(text, integer, text) from public, anon, authenticated;
revoke execute on function genesis_media.update_upload(text, jsonb, text[], text) from public, anon, authenticated;
revoke execute on function genesis_media.claim_verify(text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function genesis_media.remove_upload(text, text[], timestamptz) from public, anon, authenticated;
revoke execute on function genesis_media.stale_uploads(timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function genesis_media.reserve_part(text, integer, bigint, text, text, timestamptz, timestamptz) to service_role;
grant execute on function genesis_media.complete_part(text, integer, text, text) to service_role;
grant execute on function genesis_media.release_part(text, integer, text) to service_role;
grant execute on function genesis_media.update_upload(text, jsonb, text[], text) to service_role;
grant execute on function genesis_media.claim_verify(text, timestamptz, timestamptz, text) to service_role;
grant execute on function genesis_media.remove_upload(text, text[], timestamptz) to service_role;
grant execute on function genesis_media.stale_uploads(timestamptz, integer, timestamptz) to service_role;
