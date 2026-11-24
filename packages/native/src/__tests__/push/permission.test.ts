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
});
