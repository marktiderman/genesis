import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseProvider, type SupabaseProviderOptions } from "../supabase-provider";
import { readOutcomeFromCode, toDataWriteError, writeOutcomeFromCode } from "../postgrest-errors";
import { isDataReadError, type DataReadError } from "../../schema/read-outcome";
import { DataWriteError, isDataWriteError } from "../../schema/write-outcome";
import { relatedKeys } from "../../hooks/related-keys";

// A stand-in Supabase client: each awaited query takes the next queued
// response, and every chained call is recorded so tests can check what was
// sent.
type Response = { data: unknown; error: { message: string; code?: string } | null; count?: number };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "insert", "delete", "select", "eq", "in", "order", "range", "single"]) {
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

const provider = (options?: SupabaseProviderOptions) => createSupabaseProvider(client, options);
const methods = () => calls.map((c) => c.method);
const ok = (data: unknown): Response => ({ data, error: null });
const fail = (message: string, code?: string): Response => ({ data: null, error: { message, code } });

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

describe("writeOutcomeFromCode", () => {
  it("maps Postgres and PostgREST codes", () => {
    expect(writeOutcomeFromCode("42501")).toBe("forbidden");
    expect(writeOutcomeFromCode("23505")).toBe("invalid");
    expect(writeOutcomeFromCode("23503")).toBe("invalid");
    expect(writeOutcomeFromCode("23502")).toBe("invalid");
    expect(writeOutcomeFromCode("23514")).toBe("invalid");
    expect(writeOutcomeFromCode("22P02")).toBe("invalid");
    expect(writeOutcomeFromCode("PGRST116")).toBe("gone");
    expect(writeOutcomeFromCode("PGRST301")).toBe("unauthenticated");
    expect(writeOutcomeFromCode("PGRST302")).toBe("unauthenticated");
    expect(writeOutcomeFromCode("28P01")).toBe("unauthenticated");
    expect(writeOutcomeFromCode("42P01")).toBe("error");
    expect(writeOutcomeFromCode("P0001")).toBe("error");
    expect(writeOutcomeFromCode("XX000")).toBe("error");
    expect(writeOutcomeFromCode(undefined)).toBe("error");
  });

  it("toDataWriteError keeps the message, code and cause, and passes DataWriteError through", () => {
    const raw = { message: "duplicate key", code: "23505", details: "Key (slug)=(a)" };
    const err = toDataWriteError(raw);
    expect(err.outcome).toBe("invalid");
    expect(err.message).toBe("duplicate key");
    expect(err.code).toBe("23505");
    expect(err.cause).toBe(raw);
    const own = new DataWriteError("conflict", "x");
    expect(toDataWriteError(own)).toBe(own);
    expect(toDataWriteError(new Error("network")).outcome).toBe("error");
  });
});

describe("update", () => {
  it("selects the changed rows without .single() and returns the row", async () => {
    const onWrite = vi.fn();
    queue.push(ok([{ id: "p1", name: "North" }]));
    const res = await provider({ onWrite }).update("practices", { id: "p1", data: { name: "North" } });
    expect(res.data).toEqual({ id: "p1", name: "North" });
    expect(calls).toContainEqual({ method: "select", args: ["*"] });
    expect(methods()).not.toContain("single");
    expect(onWrite).toHaveBeenCalledWith({
      resource: "practices",
      kind: "update",
      id: "p1",
      record: { id: "p1", name: "North" },
    });
  });

  it("zero rows on a row that is still visible is forbidden (RLS refused it)", async () => {
    const onWrite = vi.fn();
    queue.push(ok([]), ok([{ id: "p1" }]));
    const err = await failure(
      provider({ onWrite, resources: { practices: { noun: "practice" } } }).update("practices", {
        id: "p1",
        data: { name: "x" },
      }),
    );
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toBe("You can't change this practice.");
    // The read-back asks for just the id, for that row.
    expect(calls.slice(-3)).toEqual([
      { method: "from", args: ["practices"] },
      { method: "select", args: ["id"] },
      { method: "eq", args: ["id", "p1"] },
    ]);
    expect(onWrite).not.toHaveBeenCalled();
  });

  it("zero rows on a row that is no longer visible is gone", async () => {
    queue.push(ok([]), ok([]));
    const err = await failure(provider().update("notes", { id: "n1", data: { body: "x" } }));
    expect(err.outcome).toBe("gone");
    expect(err.message).toBe("This record no longer exists, or you can no longer see it.");
  });

  it("a failed read-back is an error, never a guess", async () => {
    queue.push(ok([]), fail("timeout"));
    const err = await failure(provider().update("notes", { id: "n1", data: { body: "x" } }));
    expect(err.outcome).toBe("error");
    expect(err.message).toContain("was not changed");
  });

  it("maps database errors to typed outcomes and keeps the code", async () => {
    queue.push(fail("violates check constraint", "23514"));
    const err = await failure(provider().update("practices", { id: "p1", data: {} }));
    expect(err.outcome).toBe("invalid");
    expect(err.message).toBe("violates check constraint");
    expect(err.code).toBe("23514");

    queue.push(fail("new row violates row-level security policy", "42501"));
    expect((await failure(provider().update("practices", { id: "p1", data: {} }))).outcome).toBe("forbidden");

    queue.push(fail("JWT expired", "PGRST301"));
    expect((await failure(provider().update("practices", { id: "p1", data: {} }))).outcome).toBe("unauthenticated");
  });

  it("a rejected request (network) is a DataWriteError too", async () => {
    // No queued response: the builder rejects.
    const err = await failure(provider().update("practices", { id: "p1", data: {} }));
    expect(err.outcome).toBe("error");
  });
});

describe("deleteOne (hard)", () => {
  it("selects the deleted id and returns it", async () => {
    const onWrite = vi.fn();
    queue.push(ok([{ id: "f1" }]));
    const res = await provider({ onWrite }).deleteOne("practices", { id: "f1" });
    expect(res.data).toEqual({ id: "f1" });
    expect(calls).toContainEqual({ method: "select", args: ["id"] });
    expect(methods()).not.toContain("single");
    expect(onWrite).toHaveBeenCalledWith({ resource: "practices", kind: "delete", id: "f1" });
  });

  it("zero rows on a still-visible row is forbidden", async () => {
    queue.push(ok([]), ok([{ id: "f1" }]));
    const err = await failure(provider().deleteOne("practices", { id: "f1" }));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toBe("You can't delete this record.");
  });

  it("zero rows on a row no longer visible is gone", async () => {
    queue.push(ok([]), ok([]));
    expect((await failure(provider().deleteOne("practices", { id: "f1" }))).outcome).toBe("gone");
  });

  it("a foreign-key violation is invalid", async () => {
    queue.push(fail("update or delete violates foreign key constraint", "23503"));
    expect((await failure(provider().deleteOne("practices", { id: "f1" }))).outcome).toBe("invalid");
  });
});

describe("deleteOne (recycle-bin tables)", () => {
  it("visible before, gone after, is success; the delete itself asks for no rows", async () => {
    const onWrite = vi.fn();
    queue.push(ok([{ id: "c1" }]), ok(null), ok([]));
    const res = await provider({ binTables: ["commitments"], onWrite }).deleteOne("commitments", { id: "c1" });
    expect(res.data).toEqual({ id: "c1" });
    expect(methods()).toEqual([
      "from", "select", "eq", // visible before
      "from", "delete", "eq", // the delete, no select
      "from", "select", "eq", // read back
    ]);
    expect(onWrite).toHaveBeenCalledWith({ resource: "commitments", kind: "delete", id: "c1" });
  });

  it("still visible after the delete is forbidden", async () => {
    const onWrite = vi.fn();
    queue.push(ok([{ id: "c1" }]), ok(null), ok([{ id: "c1" }]));
    const err = await failure(provider({ binTables: ["commitments"], onWrite }).deleteOne("commitments", { id: "c1" }));
    expect(err.outcome).toBe("forbidden");
    expect(onWrite).not.toHaveBeenCalled();
  });

  it("not visible before the delete is gone, and nothing is deleted", async () => {
    queue.push(ok([]));
    const err = await failure(provider({ binTables: ["commitments"] }).deleteOne("commitments", { id: "c1" }));
    expect(err.outcome).toBe("gone");
    expect(methods()).not.toContain("delete");
  });

  it("a failed check after the delete says it may not have been deleted", async () => {
    queue.push(ok([{ id: "c1" }]), ok(null), fail("timeout"));
    const err = await failure(provider({ binTables: ["commitments"] }).deleteOne("commitments", { id: "c1" }));
    expect(err.outcome).toBe("error");
    expect(err.message).toContain("may not have been deleted");
  });

  it("accepts a predicate, and per-resource deleteMode wins over binTables", async () => {
    queue.push(ok([{ id: "n1" }]), ok(null), ok([]));
    await provider({ binTables: (r) => r === "notes" }).deleteOne("notes", { id: "n1" });
    expect(methods()).toContain("delete");

    calls = [];
    queue.push(ok([{ id: "n1" }]));
    await provider({ binTables: ["notes"], resources: { notes: { deleteMode: "hard" } } }).deleteOne("notes", { id: "n1" });
    expect(methods()).toEqual(["from", "delete", "eq", "select"]);

    calls = [];
    queue.push(ok([{ id: "t1" }]), ok(null), ok([]));
    await provider({ resources: { tags: { deleteMode: "bin" } } }).deleteOne("tags", { id: "t1" });
    expect(methods().slice(0, 3)).toEqual(["from", "select", "eq"]);
  });
});

describe("create", () => {
  it("inserts and returns the row by default", async () => {
    const onWrite = vi.fn();
    queue.push(ok({ id: "x1", title: "T" }));
    const res = await provider({ onWrite }).create("questions", { data: { title: "T" } });
    expect(methods()).toEqual(["from", "insert", "select", "single"]);
    expect(res.data).toEqual({ id: "x1", title: "T" });
    expect(onWrite).toHaveBeenCalledWith({ resource: "questions", kind: "create", id: "x1", record: { id: "x1", title: "T" } });
  });

  it("maps an RLS refusal and a unique violation", async () => {
    queue.push(fail("new row violates row-level security policy for table \"questions\"", "42501"));
    expect((await failure(provider().create("questions", { data: {} }))).outcome).toBe("forbidden");
    queue.push(fail("duplicate key value violates unique constraint", "23505"));
    expect((await failure(provider().create("questions", { data: {} }))).outcome).toBe("invalid");
  });

  it("a create override returning an id is read back", async () => {
    const create = vi.fn().mockResolvedValue("p9");
    queue.push(ok([{ id: "p9", name: "South" }]));
    const res = await provider({ resources: { practices: { create } } }).create("practices", { data: { name: "South" } });
    expect(create).toHaveBeenCalledWith({ name: "South" });
    expect(methods()).not.toContain("insert");
    expect(res.data).toEqual({ id: "p9", name: "South" });
  });

  it("a create override returning the row is used as-is", async () => {
    const res = await provider({
      resources: { practices: { create: async () => ({ id: "p9", name: "South" }) } },
    }).create("practices", { data: { name: "South" } });
    expect(res.data).toEqual({ id: "p9", name: "South" });
    expect(calls).toEqual([]);
  });

  it("a created row is reported saved even when reading it back fails", async () => {
    queue.push(fail("no rows", "PGRST116"));
    const res = await provider({ resources: { practices: { create: async () => "p9" } } }).create("practices", { data: {} });
    expect(res.data).toEqual({ id: "p9" });
  });

  it("a create override's Supabase error is mapped", async () => {
    const create = async () => {
      throw Object.assign(new Error("Only platform admins can create practices"), { code: "P0001" });
    };
    const err = await failure(provider({ resources: { practices: { create } } }).create("practices", { data: {} }));
    expect(err.outcome).toBe("error");
    expect(err.message).toBe("Only platform admins can create practices");
    expect(err.code).toBe("P0001");
  });

  it("a create override that returns nothing fails loudly", async () => {
    const create = async () => undefined as unknown as string;
    const onWrite = vi.fn();
    expect((await failure(provider({ onWrite, resources: { a: { create } } }).create("a", { data: {} }))).outcome).toBe("error");
    expect(onWrite).not.toHaveBeenCalled();
  });
});

describe("prepare", () => {
  const prepare = (values: Record<string, unknown>) => {
    const name = String(values["name"] ?? "").trim();
    if (!name) throw new DataWriteError("invalid", "Name is required.");
    return { name };
  };

  it("writes the prepared row on create and update, with the context", async () => {
    const spy = vi.fn(prepare);
    const p = provider({ resources: { practices: { prepare: spy } } });
    queue.push(ok({ id: "p1", name: "North" }));
    await p.create("practices", { data: { name: "  North ", created_at: "x" } });
    expect(calls).toContainEqual({ method: "insert", args: [{ name: "North" }] });
    expect(spy).toHaveBeenLastCalledWith({ name: "  North ", created_at: "x" }, { resource: "practices", action: "create" });

    queue.push(ok([{ id: "p1", name: "South" }]));
    await p.update("practices", { id: "p1", data: { name: " South", id: "x" } });
    expect(calls).toContainEqual({ method: "update", args: [{ name: "South" }] });
    expect(spy).toHaveBeenLastCalledWith({ name: " South", id: "x" }, { resource: "practices", action: "update", id: "p1" });
  });

  it("a refusal from prepare sends nothing", async () => {
    const err = await failure(provider({ resources: { practices: { prepare } } }).update("practices", { id: "p1", data: { name: " " } }));
    expect(err.outcome).toBe("invalid");
    expect(err.message).toBe("Name is required.");
    expect(calls).toEqual([]);
  });

  it("does not mutate the caller's values and may be async", async () => {
    const values = { name: "a" };
    queue.push(ok({ id: "p1" }));
    await provider({
      resources: {
        practices: {
          prepare: async (v) => {
            v["name"] = "b";
            return v;
          },
        },
      },
    }).create("practices", { data: values });
    expect(values).toEqual({ name: "a" });
    expect(calls).toContainEqual({ method: "insert", args: [{ name: "b" }] });
  });

  it("runs before a create override too", async () => {
    const create = vi.fn().mockResolvedValue({ id: "p1", name: "N" });
    await provider({ resources: { practices: { prepare, create } } }).create("practices", { data: { name: " N " } });
    expect(create).toHaveBeenCalledWith({ name: "N" });
  });
});

describe("update override", () => {
  it("returning the row uses it; returning an id reads it back", async () => {
    const update = vi.fn().mockResolvedValue({ id: "c1", name: "A" });
    const res = await provider({ resources: { clients: { update } } }).update("clients", { id: "c1", data: { name: "A" } });
    expect(update).toHaveBeenCalledWith("c1", { name: "A" });
    expect(res.data).toEqual({ id: "c1", name: "A" });
    expect(methods()).not.toContain("update");

    queue.push(ok([{ id: "c1", name: "B" }]));
    const res2 = await provider({ resources: { clients: { update: async (id) => id } } }).update("clients", { id: "c1", data: { name: "B" } });
    expect(res2.data).toEqual({ id: "c1", name: "B" });
  });

  it("returning nothing is zero rows, explained by a read-back", async () => {
    const onWrite = vi.fn();
    queue.push(ok([{ id: "c1" }]));
    const p = provider({ onWrite, resources: { clients: { noun: "client", update: async () => undefined } } });
    const err = await failure(p.update("clients", { id: "c1", data: {} }));
    expect(err.outcome).toBe("forbidden");
    expect(err.message).toBe("You can't change this client.");
    expect(onWrite).not.toHaveBeenCalled();

    queue.push(ok([]));
    expect((await failure(p.update("clients", { id: "c1", data: {} }))).outcome).toBe("gone");
  });

  it("returning false is zero rows; returning true reads the row back", async () => {
    queue.push(ok([]));
    const p = provider({ resources: { clients: { update: async () => false } } });
    expect((await failure(p.update("clients", { id: "c1", data: {} }))).outcome).toBe("gone");

    queue.push(ok([{ id: "c1", name: "B" }]));
    const res = await provider({ resources: { clients: { update: async () => true } } }).update("clients", { id: "c1", data: {} });
    expect(res.data).toEqual({ id: "c1", name: "B" });
  });

  it("an RPC's 42501 is forbidden", async () => {
    const update = async () => {
      throw { message: "permission denied for function update_client", code: "42501" };
    };
    expect((await failure(provider({ resources: { clients: { update } } }).update("clients", { id: "c1", data: {} }))).outcome).toBe("forbidden");
  });
});

describe("onWrite", () => {
  it("is awaited, and its failure never fails a committed write", async () => {
    const order: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    queue.push(ok([{ id: "p1" }]));
    const res = await provider({
      onWrite: async () => {
        order.push("onWrite");
        throw new Error("cache down");
      },
    }).update("practices", { id: "p1", data: {} });
    order.push("returned");
    expect(res.data).toEqual({ id: "p1" });
    expect(order).toEqual(["onWrite", "returned"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("toFormValues and invalidates", () => {
  it("toFormValues maps a row per resource and passes others through", () => {
    const p = provider({
      resources: { tasks: { toFormValues: (r) => ({ ...r, done: r["status"] === "done" }) } },
    });
    expect(p.toFormValues?.("tasks", { id: 1, status: "done" })).toEqual({ id: 1, status: "done", done: true });
    expect(p.toFormValues?.("notes", { id: 1 })).toEqual({ id: 1 });
  });

  it("invalidates returns a resource's keys, static or from the event", () => {
    const p = provider({
      resources: {
        practices: { invalidates: [["staff"], ["me"]] },
        tasks: { invalidates: (e) => [["person", e.id]] },
      },
    });
    expect(p.invalidates?.({ resource: "practices", kind: "create", id: "p1" })).toEqual([["staff"], ["me"]]);
    expect(p.invalidates?.({ resource: "tasks", kind: "delete", id: 7 })).toEqual([["person", 7]]);
    expect(p.invalidates?.({ resource: "notes", kind: "update", id: 1 })).toEqual([]);
  });

  it("relatedKeys merges the provider's keys with the caller's, and survives a throwing provider", () => {
    const p = provider({ resources: { practices: { invalidates: [["staff"]] } } });
    const event = { resource: "practices", kind: "update" as const, id: "p1" };
    expect(relatedKeys(p, event, [["me"]])).toEqual([["staff"], ["me"]]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...p, invalidates: () => { throw new Error("x"); } };
    expect(relatedKeys(broken, event, [["me"]])).toEqual([["me"]]);
    error.mockRestore();
  });
});

describe("reads are unchanged", () => {
  it("getOne still uses .single() and throws a plain Error with the code", async () => {
    queue.push(fail("JSON object requested, multiple (or no) rows returned", "PGRST116"));
    const err = await provider().getOne("practices", { id: "p1" }).catch((e: unknown) => e);
    expect(methods()).toContain("single");
    expect(isDataWriteError(err)).toBe(false);
    expect((err as { code?: string }).code).toBe("PGRST116");
  });
});

describe("getList ordering and page size", () => {
  const list = (p: ReturnType<typeof provider>, params: Parameters<ReturnType<typeof provider>["getList"]>[1]) => {
    queue.push({ ...ok([]), count: 0 } as Response);
    return p.getList("tasks", params);
  };
  const orders = () => calls.filter((c) => c.method === "order").map((c) => c.args);

  it("orders by the key column after the sort, so equal values keep one order across pages", async () => {
    await list(provider(), { sort: { field: "status", order: "desc" }, pagination: { page: 2, perPage: 10 } });
    expect(orders()).toEqual([
      ["status", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("doesn't repeat the key when sorting by it, and honours orderKey", async () => {
    await list(provider(), { sort: { field: "id", order: "asc" } });
    expect(orders()).toEqual([["id", { ascending: true }]]);
    calls = [];
    await list(provider({ resources: { tasks: { orderKey: "slug" } } }), { sort: { field: "title", order: "asc" } });
    expect(orders().map(([col]) => col)).toEqual(["title", "slug"]);
    calls = [];
    await list(provider({ resources: { tasks: { orderKey: false } } }), { sort: { field: "title", order: "asc" } });
    expect(orders().map(([col]) => col)).toEqual(["title"]);
  });

  it("caps a page at maxPerPage with a warning, and reports it in capabilities", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = provider({ maxPerPage: 100 });
    await list(p, { pagination: { page: 1, perPage: 1000 } });
    expect(calls.find((c) => c.method === "range")?.args).toEqual([0, 99]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"tasks" asked for 1000 rows'));
    expect((await p.capabilities!()).maxPerPage).toBe(100);
    warn.mockRestore();
  });
});

describe("read errors", () => {
  it("throw a DataReadError with a message users can see; the raw error is the cause", async () => {
    const onReadError = vi.fn();
    const p = provider({ onReadError, resources: { tasks: { noun: "task" } } });
    queue.push(fail('relation "public.tasks" does not exist', "42P01"));
    const error = await p.getList("tasks", {}).catch((e: unknown) => e);
    expect(isDataReadError(error)).toBe(true);
    const e = error as DataReadError;
    expect(e.outcome).toBe("invalid");
    expect(e.message).toBe("These tasks couldn't be loaded.");
    expect(e.message).not.toContain("relation");
    expect((e.cause as { message: string }).message).toContain("relation");
    expect(onReadError).toHaveBeenCalledWith(e, { resource: "tasks", operation: "getList" });
  });

  it("names an expired session, a refusal and a missing record plainly", async () => {
    const p = provider({ resources: { tasks: { noun: "task" } } });
    queue.push(fail("JWT expired", "PGRST301"));
    expect(((await p.getList("tasks", {}).catch((e) => e)) as DataReadError).message).toBe(
      "Your session has ended. Sign in again to continue.",
    );
    queue.push(fail("permission denied for table tasks", "42501"));
    expect(((await p.getMany("tasks", { ids: ["1"] }).catch((e) => e)) as DataReadError).outcome).toBe("forbidden");
    queue.push(fail("JSON object requested, multiple (or no) rows returned", "PGRST116"));
    const gone = (await p.getOne("tasks", { id: "1" }).catch((e) => e)) as DataReadError;
    expect([gone.outcome, gone.message]).toEqual(["gone", "This task doesn't exist, or you can't see it."]);
  });

  it("maps codes to read outcomes", () => {
    expect(readOutcomeFromCode("42703")).toBe("invalid");
    expect(readOutcomeFromCode("PGRST100")).toBe("invalid");
    expect(readOutcomeFromCode("PGRST116")).toBe("gone");
    expect(readOutcomeFromCode("42501")).toBe("forbidden");
    expect(readOutcomeFromCode("XX000")).toBe("error");
    expect(readOutcomeFromCode(undefined)).toBe("error");
  });
});

describe("capabilities softDelete", () => {
  it("is true for recycle-bin tables only", async () => {
    const p = provider({ binTables: ["tasks"] });
    expect((await p.capabilities!("tasks")).softDelete).toBe(true);
    expect((await p.capabilities!("notes")).softDelete).toBe(false);
    expect((await p.capabilities!()).softDelete).toBe(false);
  });
});

describe("getList follow-ups (#96 review)", () => {
  const list = (p: ReturnType<typeof provider>, params: Parameters<ReturnType<typeof provider>["getList"]>[1], resource = "tasks") => {
    queue.push({ ...ok([]), count: 0 } as Response);
    return p.getList(resource, params);
  };

  it("orders an unsorted page by the key column, and leaves an unpaged, unsorted list alone", async () => {
    await list(provider(), { pagination: { page: 1, perPage: 10 } });
    expect(calls.filter((c) => c.method === "order").map((c) => c.args)).toEqual([["id", { ascending: true }]]);
    calls = [];
    await list(provider(), {});
    expect(calls.some((c) => c.method === "order")).toBe(false);
  });

  it("warns about the page cap once per resource", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = provider({ maxPerPage: 10 });
    await list(p, { pagination: { page: 1, perPage: 50 } });
    await list(p, { pagination: { page: 2, perPage: 50 } });
    await list(p, { pagination: { page: 1, perPage: 50 } }, "notes");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("uses nounPlural in list messages", async () => {
    const p = provider({ resources: { categories: { noun: "category", nounPlural: "categories" } } });
    queue.push(fail("boom"));
    const e = (await p.getList("categories", {}).catch((x) => x)) as DataReadError;
    expect(e.message).toBe("These categories couldn't be loaded. Try again.");
  });
});
