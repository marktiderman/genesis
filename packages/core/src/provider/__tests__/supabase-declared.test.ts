// @feat:declared-data-access
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseProvider, type SupabaseProviderOptions } from "../supabase-provider";
import { isDataReadError, type DataReadError } from "../../schema/read-outcome";
import { isDataWriteError, type DataWriteError } from "../../schema/write-outcome";

// Declared data access (docs/DATA-ACCESS.md): named write functions, actions, the table opt-in,
// and `access: "declared"`. A stand-in client records every call and answers each awaited query
// (a table query or an rpc) from a queue.
type Response = { data: unknown; error: { message: string; code?: string } | null; count?: number };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "insert", "delete", "select", "eq", "in", "order", "range", "single", "or", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b["then"] = (resolve: (r: Response) => unknown, reject?: (e: unknown) => unknown) => {
    const next = queue.shift();
    if (!next) return Promise.resolve().then(() => reject?.(new Error("no queued response")));
    return Promise.resolve(next).then(resolve);
  };
  return b;
}

const client = {
  from: (table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder();
  },
  rpc: (fn: string, args?: Record<string, unknown>) => {
    calls.push({ method: "rpc", args: [fn, args] });
    return builder();
  },
};

const provider = (options: SupabaseProviderOptions) => createSupabaseProvider(client, options);
const ok = (data: unknown): Response => ({ data, error: null });
const fail = (message: string, code?: string): Response => ({ data: null, error: { message, code } });
const call = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
const writesTable = () => calls.some((c) => ["insert", "update", "delete"].includes(c.method));

async function writeFailure(p: Promise<unknown>): Promise<DataWriteError> {
  try {
    await p;
  } catch (e) {
    if (isDataWriteError(e)) return e;
    throw e;
  }
  throw new Error("expected the write to fail");
}

async function readFailure(p: Promise<unknown>): Promise<DataReadError> {
  try {
    await p;
  } catch (e) {
    if (isDataReadError(e)) return e;
    throw e;
  }
  throw new Error("expected the read to fail");
}

beforeEach(() => {
  queue = [];
  calls = [];
});

const TASKS: SupabaseProviderOptions = {
  access: "declared",
  resources: {
    tasks: {
      noun: "task",
      source: "tasks_with_people",
      writes: { create: "create_task", update: "save_task", delete: "delete_task" },
      actions: { archive: "archive_task" },
    },
  },
};

describe("writes through named functions", () => {
  it("create calls the function with p_values and reads the record back through the source", async () => {
    queue.push(ok("t9"), ok([{ id: "t9", title: "A", person_name: "Ann" }]));
    const res = await provider(TASKS).create("tasks", { data: { title: "A" } });
    expect(call("rpc")).toEqual([["create_task", { p_values: { title: "A" } }]]);
    expect(call("from")).toEqual([["tasks_with_people"]]);
    expect(writesTable()).toBe(false);
    expect(res.data).toEqual({ id: "t9", title: "A", person_name: "Ann" });
  });

  it("create takes the row a function returns, and a set-returning function's first row", async () => {
    queue.push(ok({ id: "t1", title: "A" }));
    expect((await provider(TASKS).create("tasks", { data: { title: "A" } })).data).toEqual({ id: "t1", title: "A" });
    queue.push(ok([{ id: "t2", title: "B" }]));
    expect((await provider(TASKS).create("tasks", { data: { title: "B" } })).data).toEqual({ id: "t2", title: "B" });
  });

  it("create maps the function's refusal", async () => {
    queue.push(fail("not a member", "42501"));
    expect((await writeFailure(provider(TASKS).create("tasks", { data: {} }))).outcome).toBe("forbidden");
  });

  it("{ fn, args } names the arguments", async () => {
    queue.push(ok("t3"), ok([{ id: "t3" }]));
    await provider({
      resources: { tasks: { writes: { create: { fn: "add_task", args: (v) => ({ p_title: v.title }) } } } },
    }).create("tasks", { data: { title: "C" } });
    expect(call("rpc")).toEqual([["add_task", { p_title: "C" }]]);
  });

  it("update calls the function with p_id and p_values, without reading the table, and reads back through the source", async () => {
    queue.push(ok("t1"), ok([{ id: "t1", title: "X", person_name: "Ann" }]));
    const res = await provider(TASKS).update("tasks", { id: "t1", data: { title: "X" } });
    expect(call("rpc")).toEqual([["save_task", { p_id: "t1", p_values: { title: "X" } }]]);
    // The function decides what to write: the table's own row is never read to learn its columns.
    expect(call("from")).toEqual([["tasks_with_people"]]);
    expect(res.data).toEqual({ id: "t1", title: "X", person_name: "Ann" });
  });

  it("update passes p_expected_version for a versioned resource, and the new version comes back", async () => {
    queue.push(ok(true), ok([{ id: "t1", title: "X", version: 5 }]));
    const res = await provider({
      access: "declared",
      resources: { tasks: { source: "v_tasks", version: { field: "version", kind: "integer" }, writes: { update: "save_task" } } },
    }).update("tasks", { id: "t1", data: { title: "X", version: 4 }, expectedVersion: "4" });
    expect(call("rpc")).toEqual([["save_task", { p_id: "t1", p_values: { title: "X" }, p_expected_version: "4" }]]);
    expect(res.version).toBe("5");
  });

  it("update returning null is forbidden while the row is visible through the source, gone when it isn't", async () => {
    queue.push(ok(null), ok([{ id: "t1" }]));
    expect((await writeFailure(provider(TASKS).update("tasks", { id: "t1", data: { title: "X" } }))).outcome).toBe("forbidden");
    // The visibility check reads the declared source, not the table.
    expect(call("from")).toEqual([["tasks_with_people"]]);

    calls = [];
    queue.push(ok(null), ok([]));
    expect((await writeFailure(provider(TASKS).update("tasks", { id: "t1", data: { title: "X" } }))).outcome).toBe("gone");
  });

  it("update returning null at another version is a conflict carrying the row as it is now", async () => {
    const versioned: SupabaseProviderOptions = {
      access: "declared",
      resources: { tasks: { source: "v_tasks", version: { field: "version", kind: "integer" }, writes: { update: "save_task" } } },
    };
    queue.push(ok(null), ok([{ id: "t1", title: "Theirs", version: 7 }]), ok([{ id: "t1", title: "Theirs", version: 7 }]));
    const err = await writeFailure(provider(versioned).update("tasks", { id: "t1", data: { title: "X" }, expectedVersion: "6" }));
    expect(err.outcome).toBe("conflict");
    expect(err.current).toEqual({ id: "t1", title: "Theirs", version: 7 });
    expect(call("from").every(([t]) => t === "v_tasks")).toBe(true);
  });

  it("delete calls the function with p_id; null is forbidden or gone", async () => {
    queue.push(ok("t1"));
    expect(await provider(TASKS).deleteOne("tasks", { id: "t1" })).toEqual({ data: { id: "t1" } });
    expect(call("rpc")).toEqual([["delete_task", { p_id: "t1" }]]);
    expect(writesTable()).toBe(false);

    queue.push(ok(null), ok([{ id: "t1" }]));
    expect((await writeFailure(provider(TASKS).deleteOne("tasks", { id: "t1" }))).outcome).toBe("forbidden");
    queue.push(ok(false), ok([]));
    expect((await writeFailure(provider(TASKS).deleteOne("tasks", { id: "t1" }))).outcome).toBe("gone");
  });

  it("an app's own create or update rule wins over writes", async () => {
    queue.push(ok([{ id: "p1" }]));
    await provider({
      resources: { tasks: { create: async () => "p1", writes: { create: "create_task" } } },
    }).create("tasks", { data: {} });
    expect(call("rpc")).toEqual([]);
  });

  it("a client with no rpc is an error naming the function", async () => {
    const p = createSupabaseProvider({ from: client.from }, TASKS);
    const err = await writeFailure(p.deleteOne("tasks", { id: "t1" }));
    expect(err.outcome).toBe("error");
    expect(err.message).toContain("delete_task()");
  });
});

describe("runAction", () => {
  it("calls the declared function with p_id and returns the row it gave back", async () => {
    queue.push(ok({ id: "t1", archived: true }));
    const res = await provider(TASKS).runAction!("tasks", { id: "t1", action: "archive" });
    expect(call("rpc")).toEqual([["archive_task", { p_id: "t1" }]]);
    expect(res.data).toEqual({ id: "t1", archived: true });
  });

  it("reads the record back when the function returns its id or true", async () => {
    queue.push(ok(true), ok([{ id: "t1", archived: true }]));
    const res = await provider(TASKS).runAction!("tasks", { id: "t1", action: "archive" });
    expect(res.data).toEqual({ id: "t1", archived: true });
    expect(call("from")).toEqual([["tasks_with_people"]]);
  });

  it("passes the expected version, and null is forbidden or gone", async () => {
    const versioned: SupabaseProviderOptions = {
      resources: { tasks: { version: { field: "version", kind: "integer" }, actions: { close: { fn: "close_task" } } } },
    };
    queue.push(ok({ id: "t1" }));
    await provider(versioned).runAction!("tasks", { id: "t1", action: "close", expectedVersion: "2" });
    expect(call("rpc")).toEqual([["close_task", { p_id: "t1", p_expected_version: "2" }]]);

    queue.push(ok(null), ok([{ id: "t1" }]));
    expect((await writeFailure(provider(TASKS).runAction!("tasks", { id: "t1", action: "archive" }))).outcome).toBe("forbidden");
    queue.push(ok(null), ok([]));
    expect((await writeFailure(provider(TASKS).runAction!("tasks", { id: "t1", action: "archive" }))).outcome).toBe("gone");
  });

  it("refuses an action the resource doesn't declare", async () => {
    const err = await writeFailure(provider(TASKS).runAction!("tasks", { id: "t1", action: "explode" }));
    expect(err.outcome).toBe("invalid");
    expect(err.message).toContain('declares no action "explode"');
    expect(call("rpc")).toEqual([]);
  });

  it("is served only when some resource declares an action, and capabilities say which", async () => {
    expect(createSupabaseProvider(client).runAction).toBeUndefined();
    expect((await createSupabaseProvider(client).capabilities!("tasks")).actions).toBe(false);
    const p = provider({ ...TASKS, resources: { ...TASKS.resources, notes: { source: "notes" } } });
    expect(p.runAction).toBeTypeOf("function");
    expect((await p.capabilities!("tasks")).actions).toBe(true);
    expect((await p.capabilities!("notes")).actions).toBe(false);
  });
});

describe('access: "declared"', () => {
  it("refuses a read of a resource with no source, naming what to declare, through onReadError", async () => {
    const seen: string[] = [];
    const p = provider({ access: "declared", onReadError: (e) => void seen.push(e.message), resources: { notes: {} } });
    const err = await readFailure(p.getList("notes", {}));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toContain('"notes" declares no read');
    expect(err.message).toContain("table: { read: true");
    expect(seen).toHaveLength(1);
    await readFailure(p.getOne("notes", { id: "n1" }));
    await readFailure(p.getMany("notes", { ids: ["n1"] }));
    expect(calls).toEqual([]);
  });

  it("refuses a resource missing from resources, for reads and writes", async () => {
    const p = provider(TASKS);
    expect((await readFailure(p.getList("comments", {}))).message).toContain('"comments" declares no read');
    const err = await writeFailure(p.create("comments", { data: { body: "x" } }));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toContain('"comments" declares no create');
    expect(err.message).toContain("writes.create");
    expect((await writeFailure(p.update("comments", { id: "c1", data: { body: "x" } }))).message).toContain("declares no update");
    expect((await writeFailure(p.deleteOne("comments", { id: "c1" }))).message).toContain("declares no delete");
    expect(writesTable()).toBe(false);
  });

  it("refuses the writes a resource doesn't declare, and serves the ones it does", async () => {
    const p = provider({ access: "declared", resources: { tasks: { source: "v", writes: { update: "save_task" } } } });
    const err = await writeFailure(p.create("tasks", { data: {} }));
    expect(err.message).toContain('write: ["create"]');
    expect((await writeFailure(p.deleteOne("tasks", { id: "t1" }))).outcome).toBe("forbidden");
    expect((await p.capabilities!("tasks")).create).toBe(false);
    expect((await p.capabilities!("tasks")).delete).toBe(false);
    queue.push(ok("t1"), ok([{ id: "t1" }]));
    await p.update("tasks", { id: "t1", data: { title: "x" } });
    expect(call("rpc")).toEqual([["save_task", { p_id: "t1", p_values: { title: "x" } }]]);
  });

  it("serves a table opt-in, read and the writes it lists", async () => {
    const p = provider({
      access: "declared",
      resources: { labels: { table: { read: true, write: ["update"], why: "A lookup every member may rename." } } },
    });
    queue.push({ ...ok([{ id: "l1" }]), count: 1 });
    expect((await p.getList("labels", {})).data).toEqual([{ id: "l1" }]);
    queue.push(ok([{ id: "l1" }]), ok([{ id: "l1", name: "Bug" }]));
    expect((await p.update("labels", { id: "l1", data: { name: "Bug" } })).data).toEqual({ id: "l1", name: "Bug" });
    expect((await writeFailure(p.create("labels", { data: {} }))).message).toContain('"labels" declares no create');
    expect((await writeFailure(p.deleteOne("labels", { id: "l1" }))).message).toContain('"labels" declares no delete');
    const caps = await p.capabilities!("labels");
    expect([caps.create, caps.delete]).toEqual([false, false]);
  });

  it("table: { write: true } opts in every write, with an id-only insert read back from the table", async () => {
    const p = provider({ access: "declared", resources: { labels: { table: { read: true, write: true, why: "Lookup." } } } });
    queue.push(ok({ id: "l2" }), ok([{ id: "l2", name: "New" }]));
    const res = await p.create("labels", { data: { name: "New" } });
    expect(call("select")).toEqual([["id"], ["*"]]);
    expect(res.data).toEqual({ id: "l2", name: "New" });
    queue.push(ok([{ id: "l2" }]));
    await p.deleteOne("labels", { id: "l2" });
    expect(call("delete")).toHaveLength(1);
  });

  it("an open provider (the default) reads and writes undeclared resources as before", async () => {
    const p = createSupabaseProvider(client);
    queue.push({ ...ok([]), count: 0 });
    await p.getList("anything", {});
    queue.push(ok({ id: "a1" }), ok([{ id: "a1" }]));
    await p.create("anything", { data: {} });
    expect((await p.capabilities!("anything")).create).toBe(true);
    expect(call("insert")).toHaveLength(1);
  });
});

describe("a declared provider never reads a table it hasn't declared", () => {
  it("an app update rule with a source passes the values on without probing the table for its columns", async () => {
    const update = async (id: string | number) => id;
    queue.push(ok([{ id: "t1", title: "x" }])); // the read-back, through the view
    await provider({ access: "declared", resources: { tasks: { source: "v_tasks", update } } }).update("tasks", {
      id: "t1",
      data: { title: "x" },
    });
    expect(call("from")).toEqual([["v_tasks"]]);
  });

  it("a table update opt-in without table.read doesn't read the table's row for its columns, and reads back through the source", async () => {
    queue.push(ok([{ id: "t1" }]), ok([{ id: "t1", title: "x" }]));
    await provider({
      access: "declared",
      resources: { tasks: { source: "v_tasks", writeColumns: ["title"], table: { write: ["update"], why: "Bulk renames." } } },
    }).update("tasks", { id: "t1", data: { title: "x", assignee_count: 2 } });
    expect(call("from")).toEqual([["tasks"], ["v_tasks"]]);
    expect(call("update")).toEqual([[{ title: "x" }]]);
    expect(call("select")[0]).toEqual(["id"]);
  });

  it("refuses a table update over a view with neither table.read nor writeColumns: it can't tell the table's columns", async () => {
    const err = await writeFailure(
      provider({
        access: "declared",
        resources: { tasks: { source: "v_tasks", table: { write: ["update"], why: "Bulk renames." } } },
      }).update("tasks", { id: "t1", data: { title: "x", assignee_count: 2 } }),
    );
    expect(err.message).toContain('"tasks" updates its table but reads v_tasks');
    expect(err.message).toContain("writeColumns");
    expect(calls).toEqual([]);
  });

  it("a write-only resource is never read: a create reports what it sent", async () => {
    queue.push(ok("f1"));
    const res = await provider({ access: "declared", resources: { feedback: { writes: { create: "send_feedback" } } } }).create("feedback", {
      data: { body: "Nice" },
    });
    expect(res.data).toEqual({ id: "f1", body: "Nice" });
    expect(call("from")).toEqual([]);
  });

  it("a write-only resource's null answer says it may be refused, gone or changed, without reading", async () => {
    const p = provider({
      access: "declared",
      resources: {
        feedback: {
          version: { field: "version", kind: "integer" },
          writes: { update: "edit_feedback", delete: "drop_feedback" },
          actions: { flag: "flag_feedback" },
        },
      },
    });
    queue.push(ok(null));
    const err = await writeFailure(p.update("feedback", { id: "f1", data: { body: "x" }, expectedVersion: "2" }));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toBe("This record was not changed: you can't change it, it no longer exists, or someone changed it first.");
    queue.push(ok(null));
    expect((await writeFailure(p.deleteOne("feedback", { id: "f1" }))).message).toMatch(/^This record was not deleted/);
    queue.push(ok(null));
    expect((await writeFailure(p.runAction!("feedback", { id: "f1", action: "flag" }))).outcome).toBe("forbidden");
    expect(call("from")).toEqual([]);
  });

  it("an undeclared resource gets no realtime channel, and capabilities say so", async () => {
    const channel = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const p = createSupabaseProvider({ ...client, channel } as never, { access: "declared", realtime: true, resources: { tasks: { source: "v" } } });
    const stop = p.subscribe!("notes", {}, () => undefined);
    expect(typeof stop).toBe("function");
    expect(channel).not.toHaveBeenCalled();
    expect(warn.mock.calls[0]![0]).toContain('"notes" declares no read');
    expect((await p.capabilities!("notes")).realtime).toBe(false);
    expect((await p.capabilities!("tasks")).realtime).toBe(true);
    warn.mockRestore();
  });

  it("an id-only insert keeps the version when the read-back fails", async () => {
    queue.push(ok({ id: "t5", version: 1 }), fail("permission denied", "42501"));
    const res = await provider({
      resources: { tasks: { source: "v", version: { field: "version", kind: "integer" } } },
    }).create("tasks", { data: { title: "x" } });
    expect(call("select")[0]).toEqual(["id,version"]);
    expect(res.data).toEqual({ id: "t5", title: "x", version: 1 });
  });
});

describe("write functions get the values as given", () => {
  it("writeColumns doesn't trim what a writes.create or writes.update function gets", async () => {
    const p = provider({
      resources: { tasks: { source: "v", writeColumns: ["title"], writes: { create: "create_task", update: "save_task" } } },
    });
    queue.push(ok("t1"), ok([{ id: "t1" }]));
    await p.create("tasks", { data: { title: "A", assignee_ids: ["u1"] } });
    queue.push(ok("t1"), ok([{ id: "t1" }]));
    await p.update("tasks", { id: "t1", data: { title: "B", assignee_ids: ["u2"] } });
    expect(call("rpc")).toEqual([
      ["create_task", { p_values: { title: "A", assignee_ids: ["u1"] } }],
      ["save_task", { p_id: "t1", p_values: { title: "B", assignee_ids: ["u2"] } }],
    ]);
  });

  it("a table write still keeps to writeColumns", async () => {
    queue.push(ok([{ id: "t1" }]), ok([{ id: "t1" }]));
    await provider({ resources: { tasks: { source: "v", writeColumns: ["title"] } } }).update("tasks", {
      id: "t1",
      data: { title: "B", person_name: "Ann" },
    });
    expect(call("update")).toEqual([[{ title: "B" }]]);
  });
});

describe("the version goes with the values it was written with", () => {
  it("a read-back without the version returns the values sent with the version written, not a later writer's values", async () => {
    const versioned: SupabaseProviderOptions = {
      resources: { tasks: { source: "v_no_version", version: { field: "version", kind: "integer" } } },
    };
    // The update wrote version 4; by the read-back someone else has made the title "Theirs".
    queue.push(ok([{ id: "t1", title: "Old", version: 3 }])); // the table's row, for its columns
    queue.push(ok([{ id: "t1", version: 4 }]), ok([{ id: "t1", title: "Theirs", person_name: "Ann" }]));
    const res = await provider(versioned).update("tasks", { id: "t1", data: { title: "Mine" } });
    expect(res.data).toEqual({ id: "t1", title: "Mine", person_name: "Ann", version: 4 });
    expect(res.version).toBe("4");
  });

  it("a read-back with the version is taken as it is", async () => {
    queue.push(ok([{ id: "t1", title: "Old", version: 3 }])); // the table's row, for its columns
    queue.push(ok([{ id: "t1", version: 4 }]), ok([{ id: "t1", title: "Theirs", version: 5 }]));
    const res = await provider({
      resources: { tasks: { source: "v", version: { field: "version", kind: "integer" } } },
    }).update("tasks", { id: "t1", data: { title: "Mine" } });
    expect(res.data).toEqual({ id: "t1", title: "Theirs", version: 5 });
  });
});
