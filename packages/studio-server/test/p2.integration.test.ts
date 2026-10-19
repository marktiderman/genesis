import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { adminSql, call, CLIENT_1, CLIENT_2, CLIENT_3, CLIENT_B, COACH_A, COACH_B, describeDb, makeHandler, resetDatabase } from "./fixtures";
import type { StudioHandler } from "../src/index";

describeDb("P2: exact bulk writes, imports with a dry run, undo from the audit", () => {
  let studio: StudioHandler;
  let admin: ReturnType<typeof adminSql>;
  const extra: StudioHandler[] = [];

  beforeAll(() => {
    studio = makeHandler();
    admin = adminSql();
  });
  beforeEach(resetDatabase);
  afterAll(async () => {
    await Promise.all([studio.close(), admin.end(), ...extra.map((h) => h.close())]);
  });

  const version = async (id: string) =>
    (await call(studio, COACH_A, { op: "read", resource: "public.clients", id })).body.row.version as string;
  const notes = async () =>
    Object.fromEntries((await admin`select id, notes from public.clients order by id`).map((r) => [r.id, r.notes]));
  const auditCount = async () => (await admin`select count(*)::int as n from genesis_studio.audit_log`)[0]!.n;

  // ── Bulk update ─────────────────────────────────────────────────────────

  it("updates many rows in one transaction, each at its version, each audited", async () => {
    const res = await call(studio, COACH_A, {
      op: "updateMany",
      resource: "public.clients",
      changes: [
        { id: CLIENT_1, data: { status: "paused" }, expectedVersion: await version(CLIENT_1) },
        { id: CLIENT_2, data: { status: "paused" }, expectedVersion: await version(CLIENT_2) },
        { id: CLIENT_3, data: { status: "paused" }, expectedVersion: await version(CLIENT_3) },
      ],
    });
    expect(res.body).toMatchObject({ ok: true, count: 3 });
    expect(await auditCount()).toBe(3);
  });

  it("changes nothing when any row fails, and lists every failure", async () => {
    const before = await notes();
    const stale = await version(CLIENT_2);
    await admin`update public.clients set notes = 'moved on' where id = ${CLIENT_2}`;
    const res = await call(studio, COACH_A, {
      op: "updateMany",
      resource: "public.clients",
      changes: [
        { id: CLIENT_1, data: { notes: "bulk" }, expectedVersion: await version(CLIENT_1) },
        { id: CLIENT_2, data: { notes: "bulk" }, expectedVersion: stale },
        { id: CLIENT_3, data: { status: "archived" }, expectedVersion: await version(CLIENT_3) },
        { id: CLIENT_B, data: { notes: "bulk" }, expectedVersion: null },
      ],
    });
    expect(res.body.ok).toBe(false);
    expect(res.body.count).toBe(0);
    expect(res.body.failures.map((f: any) => [f.index, f.outcome])).toEqual([
      [1, "conflict"],
      [2, "invalid"],
      [3, "gone"],
    ]);
    expect(await notes()).toEqual({ ...before, [CLIENT_2]: "moved on" });
    expect(await auditCount()).toBe(0);
  });

  // ── Bulk delete ─────────────────────────────────────────────────────────

  it("deletes many rows exactly, or none", async () => {
    const stale = await version(CLIENT_3);
    await admin`update public.clients set notes = 'moved on' where id = ${CLIENT_3}`;
    const refused = await call(studio, COACH_A, {
      op: "deleteMany",
      resource: "public.clients",
      items: [
        { id: CLIENT_2, expectedVersion: await version(CLIENT_2) },
        { id: CLIENT_3, expectedVersion: stale },
      ],
    });
    expect(refused.body).toMatchObject({ ok: false, count: 0 });
    expect((await admin`select count(*)::int as n from public.clients`)[0]!.n).toBe(4);

    const done = await call(studio, COACH_A, {
      op: "deleteMany",
      resource: "public.clients",
      items: [
        { id: CLIENT_2, expectedVersion: await version(CLIENT_2) },
        { id: CLIENT_3, expectedVersion: await version(CLIENT_3) },
      ],
    });
    expect(done.body).toMatchObject({ ok: true, count: 2 });
    expect((await admin`select count(*)::int as n from public.clients`)[0]!.n).toBe(2);
  });

  // ── Import ──────────────────────────────────────────────────────────────

  const rows = [
    { name: "Imported One", status: "active" },
    { name: "Imported Two", status: "archived" },
    { status: "active" },
    { name: "Imported Four", program_id: "not-a-number" },
    { name: "Imported Five", coach_id: COACH_B },
  ];

  it("dry-runs an import: every failing row is listed, nothing is kept", async () => {
    const res = await call(studio, COACH_A, { op: "import", resource: "public.clients", rows, dryRun: true });
    expect(res.body).toMatchObject({ ok: false, dryRun: true, count: 1 });
    expect(res.body.failures.map((f: any) => [f.index, f.outcome])).toEqual([
      [1, "invalid"],
      [2, "invalid"],
      [3, "invalid"],
      [4, "forbidden"],
    ]);
    expect(res.body.failures[1].message).toMatch(/null value in column "name"/);
    expect(res.body.failures[2].message).toMatch(/invalid input syntax for type integer/);
    expect((await admin`select count(*)::int as n from public.clients`)[0]!.n).toBe(4);
    expect(await auditCount()).toBe(0);
  });

  it("imports all rows in one transaction, or none", async () => {
    const refused = await call(studio, COACH_A, { op: "import", resource: "public.clients", rows, dryRun: false });
    expect(refused.body).toMatchObject({ ok: false, count: 0 });
    expect((await admin`select count(*)::int as n from public.clients`)[0]!.n).toBe(4);

    const good = [{ name: "Imp A" }, { name: "Imp B", status: "paused", program_id: "2" }];
    const clean = await call(studio, COACH_A, { op: "import", resource: "public.clients", rows: good, dryRun: true });
    expect(clean.body).toMatchObject({ ok: true, dryRun: true, count: 2 });
    const done = await call(studio, COACH_A, { op: "import", resource: "public.clients", rows: good, dryRun: false });
    expect(done.body).toMatchObject({ ok: true, count: 2 });
    const added = await admin`select name, coach_id, program_id from public.clients where name like 'Imp %' order by name`;
    expect(added).toEqual([
      { name: "Imp A", coach_id: COACH_A, program_id: null },
      { name: "Imp B", coach_id: COACH_A, program_id: 2 },
    ]);
    expect(await auditCount()).toBe(2);
  });

  // ── Undo ────────────────────────────────────────────────────────────────

  async function edit(id: string, data: Record<string, unknown>) {
    const res = await call(studio, COACH_A, { op: "update", resource: "public.clients", id, data, expectedVersion: await version(id) });
    expect(res.status).toBe(200);
    return res.body.audit.id as string;
  }

  it("undoes an edit with a compensating, audited write", async () => {
    const auditId = await edit(CLIENT_1, { notes: "oops", status: "paused" });
    const res = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId });
    expect(res.status).toBe(200);
    expect(res.body.audit).toMatchObject({ action: "update", after: { notes: "Prefers mornings", status: "active" } });
    expect((await admin`select notes, status from public.clients where id = ${CLIENT_1}`)[0]).toEqual({
      notes: "Prefers mornings",
      status: "active",
    });
    // Undoing again would overwrite the undo itself.
    const again = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId });
    expect(again.status).toBe(409);
  });

  it("refuses to undo over a later change", async () => {
    const auditId = await edit(CLIENT_1, { notes: "first" });
    await edit(CLIENT_1, { notes: "second" });
    const res = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/notes changed since/);
    expect((await admin`select notes from public.clients where id = ${CLIENT_1}`)[0]!.notes).toBe("second");
  });

  it("checks deferred constraints per row, in a dry run too", async () => {
    const rows = [
      { id: 1, code: "A" },
      { id: 2, code: "A" },
    ];
    const dry = await call(studio, COACH_A, { op: "import", resource: "public.deferred_codes", rows, dryRun: true });
    expect(dry.body.ok).toBe(false);
    expect(dry.body.failures.map((f: any) => f.index)).toEqual([1]);
    const real = await call(studio, COACH_A, { op: "import", resource: "public.deferred_codes", rows, dryRun: false });
    expect(real.status).toBe(200);
    expect(real.body).toMatchObject({ ok: false, count: 0 });
    expect(real.body.failures.map((f: any) => f.index)).toEqual([1]);
  });

  it("only undoes the user's own changes", async () => {
    const auditId = await edit(CLIENT_1, { notes: "mine" });
    const [row] = await admin`update genesis_studio.audit_log set actor = ${COACH_B} where id = ${auditId} returning id`;
    expect(row).toBeTruthy();
    const res = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId });
    // audit_entry returns only the caller's own entries, so someone else's reads as missing.
    expect(res.status).toBe(410);
    const [still] = await admin`select notes from public.clients where id = ${CLIENT_1}`;
    expect(still!.notes).toBe("mine");
  });

  it("undoes an added row by deleting it", async () => {
    const created = await call(studio, COACH_A, { op: "create", resource: "public.clients", data: { name: "Temp" } });
    const res = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId: created.body.audit.id });
    expect(res.status).toBe(200);
    expect(res.body.audit.action).toBe("delete");
    expect(await admin`select 1 from public.clients where name = 'Temp'`).toHaveLength(0);
  });

  it("restores a deleted row with its own key, or refuses", async () => {
    // clients' key comes from a default the user can't set: refused.
    const del = await call(studio, COACH_A, { op: "delete", resource: "public.clients", id: CLIENT_2, expectedVersion: await version(CLIENT_2) });
    const refused = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId: del.body.audit.id });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/same identity/);

    // scores' key is set by the caller (through the app's function): restored.
    const scores = makeHandler({
      resources: { "public.scores": { functions: { update: "public.save_score", create: "public.add_score", delete: "public.remove_score" } } },
    });
    extra.push(scores);
    const seen = (await call(scores, COACH_A, { op: "read", resource: "public.scores", id: 1 })).body.row;
    const gone = await call(scores, COACH_A, { op: "delete", resource: "public.scores", id: 1, expectedVersion: seen.version });
    expect(gone.status).toBe(200);
    // Undo needs history access; give the scores rule history for this check.
    const withHistory = makeHandler({
      authorize: ({ resource }) => resource === "public.scores",
      resources: { "public.scores": { functions: { update: "public.save_score", create: "public.add_score", delete: "public.remove_score" } } },
    });
    extra.push(withHistory);
    const restored = await call(withHistory, COACH_A, { op: "undo", resource: "public.scores", auditId: gone.body.audit.id });
    expect(restored.status).toBe(200);
    expect((await admin`select id, points from public.scores`)).toEqual([{ id: 1, points: 40 }]);
  });
});
