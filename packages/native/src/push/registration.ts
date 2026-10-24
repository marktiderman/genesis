/**
 * This device's Expo push token, kept against whoever is signed in.
 *
 *   sync(userId)   permission granted → (Android) channels → token → backend.register,
 *                  again when the token changes and at most daily otherwise (last seen)
 *   forget()       backend.forget(token) on sign-out, an account switch or deletion;
 *                  a forget that fails offline is kept and retried at the next start
 *
 * The token is remembered on the phone (storage) with the user it was
 * registered for, so it can be forgotten after the session has ended. Every
 * step runs in order on one queue, so a sign-out never races a registration.
 */
import { createStore, type Store } from "../updates/store";
import type { PushBackend } from "./backend";
import { report, type NotificationsModuleLike, type PushOnError, type PushStorageLike } from "./modules";

export type RegistrationStatus = "idle" | "registering" | "registered" | "unavailable" | "error";

export interface RegistrationState {
  status: RegistrationStatus;
  /**
   * Why it isn't registered: `no_project_id` (the build has no EAS project id, so there is no
   * Expo push token), `no_token` (the OS gave none: a simulator without push, or no network),
   * `backend` (the server refused or couldn't be reached).
   */
  problem: "no_project_id" | "no_token" | "backend" | null;
}

export interface Registration extends Store<RegistrationState> {
  sync(userId: string, options?: { force?: boolean }): Promise<void>;
  forget(): Promise<void>;
  /** Retry forgets that failed earlier (offline sign-out). */
  flush(): Promise<void>;
  /** This device's token, once known (the person's own; never shown in logs). */
  token(): string | null;
}

interface Saved {
  token: string;
  userId: string;
  at: number;
}

/** Registered again at most this often while nothing changed (last seen, and a token another login took comes back). */
const REFRESH_MS = 60 * 60_000;

export function createRegistration(options: {
  notifications?: NotificationsModuleLike;
  backend: PushBackend;
  projectId?: string | null;
  platform: string;
  appVersion?: string | null;
  storage?: PushStorageLike;
  storageKeyPrefix: string;
  /** Creates the Android channels; runs before the token is asked for. */
  ensureChannels: () => Promise<void>;
  /** Is this user still the one signed in? A sync for someone who has signed out is dropped. */
  isCurrent: (userId: string) => boolean;
  now: () => number;
  onError?: PushOnError;
}): Registration {
  const { notifications, backend, storage, storageKeyPrefix, onError, now } = options;
  const savedKey = `${storageKeyPrefix}:device`;
  const pendingKey = `${storageKeyPrefix}:forget`;
  const store = createStore<RegistrationState>({ status: "idle", problem: null });
  let current: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let warnedNoProject = false;

  const run = <T>(step: () => Promise<T>): Promise<T> => {
    const next = queue.then(step, step);
    queue = next.catch(() => {});
    return next;
  };

  const read = async <T>(key: string, fallback: T): Promise<T> => {
    if (!storage) return fallback;
    try {
      const raw = await storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch (error) {
      report(onError, error, "storage");
      return fallback;
    }
  };
  const write = async (key: string, value: unknown) => {
    try {
      if (value === null) await storage?.removeItem?.(key);
      else await storage?.setItem(key, JSON.stringify(value));
    } catch (error) {
      report(onError, error, "storage");
    }
  };

  const forgetToken = async (token: string): Promise<boolean> => {
    try {
      await backend.forget(token);
      return true;
    } catch (error) {
      report(onError, error, "forget");
      return false;
    }
  };

  const queuePending = async (token: string) => {
    const pending = await read<string[]>(pendingKey, []);
    if (!pending.includes(token)) await write(pendingKey, [...pending, token].slice(-10));
  };

  return {
    ...store,
    token: () => current,
    sync(userId, { force = false } = {}) {
      return run(async () => {
        if (!notifications || !options.isCurrent(userId)) return;
        if (!options.projectId) {
          store.setState({ status: "unavailable", problem: "no_project_id" });
          if (!warnedNoProject) {
            warnedNoProject = true;
            // Loud once: without an EAS project id there is no Expo push token, so no push reaches this build.
            report(onError, new Error("push: no EAS project id (projectId), so this build gets no push token. Run `eas init` and pass Constants.expoConfig.extra.eas.projectId."), "setup");
          }
          return;
        }
        store.setState({ status: "registering", problem: null });
        await options.ensureChannels().catch((error) => report(onError, error, "channels"));
        let token: string;
        try {
          token = (await notifications.getExpoPushTokenAsync({ projectId: options.projectId })).data;
        } catch (error) {
          report(onError, error, "register");
          store.setState({ status: "error", problem: "no_token" });
          return;
        }
        if (typeof token !== "string" || token.length === 0) {
          store.setState({ status: "error", problem: "no_token" });
          return;
        }
        current = token;
        const saved = await read<Saved | null>(savedKey, null);
        // A different token kept for someone else on this phone: forget it. (The same token the server moves itself.)
        if (saved && saved.userId !== userId && saved.token !== token && !(await forgetToken(saved.token))) await queuePending(saved.token);
        if (!force && saved && saved.token === token && saved.userId === userId && now() - saved.at < REFRESH_MS) {
          store.setState({ status: "registered", problem: null });
          return;
        }
        if (!options.isCurrent(userId)) return;
        try {
          await backend.register(token, options.platform === "ios" ? "ios" : "android", options.appVersion ?? null);
        } catch (error) {
          report(onError, error, "register");
          store.setState({ status: "error", problem: "backend" });
          return;
        }
        // An older token this phone had (the OS rotated it) goes; the new one stays.
        if (saved && saved.token !== token && saved.userId === userId && !(await forgetToken(saved.token))) await queuePending(saved.token);
        await write(savedKey, { token, userId, at: now() } satisfies Saved);
        // A forget of this same token still waiting from an offline sign-out would undo this registration.
        const pending = await read<string[]>(pendingKey, []);
        if (pending.includes(token)) await write(pendingKey, pending.filter((t) => t !== token).length ? pending.filter((t) => t !== token) : null);
        store.setState({ status: "registered", problem: null });
      });
    },
    forget() {
      return run(async () => {
        const saved = await read<Saved | null>(savedKey, null);
        const token = saved?.token ?? current;
        await write(savedKey, null);
        store.setState({ status: "idle", problem: null });
        if (!token) return;
        if (!(await forgetToken(token))) await queuePending(token);
      });
    },
    flush() {
      return run(async () => {
        const pending = await read<string[]>(pendingKey, []);
        if (pending.length === 0) return;
        const left: string[] = [];
        const registered = (await read<Saved | null>(savedKey, null))?.token;
        for (const token of pending) {
          // Registered again since (signed back in): keep it.
          if (token === registered) continue;
          if (!(await forgetToken(token))) left.push(token);
        }
        await write(pendingKey, left.length ? left : null);
      });
    },
  };
}
