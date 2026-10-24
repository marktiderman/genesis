// @feat:app-updates
import { describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CLOCK_SKEW_MS,
  WEEK_MS,
  createPolicyStore,
  evaluatePolicy,
  sanitizePolicy,
  staticPolicySource,
  supabasePolicySource,
  type PolicyClientLike,
  type PolicyState,
  type UpdatePolicy,
  type UpdatePolicySource,
} from "../../updates/policy";
import { brokenStorage, flush, memoryStorage, never } from "./fakes";

const NOW = 1_800_000_000_000;
const old: UpdatePolicy = { minimumVersion: { ios: "2.0.0", android: "2.0.0" }, storeUrl: { ios: "https://apps.apple.com/app/id1" } };
const verdict = (state: PolicyState, now = NOW, installedVersion = "1.0.0") => evaluatePolicy(state, { platform: "ios", installedVersion, now });
const failing: UpdatePolicySource = { load: () => Promise.reject(new Error("Network request failed")) };
const cacheEntry = (policy: UpdatePolicy, savedAt: number) => JSON.stringify({ v: 1, savedAt, policy });

describe("the policy store", () => {
  it("fails open offline with nothing cached", async () => {
    const onError = vi.fn();
    const store = createPolicyStore({ source: failing, storage: memoryStorage(), now: () => NOW, onError });
    await store.load();
    expect(store.getState()).toMatchObject({ status: "ready", origin: "none", policy: null });
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "policy");
  });

  it("stops waiting at the timeout when the network hangs, and fails open", async () => {
    const store = createPolicyStore({ source: { load: never }, timeoutMs: 20, now: () => NOW });
    const started = Date.now();
    await store.load();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(store.getState().status).toBe("ready");
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
  });

  it("applies a network answer that arrives after the timeout", async () => {
    let answer!: (policy: UpdatePolicy) => void;
    const store = createPolicyStore({ source: { load: () => new Promise((resolve) => (answer = resolve)) }, timeoutMs: 5, now: () => NOW });
    await store.load();
    expect(verdict(store.getState()).kind).toBe("ok");
    answer(old);
    await flush();
    expect(verdict(store.getState()).kind).toBe("forceUpgrade");
  });

  it("caches a network answer and uses it offline for a week", async () => {
    const storage = memoryStorage();
    await createPolicyStore({ source: staticPolicySource(old), storage, now: () => NOW }).load();
    await flush();
    expect(JSON.parse(storage.data.get("genesis:updates:policy")!)).toMatchObject({ v: 1, savedAt: NOW, policy: old });

    const offline = createPolicyStore({ source: failing, storage, now: () => NOW + WEEK_MS - 1 });
    await offline.load();
    expect(offline.getState().origin).toBe("cache");
    expect(verdict(offline.getState(), NOW + WEEK_MS - 1).kind).toBe("forceUpgrade");
  });

  it("does not trust a cache older than cacheMaxAgeMs, or one from the future", async () => {
    const stale = createPolicyStore({ source: failing, storage: memoryStorage({ "genesis:updates:policy": cacheEntry(old, NOW - WEEK_MS - 1) }) });
    await stale.load();
    expect(stale.getState().origin).toBe("cache");
    expect(verdict(stale.getState())).toEqual({ kind: "ok" });

    // The clock moved back since the cache was written: its time is ahead of now.
    const ahead = createPolicyStore({ source: failing, storage: memoryStorage({ "genesis:updates:policy": cacheEntry(old, NOW + CLOCK_SKEW_MS + 1) }) });
    await ahead.load();
    expect(verdict(ahead.getState())).toEqual({ kind: "ok" });

    // A little drift is fine.
    const drift = createPolicyStore({ source: failing, storage: memoryStorage({ "genesis:updates:policy": cacheEntry(old, NOW + 1000) }) });
    await drift.load();
    expect(verdict(drift.getState()).kind).toBe("forceUpgrade");
  });

  it("never blocks a cold start on a cached maintenance flag", async () => {
    const storage = memoryStorage({ "genesis:updates:policy": cacheEntry({ maintenance: { active: true, message: "Back soon" } }, NOW) });
    const store = createPolicyStore({ source: failing, storage, now: () => NOW });
    await store.load();
    expect(store.getState().origin).toBe("cache");
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
  });

  it("blocks on maintenance fetched live, and keeps it when a retry can't reach the server", async () => {
    let online = true;
    const source: UpdatePolicySource = {
      load: async () => {
        if (!online) throw new Error("offline");
        return { maintenance: { active: true, message: "Back at 10" } };
      },
    };
    const store = createPolicyStore({ source, now: () => NOW });
    await store.load();
    expect(verdict(store.getState())).toEqual({ kind: "maintenance", message: "Back at 10" });
    online = false;
    expect(await store.refresh()).toBe(false);
    expect(verdict(store.getState())).toEqual({ kind: "maintenance", message: "Back at 10" });
    expect(store.getState().error?.message).toBe("offline");
  });

  it("prefers the network over a cache read that finishes later", async () => {
    let release!: (value: string) => void;
    const storage = { getItem: () => new Promise<string>((resolve) => (release = resolve)), setItem: async () => {} };
    const store = createPolicyStore({ source: staticPolicySource({}), storage, now: () => NOW });
    await store.load();
    release(cacheEntry(old, NOW));
    await flush();
    expect(store.getState().origin).toBe("network");
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
  });

  it("ignores a cache it can't read or parse", async () => {
    for (const storage of [brokenStorage(), memoryStorage({ "genesis:updates:policy": "{not json" }), memoryStorage({ "genesis:updates:policy": '{"v":2}' })]) {
      const store = createPolicyStore({ source: failing, storage, now: () => NOW });
      await store.load();
      expect(store.getState().origin).toBe("none");
      expect(verdict(store.getState())).toEqual({ kind: "ok" });
    }
  });

  it("keeps retrying a source that throws synchronously (no stale in-flight answer)", async () => {
    let calls = 0;
    let online = true;
    const source: UpdatePolicySource = {
      load: () => {
        calls++;
        if (!online) throw new Error("offline, thrown before any await");
        return Promise.resolve({ maintenance: { active: true, message: null } });
      },
    };
    const store = createPolicyStore({ source, now: () => NOW });
    await store.load();
    online = false;
    expect(await store.refresh()).toBe(false);
    online = true;
    source.load = async () => {
      calls++;
      return {};
    };
    expect(await store.refresh()).toBe(true);
    expect(calls).toBe(3);
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
  });

  it("treats a NaN or infinite timeout as the default rather than waiting forever", async () => {
    vi.useFakeTimers();
    try {
      for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        const store = createPolicyStore({ source: { load: never }, timeoutMs, now: () => NOW });
        const loading = store.load();
        await vi.advanceTimersByTimeAsync(3000);
        await loading;
        expect(store.getState().status).toBe("ready");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports success even when storage.setItem returns nothing or throws synchronously", async () => {
    const storage = {
      getItem: async () => null,
      setItem: (() => {
        throw new Error("sync write failure");
      }) as unknown as (key: string, value: string) => Promise<void>,
    };
    const onError = vi.fn();
    const store = createPolicyStore({ source: staticPolicySource(old), storage, now: () => NOW, onError });
    expect(await store.refresh()).toBe(true);
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "storage");
    expect(onError).not.toHaveBeenCalledWith(expect.anything(), "policy");
  });

  it("runs the first load once, and refreshes at most once per interval", async () => {
    const load = vi.fn(async () => ({}));
    let now = NOW;
    const store = createPolicyStore({ source: { load }, now: () => now });
    await Promise.all([store.load(), store.load()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await store.refreshIfDue(60_000)).toBe(false);
    now += 60_000;
    expect(await store.refreshIfDue(60_000)).toBe(true);
    now -= 3_600_000; // the clock moved back: refresh rather than wait an hour
    expect(await store.refreshIfDue(60_000)).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe("evaluatePolicy", () => {
  const live = (policy: UpdatePolicy): PolicyState => ({ status: "ready", policy, origin: "network", fetchedAt: NOW, error: null, refreshing: false });

  it("forces an upgrade below the platform's minimum, with its store link", () => {
    expect(verdict(live(old))).toEqual({ kind: "forceUpgrade", minimumVersion: "2.0.0", installedVersion: "1.0.0", storeUrl: "https://apps.apple.com/app/id1" });
  });

  it("forces nothing without a store link for the platform: there would be no way out", () => {
    expect(evaluatePolicy(live(old), { platform: "android", installedVersion: "1.0.0", now: NOW })).toEqual({ kind: "ok" });
  });

  it("fails open on a malformed minimum, an unknown installed version, or another platform", () => {
    expect(verdict(live({ minimumVersion: { ios: "two" } }))).toEqual({ kind: "ok" });
    expect(evaluatePolicy(live(old), { platform: "ios", installedVersion: null, now: NOW })).toEqual({ kind: "ok" });
    expect(evaluatePolicy(live(old), { platform: "web", installedVersion: "1.0.0", now: NOW })).toEqual({ kind: "ok" });
    expect(verdict(live(old), NOW, "2.0")).toEqual({ kind: "ok" });
  });

  it("puts force upgrade before maintenance", () => {
    expect(verdict(live({ ...old, maintenance: { active: true, message: null } })).kind).toBe("forceUpgrade");
    expect(verdict(live({ maintenance: { active: true, message: null } }))).toEqual({ kind: "maintenance", message: null });
    expect(verdict(live({ maintenance: { active: false, message: "x" } }))).toEqual({ kind: "ok" });
  });
});

describe("sanitizePolicy", () => {
  it("keeps only well-formed fields", () => {
    expect(
      sanitizePolicy({
        minimumVersion: { ios: 2, android: " 1.2 " },
        storeUrl: { ios: "javascript:alert(1)", android: "market://details?id=app" },
        maintenance: { active: "yes", message: "" },
        notes: [{ version: "1.2", body: "New" }, { version: 1, body: "x" }, null, { version: "1.3" }],
      }),
    ).toEqual({
      minimumVersion: { android: "1.2" },
      storeUrl: { android: "market://details?id=app" },
      maintenance: { active: false, message: null },
      notes: [{ version: "1.2", body: "New" }],
    });
    expect(sanitizePolicy(null)).toEqual({});
    expect(() => sanitizePolicy("nope")).toThrow();
  });
});

describe("supabasePolicySource", () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const calls: unknown[][] = [];
    const client: PolicyClientLike = {
      from: (table: string) => {
        calls.push(["from", table]);
        return {
          select: (columns: string) => {
            calls.push(["select", columns]);
            return {
              eq: (column: string, value: string) => {
                calls.push(["eq", column, value]);
                return { maybeSingle: async () => result };
              },
            };
          },
        };
      },
    };
    return { client, calls };
  }

  it("reads the app's row and maps it", async () => {
    const { client, calls } = fakeClient({
      data: {
        min_version_ios: "2.0",
        min_version_android: null,
        store_url_ios: "https://apps.apple.com/app/id1",
        store_url_android: null,
        maintenance: true,
        maintenance_message: "Back soon",
        notes: [{ version: "2.0", body: "Hello" }],
      },
      error: null,
    });
    const policy = await supabasePolicySource(client, { appId: "my-app" }).load();
    expect(calls).toContainEqual(["from", "app_release_policy"]);
    expect(calls).toContainEqual(["eq", "app_id", "my-app"]);
    expect(policy).toEqual({
      minimumVersion: { ios: "2.0" },
      storeUrl: { ios: "https://apps.apple.com/app/id1" },
      maintenance: { active: true, message: "Back soon" },
      notes: [{ version: "2.0", body: "Hello" }],
    });
  });

  it("reads no row as no policy, and throws on an error so the cache answers", async () => {
    expect(await supabasePolicySource(fakeClient({ data: null, error: null }).client).load()).toEqual({});
    await expect(supabasePolicySource(fakeClient({ data: null, error: { message: "JWT expired", code: "PGRST301" } }).client).load()).rejects.toThrow(
      "JWT expired",
    );
  });

  it("takes a real SupabaseClient without a cast, and fails open when the server can't be reached", async () => {
    const fits = (client: SupabaseClient): PolicyClientLike => client;
    const offline = () => Promise.reject(new TypeError("Network request failed"));
    const client = createClient("http://127.0.0.1:9", "publishable-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: offline } });
    const store = createPolicyStore({ source: supabasePolicySource(fits(client)), timeoutMs: 2000, now: () => NOW });
    await store.load();
    expect(verdict(store.getState())).toEqual({ kind: "ok" });
  });
});

