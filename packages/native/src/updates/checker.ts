/**
 * The update banner's engine: ask expo-updates for a newer update, download
 * it, and reload only when the person taps and nothing is mid-edit.
 *
 * - It never reloads on its own. A downloaded update also applies on the next
 *   cold start, so dismissing the banner loses nothing.
 * - The reload guard says no while any `useBlockReload(true)` is mounted (a
 *   form with unsaved changes) or your `canReload()` returns false (or
 *   throws). The banner then asks the person to finish first.
 * - expo-updates only serves updates built for this binary's runtime
 *   version; an update whose manifest names another runtime is ignored too.
 */
import { createStore, type Store } from "./store";
import { manifestField, toError, type UpdatesModuleLike, type UpdatesOnError } from "./modules";

export interface ReloadGuard {
  /** Hold reloads off until the returned function is called. */
  block(): () => void;
  /** True when nothing blocks and your `canReload` agrees. */
  canReload(): boolean;
  /** Fires when a block starts or ends. */
  subscribe(listener: () => void): () => void;
}

export function createReloadGuard(canReload?: () => boolean): ReloadGuard {
  let blockers = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    block() {
      blockers++;
      notify();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        blockers--;
        notify();
      };
    },
    canReload() {
      if (blockers > 0) return false;
      try {
        return canReload ? canReload() === true : true;
      } catch {
        return false; // When in doubt, don't throw away someone's work.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type UpdateCheckStatus = "disabled" | "idle" | "checking" | "downloading" | "ready" | "reloading" | "error";

export interface UpdateCheckState {
  status: UpdateCheckStatus;
  /** The downloaded update's id, when the manifest has one. */
  updateId: string | null;
  /** The person closed the banner; the update still applies on the next cold start. */
  dismissed: boolean;
  /** The last tap was refused by the reload guard; cleared when the guard opens. */
  blocked: boolean;
  error: Error | null;
}

export interface UpdateCheckerOptions {
  updates?: UpdatesModuleLike;
  guard: ReloadGuard;
  /** Passed to `reloadAsync` (a branded reload screen). */
  reloadScreenOptions?: object;
  now?: () => number;
  onError?: UpdatesOnError;
}

export interface UpdateChecker extends Pick<Store<UpdateCheckState>, "getState" | "subscribe"> {
  /** Check and download. Never rejects; does nothing while one is in flight or an update is ready. */
  check(): Promise<void>;
  /** `check()` unless the last one started less than `minIntervalMs` ago. */
  checkIfDue(minIntervalMs: number): Promise<void>;
  /** Reload into the downloaded update. Resolves false when there is none or the guard refuses. */
  reload(): Promise<boolean>;
  dismiss(): void;
  /** Stop following the guard. */
  dispose(): void;
}

export function createUpdateChecker(options: UpdateCheckerOptions): UpdateChecker {
  const { updates, guard, reloadScreenOptions, now = Date.now, onError } = options;
  const enabled = Boolean(updates?.isEnabled);
  const store = createStore<UpdateCheckState>({
    status: enabled ? "idle" : "disabled",
    updateId: null,
    dismissed: false,
    blocked: false,
    error: null,
  });
  let inflight: Promise<void> | null = null;
  let lastCheck: number | null = null;
  const report = (error: Error, from: "check" | "reload") => {
    try {
      onError?.(error, from);
    } catch {
      // ignore a failing reporter
    }
  };
  const stopGuard = guard.subscribe(() => {
    if (store.getState().blocked && guard.canReload()) store.setState({ blocked: false });
  });

  const check = (): Promise<void> => {
    if (!updates || !enabled) return Promise.resolve();
    const { status } = store.getState();
    if (inflight || status === "ready" || status === "reloading") return inflight ?? Promise.resolve();
    lastCheck = now();
    // eslint-disable-next-line prefer-const -- read in `finally`, after the assignment below
    let run!: Promise<void>;
    run = (async () => {
      // Never settle synchronously (a module that throws before its first await).
      await null;
      try {
        store.setState({ status: "checking", error: null });
        const result = await updates.checkForUpdateAsync();
        if (!result.isAvailable && !result.isRollBackToEmbedded) {
          store.setState({ status: "idle" });
          return;
        }
        const runtime = manifestField(result.manifest, "runtimeVersion");
        if (runtime && updates.runtimeVersion && runtime !== updates.runtimeVersion) {
          store.setState({ status: "idle" });
          return;
        }
        store.setState({ status: "downloading" });
        const fetched = await updates.fetchUpdateAsync();
        const updateId = manifestField(fetched.manifest, "id") ?? manifestField(result.manifest, "id");
        if ((fetched.isNew || fetched.isRollBackToEmbedded) && !(updateId && updateId === updates.updateId)) {
          store.setState({ status: "ready", updateId, dismissed: false });
        } else {
          store.setState({ status: "idle" });
        }
      } catch (raw) {
        const error = toError(raw);
        report(error, "check");
        store.setState({ status: "error", error });
      } finally {
        if (inflight === run) inflight = null;
      }
    })();
    inflight = run;
    return run;
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    check,
    checkIfDue(minIntervalMs) {
      const at = now();
      if (lastCheck !== null && at >= lastCheck && at - lastCheck < minIntervalMs) return Promise.resolve();
      return check();
    },
    async reload() {
      if (!updates || store.getState().status !== "ready") return false;
      if (!guard.canReload()) {
        store.setState({ blocked: true });
        return false;
      }
      store.setState({ status: "reloading", blocked: false });
      try {
        await updates.reloadAsync(reloadScreenOptions ? { reloadScreenOptions } : undefined);
        return true;
      } catch (raw) {
        const error = toError(raw);
        report(error, "reload");
        store.setState({ status: "ready", error });
        return false;
      }
    },
    dismiss() {
      store.setState({ dismissed: true, blocked: false });
    },
    dispose: stopGuard,
  };
}
