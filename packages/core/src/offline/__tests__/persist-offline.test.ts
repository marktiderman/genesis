// @feat:data-offline
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resourceKeys } from "../../query-keys";
import { memoryLocalCache } from "../memory";
import { persistOffline } from "../persist";
import { cacheScope, type LocalCache } from "../types";

const ANA = cacheScope("ana", "org:acme");
const list = resourceKeys("tasks").list({ pagination: { page: 1, perPage: 20 } });
const detail = resourceKeys("tasks").detail("1");
const rows = [
  { id: 1, title: "One" },
  { id: 2, title: "Two" },
];

afterEach(() => vi.useRealTimers());

/** A client whose queries "fetch" these values, and the persistence saving its reads. */
function setup(cache: LocalCache = memoryLocalCache(), resources = ["tasks"], buster = "v1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const persistence = persistOffline({ cache, resources, buster, throttleMs: 0 })(client);
  return { client, persistence, cache };
}

/** Reads through the client as a screen would (a real fetch, not setQueryData). */
async function fetchAll(client: QueryClient) {
  await client.fetchQuery({ queryKey: list, queryFn: async () => ({ data: rows, total: 2 }) });
  await client.fetchQuery({ queryKey: detail, queryFn: async () => ({ id: 1, title: "One", notes: "full row" }) });
  await client.fetchQuery({ queryKey: resourceKeys("secrets").list({}), queryFn: async () => ({ data: [{ id: 9 }], total: 1 }) });
}

/** Lets the throttled save run. */
const settle = () => new Promise((r) => setTimeout(r, 10));

describe("persistOffline", () => {
  it("restores lists and records into a fresh client, sharing one stored row, and only kept resources", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();

    // The next start: same cache, a new client.
    const next = setup(first.cache);
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(list)).toEqual({ data: [{ id: 1, title: "One", notes: "full row" }, { id: 2, title: "Two" }], total: 2 });
    expect(next.client.getQueryData(detail)).toEqual({ id: 1, title: "One", notes: "full row" });
    expect(next.client.getQueryData(resourceKeys("secrets").list({}))).toBeUndefined();
    const [stored] = await first.cache.readRows(ANA, "tasks", ["1"]);
    expect(stored?.row).toEqual({ id: 1, title: "One", notes: "full row" });
  });

  it("marks a restored read with when it was fetched, so a screen refetches it", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    const fetchedAt = first.client.getQueryState(list)!.dataUpdatedAt;
    await settle();
    stop();
    const next = setup(first.cache);
    await next.persistence.restore(ANA);
    expect(next.client.getQueryState(list)?.dataUpdatedAt).toBe(fetchedAt);
  });

  it("never keeps a change made in the client (an optimistic patch), only fetched reads", async () => {
    const { client, persistence, cache } = setup();
    await persistence.restore(ANA);
    const stop = persistence.subscribe(ANA);
    client.setQueryData(list, { data: [{ id: 1, title: "Unsaved" }], total: 1 });
    await settle();
    stop();
    expect(await cache.readRows(ANA, "tasks", ["1"])).toEqual([]);
  });

  it("never replaces a newer read already in the client", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();
    const next = setup(first.cache);
    await next.client.fetchQuery({ queryKey: list, queryFn: async () => ({ data: [{ id: 3, title: "Newer" }], total: 1 }) });
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(list)).toEqual({ data: [{ id: 3, title: "Newer" }], total: 1 });
  });

  it("keeps people and workspaces apart", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();
    for (const other of [cacheScope("ben", "org:acme"), cacheScope("ana", "org:other")]) {
      const next = setup(first.cache);
      await next.persistence.restore(other);
      expect(next.client.getQueryData(list)).toBeUndefined();
    }
  });

  it("takes a bare user id as the scope (GenesisNativeApp hands over the user id)", async () => {
    const first = setup();
    await first.persistence.restore("ana");
    const stop = first.persistence.subscribe("ana");
    await fetchAll(first.client);
    await settle();
    stop();
    const next = setup(first.cache);
    await next.persistence.restore("ana");
    expect(next.client.getQueryData(list)).toBeDefined();
    // Signed out: nothing restored, nothing saved.
    const out = setup(first.cache);
    await out.persistence.restore("");
    expect(out.client.getQueryData(list)).toBeUndefined();
  });

  it("discards what was kept under another app version", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();
    const next = setup(first.cache, ["tasks"], "v2");
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(list)).toBeUndefined();
    expect(await first.cache.readRows(ANA, "tasks", ["1"])).toEqual([]);
  });

  it("drops reads older than maxAge", async () => {
    const cache = memoryLocalCache();
    const first = setup(cache);
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 60 * 60 * 1000, toFake: ["Date"] });
    const next = setup(cache);
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(list)).toBeUndefined();
  });

  it("skips a read whose rows are missing, instead of showing a hole", async () => {
    const first = setup();
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetchAll(first.client);
    await settle();
    stop();
    // Row 2 is gone from the device (evicted).
    const cache = first.cache;
    const original = cache.readRows.bind(cache);
    cache.readRows = async (scope, resource, ids) => (await original(scope, resource, ids)).filter((r) => r.id !== "2");
    const next = setup(cache);
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(list)).toBeUndefined();
    expect(next.client.getQueryData(detail)).toBeDefined();
  });

  it("clear deletes the person's buckets and stops saves already scheduled", async () => {
    const cache = memoryLocalCache();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const persistence = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 20 })(client);
    await persistence.restore(ANA);
    persistence.subscribe(ANA);
    await fetchAll(client);
    // A save is scheduled; sign-out clears before it runs.
    await persistence.clear();
    await new Promise((r) => setTimeout(r, 40));
    expect(await cache.readQueries(ANA)).toEqual([]);
    expect(await cache.readRows(ANA, "tasks", ["1"])).toEqual([]);
  });

  it("keeps infinite lists, page by page", async () => {
    const first = setup();
    const key = resourceKeys("tasks").infinite({});
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await first.client.fetchInfiniteQuery({
      queryKey: key,
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      queryFn: async () => ({ data: rows, total: 2 }),
    });
    await settle();
    stop();
    const next = setup(first.cache);
    await next.persistence.restore(ANA);
    expect(next.client.getQueryData(key)).toEqual({ pages: [{ data: rows, total: 2 }], pageParams: [0] });
  });
});

describe("persistOffline, what the device keeps", () => {
  /** Saves `fetch`'s reads with a first persistence, and returns a fresh client restored from them. */
  async function roundTrip(fetch: (client: QueryClient) => Promise<void>, cache: LocalCache = memoryLocalCache()) {
    const first = setup(cache);
    await first.persistence.restore(ANA);
    const stop = first.persistence.subscribe(ANA);
    await fetch(first.client);
    await settle();
    stop();
    const next = setup(cache);
    await next.persistence.restore(ANA);
    return { first, next, cache };
  }

  it("never saves a patch made after the fetch but before the save ran", async () => {
    const cache = memoryLocalCache();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const persistence = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 20 })(client);
    await persistence.restore(ANA);
    const stop = persistence.subscribe(ANA);
    await client.fetchQuery({ queryKey: list, queryFn: async () => ({ data: rows, total: 2 }) });
    client.setQueryData(list, { data: [{ id: 1, title: "Unsaved" }], total: 1 });
    await new Promise((r) => setTimeout(r, 40));
    stop();
    expect((await cache.readRows(ANA, "tasks", ["1"]))[0]?.row).toEqual({ id: 1, title: "One" });
  });

  it("forgets a record that comes back empty, on the device too", async () => {
    const cache = memoryLocalCache();
    await roundTrip(fetchAll, cache);
    const { next } = await roundTrip(async (client) => {
      await client.fetchQuery({ queryKey: detail, queryFn: async () => null });
    }, cache);
    expect(next.client.getQueryData(detail)).toBeUndefined();
    expect(await cache.readRows(ANA, "tasks", ["1"])).toEqual([]);
  });

  it("keeps a projected list as it came, apart from the rows read whole", async () => {
    const projected = resourceKeys("tasks").list({ select: "id, owner:people(name)" });
    const { next } = await roundTrip(async (client) => {
      await client.fetchQuery({ queryKey: detail, queryFn: async () => ({ id: 1, title: "One", owner: "u-1" }) });
      await client.fetchQuery({ queryKey: projected, queryFn: async () => ({ data: [{ id: 1, owner: { name: "Ana" } }], total: 1 }) });
    });
    expect(next.client.getQueryData(detail)).toEqual({ id: 1, title: "One", owner: "u-1" });
    expect(next.client.getQueryData(projected)).toEqual({ data: [{ id: 1, owner: { name: "Ana" } }], total: 1 });
  });

  it("deletes expired reads and the rows nothing refers to on the next start", async () => {
    const cache = memoryLocalCache();
    await roundTrip(fetchAll, cache);
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 60 * 60 * 1000, toFake: ["Date"] });
    await setup(cache).persistence.restore(ANA);
    expect((await cache.readQueries(ANA)).map((q) => q.key)).toEqual(["__genesis_offline_meta__"]);
    expect(await cache.readRows(ANA, "tasks", ["1", "2"])).toEqual([]);
  });

  it("never saves a read that was on its way before saving started (the scope before)", async () => {
    const { client, persistence, cache } = setup();
    let answer: (v: unknown) => void = () => {};
    const inFlight = client.fetchQuery({ queryKey: list, queryFn: () => new Promise((r) => (answer = r)) });
    const stop = persistence.subscribe(cacheScope("ana", "org:other"));
    answer({ data: rows, total: 2 });
    await inFlight;
    await settle();
    stop();
    expect(await cache.readQueries(cacheScope("ana", "org:other"))).toEqual([]);
  });

  it("drops a restore that finishes after it was called off (a sign-out while the device was reading)", async () => {
    const cache = memoryLocalCache();
    await roundTrip(fetchAll, cache);
    let release: () => void = () => {};
    const slow: LocalCache = { ...cache, readQueries: async (scope) => { await new Promise<void>((r) => (release = r)); return cache.readQueries(scope); } };
    const { client, persistence } = setup(slow);
    const abort = new AbortController();
    const restoring = persistence.restore(ANA, abort.signal);
    abort.abort();
    client.clear();
    release();
    await restoring;
    expect(client.getQueryData(list)).toBeUndefined();
  });

  it("clears everyone it saved for, a person who signed in after the start included", async () => {
    const { client, persistence, cache } = setup();
    await persistence.restore(ANA);
    persistence.subscribe(ANA)();
    const ben = cacheScope("ben");
    const stop = persistence.subscribe(ben);
    await fetchAll(client);
    await settle();
    stop();
    expect(await cache.readQueries(ben)).not.toEqual([]);
    await persistence.clear();
    expect(await cache.readQueries(ben)).toEqual([]);
  });

  it("keeps what a person who signed in after the start saved, across the next start", async () => {
    const cache = memoryLocalCache();
    const ben = cacheScope("ben");
    const first = setup(cache);
    const stop = first.persistence.subscribe(ben);
    await fetchAll(first.client);
    await settle();
    stop();
    const next = setup(cache);
    await next.persistence.restore(ben);
    expect(next.client.getQueryData(list)).toBeDefined();
  });
});
