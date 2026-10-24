// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { DAY_MS, connectQueryLifecycle, createNativeQueryClient, createQueryPersistence } from "../query";
import { flush, memoryStorage } from "./fakes";

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("createNativeQueryClient", () => {
  it("runs offline instead of waiting, and keeps data as long as it is persisted", () => {
    const client = createNativeQueryClient();
    const { queries, mutations } = client.getDefaultOptions();
    expect(queries?.networkMode).toBe("always");
    expect(mutations?.networkMode).toBe("always");
    expect(queries?.gcTime).toBe(DAY_MS);
  });

  it("lets the app's config win", () => {
    const client = createNativeQueryClient({ defaultOptions: { queries: { networkMode: "online", retry: 0 } } });
    expect(client.getDefaultOptions().queries).toMatchObject({ networkMode: "online", retry: 0, gcTime: DAY_MS });
  });
});

describe("createQueryPersistence", () => {
  it("saves only the allowlisted key roots and restores them", async () => {
    const storage = memoryStorage();
    const client = createNativeQueryClient();
    const persistence = createQueryPersistence({ queryClient: client, storage, keys: ["clients"], buster: "1.0.0", throttleMs: 0 });
    const unsubscribe = persistence.subscribe();
    client.setQueryData(["clients", "1"], { name: "Ada" });
    client.setQueryData(["secrets"], { token: "x" });
    await settle();
    unsubscribe();
    const saved = storage.data.get("genesis-query-cache") ?? "";
    expect(saved).toContain("Ada");
    expect(saved).not.toContain("secrets");

    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "1.0.0" }).restore();
    expect(fresh.getQueryData(["clients", "1"])).toEqual({ name: "Ada" });
  });

  it("discards a cache from another app version", async () => {
    const storage = memoryStorage();
    const client = createNativeQueryClient();
    const unsubscribe = createQueryPersistence({ queryClient: client, storage, keys: ["clients"], buster: "1.0.0", throttleMs: 0 }).subscribe();
    client.setQueryData(["clients"], ["Ada"]);
    await settle();
    unsubscribe();

    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "2.0.0" }).restore();
    expect(fresh.getQueryData(["clients"])).toBeUndefined();
  });

  it("discards a cache older than maxAge", async () => {
    const storage = memoryStorage();
    const client = createNativeQueryClient();
    const unsubscribe = createQueryPersistence({ queryClient: client, storage, keys: ["clients"], buster: "1", throttleMs: 0 }).subscribe();
    client.setQueryData(["clients"], ["Ada"]);
    await settle();
    unsubscribe();

    const later = Date.now() + 2 * DAY_MS;
    const now = vi.spyOn(Date, "now").mockReturnValue(later);
    const fresh = createNativeQueryClient();
    await createQueryPersistence({ queryClient: fresh, storage, keys: ["clients"], buster: "1" }).restore();
    now.mockRestore();
    expect(fresh.getQueryData(["clients"])).toBeUndefined();
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
});
