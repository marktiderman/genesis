import { describe, expect, it } from "vitest";
import type { BaseRecord, DataProvider } from "../../provider/types";
import { DataReadError } from "../../schema/read-outcome";
import { DataWriteError } from "../../schema/write-outcome";
import {
  ContractError,
  FIXTURE_USERS,
  expectAllowed,
  expectBinned,
  expectNeverShows,
  expectPlainMessage,
  expectRefused,
  expectSees,
  expectServerOwned,
  fixtureAccessToken,
} from "../index";

/** A one-table store: `writable` decides whether an update sticks, `onUpdate` can throw instead. */
function store(row: BaseRecord, opts: { writable?: boolean; onUpdate?: () => never; binned?: boolean } = {}) {
  const rows = new Map<string, BaseRecord>([[String(row.id), { ...row }]]);
  const bin = new Set<string>();
  const provider = {
    async getOne(_resource: string, { id }: { id: string | number }) {
      const r = rows.get(String(id));
      if (!r) throw new DataReadError("gone", "That record is gone.");
      return { data: r };
    },
    async update(_resource: string, { id, data }: { id: string | number; data: Record<string, unknown> }) {
      opts.onUpdate?.();
      const r = rows.get(String(id))!;
      if (opts.writable) Object.assign(r, data);
      return { data: r };
    },
    async deleteOne(_resource: string, { id }: { id: string | number }) {
      rows.delete(String(id));
      if (opts.binned) bin.add(String(id));
      return {};
    },
  } as unknown as DataProvider;
  return { provider, inBin: async () => bin.has(String(row.id)) };
}

const fails = (p: Promise<unknown>, text: string | RegExp) => expect(p).rejects.toThrow(text);

describe("fixture ids", () => {
  it("match genesis_testing.user_id()", () => {
    expect(FIXTURE_USERS).toEqual({
      owner: "00000000-0000-4000-8000-000000000001",
      staff: "00000000-0000-4000-8000-000000000002",
      client: "00000000-0000-4000-8000-000000000003",
      stranger: "00000000-0000-4000-8000-000000000004",
    });
  });

  it("signs a token whose claims name the fixture person", async () => {
    const token = await fixtureAccessToken("client", { secret: "x".repeat(32) });
    const [, body, signature] = token.split(".");
    const claims = JSON.parse(atob(body!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(claims).toMatchObject({ sub: FIXTURE_USERS.client, role: "authenticated", aud: "authenticated" });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(signature).toMatch(/^[\w-]{43}$/);
    const other = await fixtureAccessToken("client", { secret: "y".repeat(32) });
    expect(other.split(".")[2]).not.toBe(signature);
  });
});

describe("expectRefused", () => {
  it("passes on a refusal in plain words and returns it", async () => {
    const err = await expectRefused(Promise.reject(new DataWriteError("forbidden", "You can't edit this task.")));
    expect(err.outcome).toBe("forbidden");
  });

  it("fails when the write is allowed", () => fails(expectRefused(Promise.resolve({ id: 1 })), /was allowed/));

  it("fails on an outcome that isn't a refusal", () =>
    fails(expectRefused(Promise.reject(new DataWriteError("invalid", "Name is required."))), /"invalid"/));

  it("fails on a plain Error", () => fails(expectRefused(Promise.reject(new TypeError("fetch failed"))), /not as a DataWriteError/));

  it("fails when the refusal shows raw database text", () =>
    fails(
      expectRefused(Promise.reject(new DataWriteError("forbidden", 'new row violates row-level security policy for table "tasks"'))),
      /raw database text/,
    ));

  it("takes other outcomes when asked", async () => {
    const err = await expectRefused(Promise.reject(new DataWriteError("conflict", "Someone else changed it.")), {
      outcomes: ["conflict"],
    });
    expect(err.outcome).toBe("conflict");
  });
});

describe("expectPlainMessage", () => {
  it.each(["You can't delete this task.", "Email is already in use.", "Saved 12345 rows."])("accepts %s", (m) =>
    expect(() => expectPlainMessage(new Error(m))).not.toThrow(),
  );
  it.each(["duplicate key value violates unique constraint", "permission denied for table tasks", "error 42501", "PGRST116", ""])(
    "rejects %s",
    (m) => expect(() => expectPlainMessage(new Error(m))).toThrow(ContractError),
  );
});

describe("expectAllowed", () => {
  it("returns the result", async () => expect(await expectAllowed(Promise.resolve(7))).toBe(7));
  it("fails on a refusal", () =>
    fails(expectAllowed(Promise.reject(new DataWriteError("forbidden", "You can't."))), /refused: forbidden/));
});

describe("expectServerOwned", () => {
  const row = { id: "t1", status: "open" };

  it("passes when the update is refused", async () => {
    const { provider } = store(row, {
      onUpdate: () => {
        throw new DataWriteError("forbidden", "You can't edit this task.");
      },
    });
    await expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "status", value: "done" });
  });

  it("passes when the update runs but the value stays (a trigger put it back)", async () => {
    const { provider } = store(row, { writable: false });
    await expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "status", value: "done" });
  });

  it("fails when the value changed", async () => {
    const { provider } = store(row, { writable: true });
    await fails(
      expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "status", value: "done" }),
      /changed from "open" to "done"/,
    );
  });

  it("fails on an error that isn't a refusal", async () => {
    const { provider } = store(row, {
      onUpdate: () => {
        throw new DataWriteError("invalid", "Status must be open or done.");
      },
    });
    await fails(
      expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "status", value: "x" }),
      /not as a refusal/,
    );
  });

  it("fails when there's nothing to test", async () => {
    const { provider } = store(row);
    await fails(
      expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "status", value: "open" }),
      /try a different value/,
    );
    await fails(
      expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "t1", field: "kind", value: "x" }),
      /has no field kind/,
    );
    await expect(
      expectServerOwned({ as: provider, control: provider, resource: "tasks", id: "nope", field: "status", value: "x" }),
    ).rejects.toThrow();
  });
});

describe("expectNeverShows", () => {
  it("passes when the marker is absent", () => expectNeverShows(Promise.resolve({ data: [{ body: "hello" }] }), "secret-1"));

  it("fails when it appears, even escaped", async () => {
    await fails(expectNeverShows(Promise.resolve([{ body: "a secret-1 b" }]), "secret-1"), /appears in/);
    await fails(expectNeverShows(Promise.resolve([{ body: 'say "hi"' }]), 'say "hi"'), /appears in/);
  });

  it("passes on a forbidden or gone read, fails on any other failure", async () => {
    await expectNeverShows(Promise.reject(new DataReadError("forbidden", "You can't see this.")), "secret-1");
    await fails(expectNeverShows(Promise.reject(new DataReadError("invalid", "Bad column.")), "secret-1"), /read failed/);
  });

  it("needs a marker", () => fails(expectNeverShows(Promise.resolve([]), ""), /give a marker/));
});

describe("expectSees", () => {
  it("counts list results, getMany results and arrays", async () => {
    await expectSees(Promise.resolve({ data: [1, 2], total: 2 }), 2);
    await expectSees(Promise.resolve([1]), 1);
  });
  it("fails on the wrong count, a non-list or a failed read", async () => {
    await fails(expectSees(Promise.resolve([1]), 2), /saw 1 row\(s\), expected 2/);
    await fails(expectSees(Promise.resolve({ id: 1 }), 1), /no rows to count/);
    await fails(expectSees(Promise.reject(new DataReadError("forbidden", "No.")), 0), /read failed/);
  });
});

describe("expectBinned", () => {
  it("passes when the row leaves view and stays in the bin", async () => {
    const { provider, inBin } = store({ id: "n1" }, { binned: true });
    await expectBinned({ as: provider, resource: "notes", id: "n1", inBin });
  });

  it("fails when it was deleted for good", async () => {
    const { provider, inBin } = store({ id: "n1" }, { binned: false });
    await fails(expectBinned({ as: provider, resource: "notes", id: "n1", inBin }), /deleted for good/);
  });

  it("fails when it is still visible", async () => {
    const { provider } = store({ id: "n1" });
    const stays = { ...provider, deleteOne: async () => ({}) } as unknown as DataProvider;
    await fails(expectBinned({ as: stays, resource: "notes", id: "n1", inBin: async () => true }), /still visible/);
  });
});
