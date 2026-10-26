import { describe, expect, it, vi } from "vitest";
import {
  VoteRefusedError,
  buildBoard,
  createProductWhatsNew,
  createVoteQueue,
  isPermanentVoteError,
  memoryProductSource,
  memoryVoteQueueStore,
  roadmapFromBoard,
  storageVoteQueueStore,
  whatsNewKey,
  type CatalogFeature,
  type ProductIdea,
} from "../index";

const idea = (id: string, extra: Partial<ProductIdea> = {}): ProductIdea => ({ id, title: `idea ${id}`, votes: 0, voted: false, status: "open", ...extra });

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn(async (k: string) => data.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void data.set(k, v)),
  };
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe("vote queue (@feat:product-insights)", () => {
  it("lays a queued vote over the source's ideas, saves it, and sends it on flush", async () => {
    const source = memoryProductSource({ ideas: [idea("a", { votes: 2 })] });
    const store = memoryVoteQueueStore();
    const queue = createVoteQueue({ source, store });
    const [a] = await source.ideas();
    await queue.toggle(a!);
    expect(queue.apply([a!])[0]).toMatchObject({ voted: true, votes: 3 });
    expect(await store.load()).toEqual([{ ideaId: "a", voted: true, base: false }]);
    const result = await queue.flush();
    expect(result).toEqual({ sent: [{ ideaId: "a", voted: true }], refused: [], failed: [] });
    expect(queue.pending()).toEqual([]);
    expect(await store.load()).toEqual([]);
    expect((await source.ideas())[0]).toMatchObject({ voted: true, votes: 3 });
  });

  it("collapses a toggle back before it is sent: nothing reaches the source", async () => {
    const vote = vi.fn(async () => {});
    const unvote = vi.fn(async () => {});
    const queue = createVoteQueue({ source: { vote, unvote } });
    const a = idea("a");
    await queue.toggle(a);
    await queue.toggle(a);
    expect(queue.pending()).toEqual([]);
    await queue.flush();
    expect(vote).not.toHaveBeenCalled();
    expect(unvote).not.toHaveBeenCalled();
  });

  it("keeps a vote that couldn't be sent (offline) and sends it on the next flush", async () => {
    let online = false;
    const vote = vi.fn(async () => {
      if (!online) throw new Error("Network request failed");
    });
    const onError = vi.fn();
    const queue = createVoteQueue({ source: { vote, unvote: vi.fn() }, onError });
    await queue.toggle(idea("a"));
    expect((await queue.flush()).failed).toEqual(["a"]);
    expect(queue.pending()).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "a");
    online = true;
    expect((await queue.flush()).sent).toEqual([{ ideaId: "a", voted: true }]);
    expect(queue.pending()).toEqual([]);
  });

  it("drops a vote the source refuses for good, so the board shows the source's state again", async () => {
    const queue = createVoteQueue({ source: { vote: async () => Promise.reject(new VoteRefusedError()), unvote: vi.fn() } });
    const a = idea("a", { votes: 1 });
    await queue.toggle(a);
    const result = await queue.flush();
    expect(result.refused).toEqual(["a"]);
    expect(queue.pending()).toEqual([]);
    expect(queue.apply([a])[0]).toEqual(a);
  });

  it("reads 4xx as permanent, but not 408, 429 or a plain error", () => {
    expect(isPermanentVoteError({ status: 403 })).toBe(true);
    expect(isPermanentVoteError({ status: 429 })).toBe(false);
    expect(isPermanentVoteError({ status: 408 })).toBe(false);
    expect(isPermanentVoteError({ status: 503 })).toBe(false);
    expect(isPermanentVoteError(new Error("x"))).toBe(false);
    expect(isPermanentVoteError(new VoteRefusedError())).toBe(true);
  });

  it("restores votes saved before a relaunch and sends them", async () => {
    const vote = vi.fn(async () => {});
    const store = memoryVoteQueueStore([{ ideaId: "a", voted: true, base: false }]);
    const queue = createVoteQueue({ source: { vote, unvote: vi.fn() }, store });
    await queue.load();
    expect(queue.apply([idea("a")])[0]!.voted).toBe(true);
    await queue.flush();
    expect(vote).toHaveBeenCalledWith("a");
  });

  it("a toggle back while the vote is on its way is sent after it, as an unvote", async () => {
    let release!: () => void;
    const vote = vi.fn(() => new Promise<void>((r) => (release = r)));
    const unvote = vi.fn(async () => {});
    const queue = createVoteQueue({ source: { vote, unvote } });
    const a = idea("a");
    await queue.toggle(a);
    const first = queue.flush();
    await flushMicrotasks();
    await queue.toggle(a); // back to not voted, while the vote is in flight
    const second = queue.flush();
    release();
    await first;
    await second;
    expect(vote).toHaveBeenCalledTimes(1);
    expect(unvote).toHaveBeenCalledWith("a");
    expect(queue.pending()).toEqual([]);
  });

  it("a queue in storage survives a value it can't read", async () => {
    const storage = memoryStorage({ "genesis:product:votes": "{not json" });
    const queue = createVoteQueue({ source: { vote: vi.fn(), unvote: vi.fn() }, store: storageVoteQueueStore(storage) });
    await queue.load();
    expect(queue.pending()).toEqual([]);
    await queue.toggle(idea("a"));
    expect(JSON.parse(storage.data.get("genesis:product:votes")!)).toEqual([{ ideaId: "a", voted: true, base: false }]);
  });
});

describe("roadmap rows (@feat:product-roadmap)", () => {
  it("come from the board's horizons, internal features left out", () => {
    const f = (id: string, extra: Partial<CatalogFeature>): CatalogFeature => ({ id, name: id, summary: `${id} summary`, status: "planned", owner: "o", ...extra });
    const board = buildBoard([f("a", { horizon: "now", tagline: "A!" }), f("b", { horizon: "later" }), f("c", { horizon: "next", visibility: "internal" })], []);
    expect(roadmapFromBoard(board)).toEqual([
      { id: "a", title: "a", summary: "A!", horizon: "now", status: "planned", votes: 0 },
      { id: "b", title: "b", summary: "b summary", horizon: "later", status: "planned", votes: 0 },
    ]);
  });
});

describe("what's new (@feat:product-releases)", () => {
  it("keys on the app version plus the over-the-air update, or embedded", () => {
    const application = { nativeApplicationVersion: "1.4.0" };
    expect(whatsNewKey({ application, updates: { isEnabled: true, isEmbeddedLaunch: false, updateId: "u1" } })).toBe("1.4.0+u1");
    expect(whatsNewKey({ application, updates: { isEnabled: true, isEmbeddedLaunch: true, updateId: "u0" } })).toBe("1.4.0+embedded");
    expect(whatsNewKey({ application, updates: { isEnabled: false, isEmbeddedLaunch: false, updateId: null } })).toBe("1.4.0+embedded");
    expect(whatsNewKey({ application })).toBe("1.4.0+embedded");
    expect(whatsNewKey({ application: { nativeApplicationVersion: null } })).toBeNull();
  });

  it("a first install remembers the key and shows nothing, without fetching", async () => {
    const storage = memoryStorage();
    const whatsNew = vi.fn(async () => [{ id: "n", title: "New" }]);
    const store = createProductWhatsNew({ source: { whatsNew }, key: "1.4.0+u1", storage });
    await store.load();
    await flushMicrotasks();
    expect(store.getState().status).toBe("hidden");
    expect(whatsNew).not.toHaveBeenCalled();
    expect(storage.data.get("genesis:product:whats-new")).toBe("1.4.0+u1");
  });

  it("shows once per key: a new update fetches its notes then, and closing remembers it", async () => {
    const storage = memoryStorage({ "genesis:product:whats-new": "1.4.0+u1" });
    const whatsNew = vi.fn(async (key: string) => [{ id: "n", title: `New in ${key}` }]);
    const store = createProductWhatsNew({ source: { whatsNew }, key: "1.4.0+u2", storage });
    await store.load();
    expect(whatsNew).toHaveBeenCalledWith("1.4.0+u2");
    expect(store.getState()).toEqual({ status: "showing", notes: [{ id: "n", title: "New in 1.4.0+u2" }] });
    store.dismiss();
    await flushMicrotasks();
    expect(store.getState().status).toBe("hidden");
    expect(storage.data.get("genesis:product:whats-new")).toBe("1.4.0+u2");

    const again = createProductWhatsNew({ source: { whatsNew }, key: "1.4.0+u2", storage });
    await again.load();
    expect(again.getState().status).toBe("hidden");
    expect(whatsNew).toHaveBeenCalledTimes(1);
  });

  it("no notes for a key: remembered without showing; a failed fetch tries again next launch", async () => {
    const storage = memoryStorage({ "genesis:product:whats-new": "1.4.0+u1" });
    const empty = createProductWhatsNew({ source: { whatsNew: async () => [] }, key: "1.4.0+u2", storage });
    await empty.load();
    await flushMicrotasks();
    expect(empty.getState().status).toBe("hidden");
    expect(storage.data.get("genesis:product:whats-new")).toBe("1.4.0+u2");

    const onError = vi.fn();
    const failing = createProductWhatsNew({ source: { whatsNew: async () => Promise.reject(new Error("offline")) }, key: "1.4.0+u3", storage, onError });
    await failing.load();
    await flushMicrotasks();
    expect(failing.getState().status).toBe("hidden");
    expect(onError).toHaveBeenCalled();
    expect(storage.data.get("genesis:product:whats-new")).toBe("1.4.0+u2");
  });

  it("storage that can't be read shows nothing, rather than on every launch", async () => {
    const whatsNew = vi.fn(async () => [{ id: "n", title: "New" }]);
    const store = createProductWhatsNew({ source: { whatsNew }, key: "1+u", storage: { getItem: () => Promise.reject(new Error("x")), setItem: vi.fn() } });
    await store.load();
    expect(store.getState().status).toBe("hidden");
    expect(whatsNew).not.toHaveBeenCalled();
  });

  it("opens by hand, fetching the notes then", async () => {
    const whatsNew = vi.fn(async () => [{ id: "n", title: "New" }]);
    const store = createProductWhatsNew({ source: { whatsNew }, key: "1+u", storage: memoryStorage({ "genesis:product:whats-new": "1+u" }) });
    await store.load();
    expect(whatsNew).not.toHaveBeenCalled();
    await store.open();
    expect(store.getState().status).toBe("showing");
  });
});

describe("vote queue review fixes (@feat:product-insights)", () => {
  it("never sends a vote toggled back while an earlier one was on its way", async () => {
    let release!: () => void;
    const vote = vi.fn((id: string) => (id === "a" ? new Promise<void>((r) => (release = r)) : Promise.resolve()));
    const queue = createVoteQueue({ source: { vote, unvote: vi.fn(async () => {}) } });
    await queue.toggle(idea("a"));
    await queue.toggle(idea("b"));
    const flushing = queue.flush();
    await flushMicrotasks();
    await queue.toggle(idea("b")); // back to not voted before b's turn: nothing to send for b
    release();
    await flushing;
    expect(vote.mock.calls.map(([id]) => id)).toEqual(["a"]);
    expect(queue.pending()).toEqual([]);
  });
});
