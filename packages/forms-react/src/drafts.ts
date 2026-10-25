import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Autosave must listen before anyone can answer: a passive effect runs after paint, and an answer
// given in between was never saved. A layout effect runs before the form can be touched; on a
// server (no window) a passive one avoids the warning, and there is no one to answer anyway.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
import {
  createDraftAutosave,
  createForm,
  fingerprint,
  restoreDraft,
  withHostOptions,
  type CreateFormOptions,
  type DraftAutosave,
  type DraftKey,
  type DraftStore,
  type FormDefinition,
  type FormDraft,
  type FormEngine,
} from "@marktiderman/genesis-forms";

type FormLike = FormDefinition | { definition: FormDefinition };
const definitionOf = (form: FormLike) => ("definition" in form ? form.definition : form);
const isThenable = <T,>(v: T | Promise<T>): v is Promise<T> => typeof (v as { then?: unknown } | null)?.then === "function";

export interface UseFormDraftOptions extends CreateFormOptions {
  store: DraftStore;
  /** Who is answering: a user id, or a session id made once on this device for anonymous visits. */
  respondent: string;
  /** Default the definition's id. */
  formId?: string | undefined;
  /** The definition's version. Default `fingerprint(definition)`: any edit is a new version, and `restoreDraft` decides whether the draft still fits. */
  version?: string | undefined;
  /** Milliseconds a pause lasts before the draft is saved. Default 800. */
  delayMs?: number | undefined;
  /** How old a draft may be and still be put back. Default 30 days. */
  maxAgeMs?: number | undefined;
  /** Keep sensitive answers in the draft. Default false. */
  keepSensitive?: boolean | undefined;
  /** A read, save or removal of the draft failed. Default `console.warn`. */
  onError?: ((error: unknown) => void) | undefined;
}

export interface FormDraftState {
  /** The engine, with the draft put back. Null only while an async store reads the draft. */
  engine: FormEngine | null;
  /**
   * `restored`: the draft was put back. `discarded`: there was one, but the form changed so it
   * no longer fits (or it was too old), and it was removed. `none`: no draft. `error`: the
   * draft couldn't be read (`onError` has why); the form starts empty, and the stored draft is
   * left alone until the respondent answers something. `loading`: an async store is reading.
   */
  draft: "restored" | "discarded" | "none" | "error" | "loading";
  /** When the draft was last saved, in milliseconds since 1970. */
  savedAt: number | null;
  /** Save now whatever is waiting. */
  flush(): Promise<void>;
  /** Stop saving and remove the draft: call it once the submission is safe (`outbox.enqueue` resolved). */
  clear(): Promise<void>;
}

interface Held {
  definition: FormDefinition;
  id: string;
  engine: FormEngine | null;
  draft: FormDraftState["draft"];
  /** An async store's read, while it lasts. */
  read?: Promise<Pick<Held, "engine" | "draft">> | undefined;
}

/**
 * `useForm` with a draft on the device: the saved answers are put back when the form opens
 * (where the respondent got to, too), saved again `delayMs` after each change, and flushed
 * when the page is hidden or the component unmounts. With a store that answers at once
 * (`localStorage`, memory) the engine is ready on the first render; with an async one
 * (AsyncStorage) `engine` is null until the draft is read. A new definition, version or
 * respondent starts again, as `useForm` does with a new definition.
 */
export function useFormDraft(form: FormLike, options: UseFormDraftOptions): FormDraftState {
  const definition = definitionOf(form);
  const key: DraftKey = {
    formId: options.formId ?? definition.id,
    version: options.version ?? fingerprint(definition),
    respondent: options.respondent,
  };
  const id = `${key.formId}\u0000${key.version}\u0000${key.respondent}`;
  const onError = options.onError ?? ((e: unknown) => console.warn("[forms] Draft storage failed.", e));

  // Options are read when an engine is made, like `useForm`'s.
  const open = (saved: FormDraft | null): Pick<Held, "engine" | "draft"> => {
    if (!saved) return { engine: createForm(definition, options), draft: "none" };
    const restored = restoreDraft(withHostOptions(definition, options.hostOptions), saved, {
      version: key.version,
      maxAgeMs: options.maxAgeMs,
    });
    if (!restored.ok) {
      try {
        const removed = options.store.remove(key);
        if (isThenable(removed)) removed.catch(onError);
      } catch (e) {
        onError(e);
      }
      return { engine: createForm(definition, options), draft: "discarded" };
    }
    const engine = createForm(definition, {
      ...options,
      initialValues: { ...options.initialValues, ...restored.values },
      resumeAt: restored.resumeAt,
    });
    return { engine, draft: "restored" };
  };

  const failed = (e: unknown): Pick<Held, "engine" | "draft"> => {
    onError(e);
    return { engine: createForm(definition, options), draft: "error" };
  };

  const begin = (): Held => {
    let saved: FormDraft | null | Promise<FormDraft | null>;
    try {
      saved = options.store.get(key);
    } catch (e) {
      return { definition, id, ...failed(e) };
    }
    if (!isThenable(saved)) return { definition, id, ...open(saved) };
    const read = Promise.resolve(saved).then(open, failed);
    return { definition, id, engine: null, draft: "loading", read };
  };

  const [held, setHeld] = useState<Held>(begin);
  let current = held;
  if (held.definition !== definition || held.id !== id) {
    current = begin();
    setHeld(current);
  }

  useEffect(() => {
    const read = current.read;
    if (!read) return;
    let live = true;
    void read.then((opened) => {
      if (live) setHeld((h) => (h.read === read ? { definition: h.definition, id: h.id, ...opened } : h));
    });
    return () => {
      live = false;
    };
  }, [current.read]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [autosave, setAutosave] = useState<DraftAutosave | null>(null);
  const engine = current.engine;
  const restored = current.draft === "restored";
  useBeforePaint(() => {
    if (!engine) return;
    const saver = createDraftAutosave(engine, options.store, key, {
      delayMs: options.delayMs,
      keepSensitive: options.keepSensitive,
      onError,
      onSaved: (d) => setSavedAt(d.savedAt),
      stored: restored,
    });
    setAutosave(saver);
    // Web: save before the page goes away or to the background (mobile Safari often sends
    // only visibilitychange). React Native: call `flush` from an AppState listener.
    const w = (globalThis as { window?: Window }).window;
    const d = (globalThis as { document?: Document }).document;
    const onHide = () => void saver.flush();
    const onVisibility = () => {
      if (d?.visibilityState === "hidden") void saver.flush();
    };
    w?.addEventListener?.("pagehide", onHide);
    d?.addEventListener?.("visibilitychange", onVisibility);
    return () => {
      w?.removeEventListener?.("pagehide", onHide);
      d?.removeEventListener?.("visibilitychange", onVisibility);
      void saver.dispose();
    };
    // The engine is the identity: a new one (new definition or key) gets a new autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const flush = useCallback(() => autosave?.flush() ?? Promise.resolve(), [autosave]);
  const clear = useCallback(async () => {
    if (autosave) return autosave.clear();
    await options.store.remove(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, id]);

  return { engine, draft: current.draft, savedAt, flush, clear };
}
