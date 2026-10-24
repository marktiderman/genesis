import { useEffect, useSyncExternalStore } from "react";
import type { OutboxSnapshot, SubmitOutbox } from "@marktiderman/genesis-forms";

export interface UseSubmitOutboxOptions {
  /**
   * Follow the browser's `online` and `offline` events (`navigator.onLine`). Default true
   * where there is a `window`. In React Native pass false and call `outbox.setOnline` from
   * NetInfo yourself.
   */
  trackOnline?: boolean | undefined;
}

export interface SubmitOutboxState extends OutboxSnapshot {
  outbox: SubmitOutbox;
}

/**
 * The outbox's state (what's waiting, what failed, online or not), re-rendered as it
 * changes. Starts the outbox (its timers) on mount; it keeps running after unmount, because
 * one outbox serves the whole app: make it once, at module scope or in a provider, with
 * `createSubmitOutbox`, and call `outbox.stop()` yourself if it must stop.
 */
export function useSubmitOutbox(outbox: SubmitOutbox, options: UseSubmitOutboxOptions = {}): SubmitOutboxState {
  const snapshot = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);
  const track = options.trackOnline ?? true;

  useEffect(() => {
    outbox.start();
  }, [outbox]);

  useEffect(() => {
    if (!track) return;
    const w = (globalThis as { window?: Window }).window;
    if (!w || typeof w.addEventListener !== "function") return;
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav && typeof nav.onLine === "boolean") outbox.setOnline(nav.onLine);
    const up = () => outbox.setOnline(true);
    const down = () => outbox.setOnline(false);
    w.addEventListener("online", up);
    w.addEventListener("offline", down);
    return () => {
      w.removeEventListener("online", up);
      w.removeEventListener("offline", down);
    };
  }, [outbox, track]);

  return { ...snapshot, outbox };
}
