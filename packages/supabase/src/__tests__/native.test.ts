import { describe, expect, it, vi } from "vitest";
import { keychainStorage, refreshWhileActive, wipeSessionOnReinstall, type SecureStoreLike } from "../native";
import type { SessionStorage } from "../index";

function fakeSecureStore(failAfter = Infinity) {
  const items = new Map<string, string>();
  let writes = 0;
  const store: SecureStoreLike = {
    async getItemAsync(key) {
      return items.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (++writes > failAfter) throw new Error("keychain write failed");
      items.set(key, value);
    },
    async deleteItemAsync(key) {
      items.delete(key);
    },
  };
  return { store, items, setFailAfter: (n: number) => ((failAfter = writes + n)) };
}

const memory = (): SessionStorage => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
};

describe("keychainStorage", () => {
  it("round-trips a value bigger than one Keychain item, in chunks", async () => {
    const { store, items } = fakeSecureStore();
    const s = keychainStorage(store, { chunkSize: 10 });
    const value = "x".repeat(35);
    await s.setItem("sb", value);
    expect(await s.getItem("sb")).toBe(value);
    expect([...items.keys()].filter((k) => k !== "sb.n")).toHaveLength(4);
  });

  it("drops the old generation after a new write, and everything on remove", async () => {
    const { store, items } = fakeSecureStore();
    const s = keychainStorage(store, { chunkSize: 10 });
    await s.setItem("sb", "a".repeat(25));
    await s.setItem("sb", "b".repeat(5));
    expect(await s.getItem("sb")).toBe("bbbbb");
    expect(items.size).toBe(2);
    await s.removeItem("sb");
    expect(items.size).toBe(0);
    expect(await s.getItem("sb")).toBeNull();
  });

  it("keeps the previous session whole when a write is cut short", async () => {
    const fake = fakeSecureStore();
    const s = keychainStorage(fake.store, { chunkSize: 10 });
    await s.setItem("sb", "old-session-value");
    fake.setFailAfter(1);
    await expect(s.setItem("sb", "new-session-value-that-needs-chunks")).rejects.toThrow();
    expect(await s.getItem("sb")).toBe("old-session-value");
  });

  it("runs writes to one key one at a time, so the last write wins", async () => {
    const { store } = fakeSecureStore();
    const s = keychainStorage(store, { chunkSize: 4 });
    await Promise.all([s.setItem("sb", "first-value"), s.setItem("sb", "second-value")]);
    expect(await s.getItem("sb")).toBe("second-value");
  });
});

describe("refreshWhileActive", () => {
  it("starts in front, stops in the background, and unsubscribes", () => {
    let listener: (state: string) => void = () => {};
    const remove = vi.fn();
    const auth = { startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() };
    const stop = refreshWhileActive({ auth }, { currentState: "active", addEventListener: (_t, l) => ((listener = l), { remove }) });
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    listener("background");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    stop();
    expect(remove).toHaveBeenCalled();
  });
});

describe("wipeSessionOnReinstall", () => {
  it("removes a leftover session once, on the first launch after install", async () => {
    const session = memory();
    const installMarker = memory();
    await session.setItem("sb-x-auth-token", "left over");
    expect(await wipeSessionOnReinstall({ session, sessionKey: "sb-x-auth-token", installMarker })).toBe(true);
    expect(await session.getItem("sb-x-auth-token")).toBeNull();
    await session.setItem("sb-x-auth-token", "signed in again");
    expect(await wipeSessionOnReinstall({ session, sessionKey: "sb-x-auth-token", installMarker })).toBe(false);
    expect(await session.getItem("sb-x-auth-token")).toBe("signed in again");
  });
});

describe("keychainStorage review fixes", () => {
  it("never splits a character, and keeps chunks under the byte budget", async () => {
    const { store, items } = fakeSecureStore();
    const s = keychainStorage(store, { chunkSize: 8 });
    const value = "ab😀cd😀éé😀"; // 4-byte emoji and 2-byte é at chunk boundaries
    await s.setItem("sb", value);
    expect(await s.getItem("sb")).toBe(value);
    for (const [k, v] of items) if (k !== "sb.n") expect(new TextEncoder().encode(v).length).toBeLessThanOrEqual(8);
  });

  it("sweeps chunks left by a write that was cut short", async () => {
    const fake = fakeSecureStore();
    const s = keychainStorage(fake.store, { chunkSize: 4 });
    await s.setItem("sb", "old");
    fake.setFailAfter(3); // the pending marker and two chunks, then fail
    await expect(s.setItem("sb", "a-much-longer-new-value")).rejects.toThrow();
    fake.setFailAfter(1000);
    await s.setItem("sb", "new");
    expect(await s.getItem("sb")).toBe("new");
    expect([...fake.items.keys()].sort()).toEqual(["sb.n", [...fake.items.keys()].find((k) => k !== "sb.n")!].sort());
  });

  it("wipes the PKCE verifier and user with the session", async () => {
    const session = memory();
    for (const k of ["sb", "sb-code-verifier", "sb-user"]) await session.setItem(k, "x");
    await wipeSessionOnReinstall({ session, sessionKey: "sb", installMarker: memory() });
    for (const k of ["sb", "sb-code-verifier", "sb-user"]) expect(await session.getItem(k)).toBeNull();
  });
});
