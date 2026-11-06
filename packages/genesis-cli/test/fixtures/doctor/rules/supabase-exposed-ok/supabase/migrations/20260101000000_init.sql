-- A private schema the API never serves is fine to create here.
create schema if not exists private;
create table public.notes (id uuid primary key default gen_random_uuid(), body text not null);
alter table public.notes enable row level security;
