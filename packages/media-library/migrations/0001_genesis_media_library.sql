-- Genesis media-library: upload sessions
--
-- The default home of `@marktiderman/genesis-media-library`'s upload sessions
-- (createSupabaseSessionStore), in the app's own Supabase, in the
-- genesis_media_library schema:
--
--   uploads       one session per upload: its owner, purpose, identity (size, and the
--                 whole object's SHA-256 once known), part size, storage key, targets,
--                 the first target's multipart id, its state, and what verification found
--   upload_parts  the parts received: number, size, digest (RFC 9530) and the target's etag
--
-- Every row belongs to an owner (owner_kind, owner_id). Only the service role writes: the
-- upload handler runs with it and binds every operation to its owner itself. A signed-in
-- person may only read their own sessions (owner_kind 'person', owner_id their auth.uid()),
-- never write them: a session records what verification found (state, copies), which a
-- person must not be able to claim. anon gets nothing.
--
-- add_part and update_upload are for the service role only.
--
-- Expose `genesis_media_library` in the project's API schemas only if the handler uses the
-- Data API (it does through createSupabaseSessionStore). Grants are by name, never in bulk.

create schema if not exists genesis_media_library;
revoke all on schema genesis_media_library from public, anon;
grant usage on schema genesis_media_library to authenticated, service_role;

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
  key text not null,
  targets text[] not null check (cardinality(targets) between 1 and 8),
  target_upload_id text not null,
  state text not null default 'open' check (state in ('open', 'verifying', 'done', 'partial', 'identity_mismatch')),
  copies jsonb not null default '[]'::jsonb,
  failed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table genesis_media_library.uploads is 'Upload sessions of @marktiderman/genesis-media-library: one per upload, bound to its owner.';

-- findOpen: an owner's open session for one identity, purpose and target set.
create index uploads_open_identity on genesis_media_library.uploads (owner_kind, owner_id, purpose, size, sha256) where state = 'open';
-- The sweep: open sessions past their expiry.
create index uploads_open_expiry on genesis_media_library.uploads (expires_at) where state = 'open';

create table genesis_media_library.upload_parts (
  upload_id text not null references genesis_media_library.uploads (id) on delete cascade,
  n integer not null check (n between 1 and 10000),
  size bigint not null check (size >= 0),
  digest text not null check (digest ~ '^sha-256=:[A-Za-z0-9+/]{43}=:$'),
  etag text not null,
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

-- Records a part atomically: 'added'; 'same' (already there with this digest: its etag becomes
-- this one, the target's latest write); or 'conflict' (already there with another digest; the
-- first stands). Only for a session in 'open' (the row is locked meanwhile, so a finalize waits).
create function genesis_media_library.add_part(p_upload text, p_n integer, p_size bigint, p_digest text, p_etag text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from genesis_media_library.uploads where id = p_upload and state = 'open' for update;
  if not found then
    raise exception 'no open upload %', p_upload using errcode = 'P0002';
  end if;
  insert into genesis_media_library.upload_parts (upload_id, n, size, digest, etag)
  values (p_upload, p_n, p_size, p_digest, p_etag)
  on conflict (upload_id, n) do nothing;
  if found then
    return 'added';
  end if;
  update genesis_media_library.upload_parts set etag = p_etag
  where upload_id = p_upload and n = p_n and digest = p_digest;
  if found then
    return 'same';
  end if;
  return 'conflict';
end
$$;

-- Applies a patch (state, sha256, copies, failed, expires_at) when the session is still in
-- one of p_when (any state when null). True when it applied.
create function genesis_media_library.update_upload(p_id text, p_patch jsonb, p_when text[] default null)
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
    expires_at = coalesce((p_patch->>'expires_at')::timestamptz, expires_at)
  where id = p_id and (p_when is null or state = any (p_when));
  return found;
end
$$;

revoke execute on function genesis_media_library.add_part(text, integer, bigint, text, text) from public, anon, authenticated;
revoke execute on function genesis_media_library.update_upload(text, jsonb, text[]) from public, anon, authenticated;
grant execute on function genesis_media_library.add_part(text, integer, bigint, text, text) to service_role;
grant execute on function genesis_media_library.update_upload(text, jsonb, text[]) to service_role;
