// ---------------------------------------------------------------------------
// Autosave a draft (README "Autosave a draft")
//
// A draft is one row someone edits over time: an answer to a questionnaire, a
// note, a journal entry. It is saved as they type, a moment after they stop,
// and the first save adds the row. The app supplies the writes, so this works
// with any backend; nothing here talks to a database.
//
// DraftController holds the rules and is plain TypeScript; `useDraft` is its
// React wrapper.
// ---------------------------------------------------------------------------

import { isDataWriteError } from "../schema/write-outcome";

/** A draft's value: a flat map of fields (a table or a list is one field). */
export type DraftValue = Record<string, unknown>;

export type DraftStatus = "idle" | "saving" | "saved" | "error" | "stopped";

export interface DraftSeed<V extends DraftValue, R> {
  /** The row as the server has it, or null before the first save. */
  row: R | null;
  /** The value to start from: the row's, or a blank one. */
  value: V;
}

/** What `adopt` found: the row it merged into, or a row already finished elsewhere. */
export type DraftAdoption<R> = { row: R } | { final: R };

export interface DraftOptions<V extends DraftValue, R> {
  seed: DraftSeed<V, R>;
  /**
   * Changes when the server's copy changes in a way that wins over edits here
   * (it was sent from another tab, a reviewer returned it). The draft then
   * starts again from the new `seed`; see `onRevision`.
   */
  revision?: string | undefined;
  /** The first write: add the row. */
  create: (value: V) => Promise<R>;
  /** Later writes. `keepalive` is set for the save made as the page closes. */
  update: (row: R, value: V, hints: { keepalive: boolean }) => Promise<R>;
  /** The value a saved row holds. */
  toValue: (row: R) => V;
  /**
   * The first write found a row already there (another tab started it): merge
   * into it, or report that it is already finished. `dirty` names the fields
   * changed here since the draft started; only those should be written over
   * the existing row's. Without `adopt`, the duplicate is an error.
   */
  adopt?: ((value: V, dirty: ReadonlySet<string>) => Promise<DraftAdoption<R>>) | undefined;
  /** Whether a failed `create` means "a row is already there". Default: a `duplicate` write outcome. */
  isDuplicate?: ((error: unknown) => boolean) | undefined;
  /** Never add a row for this value. Default: no field has anything in it. */
  isEmpty?: ((value: V) => boolean) | undefined;
  /** Default: the same JSON, whatever the order of object keys. */
  equal?: ((a: V, b: V) => boolean) | undefined;
  /** How long after the last change to save. Default 800 ms. */
  delayMs?: number | undefined;
  /** False: nothing is written (someone else's draft, or one already sent). Default true. */
  enabled?: boolean | undefined;
  /** After each save, with the row as saved: write it into the app's cache here. */
  onSaved?: ((row: R) => void) | undefined;
  /** `adopt` found the row finished elsewhere: nothing more is saved. */
  onFinal?: ((row: R) => void) | undefined;
  /**
   * `revision` changed with edits not yet saved: return the value to keep (a
   * merge), or null to drop the edits for the server's. Default: drop them.
   */
  onRevision?: ((pending: V, next: DraftSeed<V, R>) => V | null) | undefined;
  /** Whether a failed write is worth trying again. Default: network failures only, never refusals. */
  isRetryable?: ((error: unknown) => boolean) | undefined;
  /** Tries after the first, on a retryable failure. Default 3. */
  retries?: number | undefined;
  /** The first retry's wait; each later one doubles it. Default 500 ms. */
  retryDelayMs?: number | undefined;
  /** The words shown for a failed save. Default: the write error's own plain message. */
  messageOf?: ((error: unknown) => string) | undefined;
}

export interface DraftState<V extends DraftValue, R> {
  value: V;
  row: R | null;
  status: DraftStatus;
  /** Why the last save failed, in plain words; null once one succeeds. */
  error: string | null;
  /** True after a new revision replaced edits that weren't saved, so the page can say so. */
  discarded: boolean;
  /**
   * Changes when the value is replaced from outside the editor (merged with
   * another tab's row, or a new revision): remount the editor on it.
   */
  key: number;
}

export const DEFAULT_DRAFT_DELAY_MS = 800;
export const DRAFT_NOT_SAVED = "Your changes weren't saved.";

/** JSON with object keys sorted, so values compare equal whatever order a store keeps keys in. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

/** Something in it: not undefined, null, blank text, or a list or object of nothing. */
function hasContent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(hasContent);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasContent);
  return true;
}

/** The default `isRetryable`: a request that never reached the store. A refusal never is. */
export function isNetworkFailure(error: unknown): boolean {
  if (isDataWriteError(error)) return error.outcome === "error" && error.code === undefined;
  return error instanceof TypeError;
}

function isDuplicateOutcome(error: unknown): boolean {
  return isDataWriteError(error) && (error.outcome as string) === "duplicate";
}

function plainMessage(error: unknown): string {
  return isDataWriteError(error) && error.message ? error.message : DRAFT_NOT_SAVED;
}

/** Thrown inside a save to end it quietly: the draft stopped while it ran. */
class Halt {}

/**
 * The rules of a draft, without React: one write at a time, add then change,
 * no write when nothing changed or for an empty value, merge into a row
 * another tab started, start again on a new revision, retry network failures,
 * and a final write (`commit`) that ends it.
 */
export class DraftController<V extends DraftValue, R> {
  private state: DraftState<V, R>;
  /** The value as last saved (or as loaded): what "unchanged" compares with. */
  private saved: V;
  /** Fields changed here since the draft started (or since the last revision). */
  private dirty = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision: string | undefined;
  private ended = false;
  /** Bumped by each new revision: a save that started before it lands on nothing. */
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly options: () => DraftOptions<V, R>) {
    const { seed, revision, toValue } = options();
    this.revision = revision;
    this.saved = seed.row ? toValue(seed.row) : seed.value;
    this.state = { value: seed.value, row: seed.row, status: "idle", error: null, discarded: false, key: 0 };
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = () => this.state;

  /** Edits this draft would still save. */
  readonly pending = () => this.active() && !this.same(this.state.value, this.saved);

  /** The editor's new value: its changed fields are noted, and it's saved a moment after the last change. */
  readonly set = (value: V) => {
    const before = this.state.value;
    for (const key of new Set([...Object.keys(before), ...Object.keys(value)])) {
      if (stableJson(before[key]) !== stableJson(value[key])) this.dirty.add(key);
    }
    this.patch({ value, discarded: false });
    if (this.active()) this.schedule();
  };

  /** Save now, after any write already running. Resolves once written or failed; never rejects. */
  readonly flush = (hints: { keepalive?: boolean } = {}): Promise<void> => {
    this.clearTimer();
    // Never rejects, so one throwing option (isEmpty, equal) can't wedge the chain.
    const run = this.chain
      .then(() => this.save(hints.keepalive ?? false))
      .catch((error: unknown) => {
        this.patch({ status: "error", error: (this.options().messageOf ?? plainMessage)(error) });
      });
    this.chain = run;
    return run;
  };

  /**
   * The final write (a submit), after any write in flight, given the row so far
   * (null before the first save) and the value. On success nothing more is
   * saved and the draft is `stopped`; on failure it is thrown to the caller and
   * autosave carries on.
   */
  readonly commit = (write: (row: R | null, value: V) => Promise<R>): Promise<R> => {
    this.clearTimer();
    const run = this.chain.then(async () => {
      const row = await write(this.state.row, this.state.value);
      this.ended = true;
      this.saved = this.options().toValue(row);
      this.patch({ row, status: "stopped", error: null });
      this.options().onSaved?.(row);
      return row;
    });
    // A failed commit leaves the draft as it was: autosave carries on.
    this.chain = run.catch(() => {
      if (this.pending()) this.schedule();
    });
    return run;
  };

  /**
   * The server's seed again. Ignored unless `revision` changed; then the draft
   * starts again from it, keeping only what `onRevision` returns.
   */
  readonly reseed = (seed: DraftSeed<V, R>, revision: string | undefined) => {
    if (revision === this.revision) return;
    this.revision = revision;
    this.generation++;
    this.clearTimer();
    const opts = this.options();
    const pending = !this.same(this.state.value, this.saved);
    const kept = pending ? (opts.onRevision?.(this.state.value, seed) ?? null) : null;
    this.saved = seed.row ? opts.toValue(seed.row) : seed.value;
    this.dirty.clear();
    this.ended = false;
    this.patch({
      row: seed.row,
      value: kept ?? seed.value,
      status: this.enabled() ? "idle" : "stopped",
      error: null,
      discarded: pending && kept === null,
      key: this.state.key + 1,
    });
    if (kept !== null && this.pending()) this.schedule();
  };

  /** Call when `enabled` may have changed: off stops saving; back on saves what's pending. */
  readonly sync = () => {
    if (!this.enabled()) {
      this.clearTimer();
      if (this.state.status !== "stopped") this.patch({ status: "stopped" });
    } else if (this.state.status === "stopped" && !this.ended) {
      this.patch({ status: "idle" });
      if (this.pending()) this.schedule();
    }
  };

  private enabled() {
    return this.options().enabled ?? true;
  }

  private active() {
    return this.enabled() && !this.ended;
  }

  private same(a: V, b: V) {
    const equal = this.options().equal;
    return equal ? equal(a, b) : stableJson(a) === stableJson(b);
  }

  private schedule() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.options().delayMs ?? DEFAULT_DRAFT_DELAY_MS);
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private patch(change: Partial<DraftState<V, R>>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private async save(keepalive: boolean): Promise<void> {
    if (!this.active()) return;
    const opts = this.options();
    const value = this.state.value;
    if (this.same(value, this.saved)) return;
    const isEmpty = opts.isEmpty ?? ((v: V) => !Object.values(v).some(hasContent));
    if (!this.state.row && isEmpty(value)) return;
    this.patch({ status: "saving" });
    const generation = this.generation;
    try {
      const { row, merged } = await this.write(value, keepalive);
      // A new revision arrived while this ran: the server's copy won, so this result is stale.
      if (generation !== this.generation) return;
      const stored = opts.toValue(row);
      // What was sent, not what came back: a store that tidies values (trims text, fills
      // defaults) would otherwise look unsaved forever and be written again and again.
      this.saved = merged ? stored : value;
      if (merged) {
        // Another tab's row: show its fields, keeping only those changed here.
        const next = { ...stored } as DraftValue;
        for (const key of this.dirty) next[key] = this.state.value[key];
        this.patch({ row, value: next as V, status: "saved", error: null, key: this.state.key + 1 });
      } else {
        this.patch({ row, status: "saved", error: null });
      }
      opts.onSaved?.(row);
      // Typed while this save ran, or merged: save again.
      if (this.pending()) this.schedule();
    } catch (error) {
      if (error instanceof Halt || generation !== this.generation) return;
      this.patch({ status: "error", error: (opts.messageOf ?? plainMessage)(error) });
    }
  }

  /** One save: change the row, or add it (merging on a duplicate), retrying network failures. */
  private async write(value: V, keepalive: boolean): Promise<{ row: R; merged: boolean }> {
    const opts = this.options();
    const retries = opts.retries ?? 3;
    const isRetryable = opts.isRetryable ?? isNetworkFailure;
    for (let attempt = 0; ; attempt++) {
      try {
        if (this.state.row) {
          return { row: await opts.update(this.state.row, value, { keepalive }), merged: false };
        }
        try {
          return { row: await opts.create(value), merged: false };
        } catch (error) {
          if (!opts.adopt || !(opts.isDuplicate ?? isDuplicateOutcome)(error)) throw error;
          const adopted = await opts.adopt(value, this.dirty);
          if ("final" in adopted) {
            this.ended = true;
            this.saved = opts.toValue(adopted.final);
            this.patch({ row: adopted.final, status: "stopped", error: null });
            opts.onFinal?.(adopted.final);
            throw new Halt();
          }
          return { row: adopted.row, merged: true };
        }
      } catch (error) {
        if (error instanceof Halt || attempt >= retries || !isRetryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, (opts.retryDelayMs ?? 500) * 2 ** attempt));
        if (!this.active()) throw new Halt();
      }
    }
  }
}
