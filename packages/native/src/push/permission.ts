/**
 * Notification permission, and the soft pre-prompt that comes before the
 * system's.
 *
 * The system prompt can be shown once: a person who says no there has to find
 * the app in Settings to change it. So the block never asks at launch. The
 * app calls `prompt.offer()` at the moment push is worth it (they sent their
 * first message, set a reminder) and the block shows its own sheet first,
 * saying why; only "Turn on" in that sheet (a tap) brings up the system
 * prompt. "Not now" waits `cooldownMs` before the sheet can show again, and
 * after `maxDeclines` it never offers again (Settings still can).
 */
import { createStore, type Store } from "../updates/store";
import { report, type NotificationsModuleLike, type PermissionRequestLike, type PermissionStatusLike, type PushOnError, type PushStorageLike } from "./modules";

/**
 * `unknown` before the first read; `undetermined` the system can still ask;
 * `granted`; `provisional` (iOS delivers quietly to Notification Center);
 * `denied` only Settings can change; `unavailable` no notifications module.
 */
export type PushPermissionStatus = "unknown" | "undetermined" | "granted" | "provisional" | "denied" | "unavailable";

export interface PermissionState {
  status: PushPermissionStatus;
  /** The system prompt is up. */
  requesting: boolean;
}

export interface PermissionStore extends Store<PermissionState> {
  /** Read the status without asking (no prompt). */
  refresh(): Promise<PushPermissionStatus>;
  /** Show the system prompt (only after a tap); resolves to the new status. */
  request(): Promise<PushPermissionStatus>;
}

const IOS_PROVISIONAL = 3;
const IOS_EPHEMERAL = 4;

/** Expo's answer as one status. Android "denied but can ask again" is still askable. */
export function statusOf(response: PermissionStatusLike): PushPermissionStatus {
  const ios = response.ios?.status;
  if (ios === IOS_PROVISIONAL) return "provisional";
  if (response.granted || response.status === "granted" || ios === IOS_EPHEMERAL) return "granted";
  if (response.status === "undetermined" || response.canAskAgain) return "undetermined";
  return "denied";
}

export const canPush = (status: PushPermissionStatus) => status === "granted" || status === "provisional";

export function createPermissionStore(options: {
  notifications?: NotificationsModuleLike;
  request?: PermissionRequestLike;
  /** Runs before the system prompt (Android 13 shows it only once a channel exists). */
  beforeRequest?: () => Promise<void>;
  onError?: PushOnError;
}): PermissionStore {
  const { notifications, onError } = options;
  const store = createStore<PermissionState>({ status: notifications ? "unknown" : "unavailable", requesting: false });
  return {
    ...store,
    async refresh() {
      if (!notifications) return "unavailable";
      try {
        const status = statusOf(await notifications.getPermissionsAsync());
        store.setState({ status });
        return status;
      } catch (error) {
        report(onError, error, "permission");
        return store.getState().status;
      }
    },
    async request() {
      if (!notifications) return "unavailable";
      if (store.getState().requesting) return store.getState().status;
      store.setState({ requesting: true });
      try {
        await options.beforeRequest?.().catch((error) => report(onError, error, "channels"));
        const status = statusOf(await notifications.requestPermissionsAsync(options.request ?? DEFAULT_REQUEST));
        store.setState({ status });
        return status;
      } catch (error) {
        report(onError, error, "permission");
        return store.getState().status;
      } finally {
        store.setState({ requesting: false });
      }
    },
  };
}

const DEFAULT_REQUEST: PermissionRequestLike = { ios: { allowAlert: true, allowBadge: true, allowSound: true } };

export interface PromptOptions {
  /** After "Not now", how long before the sheet may show again. Default 3 days. */
  cooldownMs?: number;
  /** After this many "Not now"s it never offers again. Default 3. */
  maxDeclines?: number;
  /** `offer()` is ignored this long after the block starts, so no screen can ask at launch. Default 10 s. */
  launchGraceMs?: number;
}

export interface PromptState {
  visible: boolean;
  /** What `offer(reason)` said push is for here, for the sheet's copy. */
  reason: string | null;
}

export interface PromptStore extends Store<PromptState> {
  /**
   * Show the soft prompt if it is a good moment: signed in, the system can
   * still ask, not at launch, not too soon after "Not now". Resolves to
   * whether it showed.
   */
  offer(reason?: string): Promise<boolean>;
  /** "Turn on": hides the sheet and shows the system prompt. */
  accept(): Promise<PushPermissionStatus>;
  /** "Not now": hides the sheet and remembers it. */
  decline(): Promise<void>;
  hide(): void;
}

interface Declines {
  count: number;
  at: number;
}

export function createPromptStore(options: PromptOptions & {
  permission: PermissionStore;
  storage?: PushStorageLike;
  storageKey: string;
  signedIn: () => boolean;
  /** When the block started (ms), or null before. */
  startedAt: () => number | null;
  now: () => number;
  onError?: PushOnError;
}): PromptStore {
  const { permission, storage, storageKey, now, onError } = options;
  const cooldownMs = options.cooldownMs ?? 3 * 24 * 60 * 60_000;
  const maxDeclines = options.maxDeclines ?? 3;
  const launchGraceMs = options.launchGraceMs ?? 10_000;
  const store = createStore<PromptState>({ visible: false, reason: null });
  let memory: Declines = { count: 0, at: 0 };

  const readDeclines = async (): Promise<Declines> => {
    if (!storage) return memory;
    try {
      const raw = await storage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Partial<Declines>) : null;
      return { count: Number(parsed?.count) || 0, at: Number(parsed?.at) || 0 };
    } catch (error) {
      report(onError, error, "storage");
      return memory;
    }
  };

  return {
    ...store,
    async offer(reason) {
      if (store.getState().visible) return true;
      const started = options.startedAt();
      if (started === null || now() - started < launchGraceMs) return false;
      if (!options.signedIn()) return false;
      const status = permission.getState().status === "unknown" ? await permission.refresh() : permission.getState().status;
      if (status !== "undetermined") return false;
      const declines = await readDeclines();
      if (declines.count >= maxDeclines || (declines.count > 0 && now() - declines.at < cooldownMs)) return false;
      if (!options.signedIn()) return false;
      store.setState({ visible: true, reason: reason ?? null });
      return true;
    },
    async accept() {
      store.setState({ visible: false });
      return permission.request();
    },
    async decline() {
      // Only from the sheet: a dismissal that fires as it closes after "Turn on" isn't a "Not now".
      if (!store.getState().visible) return;
      store.setState({ visible: false });
      const declines = await readDeclines();
      memory = { count: declines.count + 1, at: now() };
      try {
        await storage?.setItem(storageKey, JSON.stringify(memory));
      } catch (error) {
        report(onError, error, "storage");
      }
    },
    hide() {
      store.setState({ visible: false, reason: null });
    },
  };
}
