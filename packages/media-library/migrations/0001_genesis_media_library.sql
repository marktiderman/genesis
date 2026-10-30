-- Genesis media-library: upload sessions
--
-- The default home of `@marktiderman/genesis-media-library`'s upload sessions
-- (createSupabaseSessionStore), in the app's own Supabase, in the
-- genesis_media_library schema:
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
-- Expose `genesis_media_library` in the project's API schemas only if the handler uses the
-- Data API (it does through createSupabaseSessionStore). Grants are by name, never in bulk.

create schema if not exists genesis_media_library;
revoke all on schema genesis_media_library from public, anon;
grant usage on schema genesis_media_library to authenticated, service_role;

-- The target set in a fixed order, so the same set always compares equal.
create function genesis_media_library.targets_key(p_targets text[])
returns text
language sql
immutable
set search_path = ''
as $$ select string_agg(t, E'\n' order by t) from unnest(p_targets) t $$;

create table genesis_media_library.uploads (
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

comment on table genesis_media_library.uploads is 'Upload sessions of @marktiderman/genesis-media-library: one per upload, bound to its owner.';

-- One open session per owner, identity, purpose and target set: a second create (another tab)
-- conflicts here and resumes the first.
create unique index uploads_one_open_per_identity on genesis_media_library.uploads
  (owner_kind, owner_id, purpose, size, sha256, genesis_media_library.targets_key(targets))
  where state = 'open' and sha256 is not null;
-- The sweep: open sessions past their expiry, and stuck verifications.
create index uploads_open_expiry on genesis_media_library.uploads (expires_at) where state = 'open';
create index uploads_verifying on genesis_media_library.uploads (verifying_since) where state = 'verifying';

create table genesis_media_library.upload_parts (
  upload_id text not null references genesis_media_library.uploads (id) on delete cascade,
  n integer not null check (n between 1 and 10000),
  size bigint not null check (size >= 0),
  digest text not null check (digest ~ '^sha-256=:[A-Za-z0-9+/]{43}=:$'),
  -- Null while reserved and being written.
  etag text,
  primary key (upload_id, n)
);

alter table genesis_media_library.uploads enable row level security;
alter table genesis_media_library.upload_parts enable row level security;

create policy "owners read their uploads" on genesis_media_library.uploads
  for select to authenticated using (owner_kind = 'person' and owner_id = (select auth.uid())::text);

create policy "owners read their parts" on genesis_media_library.upload_parts
  for select to authenticated using (
    exists (select 1 from genesis_media_library.uploads u where u.id = upload_id)
  );

revoke all on table genesis_media_library.uploads from public, anon, authenticated;
revoke all on table genesis_media_library.upload_parts from public, anon, authenticated;
grant select on table genesis_media_library.uploads to authenticated;
grant select on table genesis_media_library.upload_parts to authenticated;
grant select, insert, update, delete on table genesis_media_library.uploads to service_role;
grant select, insert, update, delete on table genesis_media_library.upload_parts to service_role;

-- Reserves part p_n for these bytes before they are written, in one step with the check:
-- 'reserved' (it's the caller's to write); 'same' (reserved or received with these bytes, not
-- yet received: write it and complete it); 'received' (already in, nothing to write); or
-- 'conflict' (other bytes hold it; nothing changes). Only while the session is open: otherwise
-- P0002. The session row is locked meanwhile, so a finalize waits.
create function genesis_media_library.reserve_part(p_upload text, p_n integer, p_size bigint, p_digest text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  had record;
begin
  perform 1 from genesis_media_library.uploads where id = p_upload and state = 'open' for update;
  if not found then
    raise exception 'no open upload %', p_upload using errcode = 'P0002';
  end if;
  insert into genesis_media_library.upload_parts (upload_id, n, size, digest, etag)
  values (p_upload, p_n, p_size, p_digest, null)
  on conflict (upload_id, n) do nothing;
  if found then
    return 'reserved';
  end if;
  select digest, etag into had from genesis_media_library.upload_parts where upload_id = p_upload and n = p_n;
  if had.digest <> p_digest then
    return 'conflict';
  end if;
  return case when had.etag is null then 'same' else 'received' end;
end
$$;

-- Records the target's etag for a part reserved with this digest. False when it's gone.
create function genesis_media_library.complete_part(p_upload text, p_n integer, p_digest text, p_etag text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update genesis_media_library.upload_parts p set etag = p_etag
  from genesis_media_library.uploads u
  where p.upload_id = p_upload and p.n = p_n and p.digest = p_digest and u.id = p.upload_id and u.state = 'open';
  return found;
end
$$;

-- Drops a reservation with this digest that never received an etag (its write failed).
create function genesis_media_library.release_part(p_upload text, p_n integer, p_digest text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from genesis_media_library.upload_parts where upload_id = p_upload and n = p_n and digest = p_digest and etag is null
$$;

-- Applies a patch when the session is still in one of p_when (any state when null) and, with
-- p_holder, while that worker holds the lease. A key in the patch with a null value clears that
-- field. True when it applied.
create function genesis_media_library.update_upload(p_id text, p_patch jsonb, p_when text[] default null, p_holder text default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update genesis_media_library.uploads set
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
create function genesis_media_library.claim_verify(p_id text, p_until timestamptz, p_now timestamptz, p_holder text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update genesis_media_library.uploads set lease_until = p_until, lease_holder = p_holder
  where id = p_id and state = 'verifying' and (lease_until is null or lease_until <= p_now);
  return found;
end
$$;

-- Removes the session when it is still in one of p_when and, with p_lease_free_at, when no
-- verification lease is live then. True when it was removed.
create function genesis_media_library.remove_upload(p_id text, p_when text[], p_lease_free_at timestamptz default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from genesis_media_library.uploads where id = p_id and state = any (p_when)
    and (p_lease_free_at is null or lease_until is null or lease_until <= p_lease_free_at);
  return found;
end
$$;

-- Sessions for the sweep: open ones past expires_at, and verifying ones that entered verifying
-- before p_verifying_before with no live lease.
create function genesis_media_library.stale_uploads(p_now timestamptz, p_limit integer, p_verifying_before timestamptz)
returns setof genesis_media_library.uploads
language sql
stable
security invoker
set search_path = ''
as $$
  select * from genesis_media_library.uploads
  where (state = 'open' and expires_at <= p_now)
     or (state = 'verifying' and coalesce(verifying_since, created_at) <= p_verifying_before and (lease_until is null or lease_until <= p_now))
  order by created_at
  limit p_limit
$$;

revoke execute on function genesis_media_library.reserve_part(text, integer, bigint, text) from public, anon, authenticated;
revoke execute on function genesis_media_library.complete_part(text, integer, text, text) from public, anon, authenticated;
revoke execute on function genesis_media_library.release_part(text, integer, text) from public, anon, authenticated;
revoke execute on function genesis_media_library.update_upload(text, jsonb, text[], text) from public, anon, authenticated;
revoke execute on function genesis_media_library.claim_verify(text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function genesis_media_library.remove_upload(text, text[], timestamptz) from public, anon, authenticated;
revoke execute on function genesis_media_library.stale_uploads(timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function genesis_media_library.reserve_part(text, integer, bigint, text) to service_role;
grant execute on function genesis_media_library.complete_part(text, integer, text, text) to service_role;
grant execute on function genesis_media_library.release_part(text, integer, text) to service_role;
grant execute on function genesis_media_library.update_upload(text, jsonb, text[], text) to service_role;
grant execute on function genesis_media_library.claim_verify(text, timestamptz, timestamptz, text) to service_role;
grant execute on function genesis_media_library.remove_upload(text, text[], timestamptz) to service_role;
grant execute on function genesis_media_library.stale_uploads(timestamptz, integer, timestamptz) to service_role;
