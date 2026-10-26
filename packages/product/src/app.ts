// @feat:product-roadmap @feat:product-insights
/**
 * What an app shows people about the product: the idea board (with votes), the
 * Now / Next / Later roadmap and "what's new". Data comes through a
 * `ProductSource` the app passes in (a Supabase source comes later; the
 * memory source here is for tests and demos), and votes go through a queue
 * that survives being offline. No React and no I/O: `/native` draws it.
 */
import type { FeatureHorizon, FeatureStatus } from "@marktiderman/genesis-features";
import type { Board } from "./board";

/** Where an idea stands. @stability Experimental */
export type ProductIdeaStatus = "open" | "planned" | "building" | "shipped" | "declined";

/** An idea on the board, as the signed-in person sees it. @stability Experimental */
export interface ProductIdea {
  id: string;
  title: string;
  body?: string;
  /** The FeatureId it was linked to, once triaged. */
  featureId?: string;
  /** People who voted for it, the signed-in person included. */
  votes: number;
  /** The signed-in person voted for it. */
  voted: boolean;
  status: ProductIdeaStatus;
}

/** One row of the roadmap. @stability Experimental */
export interface RoadmapItem {
  /** The FeatureId. */
  id: string;
  title: string;
  summary?: string;
  horizon: FeatureHorizon;
  status?: FeatureStatus;
  /** Demand, when the source knows it. */
  votes?: number;
}

/** One entry of "what's new". @stability Experimental */
export interface WhatsNewNote {
  id: string;
  title: string;
  body?: string;
  /** An app path to open for more. */
  url?: string;
}

/**
 * Where the screens read from and vote through. Injected, so the screens
 * don't care whether it is memory, Supabase or something else.
 *
 * `vote` and `unvote` are idempotent (voting twice is one vote). A refusal
 * that retrying won't fix (not allowed, the idea is gone) throws an error with
 * `permanent: true` (see {@link VoteRefusedError}) or an HTTP 4xx `status`;
 * anything else is retried.
 *
 * @stability Experimental
 */
export interface ProductSource {
  ideas(): Promise<ProductIdea[]>;
  vote(ideaId: string): Promise<void>;
  unvote(ideaId: string): Promise<void>;
  roadmap(): Promise<RoadmapItem[]>;
  /** The notes for one app version plus over-the-air update (see `whatsNewKey`), newest first. */
  whatsNew(key: string): Promise<WhatsNewNote[]>;
}

/** A vote the source refused for good: the queue drops it and the board shows the source's state again. @stability Experimental */
export class VoteRefusedError extends Error {
  readonly permanent = true;
  constructor(message = "This vote was refused.") {
    super(message);
    this.name = "VoteRefusedError";
  }
}

/** True for an error retrying won't fix: `permanent: true`, or an HTTP 4xx other than 408 and 429. @stability Experimental */
export function isPermanentVoteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { permanent?: unknown; status?: unknown };
  if (e.permanent === true) return true;
  return typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
}

/** The board's Now / Next / Later columns as roadmap rows, internal features left out. @stability Experimental */
export function roadmapFromBoard(board: Pick<Board, "now" | "next" | "later">): RoadmapItem[] {
  return (["now", "next", "later"] as const).flatMap((horizon) =>
    board[horizon]
      .filter((item) => item.feature.visibility !== "internal")
      .map((item) => ({
        id: item.feature.id,
        title: item.feature.name,
        summary: item.feature.tagline ?? item.feature.summary,
        horizon,
        status: item.feature.status,
        votes: item.demand,
      })),
  );
}

/** What {@link memoryProductSource} starts with. @stability Experimental */
export interface MemoryProductSeed {
  ideas?: readonly ProductIdea[];
  roadmap?: readonly RoadmapItem[];
  /** Notes by `whatsNewKey`; `"*"` answers every key. */
  whatsNew?: Readonly<Record<string, readonly WhatsNewNote[]>>;
}

/** A source in memory, for tests and demos: votes change its own copy. @stability Experimental */
export function memoryProductSource(seed: MemoryProductSeed = {}): ProductSource {
  let ideas = (seed.ideas ?? []).map((i) => ({ ...i }));
  const set = (ideaId: string, voted: boolean) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) throw new VoteRefusedError(`No idea ${ideaId}.`);
    if (idea.voted === voted) return;
    ideas = ideas.map((i) => (i.id === ideaId ? { ...i, voted, votes: Math.max(0, i.votes + (voted ? 1 : -1)) } : i));
  };
  return {
    ideas: async () => ideas.map((i) => ({ ...i })).sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title)),
    vote: async (id) => set(id, true),
    unvote: async (id) => set(id, false),
    roadmap: async () => (seed.roadmap ?? []).map((r) => ({ ...r })),
    whatsNew: async (key) => [...(seed.whatsNew?.[key] ?? seed.whatsNew?.["*"] ?? [])],
  };
}

/** A vote waiting to reach the source: the person wants `voted`; `base` is what the source has. @stability Experimental */
export interface QueuedVote {
  ideaId: string;
  voted: boolean;
  base: boolean;
}

/** Where the queue is kept between launches (AsyncStorage, MMKV). @stability Experimental */
export interface VoteQueueStore {
  load(): Promise<QueuedVote[]>;
  save(queue: QueuedVote[]): Promise<void>;
}

/** A queue store in memory (the default: queued votes last as long as the app runs). @stability Experimental */
export function memoryVoteQueueStore(initial: readonly QueuedVote[] = []): VoteQueueStore {
  let saved = initial.map((v) => ({ ...v }));
  return {
    load: async () => saved.map((v) => ({ ...v })),
    save: async (queue) => void (saved = queue.map((v) => ({ ...v }))),
  };
}

/** AsyncStorage's shape (also MMKV's async adapter). @stability Experimental */
export interface ProductStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** A queue store in AsyncStorage, under one key. A value that can't be read counts as empty. @stability Experimental */
export function storageVoteQueueStore(storage: ProductStorageLike, key = "genesis:product:votes"): VoteQueueStore {
  return {
    async load() {
      const raw = JSON.parse((await storage.getItem(key)) ?? "[]") as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (v): v is QueuedVote => !!v && typeof v === "object" && typeof v.ideaId === "string" && typeof v.voted === "boolean" && typeof v.base === "boolean",
      );
    },
    save: (queue) => storage.setItem(key, JSON.stringify(queue)),
  };
}

/** What one {@link VoteQueue.flush} did. @stability Experimental */
export interface VoteFlushResult {
  /** Reached the source, with the vote it now has. */
  sent: { ideaId: string; voted: boolean }[];
  /** Refused for good and dropped: the board shows the source's state again. */
  refused: string[];
  /** Couldn't be sent (offline): kept for the next flush. */
  failed: string[];
}

/** @stability Experimental */
export interface VoteQueue {
  /** Reads the saved queue (votes from before a relaunch). Never rejects; runs once. */
  load(): Promise<void>;
  /** The votes not yet sent. */
  pending(): QueuedVote[];
  /** `ideas` with the person's unsent votes laid over them. */
  apply(ideas: readonly ProductIdea[]): ProductIdea[];
  /**
   * Flips the person's vote on an idea as the source last reported it: queued
   * and saved at once. Toggling back to what the source has cancels the queued
   * vote, so nothing is sent. Resolves once saved, not sent: then `flush()`.
   */
  toggle(idea: ProductIdea): Promise<void>;
  /** Sends what is queued, one at a time. A call while one runs waits for it, then sends what is left. */
  flush(): Promise<VoteFlushResult>;
  /** Called on every change to the queue. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Options for {@link createVoteQueue}. @stability Experimental */
export interface VoteQueueOptions {
  source: Pick<ProductSource, "vote" | "unvote">;
  /** Default {@link memoryVoteQueueStore}. */
  store?: VoteQueueStore;
  /** Every error, from a send (a refusal included) or the store. */
  onError?: (error: unknown, ideaId?: string) => void;
}

/**
 * The offline vote queue, modelled on chat's outbox: a vote shows at once, is
 * saved, and is sent when there is a connection (`flush()`: on start, after
 * each vote and on reconnect). Votes on one idea collapse into the last one,
 * and a toggle back before it is sent sends nothing.
 *
 * @stability Experimental
 */
export function createVoteQueue(options: VoteQueueOptions): VoteQueue {
  const store = options.store ?? memoryVoteQueueStore();
  const queue = new Map<string, QueuedVote>();
  const inFlight = new Set<string>();
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  let running: Promise<VoteFlushResult> | null = null;
  let again = false;

  const report = (error: unknown, ideaId?: string) => {
    try {
      options.onError?.(error, ideaId);
    } catch {
      // a failing reporter never breaks a vote
    }
  };
  const changed = () => {
    for (const l of [...listeners]) l();
  };
  const save = async () => {
    try {
      await store.save([...queue.values()].map((v) => ({ ...v })));
    } catch (error) {
      report(error);
    }
  };

  const sendAll = async (): Promise<VoteFlushResult> => {
    const result: VoteFlushResult = { sent: [], refused: [], failed: [] };
    for (const ideaId of [...queue.keys()]) {
      // Read it again: a vote toggled back while an earlier one was being sent is gone, or changed.
      const entry = queue.get(ideaId);
      if (!entry) continue;
      const sent = { ...entry };
      inFlight.add(ideaId);
      try {
        await (sent.voted ? options.source.vote(sent.ideaId) : options.source.unvote(sent.ideaId));
        const now = queue.get(sent.ideaId);
        // The source now has `sent.voted`; a toggle made meanwhile stays queued only if it differs.
        if (now) {
          if (now.voted === sent.voted) queue.delete(sent.ideaId);
          else now.base = sent.voted;
        }
        result.sent.push({ ideaId: sent.ideaId, voted: sent.voted });
      } catch (error) {
        report(error, sent.ideaId);
        if (isPermanentVoteError(error)) {
          const now = queue.get(sent.ideaId);
          if (now && now.voted === sent.voted) queue.delete(sent.ideaId);
          result.refused.push(sent.ideaId);
        } else result.failed.push(sent.ideaId);
      } finally {
        inFlight.delete(sent.ideaId);
      }
    }
    if (result.sent.length || result.refused.length) {
      await save();
      changed();
    }
    return result;
  };

  const self: VoteQueue = {
    load() {
      loading ??= (async () => {
        try {
          for (const v of await store.load()) if (!queue.has(v.ideaId)) queue.set(v.ideaId, { ...v });
        } catch (error) {
          report(error);
        }
        changed();
      })();
      return loading;
    },
    pending: () => [...queue.values()].map((v) => ({ ...v })),
    apply(ideas) {
      return ideas.map((idea) => {
        const q = queue.get(idea.id);
        if (!q || q.voted === idea.voted) return idea;
        return { ...idea, voted: q.voted, votes: Math.max(0, idea.votes + (q.voted ? 1 : -1)) };
      });
    },
    async toggle(idea) {
      const q = queue.get(idea.id);
      const base = q?.base ?? idea.voted;
      const voted = !(q?.voted ?? idea.voted);
      // Back to what the source has: nothing to send, unless a send for it is on its way.
      if (voted === base && !inFlight.has(idea.id)) queue.delete(idea.id);
      else queue.set(idea.id, { ideaId: idea.id, voted, base });
      changed();
      await save();
    },
    flush() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        await self.load();
        let result = await sendAll();
        while (again) {
          again = false;
          const next = await sendAll();
          result = { sent: [...result.sent, ...next.sent], refused: [...result.refused, ...next.refused], failed: next.failed };
        }
        return result;
      })().finally(() => {
        running = null;
      });
      return running;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return self;
}

/** The shape `whatsNewKey` reads from expo-application (genesis-native's `ApplicationLike`). @stability Experimental */
export interface WhatsNewApplicationLike {
  readonly nativeApplicationVersion: string | null;
}

/** The shape `whatsNewKey` reads from expo-updates (genesis-native's `UpdatesModuleLike`). @stability Experimental */
export interface WhatsNewUpdatesLike {
  readonly isEnabled: boolean;
  readonly updateId: string | null;
  readonly isEmbeddedLaunch: boolean;
}

/**
 * What "what's new" is shown once for: the store version plus the
 * over-the-air update running (`"1.4.0+3f2a…"`), or `"1.4.0+embedded"` for
 * the code that shipped in the binary. `null` without a version: it never shows.
 *
 * @stability Experimental
 */
export function whatsNewKey(input: { application?: WhatsNewApplicationLike | null; updates?: WhatsNewUpdatesLike | null }): string | null {
  const version = input.application?.nativeApplicationVersion;
  if (!version) return null;
  const u = input.updates;
  const update = u && u.isEnabled && !u.isEmbeddedLaunch && u.updateId ? u.updateId : "embedded";
  return `${version}+${update}`;
}

/** @stability Experimental */
export interface ProductWhatsNewState {
  /** `loading`: reading what was seen; `fetching`: the notes are on their way; `showing`: open. */
  status: "loading" | "hidden" | "fetching" | "showing";
  notes: readonly WhatsNewNote[];
}

/** Options for {@link createProductWhatsNew}. @stability Experimental */
export interface ProductWhatsNewOptions {
  source: Pick<ProductSource, "whatsNew">;
  /** `whatsNewKey(...)`. `null`: never shows by itself. */
  key: string | null;
  /** AsyncStorage. Without it nothing shows by itself (rather than on every launch). */
  storage?: ProductStorageLike;
  /** Default `"genesis:product:whats-new"`. */
  storageKey?: string;
  onError?: (error: unknown) => void;
}

/** @stability Experimental */
export interface ProductWhatsNew {
  getState(): ProductWhatsNewState;
  subscribe(listener: () => void): () => void;
  /** Reads the key seen last and, when this one is new, fetches its notes. Never rejects; runs once. */
  load(): Promise<void>;
  /** Opens it by hand (a "What's new" row): fetches the notes for this key. */
  open(): Promise<void>;
  /** Closes it and remembers this key. */
  dismiss(): void;
}

/**
 * "What's new", once per app version plus over-the-air update. A first
 * install remembers the key and shows nothing; a new key fetches its notes
 * then (never bundled) and opens when there are any. No notes for it:
 * remembered, nothing shown. A failed fetch shows nothing and tries again
 * next launch. Storage that can't be read shows nothing.
 *
 * @stability Experimental
 */
export function createProductWhatsNew(options: ProductWhatsNewOptions): ProductWhatsNew {
  const { source, key, storage, storageKey = "genesis:product:whats-new" } = options;
  let state: ProductWhatsNewState = { status: "loading", notes: [] };
  const listeners = new Set<() => void>();
  const set = (next: ProductWhatsNewState) => {
    state = next;
    for (const l of [...listeners]) l();
  };
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // ignore a failing reporter
    }
  };
  const remember = () => {
    if (!storage || !key) return;
    Promise.resolve()
      .then(() => storage.setItem(storageKey, key))
      .catch(report);
  };
  let fetches = 0;
  const fetchNotes = async (rememberWhenEmpty: boolean) => {
    if (!key) return set({ status: "hidden", notes: [] });
    const mine = ++fetches;
    set({ status: "fetching", notes: [] });
    let notes: WhatsNewNote[] = [];
    try {
      notes = await source.whatsNew(key);
      if (!notes.length && rememberWhenEmpty) remember();
    } catch (error) {
      report(error);
    }
    // Closed (or opened again) meanwhile: this answer is stale.
    if (mine !== fetches || state.status !== "fetching") return;
    set(notes.length ? { status: "showing", notes } : { status: "hidden", notes: [] });
  };
  let loading: Promise<void> | null = null;
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load() {
      loading ??= (async () => {
        if (!storage || !key) return set({ status: "hidden", notes: [] });
        let seen: string | null;
        try {
          seen = await storage.getItem(storageKey);
        } catch (error) {
          report(error);
          return set({ status: "hidden", notes: [] });
        }
        if (seen === null) {
          remember();
          return set({ status: "hidden", notes: [] });
        }
        if (seen === key) return set({ status: "hidden", notes: [] });
        await fetchNotes(true);
      })();
      return loading;
    },
    open: () => fetchNotes(false),
    dismiss() {
      fetches++;
      remember();
      set({ status: "hidden", notes: [] });
    },
  };
}
