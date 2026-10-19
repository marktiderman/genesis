-- A small coaching schema, the shape the studio's first consumers have:
-- every row belongs to a coach, and RLS lets a coach see and change only
-- their own. Written for this demo (not taken from any other project).
create extension if not exists moddatetime schema extensions;

create type public.client_status as enum ('lead', 'active', 'paused', 'alumni');

-- plans: shared reference data with no version field, so the studio shows
-- it read-only.
create table public.plans (
  id int primary key,
  name text not null,
  monthly_price numeric(10, 2) not null
);
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (true);
grant select on public.plans to authenticated;

-- clients: editable, version-checked on updated_at.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  status public.client_status not null default 'active',
  plan_id int references public.plans (id),
  goals text,
  -- Never granted to coaches: the studio can't show what the database hides.
  risk_score int,
  updated_at timestamptz not null default now()
);
create trigger clients_updated_at before update on public.clients
  for each row execute function extensions.moddatetime(updated_at);
alter table public.clients enable row level security;
create policy clients_read on public.clients for select to authenticated using (coach_id = (select auth.uid()));
create policy clients_update on public.clients for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
revoke all on public.clients from anon, authenticated;
grant select (id, coach_id, full_name, email, status, plan_id, goals, updated_at) on public.clients to authenticated;
grant update (full_name, email, status, plan_id, goals) on public.clients to authenticated;

-- session_notes: one per client per session date — a composite key — with
-- an integer version a trigger advances.
create table public.session_notes (
  client_id uuid not null references public.clients (id) on delete cascade,
  session_on date not null,
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  summary text,
  next_steps text,
  version int not null default 1,
  primary key (client_id, session_on)
);
create function public.bump_version() returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger session_notes_version before update on public.session_notes
  for each row execute function public.bump_version();
alter table public.session_notes enable row level security;
create policy notes_read on public.session_notes for select to authenticated using (coach_id = (select auth.uid()));
create policy notes_update on public.session_notes for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
revoke all on public.session_notes from anon, authenticated;
grant select on public.session_notes to authenticated;
grant update (summary, next_steps) on public.session_notes to authenticated;
