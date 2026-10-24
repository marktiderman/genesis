import { describe, expect, it } from "vitest";
import { createGenesisSupabase, must } from "../index";

describe("createGenesisSupabase", () => {
  it("builds a client with the storage it is given", async () => {
    const stored = new Map<string, string>();
    const client = createGenesisSupabase({
      url: "http://localhost:54321",
      publishableKey: "test",
      detectSessionInUrl: false,
      storage: { getItem: async (k) => stored.get(k) ?? null, setItem: async (k, v) => void stored.set(k, v), removeItem: async (k) => void stored.delete(k) },
    });
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

describe("must", () => {
  it("returns data or throws the database's message", () => {
    expect(must({ data: [1], error: null })).toEqual([1]);
    expect(() => must({ data: null, error: { message: "permission denied" } })).toThrow("permission denied");
  });
});
