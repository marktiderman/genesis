// @feat:data-offline
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseProvider, type SupabaseProviderOptions } from "../supabase-provider";
import { isDataWriteError, type DataWriteError } from "../../schema/write-outcome";

// The same stand-in client as supabase-provider.test.ts: each awaited query
// takes the next queued response, and every chained call is recorded.
type Response = { data: unknown; error: { message: string; code?: string } | null };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "insert", "delete", "select", "eq", "in", "order", "range", "single", "or"]) {
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
};

const versioned: SupabaseProviderOptions = {
  resources: { tasks: { noun: "task", version: { field: "version", kind: "integer" } } },
};
const provider = (options: SupabaseProviderOptions = versioned) => createSupabaseProvider(client, options);
const ok = (data: unknown): Response => ({ data, error: null });

async function failure(p: Promise<unknown>): Promise<DataWriteError> {
  try {
    await p;
  } catch (e) {
    if (isDataWriteError(e)) return e;
    throw e;
  }
  throw new Error("expected the write to fail");
}

beforeEach(() => {
  queue = [];
  calls = [];
});

describe("capabilities", () => {
  it("report the version rule per resource, and nothing for a resource without one", async () => {
    const caps = await provider().capabilities!("tasks");
    expect(caps.versionedWrites).toBe(true);
    expect(caps.version).toEqual({ field: "version", kind: "integer" });

    const plain = await provider().capabilities!("notes");
    expect(plain.versionedWrites).toBe(false);
    expect("version" in plain).toBe(false);

    expect((await provider().capabilities!()).versionedWrites).toBe(false);
  });
});

describe("update with a version rule", () => {
  it("checks the expected version, never writes the version column, and returns the new version", async () => {
    queue.push(ok([{ id: "t1", title: "New", version: 4 }]));
    const res = await provider().update("tasks", {
      id: "t1",
      data: { title: "New", version: 99 },
      expectedVersion: "3",
    });
    expect(calls).toContainEqual({ method: "update", args: [{ title: "New" }] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", "t1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["version", "3"] });
    expect(res.data).toEqual({ id: "t1", title: "New", version: 4 });
    expect(res.version).toBe("4");
  });

  it("without an expected version, updates unchecked as before", async () => {
    queue.push(ok([{ id: "t1", title: "New", version: 4 }]));
    await provider().update("tasks", { id: "t1", data: { title: "New" } });
    expect(calls.filter((c) => c.method === "eq")).toEqual([{ method: "eq", args: ["id", "t1"] }]);
  });

  it("a resource without a version rule ignores expectedVersion", async () => {
    queue.push(ok([{ id: "n1", body: "x", version: 9 }]));
    const res = await provider().update("notes", { id: "n1", data: { body: "x", version: 9 }, expectedVersion: "1" });
    expect(calls.filter((c) => c.method === "eq")).toEqual([{ method: "eq", args: ["id", "n1"] }]);
    // Nothing is dropped from the row for a resource without a rule.
    expect(calls).toContainEqual({ method: "update", args: [{ body: "x", version: 9 }] });
    expect(res.version).toBeUndefined();
  });

  it("zero rows on a row now at another version is a conflict carrying the row as it is now", async () => {
    const onWrite = vi.fn();
    queue.push(ok([]), ok([{ id: "t1", title: "Theirs", version: 5 }]));
    const err = await failure(
      provider({ ...versioned, onWrite }).update("tasks", { id: "t1", data: { title: "Mine" }, expectedVersion: "3" }),
    );
    expect(err.outcome).toBe("conflict");
    expect(err.message).toBe("Someone else changed this task after you opened it. Review their change, then make yours again.");
    expect(err.current).toEqual({ id: "t1", title: "Theirs", version: 5 });
    expect(err.currentVersion).toBe("5");
    expect(onWrite).not.toHaveBeenCalled();
  });

  it("zero rows on a row still at the expected version is forbidden (RLS or a check refused it)", async () => {
    queue.push(ok([]), ok([{ id: "t1", title: "Same", version: 3 }]));
    const err = await failure(provider().update("tasks", { id: "t1", data: { title: "Mine" }, expectedVersion: "3" }));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toBe("You can't change this task.");
  });

  it("zero rows on a row no longer visible is gone, and says nothing about why", async () => {
    queue.push(ok([]), ok([]));
    const err = await failure(provider().update("tasks", { id: "t1", data: { title: "Mine" }, expectedVersion: "3" }));
    expect(err.outcome).toBe("gone");
    expect(err.current).toBeUndefined();
  });

  it("a failed read-back is an error, never a guess", async () => {
    queue.push(ok([]), { data: null, error: { message: "timeout" } });
    const err = await failure(provider().update("tasks", { id: "t1", data: { title: "x" }, expectedVersion: "3" }));
    expect(err.outcome).toBe("error");
    expect(err.message).toContain("was not changed");
  });

  it("a timestamp version is compared as the exact token the row was read with", async () => {
    const options: SupabaseProviderOptions = {
      resources: { tasks: { version: { field: "updated_at", kind: "timestamp" } } },
    };
    queue.push(ok([]), ok([{ id: "t1", updated_at: "2026-11-03T16:00:01.000001+00:00" }]));
    const err = await failure(
      provider(options).update("tasks", { id: "t1", data: { title: "x" }, expectedVersion: "2026-11-03T16:00:00.5+00:00" }),
    );
    expect(calls).toContainEqual({ method: "eq", args: ["updated_at", "2026-11-03T16:00:00.5+00:00"] });
    expect(err.outcome).toBe("conflict");
    expect(err.currentVersion).toBe("2026-11-03T16:00:01.000001+00:00");
  });
});

describe("version tokens and the caller's values", () => {
  it("a timestamp formatted two ways is one version: an RLS refusal stays forbidden, not a conflict", async () => {
    const options: SupabaseProviderOptions = {
      resources: { tasks: { version: { field: "updated_at", kind: "timestamp" } } },
    };
    queue.push(ok([]), ok([{ id: "t1", updated_at: "2026-11-03T16:00:00.5+00:00" }]));
    const err = await failure(
      provider(options).update("tasks", { id: "t1", data: { title: "x" }, expectedVersion: "2026-11-03 16:00:00.500000+00" }),
    );
    expect(err.outcome).toBe("forbidden");
  });

  it("timestamps a microsecond apart are different versions", async () => {
    const options: SupabaseProviderOptions = {
      resources: { tasks: { version: { field: "updated_at", kind: "timestamp" } } },
    };
    queue.push(ok([]), ok([{ id: "t1", updated_at: "2026-11-03T16:00:00.500001+00:00" }]));
    const err = await failure(
      provider(options).update("tasks", { id: "t1", data: { title: "x" }, expectedVersion: "2026-11-03T16:00:00.5+00:00" }),
    );
    expect(err.outcome).toBe("conflict");
  });

  it("never changes the caller's object", async () => {
    queue.push(ok([{ id: "t1", title: "New", version: 4 }]));
    const data = { title: "New", version: 3 };
    await provider().update("tasks", { id: "t1", data, expectedVersion: "3" });
    expect(data).toEqual({ title: "New", version: 3 });
  });

  it("a conflict carries the row as the resource reads it, joined columns included", async () => {
    const options: SupabaseProviderOptions = {
      resources: { tasks: { source: "tasks_with_people", writeColumns: ["title"], version: { field: "version", kind: "integer" } } },
    };
    queue.push(ok([]), ok([{ id: "t1", version: 5 }]), ok([{ id: "t1", version: 5, person_name: "Ada" }]));
    const err = await failure(provider(options).update("tasks", { id: "t1", data: { title: "x" }, expectedVersion: "3" }));
    expect(err.outcome).toBe("conflict");
    expect(err.current).toEqual({ id: "t1", version: 5, person_name: "Ada" });
    expect(calls).toContainEqual({ method: "from", args: ["tasks_with_people"] });
  });
});

describe("an update override with a version rule", () => {
  it("that takes no third argument gets one warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const update = vi.fn(async (_id: unknown, _row: unknown) => ({ id: "t1", version: 4 }));
    const p = provider({ resources: { warned: { version: { field: "version", kind: "integer" }, update } } });
    await p.update("warned", { id: "t1", data: {}, expectedVersion: "3" });
    await p.update("warned", { id: "t1", data: {}, expectedVersion: "4" });
    expect(warn.mock.calls.filter((c) => String(c[1]).includes("takes no third argument"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("is told the expected version, and its 'no row' is classified like a plain update", async () => {
    const update = vi.fn(async () => null);
    queue.push(ok([{ id: "t1", version: 6 }]));
    const err = await failure(
      provider({ resources: { tasks: { version: { field: "version", kind: "integer" }, update } } }).update("tasks", {
        id: "t1",
        data: { title: "Mine", version: 2 },
        expectedVersion: "2",
      }),
    );
    expect(update).toHaveBeenCalledWith("t1", { title: "Mine" }, { expectedVersion: "2" });
    expect(err.outcome).toBe("conflict");
  });

  it("is told nothing when the caller sends no version", async () => {
    const update = vi.fn(async () => ({ id: "t1", title: "x", version: 3 }));
    await provider({ resources: { tasks: { version: { field: "version", kind: "integer" }, update } } }).update("tasks", {
      id: "t1",
      data: { title: "x" },
    });
    expect(update).toHaveBeenCalledWith("t1", { title: "x" });
  });
});

describe("deleteOne with a version rule", () => {
  it("checks the expected version", async () => {
    queue.push(ok([{ id: "t1" }]));
    const res = await provider().deleteOne("tasks", { id: "t1", expectedVersion: "3" });
    expect(calls).toContainEqual({ method: "eq", args: ["version", "3"] });
    expect(res.data).toEqual({ id: "t1" });
  });

  it("a row changed since it was read is a conflict, and nothing is deleted", async () => {
    queue.push(ok([]), ok([{ id: "t1", version: 4 }]));
    const err = await failure(provider().deleteOne("tasks", { id: "t1", expectedVersion: "3" }));
    expect(err.outcome).toBe("conflict");
    expect(err.message).toContain("Someone else changed this task");
  });

  it("on a recycle-bin table, checks the version before the delete and stops on a conflict", async () => {
    const options: SupabaseProviderOptions = { binTables: ["tasks"], ...versioned };
    queue.push(ok([{ id: "t1", version: 4 }]));
    const err = await failure(provider(options).deleteOne("tasks", { id: "t1", expectedVersion: "3" }));
    expect(err.outcome).toBe("conflict");
    expect(calls.map((c) => c.method)).not.toContain("delete");
    // The row read for the check is the one the conflict reports: read once.
    expect(calls.filter((c) => c.method === "select")).toHaveLength(1);
  });

  it("on a recycle-bin table at the expected version, deletes and checks it left view", async () => {
    const options: SupabaseProviderOptions = { binTables: ["tasks"], ...versioned };
    queue.push(ok([{ id: "t1", version: 3 }]), ok(null), ok([]));
    const res = await provider(options).deleteOne("tasks", { id: "t1", expectedVersion: "3" });
    expect(res.data).toEqual({ id: "t1" });
  });

  it("on a recycle-bin table, the delete carries the version, so a change after the check is a conflict", async () => {
    const options: SupabaseProviderOptions = { binTables: ["tasks"], ...versioned };
    // At the version when checked; someone saves before the delete; the row stays, now at v4.
    queue.push(ok([{ id: "t1", version: 3 }]), ok(null), ok([{ id: "t1" }]), ok([{ id: "t1", version: 4 }]));
    const err = await failure(provider(options).deleteOne("tasks", { id: "t1", expectedVersion: "3" }));
    expect(err.outcome).toBe("conflict");
    const at = calls.findIndex((c) => c.method === "delete");
    expect(calls.slice(at)).toContainEqual({ method: "eq", args: ["version", "3"] });
  });

  it("on a recycle-bin table, a row already out of view is gone", async () => {
    const options: SupabaseProviderOptions = { binTables: ["tasks"], ...versioned };
    queue.push(ok([]));
    expect((await failure(provider(options).deleteOne("tasks", { id: "t1", expectedVersion: "3" }))).outcome).toBe("gone");
  });
});
