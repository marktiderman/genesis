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

/**
 * A one-table store. `provider` acts as the user: `writable` decides whether
 * an update sticks, `onUpdate` can throw instead. `system` always writes.
 */
function store(row: BaseRecord, opts: { writable?: boolean; onUpdate?: () => never; binned?: boolean } = {}) {
  const rows = new Map<string, BaseRecord>([[String(row.id), { ...row }]]);
  const bin = new Set<string>();
  const gone = () => new DataWriteError("gone", "That record is gone.");
  const make = (as: "user" | "system") =>
    ({
      async getOne(_resource: string, { id }: { id: string | number }) {
        const r = rows.get(String(id));
        if (!r) throw new DataReadError("gone", "That record is gone.", { code: "PGRST116" });
        return { data: { ...r } };
      },
      async update(_resource: string, { id, data }: { id: string | number; data: Record<string, unknown> }) {
        const r = rows.get(String(id));
        if (!r) throw gone();
        if (as === "user") opts.onUpdate?.();
        if (as === "system" || opts.writable) Object.assign(r, data);
        return { data: r };
      },
      async deleteOne(_resource: string, { id }: { id: string | number }) {
        if (!rows.delete(String(id))) throw gone();
        if (opts.binned) bin.add(String(id));
        return {};
      },
    }) as unknown as DataProvider;
  return { provider: make("user"), system: make("system"), inBin: async () => bin.has(String(row.id)) };
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
    const own = await fixtureAccessToken("toString", { secret: "x".repeat(32) });
    expect(JSON.parse(atob(own.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).sub).toBe("toString");
    const other = await fixtureAccessToken("client", { secret: "y".repeat(32) });
    expect(other.split(".")[2]).not.toBe(signature);
  });
});

describe("expectRefused", () => {
  it("passes on a refusal in plain words and returns it", async () => {
    const err = await expectRefused(Promise.reject(new DataWriteError("forbidden", "You can't edit this task.")));
    expect(err.outcome).toBe("forbidden");
  });

  it("passes on a guard's raise (P0001), which the provider reports as an error", async () => {
    const guard = new DataWriteError("error", "Only coaches decide how a course opens.", { code: "P0001" });
    expect(await expectRefused(Promise.reject(guard))).toBe(guard);
  });

  it("fails when the write is allowed", () => fails(expectRefused(Promise.resolve({ id: 1 })), /was allowed/));

  it("false pass: a write that reached no row (a typo'd id) needs a control", async () => {
    const { provider } = store({ id: "t1", title: "a" });
    await fails(expectRefused(provider.update("tasks", { id: "typo", data: { title: "x" } })), /pass a control/);
  });

  it("false pass: a control that can't make the write either fails", async () => {
    const { provider, system } = store({ id: "t1", title: "a" });
    await fails(
      expectRefused(provider.update("tasks", { id: "typo", data: { title: "x" } }), {
        control: () => system.update("tasks", { id: "typo", data: { title: "x" } }),
      }),
      /control failed too/,
    );
  });

  it("passes a no-row refusal when the control can make the write", async () => {
    const { system } = store({ id: "t1", title: "a" });
    const err = await expectRefused(Promise.reject(new DataWriteError("gone", "That task is gone.")), {
      control: () => system.update("tasks", { id: "t1", data: { title: "x" } }),
    });
    expect(err.outcome).toBe("gone");
  });

  it("false pass: invalid, duplicate and other errors are not refusals", async () => {
    await fails(
      expectRefused(Promise.reject(new DataWriteError("invalid", "Bad column.", { code: "42703" }))),
      /not as a refusal: invalid \(42703\)/,
    );
    await fails(expectRefused(Promise.reject(new DataWriteError("duplicate", "Already in use."))), /not as a refusal/);
    await fails(expectRefused(Promise.reject(new DataWriteError("error", "Something broke."))), /not as a refusal/);
    await fails(expectRefused(Promise.reject(new TypeError("fetch failed"))), /not as a refusal/);
  });

  it("fails when the refusal shows raw database text", () =>
    fails(
      expectRefused(Promise.reject(new DataWriteError("forbidden", 'new row violates row-level security policy for table "tasks"'))),
      /raw database text/,
    ));
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

it("reads the message of a plain error object", () => {
  expect(() => expectPlainMessage({ message: "duplicate key value violates unique constraint" })).toThrow(/raw database text/);
  expect(() => expectPlainMessage({ message: "" })).toThrow(/no message/);
  expect(() => expectPlainMessage({})).toThrow(/no message/);
  expect(() => expectPlainMessage({ message: "You can't." })).not.toThrow();
});

describe("expectAllowed", () => {
  it("returns the result", async () => expect(await expectAllowed(Promise.resolve(7))).toBe(7));
  it("fails on a refusal", () =>
    fails(expectAllowed(Promise.reject(new DataWriteError("forbidden", "You can't."))), /refused: forbidden/));
});

describe("expectServerOwned", () => {
  const row = { id: "t1", status: "open" };
  const check = (p: { provider: DataProvider; system: DataProvider }, over: Record<string, unknown> = {}) =>
    expectServerOwned({ as: p.provider, system: p.system, resource: "tasks", id: "t1", field: "status", value: "done", ...over });

  it("passes when the update is refused, and leaves the value as it was", async () => {
    const s = store(row, {
      onUpdate: () => {
        throw new DataWriteError("forbidden", "You can't edit this task.");
      },
    });
    await check(s);
    expect((await s.system.getOne("tasks", { id: "t1" })).data.status).toBe("open");
  });

  it("passes when the update runs but the value stays (a trigger put it back)", () => check(store(row, { writable: false })));

  it("fails when the value changed", () => fails(check(store(row, { writable: true })), /changed from "open" to "done"/));

  it("fails on an error that isn't a refusal", () =>
    fails(
      check(
        store(row, {
          onUpdate: () => {
            throw new DataWriteError("invalid", "Status must be open or done.");
          },
        }),
      ),
      /not as a refusal/,
    ));

  it("false pass: a column nobody can change fails, because the system can't either", async () => {
    const s = store(row);
    const frozen = { ...s.system, update: async () => ({ data: row }) } as unknown as DataProvider;
    await fails(check({ provider: s.provider, system: frozen }), /system couldn't change status either/);
  });

  it("false pass: a system write that fails means nothing was tested", async () => {
    const s = store(row);
    const refused = {
      ...s.system,
      update: async () => {
        throw new DataWriteError("forbidden", "No.");
      },
    } as unknown as DataProvider;
    await fails(check({ provider: s.provider, system: refused }), /system couldn't set status/);
  });

  it("fails when there's nothing to test", async () => {
    const s = store(row);
    await fails(check(s, { value: "open" }), /try a different value/);
    await fails(check(s, { field: "kind", value: "x" }), /has no field kind/);
    await expect(check(s, { id: "nope" })).rejects.toThrow();
  });
});

describe("expectNeverShows", () => {
  it("passes when the marker is absent", () => expectNeverShows(Promise.resolve({ data: [{ body: "hello" }] }), "secret-1"));

  it("fails when it appears, even escaped", async () => {
    await fails(expectNeverShows(Promise.resolve([{ body: "a secret-1 b" }]), "secret-1"), /appears in/);
    await fails(expectNeverShows(Promise.resolve([{ body: 'say "hi"' }]), 'say "hi"'), /appears in/);
  });

  it("passes on a refused read", async () => {
    await expectNeverShows(Promise.reject(new DataReadError("forbidden", "You can't see this.")), "secret-1");
    await expectNeverShows(Promise.reject(new DataReadError("error", "No.", { code: "42501" })), "secret-1");
  });

  it("false pass: a read that found nothing (a typo'd id) fails", async () => {
    const { provider } = store({ id: "n1", body: "secret-1" });
    await fails(expectNeverShows(provider.getOne("notes", { id: "typo" }), "secret-1"), /read failed: gone \(PGRST116\)/);
  });

  it("fails on any other failure", () =>
    fails(expectNeverShows(Promise.reject(new DataReadError("invalid", "Bad column.")), "secret-1"), /read failed/));

  it("needs a marker", () => fails(expectNeverShows(Promise.resolve([]), ""), /give a marker/));

  it("false pass: a read that resolved to nothing fails", () =>
    fails(expectNeverShows(Promise.resolve(undefined), "secret-1"), /nothing to look through/));
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

  it("false pass: a row that was never visible (a typo'd id) fails", async () => {
    const { provider } = store({ id: "n1" }, { binned: true });
    await fails(expectBinned({ as: provider, resource: "notes", id: "typo", inBin: async () => true }), /isn't visible before/);
  });
});
