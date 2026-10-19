-- What a stock Supabase project already has, for running the studio demo on
-- PLAIN Postgres: the anon/authenticated roles, auth.uid(), and an extensions
-- schema with moddatetime. Skip this file on Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
create extension if not exists moddatetime schema extensions;
grant usage on schema public, extensions to anon, authenticated;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
-- Supabase's own definition: the per-claim setting first, then the claims JSON.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
