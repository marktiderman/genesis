-- More Supabase stand-ins, for an app's whole migration folder on plain Postgres (after supabase-stubs.sql):
-- pg_cron, vault, pg_net, realtime, more auth tables and roles. Apply each migration with psql --single-transaction,
-- as Supabase does, and drop 'create extension pg_cron/pg_net/vault…' lines first (see README).
create schema if not exists extensions;
alter extension pgcrypto set schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgtap with schema extensions;
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$ delete from cron.job where jobname = job_name returning true $$;
create or replace function cron.unschedule(job_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = job_id returning true $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'pgsodium_keyiduser') then create role pgsodium_keyiduser nologin; end if;
end $$;
create or replace function storage.extension(name text) returns text language sql immutable as $$ select split_part(name, '.', -1) $$;
create or replace function storage.filename(name text) returns text language sql immutable as $$ select split_part(name, '/', -1) $$;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade,
  provider text, provider_id text, identity_data jsonb, email text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now(), not_after timestamptz);
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade);
do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
alter table auth.users add column if not exists phone_confirmed_at timestamptz, add column if not exists confirmed_at timestamptz, add column if not exists is_sso_user boolean default false, add column if not exists email_change text, add column if not exists recovery_sent_at timestamptz, add column if not exists invited_at timestamptz, add column if not exists confirmation_sent_at timestamptz, add column if not exists last_sign_in_with text;
-- Vault, with Supabase's ownership and grants: supabase_admin owns the schema, the table and the
-- functions (security definer), and the value is kept encrypted (vault.secrets.secret is ciphertext;
-- only vault.decrypted_secrets gives it back). The database owner may read and delete secrets and
-- call the functions, never insert or update the table itself. Here the database owner is a
-- superuser, which no grant binds; genesis_db_owner is the database owner as Supabase really has it
-- (not a superuser, Vault's grants only), so a test can give a function to it and see what the
-- function may really do on Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'genesis_db_owner') then create role genesis_db_owner nologin nosuperuser; end if;
end $$;
create schema if not exists vault authorization supabase_admin;
grant usage on schema extensions to supabase_admin;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text, created_at timestamptz default now(), updated_at timestamptz default now());
alter table vault.secrets owner to supabase_admin;
create or replace function vault._key() returns text language sql immutable as $$ select 'genesis-pgtap-stub-vault-key' $$;
alter function vault._key() owner to supabase_admin;
create or replace view vault.decrypted_secrets as select id, name, extensions.pgp_sym_decrypt(decode(secret, 'base64'), vault._key()) as decrypted_secret, secret, description, created_at, updated_at from vault.secrets;
alter view vault.decrypted_secrets owner to supabase_admin;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql security definer set search_path = '' as $$ insert into vault.secrets (secret, name, description) values (encode(extensions.pgp_sym_encrypt(new_secret, vault._key()), 'base64'), new_name, new_description) returning id $$;
alter function vault.create_secret(text, text, text) owner to supabase_admin;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void language sql security definer set search_path = '' as $$ update vault.secrets set secret = coalesce(encode(extensions.pgp_sym_encrypt(new_secret, vault._key()), 'base64'), secret), name = coalesce(new_name, name), updated_at = now() where id = secret_id $$;
alter function vault.update_secret(uuid, text, text, text) owner to supabase_admin;
revoke all on vault.secrets, vault.decrypted_secrets from public;
grant usage on schema vault to genesis_db_owner;
grant select, delete on vault.secrets, vault.decrypted_secrets to genesis_db_owner;
grant execute on function vault.create_secret(text, text, text), vault.update_secret(uuid, text, text, text) to genesis_db_owner;
create schema if not exists net;
create table if not exists net.http_request_queue (id bigserial primary key, method text, url text, headers jsonb, body jsonb, timeout_milliseconds integer);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$ insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds) values ('POST', url, headers, body, timeout_milliseconds) returning id $$;
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$ select 1::bigint $$;
create schema if not exists realtime;
create or replace function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name name, table_schema name, new anyelement, old anyelement, level text default 'ROW') returns void language sql as $$ select $$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ select $$;
alter table auth.mfa_factors add column if not exists friendly_name text, add column if not exists factor_type text, add column if not exists status text, add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now(), add column if not exists secret text;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema realtime to anon, authenticated, service_role;
