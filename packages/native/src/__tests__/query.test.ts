// @feat:native-app-shell
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { DAY_MS, connectQueryLifecycle, createNativeQueryClient } from "../query";
import { createQueryPersistence, persistQueries } from "../persist";
import { flush, memoryStorage, settle } from "./fakes";

describe("createNativeQueryClient", () => {
  it("is offlineFirst, and keeps data as long as it is persisted", () => {
    const client = createNativeQueryClient();
    const { queries, mutations } = client.getDefaultOptions();
    expect(queries?.networkMode).toBe("offlineFirst");
    expect(mutations?.networkMode).toBe("offlineFirst");
    expect(queries?.gcTime).toBe(DAY_MS);
  });

  describe("offline", () => {
    afterEach(() => onlineManager.setOnline(true));

    it("tries a query once, pauses its retries, keeps saved data, and continues when back online", async () => {
      const client = createNativeQueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
      client.mount();
      client.setQueryData(["me"], { name: "saved" }, { updatedAt: 0 });
      onlineManager.setOnline(false);
      let calls = 0;
      const queryFn = vi.fn(async () => {
        calls += 1;
        if (!onlineManager.isOnline()) throw new Error("Network request failed");
        return { name: "fresh" };
      });
      // An observer, as useQuery makes: its default retry (3) is what offlineFirst pauses.
      const unsubscribe = new QueryObserver(client, { queryKey: ["me"], queryFn, staleTime: 0 }).subscribe(() => {});
      await vi.waitFor(() => expect(client.getQueryState(["me"])?.fetchStatus).toBe("paused"));
      expect(calls).toBe(1);
      expect(client.getQueryData(["me"])).toEqual({ name: "saved" });
      onlineManager.setOnline(true);
      await vi.waitFor(() => expect(client.getQueryData(["me"])).toEqual({ name: "fresh" }));
      expect(calls).toBe(2);
      unsubscribe();
    });

    it("fails a mutation at once instead of queueing it", async () => {
      const client = createNativeQueryClient();
      onlineManager.setOnline(false);
      const mutationFn = vi.fn(async () => {
        throw new Error("Network request failed");
      });
      const mutation = client.getMutationCache().build(client, { mutationFn });
      await expect(mutation.execute(undefined)).rejects.toThrow("Network request failed");
      expect(mutationFn).toHaveBeenCalledTimes(1);
      expect(mutation.state.isPaused).toBe(false);
    });

    it("refetches a stale query on reconnect (networkMode always turned that off)", async () => {
      const client = createNativeQueryClient({ defaultOptions: { queries: { staleTime: 0 } } });
      client.mount();
      const queryFn = vi.fn(async () => 1);
      const unsubscribe = new QueryObserver(client, { queryKey: ["x"], queryFn }).subscribe(() => {});
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
      unsubscribe();
      client.unmount();
    });
  });

  it("lets the app's config win", () => {
    const client = createNativeQueryClient({ defaultOptions: { queries: { networkMode: "online", retry: 0 } } });
    expect(client.getDefaultOptions().queries).toMatchObject({ networkMode: "online", retry: 0, gcTime: DAY_MS });
  });
});

async function saveFor(storage: ReturnType<typeof memoryStorage>, scope: string, buster = "1.0.0") {
  const client = createNativeQueryClient();
  const unsubscribe = createQueryPersistence({ queryClient: client, storage, keys: ["clients"], buster, throttleMs: 0 }).subscribe(scope);
  client.setQueryData(["clients", "1"], { name: "Ada" });
  client.setQueryData(["secrets"], { token: "x" });
  await settle();
  unsubscribe();
}

describe("createQueryPersistence", () => {
  it("saves only the allowlisted key roots and restores them for the same user", async () => {
    const storage = memoryStorage();
    await saveFor(storage, "user-a");
    const saved = storage.data.get("genesis-query-cache") ?? "";
    expect(saved).toContain("Ada");
    expect(saved).not.toContain("secrets");

    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "1.0.0" }).restore("user-a");
    expect(fresh.getQueryData(["clients", "1"])).toEqual({ name: "Ada" });
  });

  it("never restores one user's cache for another, and deletes it", async () => {
    const storage = memoryStorage();
    await saveFor(storage, "user-a");
    for (const scope of ["user-b", ""]) {
      const fresh = createNativeQueryClient();
      await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "1.0.0" }).restore(scope);
      expect(fresh.getQueryData(["clients", "1"])).toBeUndefined();
    }
    expect(storage.data.has("genesis-query-cache")).toBe(false);
  });

  it("discards a cache from another app version", async () => {
    const storage = memoryStorage();
    await saveFor(storage, "u", "1.0.0");
    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "2.0.0" }).restore("u");
    expect(fresh.getQueryData(["clients", "1"])).toBeUndefined();
  });

  it("discards a cache older than maxAge", async () => {
    const storage = memoryStorage();
    await saveFor(storage, "u");
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * DAY_MS);
    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "1.0.0" }).restore("u");
    now.mockRestore();
    expect(fresh.getQueryData(["clients", "1"])).toBeUndefined();
  });

  it("starts empty, without failing, from an unreadable cache", async () => {
    const storage = memoryStorage();
    storage.data.set("genesis-query-cache", "{not json");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(persistQueries({ storage, keys: ["clients"], buster: "1" })(createNativeQueryClient()).restore("u")).resolves.toBeUndefined();
    expect(storage.data.has("genesis-query-cache")).toBe(false);
    vi.restoreAllMocks();
  });

  it("clear removes the saved cache", async () => {
    const storage = memoryStorage();
    storage.data.set("genesis-query-cache", "{}");
    await createQueryPersistence({ queryClient: createNativeQueryClient(), storage, keys: [], buster: "1" }).clear();
    await flush();
    expect(storage.data.has("genesis-query-cache")).toBe(false);
  });
});

describe("connectQueryLifecycle", () => {
  it("follows AppState for focus and NetInfo for the network", () => {
    let appListener: ((state: string) => void) | undefined;
    let netListener: ((state: { isConnected: boolean | null }) => void) | undefined;
    const removeApp = vi.fn();
    const removeNet = vi.fn();
    const cleanup = connectQueryLifecycle({
      appState: { addEventListener: (_type, l) => ((appListener = l), { remove: removeApp }) },
      netInfo: { addEventListener: (l) => ((netListener = l), removeNet) },
    });
    appListener?.("background");
    expect(focusManager.isFocused()).toBe(false);
    appListener?.("active");
    expect(focusManager.isFocused()).toBe(true);
    netListener?.({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);
    netListener?.({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
    cleanup();
    expect(removeApp).toHaveBeenCalled();
    expect(removeNet).toHaveBeenCalled();
  });

  it("leaves the app online when it stops following NetInfo, so paused queries don't wait forever", () => {
    let netListener: ((state: { isConnected: boolean | null }) => void) | undefined;
    const cleanup = connectQueryLifecycle({ netInfo: { addEventListener: (l) => ((netListener = l), () => {}) } });
    netListener?.({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);
    cleanup();
    expect(onlineManager.isOnline()).toBe(true);
  });
});
