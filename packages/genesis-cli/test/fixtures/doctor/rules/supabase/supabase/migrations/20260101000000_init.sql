-- grant execute on all functions in schema public to anon;  (a comment, never checked)
create table public.notes (id uuid primary key, body text);
alter table public.notes enable row level security;

create table todos (id uuid primary key);

create table private.secrets (id uuid primary key);

create table "Scratch" (id int);
drop table "Scratch";

/* a block comment: create table public.ghost (id int); */
create or replace function private.do_thing(p uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- set search_path inside the body doesn't count
  execute 'grant all on all functions in schema public to anon; create table public.inside (id int)';
end
$$;

create function public.pinned() returns int language sql security definer set search_path = '' as $$ select 1 $$;

create function public.fixed_later() returns int language sql security definer as $body$ select 1 $body$;
