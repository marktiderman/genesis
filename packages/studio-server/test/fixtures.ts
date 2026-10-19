// Integration fixtures: a Supabase-shaped database (anon/authenticated roles,
// auth.uid(), RLS on every table) built in plain Postgres, so the suite runs
// in CI's Postgres service container and against a local Supabase alike.

import postgres from "postgres";
import { SignJWT } from "jose";
import { describe } from "vitest";
import { byResource, createStudioHandler, jwtAuth, studioSetupSql } from "../src/index";
import type { StudioHandlerOptions } from "../src/index";

export const ADMIN_URL = process.env.STUDIO_TEST_DATABASE_URL;
export const JWT_SECRET = "test-secret-with-at-least-thirty-two-characters!";
export const COACH_A = "11111111-1111-4111-8111-111111111111";
export const COACH_B = "22222222-2222-4222-8222-222222222222";
export const CLIENT_1 = "aaaaaaaa-0000-4000-8000-000000000001";
export const CLIENT_2 = "aaaaaaaa-0000-4000-8000-000000000002";
export const CLIENT_3 = "aaaaaaaa-0000-4000-8000-000000000003";
export const CLIENT_B = "bbbbbbbb-0000-4000-8000-000000000001";

/** `describe` for suites that need the database; skipped, with a note, without one. */
export const describeDb = ADMIN_URL ? describe : describe.skip;
if (!ADMIN_URL) {
  console.warn(
    "[studio-server] STUDIO_TEST_DATABASE_URL not set — skipping integration tests. Run: pnpm --filter @marktiderman/genesis-studio-server test:db",
  );
}

/** The handler's own login: NOINHERIT, so it holds no privileges until it switches. */
export function loginUrl(): string {
  const url = new URL(ADMIN_URL!);
  url.username = "studio_login";
  url.password = "studio_login";
  return url.toString();
}

export function adminSql() {
  return postgres(ADMIN_URL!, { max: 2, onnotice: () => {} });
}

const SCHEMA_SQL = `
drop schema if exists public cascade;
drop schema if exists genesis_studio cascade;
drop schema if exists auth cascade;
create schema public;
create schema if not exists extensions;
create extension if not exists moddatetime schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'studio_login') then
    create role studio_login login noinherit password 'studio_login';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'outbox_worker') then
    create role outbox_worker login password 'outbox_worker';
  end if;
end $$;
grant authenticated to studio_login;
grant usage on schema public, extensions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;
-- Supabase's own definition: the older per-claim setting is read FIRST.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- programs and coaches: link targets for relations.
create table public.programs (id int primary key, name text not null);
alter table public.programs enable row level security;
create policy programs_read on public.programs for select to authenticated using (true);
grant select on public.programs to authenticated;
create table public.coaches (id uuid primary key, name text not null);
alter table public.coaches enable row level security;
create policy coaches_read on public.coaches for select to authenticated using (true);
grant select on public.coaches to authenticated;

-- clients: RLS by coach; a column the database hides; a CHECK constraint.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid(),
  program_id int references public.programs (id),
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  notes text,
  secret_score int,
  updated_at timestamptz not null default now()
);
create trigger clients_updated_at before update on public.clients
  for each row execute function extensions.moddatetime(updated_at);
alter table public.clients enable row level security;
create policy clients_select on public.clients for select to authenticated using (coach_id = auth.uid());
create policy clients_update on public.clients for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy clients_insert on public.clients for insert to authenticated with check (coach_id = auth.uid());
create policy clients_delete on public.clients for delete to authenticated using (coach_id = auth.uid());
grant select (id, coach_id, program_id, name, status, notes, updated_at) on public.clients to authenticated;
grant update (name, status, notes, program_id) on public.clients to authenticated;
grant insert (name, status, notes, program_id) on public.clients to authenticated;
grant delete on public.clients to authenticated;

-- client_notes: rows pointing at a client (a "many" relation).
create table public.client_notes (
  id int generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null
);
alter table public.client_notes enable row level security;
create policy cn_read on public.client_notes for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.coach_id = auth.uid()));
grant select on public.client_notes to authenticated;

-- coach_clients: a composite key and an integer version a trigger advances.
create table public.coach_clients (
  coach_id uuid not null references public.coaches (id),
  client_id uuid not null references public.clients (id) on delete cascade,
  label text,
  version int not null default 1,
  primary key (coach_id, client_id)
);
create function public.bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger coach_clients_version before update on public.coach_clients
  for each row execute function public.bump_version();
alter table public.coach_clients enable row level security;
create policy cc_select on public.coach_clients for select to authenticated using (coach_id = auth.uid());
create policy cc_update on public.coach_clients for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
grant select on public.coach_clients to authenticated;
grant update (label) on public.coach_clients to authenticated;

-- no_trigger: updated_at exists but nothing advances it, so it stays read-only.
create table public.no_trigger (id int primary key, label text, updated_at timestamptz default now());
alter table public.no_trigger enable row level security;
create policy nt_all on public.no_trigger for all to authenticated using (true) with check (true);
grant select, update on public.no_trigger to authenticated;

-- locked_rows: every row is visible, but only unlocked rows may change.
create table public.locked_rows (id int primary key, label text, locked boolean not null, updated_at timestamptz default now());
create trigger locked_rows_updated_at before update on public.locked_rows
  for each row execute function extensions.moddatetime(updated_at);
alter table public.locked_rows enable row level security;
create policy lr_select on public.locked_rows for select to authenticated using (true);
create policy lr_update on public.locked_rows for update to authenticated using (not locked) with check (not locked);
grant select on public.locked_rows to authenticated;
grant update (label) on public.locked_rows to authenticated;

-- lying: a trigger that LOOKS like it advances updated_at but puts it back.
create table public.lying (id int primary key, label text, updated_at timestamptz default now());
create function public.keep_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := old.updated_at;
  return new;
end $$;
create trigger lying_updated_at before update on public.lying
  for each row execute function public.keep_updated_at();
alter table public.lying enable row level security;
create policy l_all on public.lying for all to authenticated using (true) with check (true);
grant select, update (label) on public.lying to authenticated;

-- typed: one column per type the driver could mangle if it serialized them.
create table public.typed (
  id int primary key,
  active boolean not null default true,
  meta jsonb,
  starts_at timestamp,
  score numeric(10, 2),
  updated_at timestamptz not null default now()
);
create trigger typed_updated_at before update on public.typed
  for each row execute function extensions.moddatetime(updated_at);
alter table public.typed enable row level security;
create policy t_all on public.typed for all to authenticated using (true) with check (true);
grant select, update (active, meta, starts_at, score) on public.typed to authenticated;

-- no_rls: a trusted version, but row-level security off.
create table public.no_rls (id int primary key, label text, updated_at timestamptz default now());
create trigger no_rls_updated_at before update on public.no_rls
  for each row execute function extensions.moddatetime(updated_at);
grant select, update (label) on public.no_rls to authenticated;

-- coarse: a version stored to the whole second, too coarse to tell two quick edits apart.
create table public.coarse (id int primary key, label text, updated_at timestamptz(0) default now());
create trigger coarse_updated_at before update on public.coarse
  for each row execute function extensions.moddatetime(updated_at);
alter table public.coarse enable row level security;
create policy c_all on public.coarse for all to authenticated using (true) with check (true);
grant select, update (label) on public.coarse to authenticated;

-- app_audited: audited by the app's own trigger (the "database" sink).
create table public.app_log (id bigserial primary key, actor uuid, label text);
create table public.app_audited (id int primary key, label text, updated_at timestamptz default now());
create trigger app_audited_updated_at before update on public.app_audited
  for each row execute function extensions.moddatetime(updated_at);
create function public.log_app_audited() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_log (actor, label) values (auth.uid(), new.label);
  return new;
end $$;
create trigger app_audited_audit after update on public.app_audited
  for each row execute function public.log_app_audited();
alter table public.app_audited enable row level security;
create policy aa_all on public.app_audited for all to authenticated using (true) with check (true);
grant select, update (label) on public.app_audited to authenticated;

-- scores: every write goes through the app's own functions (decision 29).
create table public.scores (
  id int primary key,
  coach_id uuid not null default auth.uid(),
  points int not null,
  updated_at timestamptz not null default now()
);
create trigger scores_updated_at before update on public.scores
  for each row execute function extensions.moddatetime(updated_at);
alter table public.scores enable row level security;
create policy s_read on public.scores for select to authenticated using (coach_id = auth.uid());
grant select on public.scores to authenticated;
-- No direct write grants: only the functions below may change scores.
create function public.save_score(record_key jsonb, changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (changes ->> 'points')::int > 100 then
    raise exception 'Points can''t exceed 100.';
  end if;
  update public.scores set points = (changes ->> 'points')::int
   where id = (record_key ->> 'id')::int and coach_id = auth.uid();
end $$;
create function public.add_score(vals jsonb) returns public.scores
language plpgsql security definer set search_path = '' as $$
declare r public.scores;
begin
  insert into public.scores (id, coach_id, points)
  values ((vals ->> 'id')::int, auth.uid(), (vals ->> 'points')::int) returning * into r;
  return r;
end $$;
create function public.remove_score(record_key jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.scores where id = (record_key ->> 'id')::int and coach_id = auth.uid();
end $$;
revoke all on function public.save_score(jsonb, jsonb), public.add_score(jsonb), public.remove_score(jsonb) from public;
grant execute on function public.save_score(jsonb, jsonb), public.add_score(jsonb), public.remove_score(jsonb) to authenticated;

-- secret_table: granted by the database, but never allowed by authorize().
create table public.secret_table (id int primary key, payload text);
grant select on public.secret_table to authenticated;
`;

const SEED_SQL = `
insert into public.programs values (1, 'Leadership'), (2, 'Wellbeing');
insert into public.coaches values ('${COACH_A}', 'Coach A'), ('${COACH_B}', 'Coach B');
insert into public.scores (id, coach_id, points) values (1, '${COACH_A}', 40);
insert into public.clients (id, coach_id, name, status, notes, secret_score) values
  ('${CLIENT_1}', '${COACH_A}', 'Ana Ruiz', 'active', 'Prefers mornings', 91),
  ('${CLIENT_2}', '${COACH_A}', 'Ben Ode', 'paused', null, 40),
  ('${CLIENT_3}', '${COACH_A}', 'Cy Lam', 'active', 'Moved to Tuesdays', 77),
  ('${CLIENT_B}', '${COACH_B}', 'Dee Park', 'active', 'Coach B only', 12);
insert into public.coach_clients (coach_id, client_id, label) values
  ('${COACH_A}', '${CLIENT_1}', 'primary'),
  ('${COACH_A}', '${CLIENT_2}', 'backup'),
  ('${COACH_B}', '${CLIENT_B}', 'primary');
insert into public.no_trigger values (1, 'static', now());
insert into public.locked_rows values (1, 'open', false, now()), (2, 'frozen', true, now());
insert into public.lying values (1, 'original', now());
insert into public.secret_table values (1, 'nope');
insert into public.client_notes (client_id, body) values ('${CLIENT_1}', 'Kickoff call'), ('${CLIENT_1}', 'Goal review');
insert into public.no_rls values (1, 'open to all', now());
insert into public.coarse values (1, 'coarse', now());
insert into public.app_audited values (1, 'app', now());
insert into public.typed (id, active, meta, starts_at, score) values (1, true, '{"a": 1}', '2026-01-02 03:04:05.123456', 1.50);
`;

/** A trigger that makes the audit sink fail on demand, to prove the edit rolls back with it. */
const FAILING_AUDIT_SQL = `
create function genesis_studio.fail_on_request() returns trigger language plpgsql as $$
begin
  if new.after ->> 'notes' = 'fail-audit' then
    raise exception 'audit sink is down';
  end if;
  return new;
end $$;
create trigger audit_log_fail before insert on genesis_studio.audit_log
  for each row execute function genesis_studio.fail_on_request();
`;

/** Drop and rebuild every fixture. */
export async function resetDatabase(): Promise<void> {
  const sql = adminSql();
  try {
    await sql.unsafe(SCHEMA_SQL);
    await sql.unsafe(studioSetupSql({ workerRole: "outbox_worker" }));
    await sql.unsafe(FAILING_AUDIT_SQL);
    await sql.unsafe(SEED_SQL);
  } finally {
    await sql.end();
  }
}

export async function tokenFor(sub: string, claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ role: "authenticated", aud: "authenticated", ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

export const DEFAULT_RULES = {
  "public.clients": { read: true, update: true, create: true, delete: true, history: true },
  "public.programs": { read: true },
  "public.coaches": { read: true },
  "public.client_notes": { read: true },
  "public.scores": { read: true, update: true, create: true, delete: true },
  "public.coach_clients": { read: true, update: true },
  "public.no_trigger": { read: true, update: true },
  "public.locked_rows": { read: true, update: true },
  "public.lying": { read: true, update: true },
  "public.typed": { read: true, update: true },
  "public.no_rls": { read: true, update: true },
  "public.coarse": { read: true, update: true },
  "public.app_audited": { read: true, update: true },
} as const;

export function makeHandler(overrides: Partial<StudioHandlerOptions> = {}) {
  return createStudioHandler({
    database: loginUrl(),
    auth: jwtAuth({ secret: JWT_SECRET, audience: "authenticated" }),
    authorize: byResource(DEFAULT_RULES, { who: () => true }),
    audit: { sink: "table" },
    ...overrides,
  });
}

export interface CallResult {
  status: number;
  body: any;
}

/** POST one studio request as `sub` (or with no token when `sub` is null). */
export async function call(
  handler: (request: Request) => Promise<Response>,
  sub: string | null,
  body: Record<string, unknown>,
  claims?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<CallResult> {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (sub) headers.authorization = `Bearer ${await tokenFor(sub, claims)}`;
  const response = await handler(
    new Request("http://studio.test/api/studio", { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
}
