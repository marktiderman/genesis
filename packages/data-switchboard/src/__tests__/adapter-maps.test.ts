// =====================================================================
// Adapter map round-trips — the maps are REAL, the network is MOCKED.
//
// Proves the AirtableAdapter translates canonical field NAMES ↔ Airtable
// field IDs in both directions (returnFieldsByFieldId), survives pagination,
// retries capped on 429 (honoring Retry-After), and degrades stale-while-
// error. Also proves the SupabaseAdapter round-trips through the structural
// query builder + column identity map.
// =====================================================================

import { describe, expect, it, vi } from "vitest";
import {
  AirtableAdapter,
  SupabaseAdapter,
  featuresAirtableMap,
  featuresContract,
  ticketsAirtableMap,
  ticketsContract,
  ticketsSupabaseMap,
} from "../index";
import { makeAirtableFetch } from "./helpers/airtable-fetch";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

describe("AirtableAdapter — field-ID map round-trip", () => {
  function adapterWithWorkCycles(extra?: { throttleFirst?: number; retryAfterSeconds?: number }) {
    const fetch = makeAirtableFetch(
      {
        [ticketsAirtableMap.table]: [
          {
            id: "rec_wc_1",
            fields: {
              [ticketsAirtableMap.fields.title!]: "Cycle One",
              [ticketsAirtableMap.fields.status!]: "open",
              [ticketsAirtableMap.fields.prNumber!]: 1610,
            },
          },
          {
            id: "rec_wc_2",
            fields: {
              [ticketsAirtableMap.fields.title!]: "Cycle Two",
              [ticketsAirtableMap.fields.status!]: "merged",
              [ticketsAirtableMap.fields.prNumber!]: 1665,
            },
          },
        ],
      },
      extra,
    );
    return new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { tickets: ticketsAirtableMap },
      ttlMs: 0,
      sleep: async () => {}, // no real backoff waits in tests.
      fetch,
    });
  }

  it("reads decode field IDs to canonical names (+ record id as `id`)", async () => {
    const a = adapterWithWorkCycles();
    const rows = await a.list(ticketsContract);
    expect(rows).toHaveLength(2); // pagination loop walked both 1-record pages.
    expect(rows[0]).toMatchObject({
      id: "rec_wc_1",
      title: "Cycle One",
      status: "open",
      prNumber: 1610,
    });
  });

  it("get() finds a row by canonical key", async () => {
    const a = adapterWithWorkCycles();
    const row = await a.get(ticketsContract, "rec_wc_2");
    expect(row).toMatchObject({ title: "Cycle Two", prNumber: 1665 });
  });

  it("create() encodes canonical names to field IDs and returns canonical", async () => {
    const a = adapterWithWorkCycles();
    const created = await a.create(ticketsContract, {
      id: "",
      title: "Cycle Three",
      status: "open",
      prNumber: 1700,
    });
    expect(created).toMatchObject({ title: "Cycle Three", prNumber: 1700 });
    expect(String(created.id)).toMatch(/^rec_mock_/);
    // It is now listable (write went through the field-id payload).
    const all = await a.list(ticketsContract);
    expect(all.map((r) => r.title)).toContain("Cycle Three");
  });

  it("update() patches by canonical key through field IDs", async () => {
    const a = adapterWithWorkCycles();
    const updated = await a.update(ticketsContract, "rec_wc_1", {
      status: "in_review",
    });
    expect(updated).toMatchObject({ id: "rec_wc_1", status: "in_review" });
  });

  it("retries capped on 429 and honors Retry-After", async () => {
    const sleep = vi.fn(async () => {});
    const fetch = makeAirtableFetch(
      {
        [featuresAirtableMap.table]: [
          {
            id: "rec_f1",
            fields: { [featuresAirtableMap.fields.name!]: "Recovered" },
          },
        ],
      },
      { throttleFirst: 2, retryAfterSeconds: 1 },
    );
    const a = new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { features: featuresAirtableMap },
      ttlMs: 0,
      maxRetries: 4,
      sleep,
      fetch,
    });
    const rows = await a.list(featuresContract);
    expect(rows[0]).toMatchObject({ name: "Recovered" });
    expect(sleep).toHaveBeenCalledTimes(2); // two 429s ⇒ two backoff sleeps.
    expect(sleep).toHaveBeenCalledWith(1000); // Retry-After: 1s honored.
  });

  it("gives up after maxRetries and throws", async () => {
    const fetch = makeAirtableFetch({ [featuresAirtableMap.table]: [] }, { throttleFirst: 99 });
    const a = new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { features: featuresAirtableMap },
      ttlMs: 0,
      maxRetries: 2,
      sleep: async () => {},
      fetch,
    });
    await expect(a.list(featuresContract)).rejects.toThrow(/Airtable 429/);
  });

  it("stale-while-error: serves last-known-good when a refresh fails", async () => {
    // First call succeeds and primes lastGood; second call 429s past retries.
    let phase: "ok" | "fail" = "ok";
    const okFetch = makeAirtableFetch({
      [featuresAirtableMap.table]: [
        {
          id: "rec_f1",
          fields: { [featuresAirtableMap.fields.name!]: "Cached" },
        },
      ],
    });
    const failFetch = makeAirtableFetch({ [featuresAirtableMap.table]: [] }, { throttleFirst: 99 });
    const a = new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { features: featuresAirtableMap },
      ttlMs: 0, // force a refresh every call so the 2nd hits the network.
      maxRetries: 1,
      sleep: async () => {},
      fetch: (url, init) => (phase === "ok" ? okFetch(url, init) : failFetch(url, init)),
    });

    const first = await a.list(featuresContract);
    expect(first[0]).toMatchObject({ name: "Cached" });

    phase = "fail";
    const second = await a.list(featuresContract); // refresh fails → stale served.
    expect(second[0]).toMatchObject({ name: "Cached" });
  });
});

describe("SupabaseAdapter — query-builder round-trip", () => {
  function makeSupabase() {
    const client = new FakeSupabaseClient({
      tickets: [{ id: "rec_db_1", title: "DB Cycle", status: "open", prNumber: 1 }],
    });
    return {
      client,
      adapter: new SupabaseAdapter({
        client,
        maps: { tickets: ticketsSupabaseMap },
      }),
    };
  }

  it("list / get / query round-trip", async () => {
    const { adapter } = makeSupabase();
    expect(await adapter.list(ticketsContract)).toHaveLength(1);
    expect(await adapter.get(ticketsContract, "rec_db_1")).toMatchObject({
      title: "DB Cycle",
    });
    const q = await adapter.query(ticketsContract, { where: { status: "open" } });
    expect(q).toHaveLength(1);
    expect(await adapter.get(ticketsContract, "nope")).toBeNull();
  });

  it("create / update / delete round-trip", async () => {
    const { adapter, client } = makeSupabase();
    const created = await adapter.create(ticketsContract, {
      id: "rec_db_2",
      title: "Second",
      status: "open",
      prNumber: 2,
    });
    expect(created).toMatchObject({ title: "Second" });
    expect(client.rows("tickets")).toHaveLength(2);

    const updated = await adapter.update(ticketsContract, "rec_db_2", {
      status: "merged",
    });
    expect(updated).toMatchObject({ status: "merged" });

    await adapter.delete(ticketsContract, "rec_db_2");
    expect(client.rows("tickets")).toHaveLength(1);
  });

  it("update() merges scoped filter columns into the payload", async () => {
    const scopedMap = {
      table: "feedback_features",
      filter: { product: "genesis-factory" },
    };
    const client = new FakeSupabaseClient({
      feedback_features: [{ id: "f1", name: "Widget", product: "genesis-factory" }],
    });
    const adapter = new SupabaseAdapter({
      client,
      maps: { features: scopedMap },
    });
    await adapter.update(featuresContract, "f1", {
      name: "Renamed",
      // Caller tries to move the row out of the scoped slice — filter must win.
      product: "acme",
    } as Parameters<typeof adapter.update>[2]);
    expect(client.rows("feedback_features")[0]).toMatchObject({
      name: "Renamed",
      product: "genesis-factory",
    });
  });
});
