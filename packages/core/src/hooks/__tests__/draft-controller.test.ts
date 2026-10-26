import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftController, isNetworkFailure, type DraftOptions } from "../draft-controller";
import { DataWriteError } from "../../schema/write-outcome";

type V = Record<string, unknown>;
type Row = { id: string; answers: V; status: string };

/** A store the draft writes to, recording each call; `gate` holds writes until released. */
function store() {
  const calls: string[] = [];
  let next = 1;
  let gate: Promise<void> | null = null;
  return {
    calls,
    hold() {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    create: vi.fn(async (answers: V, _hints?: { keepalive: boolean }): Promise<Row> => {
      calls.push(`create ${JSON.stringify(answers)}`);
      if (gate) await gate;
      return { id: `r${next++}`, answers, status: "draft" };
    }),
    update: vi.fn(async (row: Row, answers: V, _hints?: { keepalive: boolean }): Promise<Row> => {
      calls.push(`update ${row.id} ${JSON.stringify(answers)}`);
      if (gate) await gate;
      return { ...row, answers };
    }),
  };
}

function draft(over: Partial<DraftOptions<V, Row>> = {}, s = store()) {
  let options: DraftOptions<V, Row> = {
    seed: { row: null, value: {} },
    create: s.create,
    update: s.update,
    toValue: (row) => row.answers,
    delayMs: 800,
    ...over,
  };
  const d = new DraftController<V, Row>(() => options);
  return {
    d,
    s,
    setOptions(change: Partial<DraftOptions<V, Row>>) {
      options = { ...options, ...change };
    },
  };
}

/** Run timers and the promise chain until settled. */
async function settle(ms = 1000) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DraftController: saving", () => {
  it("saves once, a moment after the last change, adding then changing the row", async () => {
    const { d, s } = draft();
    d.set({ a: "h" });
    await settle(400);
    d.set({ a: "hi" });
    await settle(400);
    expect(s.calls).toEqual([]);
    await settle(400);
    expect(s.calls).toEqual(['create {"a":"hi"}']);
    expect(d.getState()).toMatchObject({ status: "saved", row: { id: "r1" } });
    d.set({ a: "hi!" });
    await settle();
    expect(s.calls).toEqual(['create {"a":"hi"}', 'update r1 {"a":"hi!"}']);
  });

  it("keeps one write in flight, and saves what was typed meanwhile after it", async () => {
    const { d, s } = draft();
    const release = s.hold();
    d.set({ a: "1" });
    await settle();
    d.set({ a: "12" });
    await settle();
    void d.flush();
    await settle();
    expect(s.calls).toEqual(['create {"a":"1"}']);
    release();
    await settle();
    // One create, then an update with the latest value: never two creates.
    expect(s.calls).toEqual(['create {"a":"1"}', 'update r1 {"a":"12"}']);
  });

  it("adds no row for an empty value, and writes nothing when unchanged", async () => {
    const { d, s } = draft();
    d.set({ a: "   ", b: [], c: null });
    await settle();
    expect(s.calls).toEqual([]);
    const r9: Row = { id: "r9", answers: { a: "x" }, status: "draft" };
    const loaded = draft({ seed: { row: r9, value: r9.answers } });
    loaded.d.set({ a: "x" });
    await loaded.d.flush();
    expect(loaded.s.calls).toEqual([]);
    // Clearing a saved row is a change, and is saved.
    loaded.d.set({ a: "" });
    await settle();
    expect(loaded.s.calls).toEqual(['update r9 {"a":""}']);
  });

  it("calls onSaved with each saved row, for the app's cache", async () => {
    const onSaved = vi.fn();
    const { d } = draft({ onSaved });
    d.set({ a: "x" });
    await settle();
    expect(onSaved).toHaveBeenCalledWith({ id: "r1", answers: { a: "x" }, status: "draft" });
  });
});

describe("DraftController: a row another tab started", () => {
  const duplicate = new DataWriteError("duplicate", "Already there.", { code: "23505" });

  it("merges into it, keeping only the fields changed here, then saves the merge", async () => {
    const s = store();
    s.create.mockRejectedValueOnce(duplicate);
    const theirs: Row = { id: "t1", answers: { a: "theirs", b: "theirs" }, status: "draft" };
    const adopt = vi.fn(async (value: V, dirty: ReadonlySet<string>) => {
      const answers = { ...theirs.answers };
      for (const k of dirty) answers[k] = value[k];
      return { row: { ...theirs, answers } };
    });
    const { d } = draft({ adopt, seed: { row: null, value: { a: "", b: "" } } }, s);
    d.set({ a: "", b: "mine" });
    await settle();
    expect([...adopt.mock.calls[0]![1]]).toEqual(["b"]);
    expect(d.getState()).toMatchObject({ row: { id: "t1" }, value: { a: "theirs", b: "mine" }, key: 1 });
  });

  it("stops when it was already finished elsewhere", async () => {
    const s = store();
    s.create.mockRejectedValueOnce(duplicate);
    const onFinal = vi.fn();
    const sent: Row = { id: "t1", answers: { a: "sent" }, status: "sent" };
    const { d } = draft({ adopt: async () => ({ final: sent }), onFinal }, s);
    d.set({ a: "x" });
    await settle();
    expect(onFinal).toHaveBeenCalledWith(sent);
    expect(d.getState().status).toBe("stopped");
    d.set({ a: "y" });
    await settle();
    expect(s.update).not.toHaveBeenCalled();
  });

  it("treats a duplicate as an error without adopt", async () => {
    const s = store();
    s.create.mockRejectedValueOnce(duplicate);
    const { d } = draft({}, s);
    d.set({ a: "x" });
    await settle();
    expect(d.getState()).toMatchObject({ status: "error", error: "Already there." });
  });
});

describe("DraftController: failures", () => {
  it("retries network failures with backoff, never refusals", async () => {
    const s = store();
    s.create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { d } = draft({}, s);
    d.set({ a: "x" });
    await settle(800);
    expect(s.create).toHaveBeenCalledTimes(1);
    await settle(500);
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(d.getState().status).toBe("saved");

    const refused = store();
    refused.create.mockRejectedValue(new DataWriteError("forbidden", "You can't change this."));
    const r = draft({}, refused);
    r.d.set({ a: "x" });
    await settle(5000);
    expect(refused.create).toHaveBeenCalledTimes(1);
    expect(r.d.getState()).toMatchObject({ status: "error", error: "You can't change this." });
  });

  it("tells network failures from refusals", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new DataWriteError("error", "x"))).toBe(true);
    expect(isNetworkFailure(new DataWriteError("error", "x", { code: "XX000" }))).toBe(false);
    expect(isNetworkFailure(new DataWriteError("gone", "x"))).toBe(false);
  });
});

describe("DraftController: revisions", () => {
  const sent: Row = { id: "r1", answers: { a: "server" }, status: "sent" };

  it("drops edits not yet saved for the server's, and says so", async () => {
    const { d, s } = draft();
    d.set({ a: "typed" });
    d.reseed({ row: sent, value: sent.answers }, "r1:sent");
    expect(d.getState()).toMatchObject({ value: { a: "server" }, discarded: true, key: 1 });
    await settle();
    expect(s.calls).toEqual([]);
  });

  it("keeps a merge from onRevision, and saves it", async () => {
    const { d, s } = draft({ onRevision: (pending, next) => ({ ...next.value, b: pending.b }) });
    d.set({ b: "mine" });
    d.reseed({ row: { ...sent, status: "returned" }, value: sent.answers }, "r1:returned");
    expect(d.getState()).toMatchObject({ value: { a: "server", b: "mine" }, discarded: false });
    await settle();
    expect(s.calls).toEqual(['update r1 {"a":"server","b":"mine"}']);
  });

  it("ignores a seed with the same revision", () => {
    const { d } = draft({ revision: "a" });
    d.set({ a: "typed" });
    d.reseed({ row: sent, value: sent.answers }, "a");
    expect(d.getState().value).toEqual({ a: "typed" });
  });
});

describe("DraftController: flush, commit and enabled", () => {
  it("flushes now, without waiting for the delay", async () => {
    const { d, s } = draft();
    d.set({ a: "x" });
    expect(d.pending()).toBe(true);
    await d.flush({ keepalive: true });
    expect(s.calls).toEqual(['create {"a":"x"}']);
    expect(d.pending()).toBe(false);
  });

  it("passes keepalive to the update made as the page closes", async () => {
    const r9: Row = { id: "r9", answers: {}, status: "draft" };
    const loaded = draft({ seed: { row: r9, value: {} } });
    loaded.d.set({ a: "x" });
    await loaded.d.flush({ keepalive: true });
    expect(loaded.s.update.mock.calls[0]![2]).toEqual({ keepalive: true });
  });

  it("commits after the write in flight, then saves nothing more", async () => {
    const { d, s } = draft();
    const release = s.hold();
    d.set({ a: "x" });
    await settle();
    const send = vi.fn(async (row: Row | null, value: V) => ({ id: row!.id, answers: value, status: "sent" }));
    const committed = d.commit(send);
    release();
    await expect(committed).resolves.toMatchObject({ id: "r1", status: "sent" });
    expect(send.mock.calls[0]![0]).toMatchObject({ id: "r1" });
    expect(d.getState().status).toBe("stopped");
    d.set({ a: "after" });
    await settle();
    expect(s.update).not.toHaveBeenCalled();
  });

  it("keeps autosaving when a commit fails", async () => {
    const { d, s } = draft();
    await expect(d.commit(async () => Promise.reject(new Error("Answer a question first.")))).rejects.toThrow(
      "Answer a question first.",
    );
    d.set({ a: "x" });
    await settle();
    expect(s.calls).toEqual(['create {"a":"x"}']);
  });

  it("writes nothing while disabled, and saves what's pending once enabled", async () => {
    const h = draft({ enabled: false });
    h.d.sync();
    h.d.set({ a: "x" });
    await settle();
    expect(h.s.calls).toEqual([]);
    expect(h.d.pending()).toBe(false);
    expect(h.d.getState().status).toBe("stopped");
    h.setOptions({ enabled: true });
    h.d.sync();
    await settle();
    expect(h.s.calls).toEqual(['create {"a":"x"}']);
  });
});

describe("DraftController: review follow-ups", () => {
  it("doesn't save again forever when the store tidies the value", async () => {
    const s = store();
    // The store trims text, so what comes back never equals what was sent.
    s.create.mockImplementation(async (answers: V) => ({ id: "r1", answers: { a: String(answers.a).trim() }, status: "draft" }));
    const { d } = draft({}, s);
    d.set({ a: " x " });
    await settle(10_000);
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(s.update).not.toHaveBeenCalled();
    expect(d.pending()).toBe(false);
  });

  it("drops a save that lands after a new revision", async () => {
    const { d, s } = draft();
    const release = s.hold();
    d.set({ a: "typed" });
    await settle();
    const sent: Row = { id: "s1", answers: { a: "server" }, status: "sent" };
    d.reseed({ row: sent, value: sent.answers }, "s1:sent");
    release();
    await settle();
    expect(d.getState()).toMatchObject({ row: { id: "s1" }, value: { a: "server" } });
  });

  it("survives an option that throws, and keeps saving afterwards", async () => {
    let fail = true;
    const { d, s } = draft({
      isEmpty: () => {
        if (fail) throw new Error("boom");
        return false;
      },
    });
    d.set({ a: "x" });
    await settle();
    expect(d.getState().status).toBe("error");
    fail = false;
    d.set({ a: "y" });
    await settle();
    expect(s.calls).toEqual(['create {"a":"y"}']);
  });

  it("saves what's pending after a commit fails", async () => {
    const { d, s } = draft();
    d.set({ a: "x" });
    await expect(d.commit(async () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await settle();
    expect(s.calls).toEqual(['create {"a":"x"}']);
  });
});

describe("DraftController: Gate's review", () => {
  it("never writes one row's edits into a row a revision brought in during a retry's wait", async () => {
    const s = store();
    const a: Row = { id: "A", answers: {}, status: "draft" };
    s.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { d } = draft({ seed: { row: a, value: {} }, revision: "A" }, s);
    d.set({ x: "for A" });
    await settle(800); // the first try fails; the retry waits 500 ms
    const b: Row = { id: "B", answers: { x: "B's" }, status: "draft" };
    d.reseed({ row: b, value: b.answers }, "B");
    await settle(5000);
    expect(s.update.mock.calls.map(([row]) => row.id)).not.toContain("B");
    expect(d.getState()).toMatchObject({ row: { id: "B" }, value: { x: "B's" } });
  });

  it("keeps edits typed while the first save ran when the app's refetch brings that row back", async () => {
    const { d, s } = draft({ revision: "none" });
    const release = s.hold();
    d.set({ a: "first" });
    await settle(800); // create in flight
    d.set({ a: "first, then more" });
    // The app refetched and found the new row: its revision changed.
    d.reseed({ row: { id: "r1", answers: { a: "first" }, status: "draft" }, value: { a: "first" } }, "r1:draft");
    expect(d.getState()).toMatchObject({ value: { a: "first, then more" }, key: 0, discarded: false });
    release();
    await settle();
    expect(s.calls).toEqual(['create {"a":"first"}', 'update r1 {"a":"first, then more"}']);
  });

  it("saves pending edits to their own row before moving to another", async () => {
    const a: Row = { id: "A", answers: {}, status: "draft" };
    const { d, s } = draft({ seed: { row: a, value: {} }, revision: "A" });
    d.set({ x: "for A" });
    const b: Row = { id: "B", answers: { x: "B's" }, status: "draft" };
    d.reseed({ row: b, value: b.answers }, "B");
    await settle();
    expect(s.calls).toEqual(['update A {"x":"for A"}']);
    expect(d.getState()).toMatchObject({ row: { id: "B" }, value: { x: "B's" }, discarded: false });
  });

  it("passes keepalive to the first write too", async () => {
    const { d, s } = draft();
    d.set({ a: "x" });
    await d.flush({ keepalive: true });
    expect(s.create.mock.calls[0]![1]).toEqual({ keepalive: true });
  });
});

