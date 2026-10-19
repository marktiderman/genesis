#!/usr/bin/env node
// The stock-Supabase adoption test (DATA-STUDIO.md "Adoption tests"):
// real Supabase Auth tokens, real RLS, the studio handler in-process.
// Signs in as a coach, fixes a real row, and reads the audit entry back.
//
//   supabase start && node seed.mjs && node adopt.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import postgres from "postgres";
import { byResource, createStudioHandler, supabaseAuth } from "@marktiderman/genesis-studio-server";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, ".env.local"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

async function signIn(entry) {
  const [email, password] = entry.split(" ");
  const res = await fetch(`${env.STUDIO_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: env.STUDIO_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  assert.ok(res.ok, `sign-in failed: ${JSON.stringify(body)}`);
  return { token: body.access_token, id: body.user.id, email };
}

const studio = createStudioHandler({
  database: env.STUDIO_DATABASE_URL,
  auth: supabaseAuth({ url: env.STUDIO_SUPABASE_URL }),
  authorize: byResource(
    {
      "public.clients": { read: true, update: true },
      "public.session_notes": { read: true, update: ["summary", "next_steps"] },
      "public.plans": { read: true },
    },
    { who: (claims) => typeof claims.email === "string" && claims.email.endsWith("@coach.test") },
  ),
  audit: { sink: "table" },
  onError: (error) => console.error("[studio]", error),
});

async function call(user, body) {
  const res = await studio(
    new Request("http://localhost/api/studio", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const step = (text) => console.log(`✓ ${text}`);
const ada = await signIn(env.COACH_ADA);
const ben = await signIn(env.COACH_BEN);
const alg = JSON.parse(Buffer.from(ada.token.split(".")[0], "base64url").toString()).alg;
step(`signed in two coaches with Supabase Auth (tokens signed ${alg}, verified against the project's JWKS)`);

const resources = await call(ada, { op: "resources" });
assert.equal(resources.status, 200, JSON.stringify(resources.body));
const access = Object.fromEntries(resources.body.resources.map((r) => [r.name, r.access]));
assert.deepEqual(Object.keys(access).sort(), ["public.clients", "public.plans", "public.session_notes"]);
assert.equal(access["public.clients"].update, true);
assert.equal(access["public.plans"].update, false);
step(`discovered 3 tables; plans is read-only: "${access["public.plans"].reason}"`);

const described = await call(ada, { op: "describe", resource: "public.clients" });
const fields = described.body.schema.fields.map((f) => f.name);
assert.ok(!fields.includes("risk_score"));
step(`clients has ${fields.length} fields this coach may read; risk_score (never granted) is absent`);

const adaClients = await call(ada, { op: "list", resource: "public.clients", sort: { field: "full_name", order: "asc" } });
const benClients = await call(ben, { op: "list", resource: "public.clients" });
assert.deepEqual(adaClients.body.rows.map((r) => r.values.full_name), ["Maya Chen", "Omar Haddad", "Priya Nair"]);
assert.deepEqual(benClients.body.rows.map((r) => r.values.full_name), ["Lucas Silva"]);
step("RLS: Ada sees her 3 clients, Ben sees only his 1");

const maya = adaClients.body.rows[0];
const fixed = await call(ada, {
  op: "update",
  resource: "public.clients",
  id: maya.values.id,
  data: { goals: "Lead the Q1 launch, and take a real holiday" },
  expectedVersion: maya.version,
});
assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
step(`fixed Maya's goals; audit entry ${fixed.body.audit.id} by ${fixed.body.audit.actor}`);

const stale = await call(ada, {
  op: "update",
  resource: "public.clients",
  id: maya.values.id,
  data: { goals: "An edit from a stale screen" },
  expectedVersion: maya.version,
});
assert.equal(stale.status, 409);
step(`a second edit from the same stale version is refused: "${stale.body.error.message}"`);

const hijack = await call(ben, {
  op: "update",
  resource: "public.clients",
  id: maya.values.id,
  data: { goals: "Ben was here" },
  expectedVersion: fixed.body.row.version,
});
assert.equal(hijack.status, 410);
step("Ben can't edit Ada's client: reported as gone, never as a permission leak");

const notes = await call(ada, { op: "list", resource: "public.session_notes", sort: { field: "session_on", order: "asc" } });
const note = notes.body.rows[0];
const noteFix = await call(ada, {
  op: "update",
  resource: "public.session_notes",
  id: JSON.stringify([note.values.client_id, note.values.session_on]),
  data: { next_steps: "Draft a delegation list by Friday" },
  expectedVersion: note.version,
});
assert.equal(noteFix.status, 200, JSON.stringify(noteFix.body));
assert.equal(noteFix.body.row.version, String(Number(note.version) + 1));
step("fixed a session note addressed by its composite key (client_id, session_on)");

const admin = postgres(env.STUDIO_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });
const log = await admin`
  select a.id, u.email, a.resource, a.record_key, a.before, a.after
    from genesis_studio.audit_log a join auth.users u on u.id::text = a.actor
   order by a.occurred_at`;
await admin.end();
await studio.close();
assert.equal(log.length, 2);
console.log("\nAudit log, read back from the database:");
for (const entry of log) {
  console.log(`  ${entry.id}  ${entry.email}  ${entry.resource}  ${JSON.stringify(entry.record_key)}`);
  console.log(`    before ${JSON.stringify(entry.before)}`);
  console.log(`    after  ${JSON.stringify(entry.after)}`);
}
console.log("\nAdoption test passed.");
