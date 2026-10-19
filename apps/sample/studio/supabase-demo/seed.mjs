#!/usr/bin/env node
// Seeds the LOCAL demo project (`supabase start` in this folder) for the
// studio adoption test, and writes the settings the sample app and
// adopt.mjs read:
//   1. the handler's login role, NOINHERIT, member of `authenticated` only;
//   2. two coaches, created through Supabase Auth's admin API;
//   3. a few plans, clients and session notes for each coach.
//
// Local only: it refuses any API URL that isn't localhost. Credentials it
// generates go to .env.local files, which git ignores.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { cwd: here, encoding: "utf8" }));
const apiUrl = new URL(status.API_URL);
if (!["127.0.0.1", "localhost"].includes(apiUrl.hostname)) {
  console.error(`Refusing to seed ${apiUrl.host}: this script is for the local demo stack only.`);
  process.exit(1);
}

const LOGIN_ROLE = "genesis_studio_login";
const loginPassword = randomBytes(18).toString("base64url");
const coaches = [
  { email: "ada@coach.test", name: "Ada" },
  { email: "ben@coach.test", name: "Ben" },
].map((c) => ({ ...c, password: randomBytes(12).toString("base64url") }));

async function createUser(coach) {
  const res = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: status.SECRET_KEY,
      authorization: `Bearer ${status.SECRET_KEY}`,
    },
    body: JSON.stringify({ email: coach.email, password: coach.password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Creating ${coach.email}: ${JSON.stringify(body)}`);
  return body.id;
}

const db = postgres(status.DB_URL, { max: 1, onnotice: () => {} });
// Re-runnable: start from no demo users or rows.
await db`delete from auth.users where email = any(${coaches.map((c) => c.email)})`;
await db`truncate public.session_notes, public.clients, public.plans`;
await db.unsafe(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = '${LOGIN_ROLE}') then
      create role ${LOGIN_ROLE} login noinherit;
    end if;
  end $$;`);
await db.unsafe(`alter role ${LOGIN_ROLE} password '${loginPassword}'`);
await db.unsafe(`grant authenticated to ${LOGIN_ROLE}`);

for (const coach of coaches) coach.id = await createUser(coach);
const [ada, ben] = coaches;

await db`insert into public.plans values (1, 'Starter', 99), (2, 'Growth', 249), (3, 'Executive', 599)`;
const clients = await db`
  insert into public.clients (coach_id, full_name, email, status, plan_id, goals, risk_score) values
    (${ada.id}, 'Maya Chen', 'maya@client.test', 'active', 2, 'Lead the Q1 launch without burning out', 3),
    (${ada.id}, 'Omar Haddad', 'omar@client.test', 'active', 1, 'Delegate two recurring meetings', 6),
    (${ada.id}, 'Priya Nair', null, 'lead', null, null, null),
    (${ben.id}, 'Lucas Silva', 'lucas@client.test', 'paused', 3, 'Board-ready strategy deck', 8)
  returning id, full_name`;
const id = (name) => clients.find((c) => c.full_name === name).id;
await db`
  insert into public.session_notes (client_id, session_on, coach_id, summary, next_steps) values
    (${id("Maya Chen")}, '2026-10-06', ${ada.id}, 'Mapped launch risks', 'Draft a delegation list'),
    (${id("Maya Chen")}, '2026-10-13', ${ada.id}, 'Reviewed the delegation list', 'Hand off two items'),
    (${id("Omar Haddad")}, '2026-10-08', ${ada.id}, 'Calendar audit', 'Cancel one recurring meeting'),
    (${id("Lucas Silva")}, '2026-09-30', ${ben.id}, 'Strategy outline', 'First draft of slides')`;
await db.end();

const login = new URL(status.DB_URL);
login.username = LOGIN_ROLE;
login.password = loginPassword;

writeFileSync(
  join(here, ".env.local"),
  [
    "# Written by seed.mjs for the local demo stack. Not committed.",
    `STUDIO_SUPABASE_URL=${status.API_URL}`,
    `STUDIO_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
    `STUDIO_DATABASE_URL=${login.toString()}`,
    `STUDIO_ADMIN_DATABASE_URL=${status.DB_URL}`,
    ...coaches.map((c) => `COACH_${c.name.toUpperCase()}=${c.email} ${c.password}`),
    "",
  ].join("\n"),
);
// The sample app's dev server, in `--mode supabase`, serves /studio against this project.
writeFileSync(
  join(here, "..", "..", ".env.supabase.local"),
  [
    "# Written by apps/sample/studio/supabase-demo/seed.mjs. Not committed.",
    `STUDIO_DATABASE_URL=${login.toString()}`,
    "STUDIO_AUTH=supabase",
    `STUDIO_SUPABASE_URL=${status.API_URL}`,
    `STUDIO_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
    "",
  ].join("\n"),
);
console.log(`Seeded the demo project. Coach sign-ins (${coaches.map((c) => c.email).join(", ")}) are in .env.local.`);
