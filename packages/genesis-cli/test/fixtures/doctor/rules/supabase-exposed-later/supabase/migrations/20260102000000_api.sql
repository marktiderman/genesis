-- The API schema, created by a migration: on a fresh branch it exists only after Migrate.
create schema if not exists api;
grant usage on schema api to anon, authenticated, service_role;
create view api.notes with (security_invoker = true) as select id, body from public.notes;
