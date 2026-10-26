// @feat:jobs
import { describe, expect, it, vi } from "vitest";
import { JobsError, PermanentJobError, createJobsHandler, enqueueJob, runJobs, signJobRequest, verifyJobRequest, type JobsClient } from "../jobs";

type Call = { fn: string; args: Record<string, unknown> };

function fakeQueue(claimed: unknown[], settleResult = true) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "genesis_jobs_claim") return { data: claimed, error: null };
    if (fn === "genesis_jobs_settle") return { data: settleResult, error: null };
    if (fn === "genesis_job_enqueue") return { data: "job-1", error: null };
    return { data: null, error: { message: "unknown" } };
  });
  return { client: { rpc } as JobsClient, calls };
}

const job = (id: string, kind: string, attempt = 1) => ({ id, kind, payload: { n: id }, attempt, redelivery: false, claim_id: "c1" });
const settles = (calls: Call[]) => calls.filter((c) => c.fn === "genesis_jobs_settle").map((c) => [c.args["p_id"], c.args["p_outcome"], c.args["p_retry_after_seconds"]]);

describe("enqueueJob", () => {
  it("queues a kind with its payload and options", async () => {
    const { client, calls } = fakeQueue([]);
    const runAfter = new Date("2026-01-01T00:00:00Z");
    expect(await enqueueJob(client, "email.digest", { person: "p1" }, { runAfter, idempotencyKey: "p1:2026-01-01" })).toBe("job-1");
    expect(calls[0]).toEqual({
      fn: "genesis_job_enqueue",
      args: { p_kind: "email.digest", p_payload: { person: "p1" }, p_run_after: "2026-01-01T00:00:00.000Z", p_idempotency_key: "p1:2026-01-01", p_max_attempts: 8 },
    });
  });

  it("throws the queue's refusal", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "permission denied", code: "42501" } }) } as JobsClient;
    const failure = await enqueueJob(client, "x").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(JobsError);
    expect((failure as JobsError).code).toBe("42501");
  });
});

describe("runJobs", () => {
  it("claims only the handled kinds and settles each outcome", async () => {
    const { client, calls } = fakeQueue([job("a", "ok"), job("b", "later"), job("c", "bad"), job("d", "throws", 2), job("e", "permanent")]);
    const log = vi.fn();
    const report = await runJobs(client, {
      handlers: {
        ok: async (j) => {
          expect(j).toEqual({ id: "a", kind: "ok", payload: { n: "a" }, attempt: 1, redelivery: false });
        },
        later: () => ({ retryAfterSeconds: 90, error: "rate limited" }),
        bad: () => ({ failed: "no such person" }),
        throws: () => {
          throw new Error("timeout");
        },
        permanent: () => {
          throw new PermanentJobError("bad payload");
        },
      },
      backoff: (attempt) => attempt * 100,
      log,
    });
    expect(calls[0]).toEqual({ fn: "genesis_jobs_claim", args: { p_kinds: ["ok", "later", "bad", "throws", "permanent"], p_limit: 25, p_lease_seconds: 300 } });
    expect(settles(calls).sort()).toEqual(
      [
        ["a", "done", null],
        ["b", "retry", 90],
        ["c", "failed", null],
        ["d", "retry", 200],
        ["e", "failed", null],
      ].sort(),
    );
    expect(report).toEqual({ claimed: 5, done: 1, retried: 2, failed: 2, stale: 0, unsettled: 0 });
    expect(log.mock.calls.flat().join("\n")).not.toContain('"n"');
  });

  it("counts a settle refused after the lease ran out as stale", async () => {
    const { client } = fakeQueue([job("a", "ok")], false);
    expect(await runJobs(client, { handlers: { ok: () => undefined } })).toMatchObject({ claimed: 1, done: 0, stale: 1 });
  });

  it("carries on when a settle fails, and never settles a job twice", async () => {
    const settled: string[] = [];
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "genesis_jobs_claim") return { data: [job("a", "ok"), job("b", "ok")], error: null };
      settled.push(String(args["p_id"]));
      return args["p_id"] === "a" ? { data: null, error: { message: "network" } } : { data: true, error: null };
    });
    const handled: string[] = [];
    const report = await runJobs({ rpc } as JobsClient, { handlers: { ok: (j) => void handled.push(j.id) }, log: () => {} });
    expect(handled.sort()).toEqual(["a", "b"]);
    expect(settled.sort()).toEqual(["a", "b"]);
    expect(report).toMatchObject({ claimed: 2, done: 1, unsettled: 1 });
  });

  it("leaves attempts and retry times to the queue: no cap, no minimum, no backoff of the engine's own", async () => {
    const { client, calls } = fakeQueue([job("a", "now"), job("b", "throws", 50)]);
    const backoff = vi.fn(() => 0);
    const report = await runJobs(client, {
      handlers: {
        now: () => ({ retryAfterSeconds: 0.4 }),
        throws: () => {
          throw new Error("again");
        },
      },
      backoff,
      log: () => {},
    });
    expect(settles(calls).sort()).toEqual([
      ["a", "retry", 0],
      ["b", "retry", 0],
    ]);
    expect(backoff).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ claimed: 2, retried: 2, failed: 0 });
  });

  it("runs at most `concurrency` handlers at once, 4 by default", async () => {
    const peak = async (concurrency?: number) => {
      const { client } = fakeQueue(Array.from({ length: 9 }, (_, i) => job(`j${i}`, "slow")));
      let inFlight = 0;
      let most = 0;
      const slow = async () => {
        most = Math.max(most, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      };
      expect(await runJobs(client, { handlers: { slow }, ...(concurrency ? { concurrency } : {}) })).toMatchObject({ claimed: 9, done: 9 });
      return most;
    };
    expect(await peak()).toBe(4);
    expect(await peak(2)).toBe(2);
  });

  it("counts a settle that answers anything but true as stale", async () => {
    const rpc = vi.fn(async (fn: string) => (fn === "genesis_jobs_claim" ? { data: [job("a", "ok")], error: null } : { data: null, error: null }));
    expect(await runJobs({ rpc } as JobsClient, { handlers: { ok: () => undefined } })).toMatchObject({ claimed: 1, done: 0, stale: 1 });
  });

  it("does nothing without handlers", async () => {
    const { client, calls } = fakeQueue([job("a", "ok")]);
    expect(await runJobs(client, { handlers: {} })).toEqual({ claimed: 0, done: 0, retried: 0, failed: 0, stale: 0, unsettled: 0 });
    expect(calls).toEqual([]);
  });
});

const request = (auth?: string, init: RequestInit & { url?: string } = {}) =>
  new Request(init.url ?? "https://app.example.com/api/jobs/digests", {
    method: init.method ?? "POST",
    headers: auth ? { authorization: auth } : {},
    body: init.body,
  });

describe("verifyJobRequest", () => {
  it("accepts the secret and the previous one, and refuses anything else", async () => {
    const options = { secret: "new-secret", previousSecret: "old-secret" };
    expect(await verifyJobRequest(request("Bearer new-secret"), options)).toBeNull();
    expect(await verifyJobRequest(request("Bearer old-secret"), options)).toBeNull();
    expect((await verifyJobRequest(request("Bearer wrong"), options))?.status).toBe(401);
    expect((await verifyJobRequest(request(), options))?.status).toBe(401);
    expect((await verifyJobRequest(request("Basic new-secret"), options))?.status).toBe(401);
  });

  it("takes any case and spacing for the scheme", async () => {
    expect(await verifyJobRequest(request("bearer   new-secret"), { secret: "new-secret" })).toBeNull();
    expect(await verifyJobRequest(request("BEARER new-secret"), { secret: "new-secret" })).toBeNull();
  });

  it("accepts a signature for this job within five minutes, and nothing else", async () => {
    const now = 1_800_000_000;
    const options = { secret: "s", previousSecret: "old", now: () => now };
    const signed = await signJobRequest("s", "digests", now - 100);
    expect(signed).toMatch(/^GenesisJob t=1799999900,sig=[0-9a-f]{64}$/);
    expect(await verifyJobRequest(request(signed), options, "digests")).toBeNull();
    expect(await verifyJobRequest(request(await signJobRequest("old", "digests", now)), options, "digests")).toBeNull();
    expect((await verifyJobRequest(request(signed), options, "cleanup"))?.status).toBe(401);
    expect((await verifyJobRequest(request(signed), options))?.status).toBe(401);
    expect((await verifyJobRequest(request(await signJobRequest("s", "digests", now - 301)), options, "digests"))?.status).toBe(401);
    expect((await verifyJobRequest(request(await signJobRequest("wrong", "digests", now)), options, "digests"))?.status).toBe(401);
  });

  it("refuses everything when no secret is configured", async () => {
    expect((await verifyJobRequest(request("Bearer "), { secret: undefined }))?.status).toBe(500);
    expect((await verifyJobRequest(request("Bearer x"), { secret: "" }))?.status).toBe(500);
  });
});

describe("createJobsHandler", () => {
  const digests = vi.fn(async () => ({ sent: 3 }));
  const broken = vi.fn(async () => {
    throw new Error("database down, row 42");
  });
  const log = vi.fn();
  const handle = createJobsHandler({ secret: "s", jobs: { digests, broken }, log });

  it("runs the job the URL names and returns its result", async () => {
    const res = await handle(request("Bearer s"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job: "digests", result: { sent: 3 } });
  });

  it("prefers the route's name, then the body's job", async () => {
    expect(await (await handle(request("Bearer s", { url: "https://x.test/api/jobs" }), "digests")).json()).toMatchObject({ job: "digests" });
    const res = await handle(request("Bearer s", { url: "https://x.test/api/jobs", body: JSON.stringify({ job: "digests" }) }));
    expect(await res.json()).toMatchObject({ job: "digests" });
  });

  it("runs a job signed for it, and refuses a signature for another job", async () => {
    const signedFor = async (job: string) => signJobRequest("s", job);
    expect((await handle(request(await signedFor("digests")))).status).toBe(200);
    expect((await handle(request(await signedFor("broken")))).status).toBe(401);
  });

  it("trusts nothing but the job name on a signed call: no body in, no result out", async () => {
    const seen = vi.fn(async (_ctx: { body: Record<string, unknown> }) => ({ secret: "result" }));
    const h = createJobsHandler({ secret: "s", jobs: { digests: seen } });
    const res = await h(request(await signJobRequest("s", "digests"), { body: JSON.stringify({ job: "other", personId: "p1" }) }));
    expect(await res.json()).toEqual({ job: "digests", ok: true });
    expect(seen.mock.calls[0]?.[0].body).toEqual({});
  });

  it("answers 401, 404 and 405 before running anything", async () => {
    digests.mockClear();
    expect((await handle(request("Bearer nope"))).status).toBe(401);
    expect((await handle(request("Bearer s", { url: "https://x.test/api/jobs/toString" }))).status).toBe(404);
    expect((await handle(request("Bearer s", { url: "https://x.test/api/jobs/missing" }))).status).toBe(404);
    expect((await handle(request("Bearer s", { method: "DELETE" }))).status).toBe(405);
    expect(digests).not.toHaveBeenCalled();
  });

  it("hides a job's error from the caller and logs it", async () => {
    const res = await handle(request("Bearer s", { url: "https://x.test/api/jobs/broken" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("row 42");
    expect(log).toHaveBeenCalledWith("[jobs] broken: Error: database down, row 42");
  });
});
