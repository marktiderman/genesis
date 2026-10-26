import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DraftController,
  type DraftOptions,
  type DraftState,
  type DraftValue,
} from "./draft-controller";

export interface UseDraftReturn<V extends DraftValue, R> extends DraftState<V, R> {
  /** The editor's new value; saved a moment after the last change. */
  set: (value: V) => void;
  /** Save now. Never rejects; a failure shows in `status` and `error`. */
  flush: () => Promise<void>;
  /** The final write (a submit); see `DraftController.commit`. */
  commit: DraftController<V, R>["commit"];
}

/**
 * Autosave one draft row: saved a moment after each change, one write at a
 * time, added on the first save that has something in it, merged into a row
 * another tab started (`adopt`), and started again when the server's copy wins
 * (`revision`). Leaving the page saves what's pending (and warns while it
 * can't), and `commit` makes the final write. The app supplies the writes.
 *
 * ```tsx
 * const draft = useDraft({
 *   seed: { row: entry, value: entry?.answers ?? {} },
 *   revision: `${entry?.id}:${entry?.status}`,
 *   enabled: entry?.status !== "sent",
 *   create: (answers) => api.addEntry(answers),
 *   update: (row, answers) => api.saveEntry(row.id, answers),
 *   toValue: (row) => row.answers,
 *   onSaved: (row) => queryClient.setQueryData(["entry", row.id], row),
 * });
 * <Editor key={draft.key} value={draft.value} onChange={draft.set} />
 * ```
 */
export function useDraft<V extends DraftValue, R>(options: DraftOptions<V, R>): UseDraftReturn<V, R> {
  const latest = useRef(options);
  latest.current = options;
  // Created once; reads the latest options on every use, so callbacks are never stale.
  const [draft] = useState(() => new DraftController<V, R>(() => latest.current));
  const state = useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);

  useEffect(() => {
    draft.reseed(options.seed, options.revision);
    // Only a new revision starts the draft again; a new seed object alone doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, options.revision]);

  useEffect(() => {
    draft.sync();
  }, [draft, options.enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!draft.pending()) return;
      void draft.flush({ keepalive: true });
      event.preventDefault();
    };
    const pageHide = () => {
      if (draft.pending()) void draft.flush({ keepalive: true });
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      // Leaving the page within the app: save what's pending.
      if (draft.pending()) void draft.flush();
    };
  }, [draft]);

  return { ...state, set: draft.set, flush: draft.flush, commit: draft.commit };
}
