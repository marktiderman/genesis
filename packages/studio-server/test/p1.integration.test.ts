import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import postgres from "postgres";
import {
  adminSql,
  ADMIN_URL,
  call,
  CLIENT_1,
  CLIENT_2,
  CLIENT_B,
  COACH_A,
  describeDb,
  makeHandler,
  resetDatabase,
} from "./fixtures";
import {
  byResource,
  createOutboxWorker,
  studioSetupSql,
  PermanentDeliveryError,
  type OutboxEntry,
  type StudioHandler,
} from "../src/index";

describeDb("P1: create, delete, history, relations, rule-bearing writes, outbox", () => {
  let studio: StudioHandler;
  let admin: ReturnType<typeof adminSql>;
  const extra: StudioHandler[] = [];
  const handler = (...args: Parameters<typeof makeHandler>) => {
    const h = makeHandler(...args);
    extra.push(h);
    return h;
  };

  beforeAll(() => {
    studio = makeHandler();
    admin = adminSql();
  });
  beforeEach(resetDatabase);
  afterAll(async () => {
    await Promise.all([studio.close(), admin.end(), ...extra.map((h) => h.close())]);
  });

  const readClient = (id: string) => call(studio, COACH_A, { op: "read", resource: "public.clients", id });
  const audit = () =>
    admin`select action, record_key, before, after from genesis_studio.audit_log order by occurred_at`;

  // ── Describe ────────────────────────────────────────────────────────────

  it("reports create, delete and history access, a label field and relations", async () => {
    const { body } = await call(studio, COACH_A, { op: "describe", resource: "public.clients" });
    const { schema } = body;
    expect(schema.access).toMatchObject({ read: true, update: true, create: true, delete: true, history: true });
    expect(schema.labelField).toBe("name");
    expect(schema.createFields.sort()).toEqual(["name", "notes", "program_id", "status"]);
    const relations = schema.relations.map((r: any) => `${r.kind}:${r.resource}:${r.field}:${r.through?.resource ?? ""}`).sort();
    expect(relations).toEqual([
      "many:public.client_notes:client_id:",
      "one:public.programs:program_id:",
      "through:public.coaches:client_id:public.coach_clients",
    ]);
  });

  it("explains why create, delete and history are off", async () => {
    const readOnly = handler({ authorize: byResource({ "public.clients": { read: true } }, { who: () => true }) });
    const { body } = await call(readOnly, COACH_A, { op: "describe", resource: "public.clients" });
    expect(body.schema.access).toMatchObject({ create: false, delete: false, history: false });
    expect(body.schema.access.reasons.create).toMatch(/adding rows isn't enabled/);
    expect(body.schema.access.reasons.history).toMatch(/history isn't enabled/i);
    const denied = await call(readOnly, COACH_A, { op: "create", resource: "public.clients", data: { name: "X" } });
    expect(denied.status).toBe(403);
  });

  it("leaves out relations to tables this user may not see", async () => {
    const narrow = handler({
      authorize: byResource({ "public.clients": { read: true } }, { who: () => true }),
    });
    const { body } = await call(narrow, COACH_A, { op: "describe", resource: "public.clients" });
    expect(body.schema.relations).toBeUndefined();
  });

  // ── Create ──────────────────────────────────────────────────────────────

  it("creates a row as the user, with its audit entry", async () => {
    const res = await call(studio, COACH_A, {
      op: "create",
      resource: "public.clients",
      data: { name: "Eli Moss", status: "active", program_id: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.body.row.values).toMatchObject({ name: "Eli Moss", coach_id: COACH_A, program_id: 1 });
    expect(res.body.id).toBe(res.body.row.values.id);
    expect(res.body.audit).toMatchObject({ action: "create", before: null, after: { name: "Eli Moss" } });
    const [row] = await audit();
    expect(row).toMatchObject({ action: "create", record_key: { id: res.body.id } });
  });

  it("refuses a field the user may not set on a new row", async () => {
    const res = await call(studio, COACH_A, {
      op: "create",
      resource: "public.clients",
      data: { name: "Sly", coach_id: CLIENT_B },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/"coach_id" isn't a field you can set/);
  });

  it("returns the database's reason for a row it rejects", async () => {
    const res = await call(studio, COACH_A, { op: "create", resource: "public.clients", data: { status: "active" } });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/null value in column "name"/);
    expect(await audit()).toHaveLength(0);
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  it("deletes a row at the version it was read, with its audit entry", async () => {
    const seen = await readClient(CLIENT_2);
    const res = await call(studio, COACH_A, {
      op: "delete",
      resource: "public.clients",
      id: CLIENT_2,
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.audit).toMatchObject({ action: "delete", after: null, before: { name: "Ben Ode" } });
    expect(await admin`select 1 from public.clients where id = ${CLIENT_2}`).toHaveLength(0);
  });

  it("deletes with only DELETE rights: no row lock that needs UPDATE", async () => {
    const read = await call(studio, COACH_A, { op: "read", resource: "public.delete_only", id: 1 });
    const res = await call(studio, COACH_A, { op: "delete", resource: "public.delete_only", id: 1, expectedVersion: read.body.row.version });
    expect(res.status).toBe(200);
    expect(await admin`select count(*)::int as n from public.delete_only`).toEqual([{ n: 0 }]);
  });

  it("won't delete a row someone changed since it was read", async () => {
    const seen = await readClient(CLIENT_2);
    await admin`update public.clients set notes = 'changed meanwhile' where id = ${CLIENT_2}`;
    const res = await call(studio, COACH_A, {
      op: "delete",
      resource: "public.clients",
      id: CLIENT_2,
      expectedVersion: seen.body.row.version,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.current.notes).toBe("changed meanwhile");
    expect(await admin`select 1 from public.clients where id = ${CLIENT_2}`).toHaveLength(1);
  });

  it("reports another coach's row as gone, and leaves it", async () => {
    const [row] = await admin`select updated_at::text as v from public.clients where id = ${CLIENT_B}`;
    const res = await call(studio, COACH_A, {
      op: "delete",
      resource: "public.clients",
      id: CLIENT_B,
      expectedVersion: row!.v,
    });
    expect(res.status).toBe(410);
    expect(await admin`select 1 from public.clients where id = ${CLIENT_B}`).toHaveLength(1);
  });

  // ── History ─────────────────────────────────────────────────────────────

  it("returns a row's history, newest first, with only the fields the user may read", async () => {
    let seen = await readClient(CLIENT_1);
    for (const notes of ["first", "second"]) {
      const res = await call(studio, COACH_A, {
        op: "update",
        resource: "public.clients",
        id: CLIENT_1,
        data: { notes },
        expectedVersion: seen.body.row.version,
      });
      seen = { ...seen, body: { row: res.body.row } };
    }
    const all = await call(studio, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_1 });
    expect(all.body.entries.map((e: any) => e.after.notes)).toEqual(["second", "first"]);

    const narrow = handler({
      authorize: byResource(
        { "public.clients": { read: { except: ["notes"] }, history: true } },
        { who: () => true },
      ),
    });
    const hidden = await call(narrow, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_1 });
    expect(hidden.body.entries).toHaveLength(2);
    for (const entry of hidden.body.entries) {
      expect(entry.after).not.toHaveProperty("notes");
      expect(entry.before).not.toHaveProperty("notes");
    }
  });

  it("keeps record_history to the studio's login when loginRole is set", async () => {
    await admin.unsafe(studioSetupSql({ loginRole: "studio_login", workerRole: "outbox_worker" }));
    const ok = await call(studio, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_1 });
    expect(ok.status).toBe(200);
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(`select set_config('request.jwt.claims', '{"sub": "${COACH_A}"}', true)`);
        await tx.unsafe("set local role authenticated");
        await tx.unsafe(`select * from genesis_studio.record_history('public.clients', '{"id": "${CLIENT_1}"}', 10)`);
      }),
    ).rejects.toThrow(/only the studio login/);
  });

  it("refuses history for a row the user can't see", async () => {
    const res = await call(studio, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_B });
    expect(res.status).toBe(410);
  });

  // ── Lists ───────────────────────────────────────────────────────────────

  it("sorts on the server by several fields", async () => {
    const res = await call(studio, COACH_A, {
      op: "list",
      resource: "public.clients",
      sorts: [
        { field: "status", order: "asc" },
        { field: "name", order: "desc" },
      ],
    });
    expect(res.body.rows.map((r: any) => `${r.values.status}:${r.values.name}`)).toEqual([
      "active:Cy Lam",
      "active:Ana Ruiz",
      "paused:Ben Ode",
    ]);
  });

  // ── Rule-bearing writes (decision 29) ───────────────────────────────────

  const viaFunctions = () =>
    handler({
      resources: {
        "public.scores": {
          functions: { update: "public.save_score", create: "public.add_score", delete: "public.remove_score" },
        },
      },
    });

  it("routes writes through the app's functions, and its rules decide", async () => {
    const fn = viaFunctions();
    const described = await call(fn, COACH_A, { op: "describe", resource: "public.scores" });
    expect(described.body.schema.access).toMatchObject({ update: true, create: true, delete: true });
    // With no direct grants, the direct path would have been read-only.
    const direct = await call(studio, COACH_A, { op: "describe", resource: "public.scores" });
    expect(direct.body.schema.access.update).toBe(false);

    const listed = await call(fn, COACH_A, { op: "list", resource: "public.scores" });
    const seen = listed.body.rows[0];
    const tooMany = await call(fn, COACH_A, {
      op: "update",
      resource: "public.scores",
      id: 1,
      data: { points: 120 },
      expectedVersion: seen.version,
    });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.message).toMatch(/Points can't exceed 100/);

    const saved = await call(fn, COACH_A, {
      op: "update",
      resource: "public.scores",
      id: 1,
      data: { points: 95 },
      expectedVersion: seen.version,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.row.values.points).toBe(95);
    expect(saved.body.audit.after.points).toBe(95);

    const created = await call(fn, COACH_A, { op: "create", resource: "public.scores", data: { id: 2, points: 10 } });
    expect(created.status).toBe(200);
    expect(created.body.id).toBe(2);

    const removed = await call(fn, COACH_A, {
      op: "delete",
      resource: "public.scores",
      id: 2,
      expectedVersion: created.body.row.version,
    });
    expect(removed.status).toBe(200);
    expect((await audit()).map((a) => a.action)).toEqual(["update", "create", "delete"]);
  });

  it("keeps a table read-only when its mapped function doesn't exist", async () => {
    const missing = handler({ resources: { "public.scores": { functions: { update: "public.nope" } } } });
    const { body } = await call(missing, COACH_A, { op: "describe", resource: "public.scores" });
    expect(body.schema.access.update).toBe(false);
    expect(body.schema.access.reason).toMatch(/public\.nope\(jsonb, jsonb\) isn't installed/);
  });

  // ── Outbox ──────────────────────────────────────────────────────────────

  function workerUrl(): string {
    const url = new URL(ADMIN_URL!);
    url.username = "outbox_worker";
    url.password = "outbox_worker";
    return url.toString();
  }

  async function editNotes(h: StudioHandler, id: string, values: string[]) {
    let version = (await call(h, COACH_A, { op: "read", resource: "public.clients", id })).body.row.version;
    for (const notes of values) {
      const res = await call(h, COACH_A, { op: "update", resource: "public.clients", id, data: { notes }, expectedVersion: version });
      expect(res.status).toBe(200);
      version = res.body.row.version;
    }
  }

  it("queues each entry in the outbox with the edit, and delivers in order", async () => {
    const queued = handler({ audit: { sink: "outbox" } });
    await editNotes(queued, CLIENT_1, ["one", "two", "three"]);
    expect(await admin`select count(*)::int as n from genesis_studio.outbox`).toEqual([{ n: 3 }]);

    const seen: OutboxEntry[] = [];
    const worker = createOutboxWorker({ database: workerUrl(), deliver: async (e) => void seen.push(e) });
    try {
      // One record goes one entry at a time, even within a batch.
      for (let i = 0; i < 3; i++) await worker.runOnce();
      expect(seen.map((e) => e.entry.after?.notes)).toEqual(["one", "two", "three"]);
      expect(new Set(seen.map((e) => e.id)).size).toBe(3);
      expect(await worker.runOnce()).toEqual({ delivered: 0, retried: 0, deadLettered: 0 });
    } finally {
      await worker.stop();
    }
  });

  it("retries a failed delivery, and holds later entries for that record behind it", async () => {
    const queued = handler({ audit: { sink: "outbox" } });
    await editNotes(queued, CLIENT_1, ["a1", "a2"]);
    await editNotes(queued, CLIENT_2, ["b1"]);
    let failOnce = true;
    const seen: string[] = [];
    const worker = createOutboxWorker({
      database: workerUrl(),
      baseDelayMs: 0,
      deliver: async (e) => {
        if (e.entry.after?.notes === "a1" && failOnce) {
          failOnce = false;
          throw new Error("receiver down");
        }
        seen.push(String(e.entry.after?.notes));
      },
    });
    try {
      const first = await worker.runOnce();
      expect(first).toMatchObject({ retried: 1 });
      expect(seen).toEqual(["b1"]); // the other record kept flowing
      await worker.runOnce();
      await worker.runOnce();
      expect(seen).toEqual(["b1", "a1", "a2"]);
      const [row] = await admin`select attempts from genesis_studio.outbox where payload -> 'after' ->> 'notes' = 'a1'`;
      expect(row!.attempts).toBe(2);
    } finally {
      await worker.stop();
    }
  });

  it("dead-letters a permanent failure, blocks that record until replay, then delivers in order", async () => {
    const queued = handler({ audit: { sink: "outbox" } });
    await editNotes(queued, CLIENT_1, ["x1", "x2"]);
    let reject = true;
    const seen: string[] = [];
    const alerts: string[] = [];
    const worker = createOutboxWorker({
      database: workerUrl(),
      onDeadLetter: (letter) => void alerts.push(letter.id),
      deliver: async (e) => {
        if (e.entry.after?.notes === "x1" && reject) throw new PermanentDeliveryError("bad payload");
        seen.push(String(e.entry.after?.notes));
      },
    });
    try {
      expect(await worker.runOnce()).toMatchObject({ deadLettered: 1 });
      expect(alerts).toHaveLength(1);
      await worker.runOnce();
      expect(seen).toEqual([]); // x2 waits behind the dead letter
      const [dead] = await worker.deadLetters();
      expect(dead).toMatchObject({ resource: "public.clients", lastError: "bad payload" });

      reject = false;
      expect(await worker.replay(dead!.id)).toBe(true);
      await worker.runOnce();
      await worker.runOnce();
      expect(seen).toEqual(["x1", "x2"]);
      expect(await worker.deadLetters()).toHaveLength(0);
    } finally {
      await worker.stop();
    }
  });

  it("never delivers one entry twice when workers run at once", async () => {
    const queued = handler({ audit: { sink: "outbox" } });
    await editNotes(queued, CLIENT_1, ["c1"]);
    await editNotes(queued, CLIENT_2, ["c2"]);
    const seen: string[] = [];
    const deliver = async (e: OutboxEntry) => {
      await new Promise((r) => setTimeout(r, 50));
      seen.push(e.id);
    };
    const a = createOutboxWorker({ database: workerUrl(), deliver });
    const b = createOutboxWorker({ database: workerUrl(), deliver });
    try {
      await Promise.all([a.runOnce(), b.runOnce()]);
      await Promise.all([a.runOnce(), b.runOnce()]);
      expect(seen).toHaveLength(2);
      expect(new Set(seen).size).toBe(2);
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  });

  it("reports a polling failure to onError instead of failing silently", async () => {
    const url = new URL(workerUrl());
    url.password = "wrong";
    const errors: unknown[] = [];
    const worker = createOutboxWorker({
      database: url.toString(),
      deliver: async () => {},
      pollIntervalMs: 20,
      // An async logger that rejects must not stop the worker either.
      onError: async (error) => {
        errors.push(error);
        throw new Error("a broken logger");
      },
    });
    worker.start();
    try {
      await expect.poll(() => errors.length, { timeout: 5_000 }).toBeGreaterThan(1);
      expect(String(errors[0])).toMatch(/password authentication failed/);
    } finally {
      await worker.stop();
    }
  });

  it("keeps the outbox out of reach of signed-in users", async () => {
    const queued = handler({ audit: { sink: "outbox" } });
    await editNotes(queued, CLIENT_1, ["secret"]);
    const login = postgres(new URL(ADMIN_URL!).toString().replace("postgres:postgres@", "studio_login:studio_login@"), {
      max: 1,
      onnotice: () => {},
    });
    try {
      await expect(
        login.begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select * from genesis_studio.outbox`;
        }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await login.end();
    }
  });
});
