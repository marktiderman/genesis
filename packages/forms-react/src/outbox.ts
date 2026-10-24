import { useEffect, useSyncExternalStore } from "react";
import type { FormEngine, Json, OutboxItem, OutboxSnapshot, SubmitOutbox } from "@marktiderman/genesis-forms";

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

export interface OutboxSubmitOptions {
  formId: string;
  /** The visit's attempt id, for a form with upload fields. */
  attemptId?: string | undefined;
  /** Shown in the outbox's list (a form's title), never sent. */
  meta?: Record<string, Json> | undefined;
  /** Called once the submission is in storage: the draft's `clear` (`useFormDraft`). */
  clearDraft?: (() => void | Promise<void>) | undefined;
  /** The queued submission, once it is in storage. */
  onQueued?: ((item: OutboxItem) => void) | undefined;
}

/**
 * An `onSubmit` for `useFormController` that queues the engine's event log in the outbox,
 * then clears the draft. It resolves once the submission is in storage, so the controller
 * shows the ending even while offline (the outbox sends it later). When storage can't take
 * it, it rejects: the controller's phase is `failed`, the answers and the draft are kept.
 *
 * ```tsx
 * const { engine, clear } = useFormDraft(definition, { store: drafts, respondent });
 * // once engine is ready (a child component, say):
 * const controller = useFormController(engine, { onSubmit: outboxSubmit(outbox, { formId, clearDraft: clear }) });
 * ```
 */
export function outboxSubmit(outbox: SubmitOutbox, options: OutboxSubmitOptions): (engine: FormEngine) => Promise<void> {
  return async (engine) => {
    const item = await outbox.enqueue({
      formId: options.formId,
      submission: { events: engine.getState().events },
      attemptId: options.attemptId,
      meta: options.meta,
    });
    options.onQueued?.(item);
    // The submission is safe; a draft that fails to clear only means a stale draft next visit.
    try {
      await options.clearDraft?.();
    } catch (e) {
      console.warn("[forms] The draft could not be cleared.", e);
    }
  };
}
