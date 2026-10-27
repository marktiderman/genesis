// @feat:app-updates
import { afterEach, describe, expect, it, vi } from "vitest";
import { onBeforeReload, runBeforeReload } from "../reload";

const off: (() => void)[] = [];
afterEach(() => {
  off.splice(0).forEach((f) => f());
  vi.useRealTimers();
});

describe("runBeforeReload", () => {
  it("runs every hook with the deadline, and nothing once unregistered", async () => {
    const a = vi.fn();
    const b = vi.fn(async () => {});
    const offA = onBeforeReload(a);
    off.push(onBeforeReload(b));
    await runBeforeReload(300);
    expect(a).toHaveBeenCalledWith(300);
    expect(b).toHaveBeenCalledWith(300);
    offA();
    await runBeforeReload();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("never rejects when a hook throws or rejects", async () => {
    off.push(onBeforeReload(() => { throw new Error("sync"); }));
    off.push(onBeforeReload(() => Promise.reject(new Error("async"))));
    await expect(runBeforeReload(50)).resolves.toBeUndefined();
  });

  it("stops waiting at the deadline", async () => {
    vi.useFakeTimers();
    off.push(onBeforeReload(() => new Promise(() => {})));
    let done = false;
    void runBeforeReload(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
