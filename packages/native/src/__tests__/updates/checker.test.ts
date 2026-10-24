// @feat:app-updates
import { describe, expect, it, vi } from "vitest";
import { createReloadGuard, createUpdateChecker } from "../../updates/checker";
import { fakeUpdates } from "./fakes";

describe("the update checker", () => {
  it("downloads a newer update and never reloads on its own", async () => {
    const updates = fakeUpdates({ next: { id: "next-1111" } });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(checker.getState()).toMatchObject({ status: "ready", updateId: "next-1111" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    expect(await checker.reload()).toBe(true);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("never reloads while a form holds the guard, and lets the tap through once it lets go", async () => {
    const updates = fakeUpdates({ next: { id: "next-1111" } });
    const guard = createReloadGuard();
    const checker = createUpdateChecker({ updates, guard });
    await checker.check();
    const release = guard.block();
    expect(await checker.reload()).toBe(false);
    expect(checker.getState()).toMatchObject({ status: "ready", blocked: true });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    release();
    release(); // releasing twice doesn't free a second blocker
    expect(checker.getState().blocked).toBe(false);
    expect(await checker.reload()).toBe(true);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("holds while any of several blockers is active", () => {
    const guard = createReloadGuard();
    const a = guard.block();
    const b = guard.block();
    a();
    expect(guard.canReload()).toBe(false);
    b();
    expect(guard.canReload()).toBe(true);
  });

  it("treats an app canReload that says no, or throws, as no", async () => {
    const updates = fakeUpdates({ next: { id: "next-1111" } });
    for (const canReload of [() => false, () => { throw new Error("store not ready"); }]) {
      const checker = createUpdateChecker({ updates, guard: createReloadGuard(canReload) });
      await checker.check();
      expect(await checker.reload()).toBe(false);
    }
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("ignores an update built for another runtime version", async () => {
    const updates = fakeUpdates({ next: { id: "next-1111", runtimeVersion: "2.0.0" }, runtimeVersion: "1.0.0" });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(checker.getState().status).toBe("idle");
    expect(await checker.reload()).toBe(false);
  });

  it("ignores the update that is already running", async () => {
    const updates = fakeUpdates({ next: { id: "same" }, updateId: "same" });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(checker.getState().status).toBe("idle");
  });

  it("does nothing when updates are off (development, Expo Go)", async () => {
    const updates = fakeUpdates({ isEnabled: false, next: { id: "x" } });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(checker.getState().status).toBe("disabled");
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(createUpdateChecker({ guard: createReloadGuard() }).getState().status).toBe("disabled");
  });

  it("reports a failed check without throwing", async () => {
    const onError = vi.fn();
    const updates = fakeUpdates({ checkError: new Error("offline") });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard(), onError });
    await expect(checker.check()).resolves.toBeUndefined();
    expect(checker.getState()).toMatchObject({ status: "error" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }), "check");
  });

  it("checks again after a module that throws synchronously", async () => {
    const updates = fakeUpdates({ next: { id: "next-1" } });
    updates.checkForUpdateAsync.mockImplementationOnce(() => {
      throw new Error("native module missing");
    });
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(checker.getState().status).toBe("error");
    await checker.check();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    expect(checker.getState().status).toBe("ready");
  });

  it("keeps the update ready when the reload is refused", async () => {
    const updates = fakeUpdates({ next: { id: "next-1111" } });
    updates.reloadAsync.mockRejectedValueOnce(new Error("cannot reload in development"));
    const checker = createUpdateChecker({ updates, guard: createReloadGuard() });
    await checker.check();
    expect(await checker.reload()).toBe(false);
    expect(checker.getState().status).toBe("ready");
  });

  it("checks once at a time and at most once per interval", async () => {
    const updates = fakeUpdates();
    let now = 0;
    const checker = createUpdateChecker({ updates, guard: createReloadGuard(), now: () => now });
    await Promise.all([checker.check(), checker.check()]);
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    await checker.checkIfDue(1000);
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    now = 1000;
    await checker.checkIfDue(1000);
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  it("hides on dismiss", async () => {
    const checker = createUpdateChecker({ updates: fakeUpdates({ next: { id: "n" } }), guard: createReloadGuard() });
    await checker.check();
    checker.dismiss();
    expect(checker.getState()).toMatchObject({ status: "ready", dismissed: true });
  });
});
