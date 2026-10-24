/**
 * Drafts on the device: the answers so far, saved as the respondent goes (debounced), put
 * back when they open the form again, and thrown away when the form has changed so they no
 * longer fit. Pure apart from the `DraftStore` the app passes in (`createDraftStore` over
 * `localStorage`, AsyncStorage, MMKV or memory).
 *
 * A draft is not a submission and the server never sees it. Clear it only once the
 * submission is safe (in the outbox, `createSubmitOutbox`'s `enqueue` resolved, or stored).
 */
import { isCalculated } from "./calculated";
import type { FormEngine } from "./engine";
import { isEmptyValue, isSensitive } from "./fields";
import { fieldMap, own, withheld } from "./logic";
import { formProgress } from "./progress";
import { andThen, isThenable, type KeyValueStorage, type MaybePromise } from "./storage";
import type { FormDefinition, Json } from "./types";
import { validateField } from "./validate";

/** Whose draft of which form, at which version of it. */
export interface DraftKey {
  formId: string;
  /** The definition's version (a published version label, or `fingerprint(definition)`). */
  version: string;
  /** Who is answering: a user id, or a session id made once on this device for anonymous visits. */
  respondent: string;
}

/** A saved draft. Plain JSON. */
export interface FormDraft extends DraftKey {
  /** The answers given, by field id, including ones logic hides now (so going back keeps them). Calculated fields are left out. */
  values: Record<string, Json>;
  /** Each saved field's type when it was saved, by field id, to tell whether the form still fits. */
  types: Record<string, string>;
  /** The furthest question reached (`formProgress(engine).fieldId`): `createForm`'s `resumeAt`. */
  resumeAt: string | null;
  /** When it was saved, in milliseconds since 1970. */
  savedAt: number;
}

/** Where drafts are kept. One draft per form and respondent: saving another version replaces it. */
export interface DraftStore {
  /** The draft of this form by this respondent, of any version, or null. */
  get(key: DraftKey): MaybePromise<FormDraft | null>;
  set(draft: FormDraft): MaybePromise<void>;
  remove(key: DraftKey): MaybePromise<void>;
}

export const DRAFT_KEY_PREFIX = "genesis-forms:draft:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The draft read back, or null when it isn't one (or is someone else's). */
function readDraft(raw: string | null | undefined, key: DraftKey): FormDraft | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { formId, version, respondent, values, types, resumeAt, savedAt } = value;
  if (formId !== key.formId || respondent !== key.respondent || typeof version !== "string") return null;
  if (!isRecord(values) || !isRecord(types) || typeof savedAt !== "number") return null;
  if (resumeAt !== null && typeof resumeAt !== "string") return null;
  return value as unknown as FormDraft;
}

/**
 * A `DraftStore` over key-value storage, one entry per form and respondent (the version is
 * inside it, so a new version finds the old draft and `restoreDraft` decides whether it still
 * fits). A stored entry that doesn't read as a draft is answered null.
 */
export function createDraftStore(storage: KeyValueStorage, options: { prefix?: string | undefined } = {}): DraftStore {
  const prefix = options.prefix ?? DRAFT_KEY_PREFIX;
  const storageKey = (key: DraftKey) => `${prefix}${encodeURIComponent(key.formId)}:${encodeURIComponent(key.respondent)}`;
  return {
    get: (key) => andThen(storage.getItem(storageKey(key)), (raw) => readDraft(raw, key)),
    set: (draft) => storage.setItem(storageKey(draft), JSON.stringify(draft)),
    remove: (key) => storage.removeItem(storageKey(key)),
  };
}

export interface DraftOptions {
  /**
   * Keep answers to sensitive fields (`isSensitive`) in the draft. Default false: they are
   * left out, so a health detail or an ID number never sits in the device's storage, and the
   * respondent answers them again after a restore.
   */
  keepSensitive?: boolean | undefined;
}

/** The engine's answers so far as a draft (null when nothing is answered). */
export function draftOf(
  engine: Pick<FormEngine, "definition" | "getState">,
  key: DraftKey,
  options: DraftOptions & { now?: (() => number) | undefined } = {},
): FormDraft | null {
  const definition = engine.definition;
  const state = engine.getState();
  const values: Record<string, Json> = {};
  const types: Record<string, string> = {};
  for (const [id, field] of fieldMap(definition)) {
    if (isCalculated(field) || withheld(definition, field)) continue;
    if (!options.keepSensitive && isSensitive(field)) continue;
    const value = own(state.values, id);
    if (value === undefined || isEmptyValue(value, field)) continue;
    values[id] = value;
    types[id] = field.type;
  }
  if (Object.keys(values).length === 0) return null;
  return {
    formId: key.formId,
    version: key.version,
    respondent: key.respondent,
    values,
    types,
    resumeAt: formProgress(engine).fieldId,
    savedAt: (options.now ?? Date.now)(),
  };
}

/** 30 days: the default for how long a draft is kept. */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftRestore =
  | {
      ok: true;
      /** For `createForm`'s `initialValues` (over the host's own prefill). */
      values: Record<string, Json>;
      /** For `createForm`'s `resumeAt`. */
      resumeAt: string | null;
    }
  | {
      ok: false;
      /**
       * `version`: the form changed and an answer no longer fits (its question is gone, has
       * another type, or the answer isn't valid for it now). `expired`: older than `maxAgeMs`.
       */
      reason: "version" | "expired";
    };

/**
 * Whether a saved draft can be put back into this definition. The same version: yes. Another
 * version: only when every saved answer still fits (its question is there, of the same type,
 * and the answer passes its format checks); otherwise the whole draft is refused, never half
 * put back. Pass the definition with the host's options filled in (`engine.definition`, or
 * `withHostOptions`), so a picked option that's gone counts.
 */
export function restoreDraft(
  definition: FormDefinition,
  draft: FormDraft,
  options: { version: string; now?: (() => number) | undefined; maxAgeMs?: number | undefined },
): DraftRestore {
  const now = (options.now ?? Date.now)();
  if (now - draft.savedAt > (options.maxAgeMs ?? DRAFT_MAX_AGE_MS)) return { ok: false, reason: "expired" };
  const values = { ...draft.values };
  if (draft.version !== options.version) {
    const fields = fieldMap(definition);
    for (const [id, value] of Object.entries(values)) {
      const field = fields.get(id);
      if (!field || field.type !== own(draft.types, id) || isCalculated(field) || withheld(definition, field)) {
        return { ok: false, reason: "version" };
      }
      if (validateField(field, value, { requireAnswers: false }) !== null) return { ok: false, reason: "version" };
    }
  }
  const resumeAt = draft.resumeAt && fieldMap(definition).has(draft.resumeAt) ? draft.resumeAt : null;
  return { ok: true, values, resumeAt };
}

export interface DraftAutosaveOptions extends DraftOptions {
  /** How long the respondent pauses before the draft is saved, in milliseconds. Default 800. */
  delayMs?: number | undefined;
  now?: (() => number) | undefined;
  /** A save or removal that failed (storage full, unavailable). Default `console.warn`. Autosave never throws. */
  onError?: ((error: unknown) => void) | undefined;
  /** Each save that landed, with its time. */
  onSaved?: ((draft: FormDraft) => void) | undefined;
  /**
   * A draft is stored for this key already (it was just restored). Answers cleared to nothing
   * remove a stored draft; without this, only one this autosave wrote. Default false, so a
   * draft that couldn't be read is never removed before the respondent answers anything.
   */
  stored?: boolean | undefined;
}

export interface DraftAutosave {
  /** Save now whatever is waiting. Resolves when it is written (or failed, through `onError`). */
  flush(): Promise<void>;
  /**
   * Stop saving and remove the draft: call it once the submission is safe (queued in the
   * outbox, or stored). Nothing waiting is written after it.
   */
  clear(): Promise<void>;
  /** Stop listening. Whatever is waiting is saved first (`flush`). */
  dispose(): Promise<void>;
}

/**
 * Save the engine's answers to `store` as they change, `delayMs` after the last change, one
 * write at a time and in order. Answers cleared to nothing remove the draft (one this
 * autosave wrote, or the one restored: `stored`), so an emptied form doesn't come back filled.
 */
export function createDraftAutosave(
  engine: Pick<FormEngine, "definition" | "getState" | "subscribe">,
  store: DraftStore,
  key: DraftKey,
  options: DraftAutosaveOptions = {},
): DraftAutosave {
  const delay = options.delayMs ?? 800;
  const onError = options.onError ?? ((e: unknown) => console.warn("[forms] The draft could not be saved.", e));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  /** Set by `clear`: nothing is written after it, not even a write already waiting. */
  let cleared = false;
  let listening = true;
  /** Whether a draft for this key is in the store, as far as this autosave knows. */
  let stored = options.stored === true;
  let chain: Promise<void> = Promise.resolve();

  const run = (step: () => MaybePromise<void>) => {
    chain = chain.then(async () => {
      try {
        const done = step();
        if (isThenable(done)) await done;
      } catch (e) {
        onError(e);
      }
    });
    return chain;
  };

  const write = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty || cleared) return chain;
    dirty = false;
    // Read now, written in turn: the draft is the answers as they were at this moment.
    const draft = draftOf(engine, key, options);
    return run(() => {
      if (cleared) return;
      if (!draft) {
        if (!stored) return;
        return andThen(store.remove(key), () => {
          stored = false;
        });
      }
      return andThen(store.set(draft), () => {
        stored = true;
        options.onSaved?.(draft);
      });
    });
  };

  const unsubscribe = engine.subscribe(() => {
    if (!listening) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void write(), delay);
  });

  return {
    flush: () => write(),
    clear: () => {
      cleared = true;
      listening = false;
      dirty = false;
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
      return run(() => store.remove(key));
    },
    dispose: () => {
      const done = write();
      listening = false;
      unsubscribe();
      return done;
    },
  };
}
