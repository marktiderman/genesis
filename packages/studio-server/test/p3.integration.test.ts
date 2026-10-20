import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { adminSql, call, CLIENT_1, CLIENT_2, CLIENT_B, COACH_A, COACH_B, DEFAULT_RULES, describeDb, makeHandler, resetDatabase } from "./fixtures";
import { byResource, studioSetupSql, type StudioHandler } from "../src/index";

const ACTIONS = [
  { name: "complete", label: "Mark done", function: "public.complete_client", confirm: "Mark this client done?" },
  { name: "archive", label: "Archive", function: "public.archive_client" },
  { name: "ping", label: "Ping", function: "public.ping_client" },
  { name: "missing", label: "Broken", function: "public.no_such_function" },
];

describeDb("P3: row actions, comments, checked-in contracts", () => {
  let studio: StudioHandler;
  let admin: ReturnType<typeof adminSql>;
  const errors: unknown[] = [];
  const extra: StudioHandler[] = [];

  beforeAll(() => {
    studio = makeHandler({
      authorize: byResource(
        {
          ...DEFAULT_RULES,
          "public.clients": { ...DEFAULT_RULES["public.clients"], actions: ["complete", "archive", "ping", "missing"], comment: true },
        },
        { who: () => true },
      ),
      resources: { "public.clients": { actions: ACTIONS } },
      onError: (e) => errors.push(e),
    });
    admin = adminSql();
  });
  beforeEach(async () => {
    errors.length = 0;
    await resetDatabase();
  });
  afterAll(async () => {
    await Promise.all([studio.close(), admin.end(), ...extra.map((h) => h.close())]);
  });

  const read = async (id: string, as = COACH_A) => (await call(studio, as, { op: "read", resource: "public.clients", id })).body.row;
  const run = async (action: string, id: string, expectedVersion: string | null, as = COACH_A) =>
    call(studio, as, { op: "runAction", resource: "public.clients", id, action, expectedVersion });

  // ── Row actions ─────────────────────────────────────────────────────────

  it("offers only actions that are allowed and whose function exists", async () => {
    const res = await call(studio, COACH_A, { op: "describe", resource: "public.clients" });
    expect(res.body.schema.actions).toEqual([
      { name: "complete", label: "Mark done", confirm: "Mark this client done?" },
      { name: "archive", label: "Archive" },
      { name: "ping", label: "Ping" },
    ]);
    // The broken one goes to the operator, not the user.
    expect(String(errors[0])).toContain("public.no_such_function");
    // A table with no actions configured has none.
    const programs = await call(studio, COACH_A, { op: "describe", resource: "public.programs" });
    expect(programs.body.schema.actions).toBeUndefined();
  });

  it("asks authorize per action", async () => {
    const narrow = makeHandler({
      authorize: byResource({ ...DEFAULT_RULES, "public.clients": { ...DEFAULT_RULES["public.clients"], actions: ["ping"] } }, { who: () => true }),
      resources: { "public.clients": { actions: ACTIONS.slice(0, 3) } },
    });
    extra.push(narrow);
    const res = await call(narrow, COACH_A, { op: "describe", resource: "public.clients" });
    expect(res.body.schema.actions.map((a: any) => a.name)).toEqual(["ping"]);
    const refused = await call(narrow, COACH_A, {
      op: "runAction",
      resource: "public.clients",
      id: CLIENT_1,
      action: "complete",
      expectedVersion: (await read(CLIENT_1)).version,
    });
    expect(refused.status).toBe(403);
    expect((await admin`select status from public.clients where id = ${CLIENT_1}`)[0]!.status).toBe("active");
  });

  it("runs an action at the row's version, and audits its effect as run:<name>", async () => {
    const before = await read(CLIENT_1);
    const res = await run("complete", CLIENT_1, before.version);
    expect(res.status).toBe(200);
    expect(res.body.row.values.status).toBe("done");
    expect(res.body.audit).toMatchObject({ action: "run", rowAction: "complete", before: { status: "active" }, after: { status: "done" } });
    const [entry] = await admin`select action from genesis_studio.audit_log`;
    expect(entry!.action).toBe("run:complete");
    // History reads it back as a row action.
    const history = await call(studio, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_1 });
    expect(history.body.entries[0]).toMatchObject({ action: "run", rowAction: "complete" });
  });

  it("refuses an action on a row someone else changed", async () => {
    const stale = (await read(CLIENT_1)).version;
    await admin`update public.clients set notes = 'moved on' where id = ${CLIENT_1}`;
    const res = await run("complete", CLIENT_1, stale);
    expect(res.status).toBe(409);
    expect((await admin`select status from public.clients where id = ${CLIENT_1}`)[0]!.status).toBe("active");
    expect((await admin`select count(*)::int as n from genesis_studio.audit_log`)[0]!.n).toBe(0);
  });

  it("can't reach a row hidden by RLS", async () => {
    const res = await run("complete", CLIENT_B, null);
    expect(res.status).toBe(410);
    expect((await admin`select status from public.clients where id = ${CLIENT_B}`)[0]!.status).toBe("active");
  });

  it("reports an action that removes the row, audited with no after", async () => {
    const res = await run("archive", CLIENT_2, (await read(CLIENT_2)).version);
    expect(res.status).toBe(200);
    expect(res.body.row).toBeNull();
    expect(res.body.audit).toMatchObject({ action: "run", rowAction: "archive", after: null });
    expect(res.body.audit.before.name).toBe("Ben Ode");
  });

  it("audits an action that changes nothing on the row", async () => {
    const res = await run("ping", CLIENT_1, (await read(CLIENT_1)).version);
    expect(res.status).toBe(200);
    expect(res.body.audit).toMatchObject({ action: "run", rowAction: "ping", before: {}, after: {} });
  });

  it("refuses an action that isn't offered, and won't undo one", async () => {
    const unknown = await run("missing", CLIENT_1, (await read(CLIENT_1)).version);
    expect(unknown.status).toBe(403);
    const done = await run("complete", CLIENT_1, (await read(CLIENT_1)).version);
    const undo = await call(studio, COACH_A, { op: "undo", resource: "public.clients", auditId: done.body.audit.id });
    expect(undo.status).toBe(403);
    expect(undo.body.error.message).toMatch(/row action/);
  });

  // ── Comments ────────────────────────────────────────────────────────────

  it("adds and lists comments, with the author from the token", async () => {
    const added = await call(studio, COACH_A, { op: "comment", resource: "public.clients", id: CLIENT_1, body: "Called, left a message." });
    expect(added.status).toBe(200);
    expect(added.body.comment).toMatchObject({ author: COACH_A, body: "Called, left a message." });
    await call(studio, COACH_A, { op: "comment", resource: "public.clients", id: CLIENT_1, body: "Booked for Tuesday." });
    const listed = await call(studio, COACH_A, { op: "comments", resource: "public.clients", id: CLIENT_1 });
    expect(listed.body.comments.map((c: any) => c.body)).toEqual(["Called, left a message.", "Booked for Tuesday."]);
    // The acting role can't touch the comments table directly.
    const [grant] = await admin`select has_table_privilege('authenticated', 'genesis_studio.comments', 'select') as ok`;
    expect(grant!.ok).toBe(false);
  });

  it("keeps comments to rows the user can see", async () => {
    await call(studio, COACH_B, { op: "comment", resource: "public.clients", id: CLIENT_B, body: "Coach B's note" });
    const peek = await call(studio, COACH_A, { op: "comments", resource: "public.clients", id: CLIENT_B });
    expect(peek.status).toBe(410);
    const post = await call(studio, COACH_A, { op: "comment", resource: "public.clients", id: CLIENT_B, body: "sneaky" });
    expect(post.status).toBe(410);
    expect((await admin`select count(*)::int as n from genesis_studio.comments`)[0]!.n).toBe(1);
  });

  it("refuses comments where authorize doesn't allow them, and empty ones", async () => {
    const programs = await call(studio, COACH_A, { op: "describe", resource: "public.programs" });
    expect(programs.body.schema.access).toMatchObject({ comment: false });
    const refused = await call(studio, COACH_A, { op: "comment", resource: "public.programs", id: 1, body: "hi" });
    expect(refused.status).toBe(403);
    const empty = await call(studio, COACH_A, { op: "comment", resource: "public.clients", id: CLIENT_1, body: "   " });
    expect(empty.status).toBe(400);
  });

  it("keeps the read functions to the studio's login when loginRole is set", async () => {
    await admin.unsafe(studioSetupSql({ loginRole: "studio_login", workerRole: "outbox_worker" }));
    await call(studio, COACH_A, { op: "comment", resource: "public.clients", id: CLIENT_1, body: "Through the handler." });
    const listed = await call(studio, COACH_A, { op: "comments", resource: "public.clients", id: CLIENT_1 });
    expect(listed.body.comments).toHaveLength(1);
    const history = await call(studio, COACH_A, { op: "history", resource: "public.clients", id: CLIENT_1 });
    expect(history.status).toBe(200);
    // Any other login (a Data API's, say) acting as the same role is refused.
    for (const statement of [
      `select * from genesis_studio.record_comments('public.clients', '{"id": "${CLIENT_1}"}', 10)`,
      `select * from genesis_studio.record_history('public.clients', '{"id": "${CLIENT_1}"}', 10)`,
      `select * from genesis_studio.audit_entry(gen_random_uuid())`,
      `select * from genesis_studio.add_comment('public.clients', '{"id": "${CLIENT_1}"}', 'forged')`,
    ]) {
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe(`select set_config('request.jwt.claims', '{"sub": "${COACH_A}"}', true)`);
          await tx.unsafe("set local role authenticated");
          await tx.unsafe(statement);
        }),
      ).rejects.toThrow(/only the studio login/);
    }
  });

  // ── Contracts ───────────────────────────────────────────────────────────

  it("lets a checked-in contract set labels and widgets, never types or access", async () => {
    const withContract = makeHandler({
      contracts: {
        "public.clients": {
          label: "Coaching clients",
          labelField: "notes",
          description: "People in a program.",
          fields: [
            { name: "notes", label: "Coach notes", widget: "textarea", description: "Private to the coach." },
            { name: "status", widget: "number" }, // wrong type: ignored
            { name: "name", widget: "checkbox" }, // can't edit text faithfully: ignored
            { name: "secret_score", label: "Leaked" }, // not readable: ignored
            { name: "ghost", label: "Not a column" },
          ],
        },
      },
    });
    extra.push(withContract);
    const { schema } = (await call(withContract, COACH_A, { op: "describe", resource: "public.clients" })).body;
    expect(schema).toMatchObject({ label: "Coaching clients", labelField: "notes", description: "People in a program." });
    const field = (n: string) => schema.fields.find((f: any) => f.name === n);
    expect(field("notes")).toMatchObject({ label: "Coach notes", widget: "textarea", description: "Private to the coach." });
    expect(field("name").widget).toBe("text");
    expect(field("secret_score")).toBeUndefined();
    expect(field("ghost")).toBeUndefined();
    expect(schema.access.update).toBe(true);
  });
});
