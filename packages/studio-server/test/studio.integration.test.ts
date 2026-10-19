import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import {
  adminSql,
  call,
  CLIENT_1,
  CLIENT_2,
  CLIENT_3,
  CLIENT_B,
  COACH_A,
  COACH_B,
  describeDb,
  loginUrl,
  makeHandler,
  resetDatabase,
} from "./fixtures";
import { byResource, type StudioHandler } from "../src/index";

describeDb("studio handler against Postgres with RLS", () => {
  let studio: StudioHandler;
  let admin: ReturnType<typeof adminSql>;
  const extra: StudioHandler[] = [];

  function handler(...args: Parameters<typeof makeHandler>): StudioHandler {
    const h = makeHandler(...args);
    extra.push(h);
    return h;
  }

  beforeAll(() => {
    studio = makeHandler();
    admin = adminSql();
  });
  beforeEach(resetDatabase);
  afterAll(async () => {
    await Promise.all([studio.close(), admin.end(), ...extra.map((h) => h.close())]);
  });

  async function readClient(id: string) {
    return call(studio, COACH_A, { op: "read", resource: "public.clients", id });
  }

  async function auditRows() {
    return admin`select actor, resource, record_key, action, before, after from genesis_studio.audit_log order by occurred_at`;
  }

  // ── Identity ────────────────────────────────────────────────────────────

  it("refuses a request with no signed-in user", async () => {
    const res = await call(studio, null, { op: "resources" });
    expect(res.status).toBe(401);
    expect(res.body.error.outcome).toBe("unauthenticated");
  });

  it("refuses a token that isn't a signed-in user's, such as a service-role key", async () => {
    const res = await call(studio, COACH_A, { op: "resources" }, { role: "service_role" });
    expect(res.status).toBe(403);
  });

  it("connects with a login role that can do nothing until it becomes the user", async () => {
    const login = postgres(loginUrl(), { max: 1, onnotice: () => {} });
    try {
      await expect(login`select name from public.clients`).rejects.toThrow(/permission denied/);
    } finally {
      await login.end();
    }
  });

  // ── Discovery and column rights ─────────────────────────────────────────

  it("lists only the tables authorize() allows, with why each is read-only", async () => {
    const res = await call(studio, COACH_A, { op: "resources" });
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.resources.map((r: any) => [r.name, r]));
    expect(Object.keys(byName).sort()).toEqual([
      "public.clients",
      "public.coach_clients",
      "public.locked_rows",
      "public.lying",
      "public.no_trigger",
      "public.typed",
    ]);
    expect(byName["public.clients"].access.update).toBe(true);
    expect(byName["public.no_trigger"].access).toMatchObject({ update: false });
    expect(byName["public.no_trigger"].access.reason).toMatch(/no trigger advances "updated_at"/);
  });

  it("answers a table authorize() denies exactly like a table that doesn't exist", async () => {
    const denied = await call(studio, COACH_A, { op: "describe", resource: "public.secret_table" });
    const missing = await call(studio, COACH_A, { op: "describe", resource: "public.nope" });
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(denied.body.error.message.replace("secret_table", "X")).toBe(missing.body.error.message.replace("nope", "X"));
  });

  it("reports per-user column rights, and never describes a column the database hides", async () => {
    const res = await call(studio, COACH_A, { op: "describe", resource: "public.clients" });
    const { schema } = res.body;
    const fields = Object.fromEntries(schema.fields.map((f: any) => [f.name, f]));
    expect(Object.keys(fields)).toEqual(["id", "coach_id", "name", "status", "notes", "updated_at"]);
    expect(fields.secret_score).toBeUndefined();
    expect(fields.name.permissions).toEqual({ read: true, update: true });
    expect(fields.notes.permissions.update).toBe(true);
    expect(fields.id.permissions).toMatchObject({ update: false, reason: "Key fields can't be edited." });
    expect(fields.updated_at.permissions.update).toBe(false);
    expect(fields.coach_id.permissions.reason).toMatch(/database doesn't let you update/);
    expect(schema.key).toBe("id");
    expect(schema.version).toEqual({ field: "updated_at", kind: "timestamp" });
    expect(fields.updated_at.type).toBe("datetime");
  });

  it("narrows columns further by authorize(), and never selects a hidden one", async () => {
    const narrow = handler({
      authorize: byResource({ "public.clients": { read: { except: ["notes"] }, update: ["status"] } }),
    });
    const described = await call(narrow, COACH_A, { op: "describe", resource: "public.clients" });
    const names = described.body.schema.fields.map((f: any) => f.name);
    expect(names).not.toContain("notes");
    const name = described.body.schema.fields.find((f: any) => f.name === "name");
    expect(name.permissions).toMatchObject({ update: false, reason: "Editing this field isn't enabled." });

    const listed = await call(narrow, COACH_A, { op: "list", resource: "public.clients" });
    expect(listed.body.rows.every((r: any) => !("notes" in r.values))).toBe(true);

    // A hidden column can't be probed through search, sort or a filter either.
    const searched = await call(narrow, COACH_A, { op: "list", resource: "public.clients", search: "Tuesdays" });
    expect(searched.body.total).toBe(0);
    const sorted = await call(narrow, COACH_A, {
      op: "list",
      resource: "public.clients",
      sort: { field: "notes", order: "asc" },
    });
    expect(sorted.status).toBe(400);
    const filtered = await call(narrow, COACH_A, {
      op: "list",
      resource: "public.clients",
      filters: [{ field: "notes", operator: "is_null" }],
    });
    expect(filtered.status).toBe(400);

    const blocked = await call(narrow, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { name: "Renamed" },
      expectedVersion: null,
    });
    expect(blocked.status).toBe(403);
  });

  it("keeps every table read-only until an audit sink is configured", async () => {
    const noAudit = handler({ audit: undefined });
    const res = await call(noAudit, COACH_A, { op: "describe", resource: "public.clients" });
    expect(res.body.schema.access.update).toBe(false);
    expect(res.body.schema.access.reason).toMatch(/no audit sink/);
  });

  // ── Reading ────────────────────────────────────────────────────────────

  it("lists only the rows the database's row rules show this user", async () => {
    const a = await call(studio, COACH_A, { op: "list", resource: "public.clients", sort: { field: "name", order: "asc" } });
    expect(a.body.total).toBe(3);
    expect(a.body.rows.map((r: any) => r.values.name)).toEqual(["Ana Ruiz", "Ben Ode", "Cy Lam"]);
    const b = await call(studio, COACH_B, { op: "list", resource: "public.clients" });
    expect(b.body.rows.map((r: any) => r.values.name)).toEqual(["Dee Park"]);
  });

  it("pages, searches and filters on the server", async () => {
    const page = await call(studio, COACH_A, {
      op: "list",
      resource: "public.clients",
      page: 2,
      perPage: 2,
      sort: { field: "name", order: "asc" },
    });
    expect(page.body).toMatchObject({ total: 3 });
    expect(page.body.rows.map((r: any) => r.values.name)).toEqual(["Cy Lam"]);

    const search = await call(studio, COACH_A, { op: "list", resource: "public.clients", search: "tuesday" });
    expect(search.body.rows.map((r: any) => r.values.name)).toEqual(["Cy Lam"]);

    const wildcard = await call(studio, COACH_A, { op: "list", resource: "public.clients", search: "%" });
    expect(wildcard.body.total).toBe(0);

    const filtered = await call(studio, COACH_A, {
      op: "list",
      resource: "public.clients",
      filters: [{ field: "status", operator: "eq", value: "paused" }],
    });
    expect(filtered.body.rows.map((r: any) => r.values.name)).toEqual(["Ben Ode"]);
  });

  it("returns the version token exactly as Postgres stores it, microseconds included", async () => {
    const res = await readClient(CLIENT_1);
    const [stored] = await admin`select updated_at::text as v from public.clients where id = ${CLIENT_1}`;
    expect(res.body.row.version).toBe(stored!.v);
  });

  // ── Editing ────────────────────────────────────────────────────────────

  it("saves one cell, advances the version, and commits its audit entry with it", async () => {
    const before = await readClient(CLIENT_1);
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { notes: "Moved to evenings" },
      expectedVersion: before.body.row.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.row.values.notes).toBe("Moved to evenings");
    expect(res.body.row.version).not.toBe(before.body.row.version);
    expect(res.body.audit).toMatchObject({
      actor: COACH_A,
      resource: "public.clients",
      action: "update",
      key: { id: CLIENT_1 },
      before: { notes: "Prefers mornings" },
      after: { notes: "Moved to evenings" },
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: COACH_A,
      record_key: { id: CLIENT_1 },
      before: { notes: "Prefers mornings" },
      after: { notes: "Moved to evenings" },
    });
  });

  it("rejects an edit based on a stale version instead of overwriting, and says what changed", async () => {
    const seen = await readClient(CLIENT_1);
    const first = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { notes: "First editor" },
      expectedVersion: seen.body.row.version,
    });
    expect(first.status).toBe(200);

    const second = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { notes: "Second editor" },
      expectedVersion: seen.body.row.version,
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ outcome: "conflict", current: { notes: "First editor" } });
    expect(second.body.error.currentVersion).toBe(first.body.row.version);

    const [row] = await admin`select notes from public.clients where id = ${CLIENT_1}`;
    expect(row!.notes).toBe("First editor");
    expect(await auditRows()).toHaveLength(1);
  });

  it("serialises two edits racing on the same version: exactly one wins", async () => {
    const seen = await readClient(CLIENT_2);
    const attempt = (notes: string) =>
      call(studio, COACH_A, {
        op: "update",
        resource: "public.clients",
        id: CLIENT_2,
        data: { notes },
        expectedVersion: seen.body.row.version,
      });
    const results = await Promise.all([attempt("racer one"), attempt("racer two")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await auditRows()).toHaveLength(1);
  });

  it("rolls the edit back when its audit entry can't be written", async () => {
    const seen = await readClient(CLIENT_1);
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { notes: "fail-audit" },
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(500);
    expect(res.body.error.outcome).toBe("audit_failed");
    expect(res.body.error.message).toMatch(/^Not saved: the audit entry couldn't be written/);

    const after = await readClient(CLIENT_1);
    expect(after.body.row.values.notes).toBe("Prefers mornings");
    expect(after.body.row.version).toBe(seen.body.row.version);
    expect(await auditRows()).toHaveLength(0);
  });

  it("addresses and edits a row by a composite key", async () => {
    const listed = await call(studio, COACH_A, { op: "list", resource: "public.coach_clients" });
    expect(listed.body.total).toBe(2);
    const row = listed.body.rows.find((r: any) => r.values.client_id === CLIENT_2);
    const id = JSON.stringify([COACH_A, CLIENT_2]);

    const read = await call(studio, COACH_A, { op: "read", resource: "public.coach_clients", id });
    expect(read.body.row.values.label).toBe("backup");

    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.coach_clients",
      id,
      data: { label: "standby" },
      expectedVersion: row.version,
    });
    expect(res.status).toBe(200);
    expect(row.version).toBe("1");
    expect(res.body.row.version).toBe("2");
    expect(res.body.audit.key).toEqual({ coach_id: COACH_A, client_id: CLIENT_2 });

    const [other] = await admin`select label from public.coach_clients where client_id = ${CLIENT_1}`;
    expect(other!.label).toBe("primary");
  });

  it("hands each value to Postgres untouched, whatever the column type", async () => {
    const edit = async (data: Record<string, unknown>) => {
      const seen = await call(studio, COACH_A, { op: "read", resource: "public.typed", id: 1 });
      return call(studio, COACH_A, {
        op: "update",
        resource: "public.typed",
        id: 1,
        data,
        expectedVersion: seen.body.row.version,
      });
    };
    expect((await edit({ active: "false" })).status).toBe(200);
    expect((await edit({ meta: '{"b": [1, 2]}' })).status).toBe(200);
    expect((await edit({ starts_at: "2026-05-06 07:08:09.654321" })).status).toBe(200);
    const last = await edit({ score: 2.25 });
    expect(last.status).toBe(200);

    const [row] = await admin`select active, meta, starts_at::text as starts_at, score::text as score from public.typed`;
    expect(row).toEqual({ active: false, meta: { b: [1, 2] }, starts_at: "2026-05-06 07:08:09.654321", score: "2.25" });
    expect(last.body.row.values.starts_at).toBe("2026-05-06 07:08:09.654321");
    const audits = await auditRows();
    expect(audits.map((a) => a.after)).toEqual([
      { active: false },
      { meta: { b: [1, 2] } },
      { starts_at: "2026-05-06T07:08:09.654321" },
      { score: 2.25 },
    ]);
  });

  it("refuses a composite id that doesn't fit the key", async () => {
    const res = await call(studio, COACH_A, { op: "read", resource: "public.coach_clients", id: COACH_A });
    expect(res.status).toBe(400);
  });

  // ── Saying what actually happened ───────────────────────────────────────

  it("reports a row the user can't see as gone, never as permission denied", async () => {
    const [row] = await admin`select updated_at::text as v from public.clients where id = ${CLIENT_B}`;
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_B,
      data: { notes: "hijack" },
      expectedVersion: row!.v,
    });
    expect(res.status).toBe(410);
    expect(res.body.error.outcome).toBe("gone");
    const [unchanged] = await admin`select notes from public.clients where id = ${CLIENT_B}`;
    expect(unchanged!.notes).toBe("Coach B only");
  });

  it("reports a row deleted since it was read as gone", async () => {
    const seen = await readClient(CLIENT_3);
    await admin`delete from public.clients where id = ${seen.body.row.values.id}`;
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: seen.body.row.values.id,
      data: { notes: "too late" },
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(410);
  });

  it("reports forbidden only when the row is visible, unchanged, and the row rules refuse it", async () => {
    const listed = await call(studio, COACH_A, { op: "list", resource: "public.locked_rows" });
    const frozen = listed.body.rows.find((r: any) => r.values.id === 2);
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.locked_rows",
      id: 2,
      data: { label: "thawed" },
      expectedVersion: frozen.version,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/row rules don't let you change this row/);
  });

  it("refuses a field the database doesn't let this user update", async () => {
    const seen = await readClient(CLIENT_1);
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { coach_id: COACH_B },
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(403);
    const [row] = await admin`select coach_id from public.clients where id = ${CLIENT_1}`;
    expect(row!.coach_id).toBe(COACH_A);
  });

  it("returns the database's own reason for a value it rejects", async () => {
    const seen = await readClient(CLIENT_1);
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.clients",
      id: CLIENT_1,
      data: { status: "archived" },
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/check constraint/);
  });

  it("refuses edits to a table whose version nothing advances", async () => {
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.no_trigger",
      id: 1,
      data: { label: "changed" },
      expectedVersion: null,
    });
    expect(res.status).toBe(403);
    const [row] = await admin`select label from public.no_trigger where id = 1`;
    expect(row!.label).toBe("static");
  });

  it("rolls back an edit when a trigger that looked right didn't advance the version", async () => {
    const listed = await call(studio, COACH_A, { op: "list", resource: "public.lying" });
    const res = await call(studio, COACH_A, {
      op: "update",
      resource: "public.lying",
      id: 1,
      data: { label: "sneaky" },
      expectedVersion: listed.body.rows[0].version,
    });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/didn't change on update/);
    const [row] = await admin`select label from public.lying where id = 1`;
    expect(row!.label).toBe("original");
    expect(await auditRows()).toHaveLength(0);
  });

  it("lets nobody write or erase the audit log directly", async () => {
    const login = postgres(loginUrl(), { max: 1, onnotice: () => {} });
    try {
      // A failed statement aborts its transaction, so each attempt gets its own.
      const asUser = (statement: (tx: postgres.TransactionSql) => Promise<unknown>) =>
        login.begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true)`;
          await statement(tx);
        });
      await expect(
        asUser((tx) => tx`insert into genesis_studio.audit_log (resource, record_key, action) values ('x', '{}', 'update')`),
      ).rejects.toThrow(/permission denied/);
      await expect(asUser((tx) => tx`delete from genesis_studio.audit_log`)).rejects.toThrow(/permission denied/);
      await expect(asUser((tx) => tx`update genesis_studio.audit_log set actor = 'forged'`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await login.end();
    }
  });
});
