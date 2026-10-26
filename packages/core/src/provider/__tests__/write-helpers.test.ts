import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { writeMutation } from "../../hooks/use-write";
import { DataWriteError, isDataWriteError } from "../../schema/write-outcome";
import { createMockProvider } from "../mock-provider";
import type { DataProvider } from "../types";
import { RPC_FAILED, callRpc, createOrAdopt } from "../write-helpers";

const rpcReturning = (result: { data?: unknown; error?: unknown }) => ({
  rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
});

async function failure(p: Promise<unknown>): Promise<DataWriteError> {
  try {
    await p;
  } catch (error) {
    if (isDataWriteError(error)) return error;
    throw error;
  }
  throw new Error("expected a failure");
}

describe("callRpc", () => {
  it("returns the data and passes the arguments", async () => {
    const client = rpcReturning({ data: { opened: 2 } });
    expect(await callRpc(client, "open_steps", { enrollment_id: "e1" })).toEqual({ opened: 2 });
    expect(client.rpc).toHaveBeenCalledWith("open_steps", { enrollment_id: "e1" });
  });

  it("uses the caller's words for a code first", async () => {
    const err = await failure(
      callRpc(rpcReturning({ error: { code: "55000", message: "object not in prerequisite state" } }), "f", {}, {
        messages: { "55000": "This course has already started." },
      }),
    );
    expect(err.message).toBe("This course has already started.");
    expect(err.code).toBe("55000");
    expect((err.cause as { message: string }).message).toBe("object not in prerequisite state");
  });

  it("keeps a guard's own words (P0001)", async () => {
    const err = await failure(callRpc(rpcReturning({ error: { code: "P0001", message: "Withdraw from the course instead" } }), "f"));
    expect(err.message).toBe("Withdraw from the course instead");
  });

  it("gives plain defaults instead of raw text", async () => {
    const denied = await failure(
      callRpc(rpcReturning({ error: { code: "42501", message: "permission denied for function f" } }), "f"),
    );
    expect(denied.message).toBe("You can't do that.");
    expect(denied.outcome).toBe("forbidden");
    const odd = await failure(callRpc(rpcReturning({ error: { code: "XX000", message: "internal error at line 3" } }), "f"));
    expect(odd.message).toBe(RPC_FAILED);
  });

  it("keeps the safe field message for a unique violation", async () => {
    const err = await failure(
      callRpc(rpcReturning({ error: { code: "23505", message: "duplicate key", details: "Key (slug)=(a) already exists." } }), "f"),
    );
    expect(err.outcome).toBe("duplicate");
    expect(err.fields).toEqual({ slug: "This value is already in use." });
    expect(err.message).not.toMatch(/duplicate key/);
  });

  it("never shows an empty guard message or a missing result as raw text", async () => {
    const empty = await failure(callRpc(rpcReturning({ error: { code: "P0001", message: "" } }), "f"));
    expect(empty.message).toBe(RPC_FAILED);
    const nothing = await failure(callRpc({ rpc: async () => undefined as never }, "f"));
    expect(nothing.message).toBe(RPC_FAILED);
    const dup = await failure(callRpc(rpcReturning({ error: { code: "23505", message: "duplicate key value" } }), "f"));
    expect(dup.message).toBe("That already exists.");
  });

  it("reports a request that never arrived plainly", async () => {
    const err = await failure(callRpc({ rpc: () => Promise.reject(new TypeError("fetch failed")) }, "f"));
    expect(err.outcome).toBe("error");
    expect(err.message).toBe(RPC_FAILED);
  });
});

/** A mock provider whose create throws a duplicate when a row with the same key exists. */
function uniqueProvider(rows: Record<string, unknown>[]) {
  const base = createMockProvider({ drafts: rows as never });
  return {
    ...base,
    async create(resource, params) {
      const { data } = await base.getList(resource, {});
      const d = params.data as Record<string, unknown>;
      if (data.some((r) => r.person_id === d.person_id && r.lesson_id === d.lesson_id)) {
        throw new DataWriteError("duplicate", "This value is already in use.", { code: "23505" });
      }
      return base.create(resource, params);
    },
  } as DataProvider;
}

describe("createOrAdopt", () => {
  const key = ["person_id", "lesson_id"] as const;

  it("creates when nothing is there", async () => {
    const provider = uniqueProvider([]);
    const { row, adopted } = await createOrAdopt(provider, "drafts", { person_id: "p1", lesson_id: "l1", body: "a" }, { key: [...key] });
    expect(adopted).toBe(false);
    expect(row.body).toBe("a");
  });

  it("adopts the row already there, merging in only what you return", async () => {
    const provider = uniqueProvider([{ id: "d1", person_id: "p1", lesson_id: "l1", body: "old", status: "open" }]);
    const kept = await createOrAdopt(provider, "drafts", { person_id: "p1", lesson_id: "l1", body: "new" }, { key: [...key] });
    expect(kept).toEqual({ row: expect.objectContaining({ id: "d1", body: "old" }), adopted: true });
    const merged = await createOrAdopt(
      provider,
      "drafts",
      { person_id: "p1", lesson_id: "l1", body: "new" },
      { key: [...key], merge: (existing) => (existing.status === "open" ? { body: "new" } : null) },
    );
    expect(merged.row).toEqual(expect.objectContaining({ id: "d1", body: "new" }));
  });

  it("rethrows other errors, and a duplicate it can't find", async () => {
    const refusing = {
      ...uniqueProvider([]),
      create: async () => {
        throw new DataWriteError("forbidden", "You can't.");
      },
    } as DataProvider;
    expect((await failure(createOrAdopt(refusing, "drafts", { person_id: "p1" }, { key: ["person_id"] }))).outcome).toBe("forbidden");
    const hidden = {
      ...uniqueProvider([]),
      create: async () => {
        throw new DataWriteError("duplicate", "This value is already in use.");
      },
    } as DataProvider;
    expect((await failure(createOrAdopt(hidden, "drafts", { person_id: "p1" }, { key: ["person_id"] }))).outcome).toBe("duplicate");
  });

  it("reads at most two rows by every key field, and rethrows unless exactly one matches", async () => {
    const twins = uniqueProvider([
      { id: "d1", person_id: "p1", lesson_id: "l1" },
      { id: "d2", person_id: "p1", lesson_id: "l1" },
    ]);
    const getList = vi.spyOn(twins, "getList");
    expect((await failure(createOrAdopt(twins, "drafts", { person_id: "p1", lesson_id: "l1" }, { key: [...key] }))).outcome).toBe(
      "duplicate",
    );
    expect(getList).toHaveBeenLastCalledWith("drafts", {
      filters: [
        { field: "person_id", operator: "eq", value: "p1" },
        { field: "lesson_id", operator: "eq", value: "l1" },
      ],
      pagination: { page: 1, perPage: 2 },
    });
  });

  it("rethrows a clash on another unique field instead of adopting the key's row", async () => {
    const provider = uniqueProvider([{ id: "d1", person_id: "p1", lesson_id: "l1", slug: "a" }]);
    const clash = {
      ...provider,
      create: async () => {
        throw new DataWriteError("duplicate", "This value is already in use.", { fields: { slug: "This value is already in use." } });
      },
    } as DataProvider;
    const err = await failure(createOrAdopt(clash, "drafts", { person_id: "p1", lesson_id: "l1", slug: "a" }, { key: [...key] }));
    expect(err.fields).toEqual({ slug: "This value is already in use." });
  });

  it("needs a key", async () => {
    await expect(createOrAdopt(uniqueProvider([]), "drafts", {}, { key: [] })).rejects.toThrow(/needs a key/);
  });
});

describe("useWrite's mutation", () => {
  it("invalidates the keys and calls onSuccess after a success", async () => {
    const client = new QueryClient();
    await client.fetchQuery({ queryKey: ["tasks", "list"], queryFn: () => 1, staleTime: Infinity });
    await client.fetchQuery({ queryKey: ["people"], queryFn: () => 1, staleTime: Infinity });
    const onSuccess = vi.fn();
    const observer = new MutationObserver(
      client,
      writeMutation(client, async (n: number) => n * 2, {
        invalidates: (result) => [["tasks"], ["result", result]],
        onSuccess,
      }),
    );
    expect(await observer.mutate(4)).toBe(8);
    expect(client.getQueryState(["tasks", "list"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["people"])?.isInvalidated).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith(8, 4);
    client.clear();
  });

  it("invalidates nothing when the write fails", async () => {
    const client = new QueryClient();
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: () => 1, staleTime: Infinity });
    const observer = new MutationObserver(
      client,
      writeMutation(
        client,
        async () => {
          throw new DataWriteError("forbidden", "You can't.");
        },
        { invalidates: [["tasks"]] },
      ),
    );
    await expect(observer.mutate(undefined)).rejects.toThrow("You can't.");
    expect(client.getQueryState(["tasks"])?.isInvalidated).toBe(false);
    client.clear();
  });
});
