import { vi } from "vitest";
import { DEFAULT_PREFERENCES, type NotificationPreferences, type PushBackend } from "../../push/backend";
import type { NotificationBehaviorLike, NotificationLike, NotificationResponseLike, NotificationsModuleLike, PermissionStatusLike } from "../../push/modules";

export const DEFAULT_ACTION = "expo.modules.notifications.actions.DEFAULT";

export const permission = {
  undetermined: { status: "undetermined", granted: false, canAskAgain: true, ios: { status: 0 } } as PermissionStatusLike,
  granted: { status: "granted", granted: true, canAskAgain: true, ios: { status: 2 } } as PermissionStatusLike,
  provisional: { status: "granted", granted: true, canAskAgain: true, ios: { status: 3 } } as PermissionStatusLike,
  denied: { status: "denied", granted: false, canAskAgain: false, ios: { status: 1 } } as PermissionStatusLike,
};

export function tap(url: unknown, identifier = "n1", actionIdentifier = DEFAULT_ACTION): NotificationResponseLike {
  return { actionIdentifier, notification: { request: { identifier, content: { data: url === undefined ? {} : { url } } } } };
}

/** expo-notifications, faked: `emitResponse`, `emitToken` and `present` play events; `grantOnRequest` sets the answer. */
export function fakeNotifications(options: { status?: PermissionStatusLike; token?: string; last?: NotificationResponseLike | null; answer?: PermissionStatusLike; echoDeviceToken?: boolean } = {}) {
  let status = options.status ?? permission.granted;
  let last = options.last ?? null;
  const responseListeners = new Set<(r: NotificationResponseLike) => void>();
  const tokenListeners = new Set<(t: unknown) => void>();
  let handler: { handleNotification: (n: NotificationLike) => Promise<NotificationBehaviorLike> } | null = null;
  const order: string[] = [];
  let token = options.token ?? "ExponentPushToken[device-1]";
  let deviceToken = "raw-1";
  const module = {
    DEFAULT_ACTION_IDENTIFIER: DEFAULT_ACTION,
    getPermissionsAsync: vi.fn(async () => status),
    requestPermissionsAsync: vi.fn(async () => {
      order.push("request");
      status = options.answer ?? permission.granted;
      return status;
    }),
    getExpoPushTokenAsync: vi.fn(async (_: { projectId: string }) => {
      order.push("token");
      // As expo-notifications does: fetching the Expo token fetches the device token, which
      // tells every push token listener, even when it hasn't changed.
      if (options.echoDeviceToken) tokenListeners.forEach((l) => l({ type: "ios", data: deviceToken }));
      return { data: token };
    }),
    addPushTokenListener: vi.fn((listener: (t: unknown) => void) => {
      tokenListeners.add(listener);
      return { remove: () => tokenListeners.delete(listener) };
    }),
    setNotificationChannelAsync: vi.fn(async (id: string) => {
      order.push(`channel:${id}`);
      return null;
    }),
    setNotificationHandler: vi.fn((next: typeof handler) => {
      handler = next;
    }),
    addNotificationResponseReceivedListener: vi.fn((listener: (r: NotificationResponseLike) => void) => {
      responseListeners.add(listener);
      return { remove: () => responseListeners.delete(listener) };
    }),
    getLastNotificationResponse: vi.fn(() => last),
    clearLastNotificationResponse: vi.fn(() => {
      last = null;
    }),
    setBadgeCountAsync: vi.fn(async () => true),
    getBadgeCountAsync: vi.fn(async () => 0),
  } satisfies NotificationsModuleLike;
  return {
    module,
    order,
    setStatus: (next: PermissionStatusLike) => void (status = next),
    setToken: (next: string) => void (token = next),
    setDeviceToken: (next: string) => void (deviceToken = next),
    emitResponse: (r: NotificationResponseLike) => responseListeners.forEach((l) => l(r)),
    emitToken: () => tokenListeners.forEach((l) => l({ type: "ios", data: deviceToken })),
    present: (data: Record<string, unknown>) => handler?.handleNotification({ request: { identifier: "f", content: { data } } }),
    handler: () => handler,
  };
}

export function fakeBackend(saved: NotificationPreferences | null = null) {
  const calls: string[] = [];
  let stored = saved;
  const backend = {
    register: vi.fn(async (token: string, platform: string, version: string | null) => void calls.push(`register ${token} ${platform} ${version}`)),
    forget: vi.fn(async (token: string) => void calls.push(`forget ${token}`)),
    loadPreferences: vi.fn(async (_userId: string) => stored),
    savePreferences: vi.fn(async (_userId: string, p: NotificationPreferences) => {
      stored = p;
    }),
  } satisfies PushBackend;
  return { backend, calls, stored: () => stored };
}

export const prefs = (change: Partial<NotificationPreferences> = {}): NotificationPreferences => ({ ...DEFAULT_PREFERENCES, ...change });

/** React Native's AppState, faked: `emit("active")` plays a change. */
export function fakeAppState() {
  const listeners = new Set<(state: string) => void>();
  return {
    addEventListener: (_type: "change", listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => void listeners.delete(listener) };
    },
    emit: (state: string) => listeners.forEach((l) => l(state)),
  };
}
