// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { createHydrationGate } from "../hydration-gate";
import { flush, memoryStorage } from "./fakes";

describe("createHydrationGate", () => {
  it("keeps a write made before hydration off the disk", async () => {
    const disk = memoryStorage();
    disk.data.set("prefs", '{"theme":"dark"}');
    const onDroppedWrite = vi.fn();
    const gate = createHydrationGate({ onDroppedWrite });
    const storage = gate.storage(disk);

    // The store's default state is written before it has read the disk.
    await storage.setItem("prefs", '{"theme":"system"}');
    expect(disk.data.get("prefs")).toBe('{"theme":"dark"}');
    expect(onDroppedWrite).toHaveBeenCalledWith("prefs");
    expect(await storage.getItem("prefs")).toBe('{"theme":"dark"}');

    gate.markHydrated();
    await storage.setItem("prefs", '{"theme":"light"}');
    expect(disk.data.get("prefs")).toBe('{"theme":"light"}');
    await storage.removeItem("prefs");
    expect(disk.data.has("prefs")).toBe(false);
  });

  it("run waits for hydration, then runs", async () => {
    const gate = createHydrationGate();
    const write = vi.fn(() => "done");
    const result = gate.run(write);
    await flush();
    expect(write).not.toHaveBeenCalled();
    expect(gate.hydrated).toBe(false);
    gate.markHydrated();
    gate.markHydrated();
    await expect(result).resolves.toBe("done");
    expect(write).toHaveBeenCalledTimes(1);
    await expect(gate.run(() => 2)).resolves.toBe(2);
    await expect(gate.whenHydrated()).resolves.toBeUndefined();
  });
});

describe("createHydrationGate storage", () => {
  it("keeps a storage class's prototype methods and private state", async () => {
    class Store {
      #data = new Map<string, string>();
      async getItem(key: string) {
        return this.#data.get(key) ?? null;
      }
      async setItem(key: string, value: string) {
        this.#data.set(key, value);
      }
      async removeItem(key: string) {
        this.#data.delete(key);
      }
      size() {
        return this.#data.size;
      }
    }
    const gate = createHydrationGate();
    const storage = gate.storage(new Store());
    gate.markHydrated();
    await storage.setItem("a", "1");
    expect(await storage.getItem("a")).toBe("1");
    expect(storage.size()).toBe(1);
  });
});
