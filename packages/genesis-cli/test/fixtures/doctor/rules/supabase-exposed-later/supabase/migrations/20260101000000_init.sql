create table public.notes (id uuid primary key default gen_random_uuid(), body text not null);
alter table public.notes enable row level security;
