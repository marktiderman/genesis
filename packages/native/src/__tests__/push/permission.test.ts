import { describe, expect, it, vi } from "vitest";
import { createPermissionStore } from "../../push/permission";
import { permission } from "./fakes";
import type { NotificationsModuleLike, PermissionStatusLike } from "../../push/modules";

function deferredNotifications() {
  const waiting: ((s: PermissionStatusLike) => void)[] = [];
  const getPermissionsAsync = vi.fn(() => new Promise<PermissionStatusLike>((resolve) => waiting.push(resolve)));
  return { module: { getPermissionsAsync } as unknown as NotificationsModuleLike, getPermissionsAsync, answer: (s: PermissionStatusLike) => waiting.splice(0).forEach((r) => r(s)) };
}

describe("the permission store: refresh", () => {
  it("shares one read between refreshes that overlap", async () => {
    const n = deferredNotifications();
    const store = createPermissionStore({ notifications: n.module });
    const first = store.refresh();
    const second = store.refresh();
    expect(n.getPermissionsAsync).toHaveBeenCalledTimes(1);
    n.answer(permission.granted);
    await expect(first).resolves.toBe("granted");
    await expect(second).resolves.toBe("granted");
    expect(store.getState().status).toBe("granted");
  });

  it("reads again once the earlier read has settled", async () => {
    const n = deferredNotifications();
    const store = createPermissionStore({ notifications: n.module });
    const first = store.refresh();
    n.answer(permission.denied);
    await first;
    const again = store.refresh();
    expect(n.getPermissionsAsync).toHaveBeenCalledTimes(2);
    n.answer(permission.granted);
    await expect(again).resolves.toBe("granted");
  });

  it("starts a new read after a failed one", async () => {
    const onError = vi.fn();
    const getPermissionsAsync = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce(permission.granted);
    const store = createPermissionStore({ notifications: { getPermissionsAsync } as unknown as NotificationsModuleLike, onError });
    await expect(store.refresh()).resolves.toBe("unknown");
    await expect(store.refresh()).resolves.toBe("granted");
    expect(getPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it("settles a read that throws at once, and reads again next time", async () => {
    const onError = vi.fn();
    const getPermissionsAsync = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("not ready");
      })
      .mockResolvedValueOnce(permission.granted);
    const store = createPermissionStore({ notifications: { getPermissionsAsync } as unknown as NotificationsModuleLike, onError });
    await expect(store.refresh()).resolves.toBe("unknown");
    await expect(store.refresh()).resolves.toBe("granted");
    expect(getPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("starts a new read when asked for a fresh one, and only the newest read writes the state", async () => {
    const n = deferredNotifications();
    const store = createPermissionStore({ notifications: n.module });
    const old = store.refresh();
    const fresh = store.refresh({ fresh: true });
    expect(n.getPermissionsAsync).toHaveBeenCalledTimes(2);
    // A plain refresh now joins the fresh read.
    expect(store.refresh()).toBe(fresh);
    n.answer(permission.granted);
    await expect(fresh).resolves.toBe("granted");
    await old;
    expect(store.getState().status).toBe("granted");
  });

  it("lets the system prompt's answer win over a read still pending", async () => {
    const n = deferredNotifications();
    const requestPermissionsAsync = vi.fn(async () => permission.granted);
    const store = createPermissionStore({ notifications: { ...n.module, requestPermissionsAsync } as unknown as NotificationsModuleLike });
    const pending = store.refresh();
    await expect(store.request()).resolves.toBe("granted");
    // A refresh after the prompt (an account switch, say) reads again instead of joining the
    // read that began before it.
    const after = store.refresh();
    expect(after).not.toBe(pending);
    expect(n.getPermissionsAsync).toHaveBeenCalledTimes(2);
    n.answer(permission.granted);
    await expect(after).resolves.toBe("granted");
    await pending;
    expect(store.getState().status).toBe("granted");
  });
});
