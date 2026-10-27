// @feat:jobs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createRunner, defaultBackoff, jobOutcome, type JobOutcome, type RunnerJob } from "../runner";

const job = (id: string, extra: Partial<RunnerJob> & { group?: string } = {}) => ({ id, attempt: 1, ...extra });

describe("jobOutcome", () => {
  const now = 1_000_000;
  it("maps results to outcomes", () => {
    expect(jobOutcome({ ok: true }, 1)).toEqual({ status: "sent" });
    expect(jobOutcome({ ok: true, alreadyThere: true }, 1)).toEqual({ status: "sent", alreadyThere: true });
    expect(jobOutcome({ ok: true, notSent: "no_devices" }, 1)).toEqual({ status: "skipped", reason: "no_devices" });
    expect(jobOutcome({ ok: false, retryable: false, error: "bad" }, 1)).toEqual({ status: "failed", error: "bad" });
    expect(jobOutcome({ ok: false, retryable: false, disable: true, status: 410, error: "gone" }, 1)).toEqual({ status: "failed", error: "gone", httpStatus: 410, disable: true });
  });
  it("defers on Retry-After without counting, until maxDeferrals", () => {
    const deferred = jobOutcome({ ok: false, retryable: true, retryAfterSeconds: 30, error: "429" }, 3, { now, deferrals: 2 });
    expect(deferred).toMatchObject({ status: "retry", counted: false, retryAfterSeconds: 30 });
    expect((deferred as Extract<JobOutcome, { status: "retry" }>).retryAt.getTime()).toBe(now + 30_000);
    expect(jobOutcome({ ok: false, retryable: true, retryAfterSeconds: 30, error: "429" }, 3, { now, deferrals: 24 })).toMatchObject({ status: "retry", counted: true });
  });
  it("backs off and gives up after maxAttempts", () => {
    expect(jobOutcome({ ok: false, retryable: true, error: "500" }, 2, { now, backoff: () => 10 })).toMatchObject({ status: "retry", counted: true, retryAfterSeconds: 10 });
    expect(jobOutcome({ ok: false, retryable: true, error: "500" }, 8, { now })).toEqual({ status: "failed", error: "500 (gave up after 8 attempts)" });
  });
  it("jitters the backoff by at most 20%", () => {
    expect(defaultBackoff(1, () => 0)).toBe(240);
    expect(defaultBackoff(1, () => 1)).toBe(360);
    expect(defaultBackoff(20, () => 0.5)).toBe(86_400);
    expect([1, 2].map((a, i) => (defaultBackoff as (a: number, r?: unknown) => number)(a, i)).every((s) => s > 0)).toBe(true);
  });
});

describe("createRunner", () => {
  it("groups, sends, records and reports", async () => {
    const jobs = [job("a", { group: "x" }), job("b", { group: "x" }), job("c", { group: "y" })];
    const send = vi.fn(async (group: readonly (RunnerJob & { group?: string })[]) => group.map((j) => (j.id === "c" ? ("filtered" as const) : { ok: true as const })));
    const recorded: [string, JobOutcome][] = [];
    const runner = createRunner({
      claim: async ({ limit }) => jobs.slice(0, limit),
      group: (j) => j.group ?? j.id,
      send,
      record: async (j, o) => void recorded.push([j.id, o]),
    });
    expect(await runner.run()).toMatchObject({ claimed: 3, sent: 2, filtered: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(recorded.map(([id]) => id).sort()).toEqual(["a", "b", "c"]);
  });

  it("turns a throwing send into a retry for its whole group, and never logs the error's text", async () => {
    const log = vi.fn();
    const runner = createRunner({
      claim: async () => [job("a"), job("b")],
      send: async () => {
        throw new Error("secret-ish details");
      },
      record: async () => {},
      log,
    });
    expect(await runner.run()).toMatchObject({ retrying: 2 });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-ish");
  });

  it("counts stale and unrecorded claims, and survives a throwing logger", async () => {
    const runner = createRunner({
      claim: async () => [job("a"), job("b")],
      send: async (g) => g.map(() => ({ ok: false as const, retryable: false, error: "x" })),
      record: async (j) => {
        if (j.id === "a") return false;
        throw new Error("db down");
      },
      log: () => {
        throw new Error("sink down");
      },
    });
    expect(await runner.run()).toMatchObject({ stale: 1, unrecorded: 1, failed: 0 });
  });

  it("refuses a send that answers the wrong number of results", async () => {
    const runner = createRunner({ claim: async () => [job("a"), job("b")], group: () => "g", send: async () => [{ ok: true as const }], record: async () => {} });
    expect(await runner.run()).toMatchObject({ retrying: 2, sent: 0 });
  });

  it("sends at most `concurrency` groups at once, and every group when it is unset", async () => {
    const peak = async (concurrency?: number) => {
      let inFlight = 0;
      let most = 0;
      const runner = createRunner({
        claim: async () => ["a", "b", "c", "d", "e"].map((id) => job(id)),
        send: async (g) => {
          most = Math.max(most, ++inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight--;
          return g.map(() => ({ ok: true as const }));
        },
        record: async () => {},
        concurrency,
      });
      expect(await runner.run()).toMatchObject({ claimed: 5, sent: 5 });
      return most;
    };
    expect(await peak(2)).toBe(2);
    expect(await peak(1)).toBe(1);
    expect(await peak()).toBe(5);
  });
});

// Packages may inline their own copy of the engine (genesis-forms does) next to this one, so it
// must keep no module-level state: every createRunner call owns everything it uses.
describe("the engine keeps no module-level state", () => {
  it("declares nothing mutable at the top level: no let or var, no caches", () => {
    const source = readFileSync(fileURLToPath(new URL("../runner.ts", import.meta.url)), "utf8");
    const topLevel = source.split("\n").filter((line) => /^(export\s+)?(let|var|const)\s/.test(line));
    expect(topLevel.filter((line) => /^(export\s+)?(let|var)\s/.test(line))).toEqual([]);
    for (const line of topLevel) expect(line).toMatch(/^export const DEFAULT_[A-Z_]+ = \d+;$/);
    expect(source).not.toMatch(/^(export\s+)?(const|let|var)\s+\w+\s*(:[^=]+)?=\s*new\s/m);
  });

  it("shares nothing between two runners in one process", async () => {
    const make = (ids: string[], seen: string[], fail: boolean) =>
      createRunner({
        claim: async () => ids.map((id) => job(id)),
        send: async (g) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return g.map(() => (fail ? { ok: false as const, retryable: false, error: "no" } : { ok: true as const }));
        },
        record: async (j) => void seen.push(j.id),
        batchSize: 10,
        concurrency: 1,
      });
    const seenA: string[] = [];
    const seenB: string[] = [];
    const a = make(["a1", "a2"], seenA, false);
    const b = make(["b1", "b2", "b3"], seenB, true);
    const [ra, rb] = await Promise.all([a.run(), b.run()]);
    expect(ra).toEqual({ claimed: 2, sent: 2, filtered: 0, skipped: 0, retrying: 0, deferred: 0, failed: 0, stale: 0, unrecorded: 0 });
    expect(rb).toEqual({ claimed: 3, sent: 0, filtered: 0, skipped: 0, retrying: 0, deferred: 0, failed: 3, stale: 0, unrecorded: 0 });
    expect(seenA.sort()).toEqual(["a1", "a2"]);
    expect(seenB.sort()).toEqual(["b1", "b2", "b3"]);
    expect(await a.run()).toMatchObject({ claimed: 2, sent: 2 });
  });
});
