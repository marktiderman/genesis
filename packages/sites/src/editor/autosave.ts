/**
 * Autosave with compare-and-swap: a document is saved a moment after the
 * last change, naming the revision it started from. When someone else saved
 * first the store answers with their document, and the autosaver stops and
 * waits: the person chooses to load theirs (`reload`) or keep their own
 * (`overwrite`). Nothing is dropped on the way:
 *
 * - a change made while a save is in flight is saved right after it, on the
 *   new revision;
 * - during a conflict, edits keep collecting and are what `overwrite` saves;
 * - a failed save (offline, a server error) keeps the change and retries
 *   with backoff, and on the next change;
 * - `flush()` saves now and resolves once nothing is waiting (page switch,
 *   publish), or rejects when it can't;
 * - `pause()` holds every save (while a publish runs) and `resume()` saves
 *   what collected meanwhile, after `rebase` has adopted the new revision.
 *
 * Pure TypeScript with injectable timers, so it is tested without a DOM.
 */
import { isConflict, type SaveResult } from "../core/store";
import { stableHash } from "../core/theme";

export type AutosaveStatus = "saved" | "pending" | "saving" | "conflict" | "error";

export interface AutosaveState<T> {
  status: AutosaveStatus;
  /** The revision the next save names. */
  rev: number;
  /** When status is `conflict`: the store's document and revision. */
  conflict: { doc: T; rev: number } | null;
  error: Error | null;
  /** When the last save landed. */
  savedAt: Date | null;
}

export interface AutosaverOptions<T> {
  rev: number;
  save: (rev: number, doc: T) => Promise<SaveResult<T>>;
  /** Wait this long after the last change (default 800 ms). */
  delay?: number;
  /** Retry a failed save after this long, doubling up to a minute (default 2 s). */
  retryDelay?: number;
  onState?: (state: AutosaveState<T>) => void;
  /** Two documents are the same save (default: the same content, in any key order). */
  equals?: (a: T, b: T) => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => Date;
}

/** Thrown by `flush` when the document can't be saved yet (a conflict, or a failed save). */
export class AutosaveBlockedError extends Error {
  constructor(readonly status: AutosaveStatus, message: string) {
    super(message);
    this.name = "AutosaveBlockedError";
  }
}

/**
 * One document's autosave.
 *
 * @stability Beta
 */
export class Autosaver<T> {
  private state: AutosaveState<T>;
  /** The newest document not yet saved, or null. */
  private pending: T | null = null;
  /** The last document the store accepted (or loaded). */
  private saved: T | null = null;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private retries = 0;
  private waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private disposed = false;
  private paused = false;
  private readonly opts: Required<Pick<AutosaverOptions<T>, "delay" | "retryDelay" | "equals" | "setTimer" | "clearTimer" | "now">> & AutosaverOptions<T>;

  constructor(options: AutosaverOptions<T>, initial?: T) {
    this.opts = {
      delay: 800,
      retryDelay: 2000,
      equals: (a, b) => stableHash(a) === stableHash(b),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => new Date(),
      ...options,
    };
    this.saved = initial ?? null;
    this.state = { status: "saved", rev: options.rev, conflict: null, error: null, savedAt: null };
  }

  get current(): AutosaveState<T> {
    return this.state;
  }

  /** Is anything not yet in the store (pending, saving, a conflict or a failed save)? */
  get dirty(): boolean {
    return this.pending !== null || this.inFlight !== null || this.state.status === "conflict" || this.state.status === "error";
  }

  /** The document as the person has it: unsaved changes, or the last save. */
  get latest(): T | null {
    return this.pending ?? this.saved;
  }

  private set(patch: Partial<AutosaveState<T>>) {
    this.state = { ...this.state, ...patch };
    this.opts.onState?.(this.state);
  }

  /** A change: saved after the delay, unless another change comes first. */
  update(doc: T): void {
    if (this.disposed) return;
    if (this.pending === null && this.saved !== null && this.opts.equals(doc, this.saved) && !this.inFlight) return;
    this.pending = doc;
    if (this.state.status === "conflict") return; // Kept for `overwrite`; nothing is saved until the person decides.
    if (this.state.status !== "saving") this.set({ status: "pending" });
    if (this.paused) return; // Saved on `resume`.
    this.schedule(this.opts.delay);
  }

  private schedule(ms: number) {
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async run(): Promise<void> {
    if (this.inFlight) return this.inFlight; // The in-flight save picks the pending document up when it lands.
    if (this.paused) return; // `resume` runs it, and `flush`'s waiters wait for that.
    if (this.pending === null || this.state.status === "conflict" || this.disposed) {
      this.settle();
      return;
    }
    const doc = this.pending;
    const rev = this.state.rev;
    this.pending = null;
    this.set({ status: "saving", error: null });
    this.inFlight = (async () => {
      try {
        const result = await this.opts.save(rev, doc);
        if (isConflict(result)) {
          // Theirs is in the store; ours stays the person's, unsaved.
          this.pending = this.pending ?? doc;
          this.set({ status: "conflict", conflict: { doc: result.conflict, rev: result.rev } });
          return;
        }
        this.saved = doc;
        this.retries = 0;
        this.set({ rev: result.rev, savedAt: this.opts.now(), status: this.pending !== null ? "pending" : "saved" });
      } catch (err) {
        this.pending = this.pending ?? doc;
        const delay = Math.min(60_000, this.opts.retryDelay * 2 ** this.retries++);
        this.set({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
        if (!this.disposed) this.schedule(delay);
      } finally {
        this.inFlight = null;
      }
    })();
    await this.inFlight;
    if (this.pending !== null && this.state.status === "pending") return this.run();
    this.settle();
  }

  private settle() {
    if (this.dirty && this.state.status !== "conflict" && this.state.status !== "error") return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      if (this.state.status === "conflict") w.reject(new AutosaveBlockedError("conflict", "Someone else saved this first. Load their version or keep yours before going on."));
      else if (this.state.status === "error") w.reject(new AutosaveBlockedError("error", `The last change couldn't be saved: ${this.state.error?.message ?? "unknown error"}`));
      else w.resolve();
    }
  }

  /** Save now; resolves when nothing is waiting, rejects on a conflict or a failed save. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.opts.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return Promise.resolve();
    if (this.state.status === "conflict") return Promise.reject(new AutosaveBlockedError("conflict", "Someone else saved this first. Load their version or keep yours before going on."));
    const done = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    if (this.state.status === "error") this.set({ status: "pending" });
    void this.run();
    return done;
  }

  /** Conflict: take the store's document. Returns it; unsaved changes are discarded. */
  reload(): T | null {
    const conflict = this.state.conflict;
    if (!conflict) return null;
    this.pending = null;
    this.saved = conflict.doc;
    this.set({ status: "saved", rev: conflict.rev, conflict: null, error: null });
    this.settle();
    return conflict.doc;
  }

  /** Conflict: save this person's document over the store's. */
  overwrite(): Promise<void> {
    const conflict = this.state.conflict;
    if (!conflict) return Promise.resolve();
    this.pending = this.pending ?? this.saved;
    this.set({ status: "pending", rev: conflict.rev, conflict: null });
    return this.flush();
  }

  /**
   * The store moved on without a conflict (a page move bumped its revision,
   * a publish migrated it): adopt its revision. `doc` replaces the saved
   * copy when given; unsaved changes are kept and saved on the new revision.
   */
  rebase(rev: number, doc?: T): void {
    if (doc !== undefined) this.saved = doc;
    this.set({ rev });
  }

  /** Is saving held (`pause`)? */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Hold every save, for as long as the store must not change under the
   * caller (a publish). A save already in flight lands; changes keep
   * collecting and are saved on `resume`.
   */
  pause(): void {
    this.paused = true;
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
  }

  /** Save again: what collected while paused is saved now, on the current revision. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.disposed) return;
    if (this.pending !== null && this.state.status !== "conflict") this.schedule(0);
    else this.settle();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
  }
}
