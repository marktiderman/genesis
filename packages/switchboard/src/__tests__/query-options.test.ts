// =====================================================================
// whereIn + offset (U5) — the membership filter and paging window added
// alongside the "jsonb" ProviderKind (U6) and createSwitchboardProvider's
// move into this package (U4). Proves the client-side adapters (CodeAdapter,
// representative of Airtable/Notion/gitdata's shared filter/sort/slice
// pipeline) and the server-side SupabaseAdapter both honor `whereIn` and
// `offset`, and that createSwitchboardProvider's ListParams translation
// pushes an `in` filter and page > 1 down through them instead of throwing.
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  CodeAdapter,
  Registry,
  SupabaseAdapter,
  Switchboard,
  type ResourceContract,
} from "../index";
import { createSwitchboardProvider } from "../data-provider";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

interface Item extends Record<string, unknown> {
  id: string;
  team_id: string;
  position: number;
}

const itemContract: ResourceContract = {
  name: "items",
  key: "id",
  sourceOfTruth: "L1",
  fields: [
    { name: "id", type: "string" },
    { name: "team_id", type: "string" },
    { name: "position", type: "number" },
  ],
};

const FIXTURES: Item[] = [
  { id: "a", team_id: "t1", position: 0 },
  { id: "b", team_id: "t1", position: 1 },
  { id: "c", team_id: "t2", position: 2 },
  { id: "d", team_id: "t1", position: 3 },
  { id: "e", team_id: "t3", position: 4 },
];

describe("CodeAdapter.query() — whereIn + offset", () => {
  it("whereIn filters to the membership set, ANDed with where", async () => {
    const adapter = new CodeAdapter({ fixtures: { items: FIXTURES } });
    const rows = await adapter.query(itemContract, {
      where: { position: 3 },
      whereIn: { team_id: ["t1", "t3"] },
    });
    expect(rows.map((r) => r.id)).toEqual(["d"]);
  });

  it("offset paginates after ordering, independent of limit", async () => {
    const adapter = new CodeAdapter({ fixtures: { items: FIXTURES } });
    const page2 = await adapter.query(itemContract, {
      orderBy: "position",
      offset: 2,
      limit: 2,
    });
    expect(page2.map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("offset without limit is a fail-loud error, consistent with SupabaseAdapter", async () => {
    const adapter = new CodeAdapter({ fixtures: { items: FIXTURES } });
    await expect(
      adapter.query(itemContract, { orderBy: "position", offset: 3 }),
    ).rejects.toThrow(/offset requires limit/);
  });
});

describe("SupabaseAdapter.query() — whereIn + offset", () => {
  function makeSupabase() {
    const client = new FakeSupabaseClient({ items: FIXTURES });
    return new SupabaseAdapter({ client, maps: { items: { table: "items" } } });
  }

  it("whereIn pushes down to the query builder's .in()", async () => {
    const adapter = makeSupabase();
    const rows = await adapter.query(itemContract, { whereIn: { team_id: ["t2"] } });
    expect(rows.map((r) => r.id)).toEqual(["c"]);
  });

  it("offset + limit together use range()", async () => {
    const adapter = makeSupabase();
    const rows = await adapter.query(itemContract, { orderBy: "position", offset: 1, limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("offset without limit is a fail-loud error — range() needs both bounds", async () => {
    const adapter = makeSupabase();
    await expect(adapter.query(itemContract, { offset: 1 })).rejects.toThrow(/offset requires limit/);
  });

  it("offset without orderBy is a fail-loud error — unordered range() can skip or repeat rows", async () => {
    const adapter = makeSupabase();
    await expect(
      adapter.query(itemContract, { offset: 1, limit: 2 }),
    ).rejects.toThrow(/offset requires orderBy/);
  });
});

describe("createSwitchboardProvider — ListParams → QueryOptions", () => {
  function makeProvider() {
    const adapter = new CodeAdapter({ fixtures: { items: FIXTURES } });
    const registry = new Registry()
      .register(itemContract)
      .useAdapter(adapter)
      .setEnvironmentDefault("code");
    return createSwitchboardProvider(new Switchboard(registry));
  }

  it("an `in` filter translates to whereIn instead of throwing", async () => {
    const provider = makeProvider();
    const result = await provider.getList("items", {
      filters: [{ field: "team_id", operator: "in", value: ["t1", "t2"] }],
    });
    expect(result.data.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("repeated `in` filters on the same field intersect, not overwrite", async () => {
    const provider = makeProvider();
    const result = await provider.getList("items", {
      filters: [
        { field: "team_id", operator: "in", value: ["t1", "t2"] },
        { field: "team_id", operator: "in", value: ["t2", "t3"] },
      ],
    });
    // Only t2 is in both sets.
    expect(result.data.map((r) => r.id)).toEqual(["c"]);
  });

  it("page > 1 translates to an offset instead of throwing", async () => {
    const provider = makeProvider();
    const result = await provider.getList("items", {
      sort: { field: "position", order: "asc" },
      pagination: { page: 2, perPage: 2 },
    });
    expect(result.data.map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("total is accurate (not just this page's row count) once the last page is short", async () => {
    const provider = makeProvider();
    // 5 fixtures, perPage 2 → page 3 returns the last (partial) page.
    const result = await provider.getList("items", {
      sort: { field: "position", order: "asc" },
      pagination: { page: 3, perPage: 2 },
    });
    expect(result.data.map((r) => r.id)).toEqual(["e"]);
    expect(result.total).toBe(5);
  });

  it("pagination past page 1 on a Tier-B merge resource fails loud instead of returning a wrong page", async () => {
    const codeAdapter = new CodeAdapter({ fixtures: { items: FIXTURES } });
    const supabaseAdapter = new SupabaseAdapter({
      client: new FakeSupabaseClient({ items: FIXTURES }),
      maps: { items: { table: "items" } },
    });
    const registry = new Registry()
      .register(itemContract)
      .useAdapter(codeAdapter)
      .useAdapter(supabaseAdapter)
      .setEnvironmentDefault("code")
      .bindMerge("items", ["code", "supabase"]);
    const provider = createSwitchboardProvider(new Switchboard(registry));
    await expect(
      provider.getList("items", {
        sort: { field: "position", order: "asc" },
        pagination: { page: 2, perPage: 2 },
      }),
    ).rejects.toThrow(/Tier-B merge plan/);
  });

  it("an unsupported filter operator still fails loud", async () => {
    const provider = makeProvider();
    await expect(
      provider.getList("items", {
        filters: [{ field: "position", operator: "gt", value: 1 }],
      }),
    ).rejects.toThrow(/unsupported filter operator/);
  });

  it("page > 1 without a sort fails loud instead of paginating unordered", async () => {
    const provider = makeProvider();
    await expect(
      provider.getList("items", { pagination: { page: 2, perPage: 2 } }),
    ).rejects.toThrow(/requires an explicit sort/);
  });
});
