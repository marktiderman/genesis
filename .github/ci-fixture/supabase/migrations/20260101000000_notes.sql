-- The fixture's one table, with row level security on, for the supabase-ci self-test.
create table public.notes (
  id bigint generated always as identity primary key,
  body text not null
);

alter table public.notes enable row level security;
