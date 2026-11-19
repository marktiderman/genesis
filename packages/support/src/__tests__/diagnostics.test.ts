// @feat:support-feedback
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  capReport,
  captureConsole,
  createDiagnostics,
  createOfflineQueue,
  defineDiagnosticSection,
  diagnosticsShortId,
  DiagnosticsSendError,
  DIAGNOSTICS_DEFAULTS,
  DIAGNOSTICS_SCHEMA,
  emptyReport,
  httpTransport,
  jsonByteLength,
  memoryQueueStorage,
  redactReport,
  supabaseTransport,
  createSupportClient,
  type DiagnosticReport,
  type DiagnosticsTransport,
} from "../index";
import { arg, fakeSupabase } from "./fake-supabase";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const FEEDBACK = "11111111-1111-4111-8111-111111111111";
const base = (over: Partial<DiagnosticReport> = {}): DiagnosticReport => ({
  ...emptyReport({ id: ID, createdAt: "2026-11-19T10:00:00.000Z", trigger: "manual" }),
  ...over,
});

describe("the scrubber", () => {
  it("is byte-identical to genesis-native's (one set of rules on the device and the server)", () => {
    // genesis-support's core can't import genesis-native (an optional, React Native peer the
    // server entry must not load), so the scrubber is kept in both places, like contract.ts.
    const here = readFileSync(join(import.meta.dirname, "../diagnostics/scrub.ts"), "utf8");
    const native = readFileSync(join(import.meta.dirname, "../../../native/src/observability/scrub.ts"), "utf8");
    expect(here).toBe(native);
  });
});

describe("redactReport", () => {
  it("keeps the user to an id and a role (D5)", () => {
    const out = redactReport(base({ user: { id: "u1", role: "staff", email: "jane@example.test", name: "Jane" } as never }));
    expect(out.user).toEqual({ id: "u1", role: "staff" });
    expect(JSON.stringify(out)).not.toContain("jane");
  });

  it("scrubs emails, phones, JWTs, bearer tokens, long hex and query strings everywhere", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk";
    const out = redactReport(
      base({
        logs: {
          errors: [{ at: null, name: "Error", message: `refresh failed: ${jwt} for jane@example.test`, source: "app", fatal: false }],
          breadcrumbs: [{ at: null, category: "http", message: "GET https://api.test/x?token=abc", level: "info", data: { url: "https://api.test/y?email=a@b.co", authorization: "Bearer xyz" } }],
          console: [{ at: null, level: "warn", text: "call +1 555 555 0101 key 0123456789abcdef0123456789abcdef" }],
        },
        sections: { game: { note: "Bearer abc.def", password: "hunter2", nested: { cookie: "c" } } },
        device: { os: "ios", model: "iPhone", phone: "555" } as never,
      }),
    );
    const text = JSON.stringify(out);
    for (const leaked of ["jane@", jwt, "token=abc", "a@b.co", "xyz", "555 0101", "0123456789abcdef0123456789abcdef", "hunter2", "\"c\""]) expect(text).not.toContain(leaked);
    expect(out.logs.errors[0]?.message).toContain("[jwt]");
    expect((out.sections["game"] as Record<string, unknown>)["password"]).toBe("[Filtered]");
    expect((out.device as Record<string, unknown>)["phone"]).toBe("[Filtered]");
  });

  it("cleans routes to paths with private segments replaced", () => {
    const out = redactReport(
      base({
        session: { uptimeMs: 5, route: "/users/jane@x.test/reset?code=1", recentRoutes: ["/a?x=1", "/clients/3f2a9c1b-0000-4000-8000-000000000001", 7 as never], foreground: true },
        logs: { errors: [], breadcrumbs: [{ at: null, category: "navigation", message: "/orders/12345#frag", level: null, data: null }], console: [] },
      }),
    );
    expect(out.session?.route).toBe("/users/:email/reset");
    expect(out.session?.recentRoutes).toEqual(["/a", "/clients/:id"]);
    expect(out.logs.breadcrumbs[0]?.message).toBe("/orders/:id");
  });

  it("keeps ids in their exact shape (Sentry event and replay ids, a commit) and scrubs anything else there", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const out = redactReport(
      base({
        sentry: { lastEventId: "0123456789abcdef0123456789abcdef", replayId: "not an id: jane@example.test" },
        build: { commit: sha } as never,
        server: { baseUrl: "https://x.supabase.co/rest?apikey=k", apiCommit: sha },
      }),
    );
    expect(out.sentry).toEqual({ lastEventId: "0123456789abcdef0123456789abcdef", replayId: "not an id: [email]" });
    expect(out.build?.commit).toBe(sha);
    expect(out.build?.version).toBeNull();
    expect(out.server).toEqual({ baseUrl: "https://x.supabase.co/rest", apiCommit: sha });
  });

  it("returns the report's exact shape from anything (the server's input) and fails closed", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const out = redactReport({ schema: "x", id: "nope", trigger: "evil", extra: "dropped", sections: { "bad name!": 1, ok: circular }, truncated: ["logs.console", "<script>"] } as never);
    expect(out.schema).toBe(DIAGNOSTICS_SCHEMA);
    expect(out.trigger).toBe("manual");
    expect(out.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(out).not.toHaveProperty("extra");
    expect(Object.keys(out.sections)).toEqual(["ok"]);
    expect(out.truncated).toEqual(["logs.console"]);
    expect(out.logs).toEqual({ errors: [], breadcrumbs: [], console: [] });
  });

  it("checks only the keys of a section declared pii: none", () => {
    const out = redactReport(base({ sections: { stats: { hash: "0123456789abcdef0123456789abcdef", token: "t" } } }), { trustedSections: ["stats"] });
    expect(out.sections["stats"]).toEqual({ hash: "0123456789abcdef0123456789abcdef", token: "[Filtered]" });
  });
});

describe("capReport", () => {
  const crumbs = (n: number) => Array.from({ length: n }, (_, i) => ({ at: null, category: "c", message: `m${i}`, level: null, data: null }));

  it("keeps the newest 50 errors, 100 breadcrumbs and 200 console lines of 1 KB, and names what it cut", () => {
    const out = capReport(
      base({
        logs: {
          errors: Array.from({ length: 60 }, (_, i) => ({ at: null, name: "E", message: `e${i}`, source: null, fatal: null })),
          breadcrumbs: crumbs(150),
          console: Array.from({ length: 250 }, (_, i) => ({ at: null, level: "log", text: i === 249 ? "x".repeat(5000) : `l${i}` })),
        },
      }),
    );
    expect(out.logs.errors).toHaveLength(50);
    expect(out.logs.errors[0]?.message).toBe("e10");
    expect(out.logs.breadcrumbs).toHaveLength(100);
    expect(out.logs.breadcrumbs.at(-1)?.message).toBe("m149");
    expect(out.logs.console).toHaveLength(200);
    expect(new TextEncoder().encode(out.logs.console.at(-1)!.text).length).toBeLessThanOrEqual(1024);
    expect(out.truncated).toEqual(expect.arrayContaining(["logs.errors", "logs.breadcrumbs", "logs.console"]));
  });

  it("cuts every string at 4,096 characters, and an app section over its cap", () => {
    const out = capReport(base({ flags: { long: "y".repeat(5000) }, sections: { big: { blob: "z".repeat(3000).split("").join(",") }, small: { a: 1 } } }), { sectionLimits: { big: 1000 } });
    expect(String(out.flags?.["long"])).toHaveLength(4096 + "…[truncated]".length);
    expect(out.sections["big"]).toEqual({ truncated: true, bytes: expect.any(Number) });
    expect(out.sections["small"]).toEqual({ a: 1 });
    expect(out.truncated).toEqual(expect.arrayContaining(["flags", "sections.big"]));
  });

  it("keeps the whole dump under 256 KB, oldest first, and never refuses it", () => {
    const line = "w".repeat(1000);
    const huge = base({
      logs: { errors: [], breadcrumbs: crumbs(100).map((c) => ({ ...c, message: line })), console: Array.from({ length: 200 }, () => ({ at: null, level: "log", text: line })) },
      sections: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, { v: "v".repeat(30_000) }])),
    });
    expect(jsonByteLength(huge)).toBeGreaterThan(DIAGNOSTICS_DEFAULTS.maxBytes);
    const out = capReport(huge);
    expect(jsonByteLength(out)).toBeLessThanOrEqual(DIAGNOSTICS_DEFAULTS.maxBytes);
    expect(out.id).toBe(ID);
    expect(out.truncated).toEqual(expect.arrayContaining(["logs.console"]));
    // What's left of the console is the newest.
    expect(out.logs.console.length).toBeLessThan(200);
  });
});

describe("createDiagnostics", () => {
  const memory = (): DiagnosticsTransport & { sent: DiagnosticReport[] } => {
    const sent: DiagnosticReport[] = [];
    return { name: "memory", sent, send: async (r) => (sent.push(r), { id: r.id, shortId: diagnosticsShortId(r.id) }) };
  };

  it("collects every section into the format, with the session, and sends it", async () => {
    let t = 1000;
    const transport = memory();
    const d = createDiagnostics({
      app: { id: "acme", name: "Acme" },
      transport,
      now: () => t,
      randomId: () => ID,
      sections: [
        defineDiagnosticSection("device", () => ({ os: "ios", osVersion: "18.0" })),
        defineDiagnosticSection("build", async () => ({ version: "1.4.0", build: "37" })),
        defineDiagnosticSection("logs", () => ({ errors: [{ at: null, name: "E", message: "boom", source: "app", fatal: false }] })),
        defineDiagnosticSection("logs", () => ({ console: [{ at: null, level: "log", text: "hi" }] })),
        defineDiagnosticSection("game", () => ({ round: 3 }), { maxBytes: 8192 }),
        false,
      ],
      user: () => ({ id: "u1", role: "player", email: "x@y.z" } as never),
    });
    d.recordRoute("/home?x=1");
    d.recordRoute("/home");
    d.recordRoute("/clients/42");
    t = 4000;
    const delivery = await d.send({ trigger: "manual" });
    expect(delivery).toEqual({ id: ID, shortId: "3F2A9C1B", queued: false });
    const r = transport.sent[0]!;
    expect(r.schema).toBe("genesis.diagnostics/1");
    expect(r.app).toEqual({ id: "acme", name: "Acme", platform: "ios", environment: null });
    expect(r.build).toMatchObject({ version: "1.4.0", build: "37", commit: null });
    expect(r.user).toEqual({ id: "u1", role: "player" });
    expect(r.session).toEqual({ uptimeMs: 3000, route: "/clients/:id", recentRoutes: ["/home", "/clients/:id"], foreground: null });
    expect(r.logs.errors).toHaveLength(1);
    expect(r.logs.console).toHaveLength(1);
    expect(r.sections).toEqual({ game: { round: 3 } });
    // Absent sections are null, never left out.
    expect(r.server).toBeNull();
    expect(Object.keys(r)).toEqual(Object.keys(emptyReport({ id: ID, createdAt: "", trigger: "manual" })));
  });

  it("writes a section that throws or is late as null, and says so", async () => {
    vi.useFakeTimers();
    try {
      const onProblem = vi.fn();
      const d = createDiagnostics({
        app: { id: "acme" },
        transport: memory(),
        onProblem,
        sections: [
          defineDiagnosticSection("device", () => {
            throw new Error("no");
          }),
          defineDiagnosticSection("slow", () => new Promise(() => {}), { timeoutMs: 50 }),
          defineDiagnosticSection("flags", () => ({ beta: true })),
        ],
      });
      const pending = d.collect();
      await vi.advanceTimersByTimeAsync(60);
      const r = await pending;
      expect(r.device).toBeNull();
      expect(r.sections).toEqual({});
      expect(r.flags).toEqual({ beta: true });
      expect(onProblem).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a report made earlier, linked to its feedback", async () => {
    const transport = memory();
    const d = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const report = await d.collect({ trigger: "feedback" });
    await d.send({ trigger: "feedback", report, feedbackId: FEEDBACK });
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "feedback", feedbackId: FEEDBACK });
  });

  it("queues a send that failed for a reason that may pass, and sends it on flush", async () => {
    const storage = memoryQueueStorage();
    let online = false;
    const sent: string[] = [];
    const transport: DiagnosticsTransport = {
      name: "flaky",
      send: async (r) => {
        if (!online) throw new DiagnosticsSendError("offline", 0, true);
        sent.push(r.id);
        return { id: r.id, shortId: diagnosticsShortId(r.id) };
      },
    };
    const d = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID, offline: { storage, autoRetry: false } });
    expect(await d.send({ trigger: "shake" })).toEqual({ id: ID, shortId: "3F2A9C1B", queued: true });
    expect(await d.pending()).toBe(1);
    online = true;
    // Not due yet: the backoff holds it.
    expect((await d.flush()).sent).toBe(0);
    expect(sent).toEqual([]);
  });

  it("throws a failure that won't pass (a refusal), even with a queue", async () => {
    const transport: DiagnosticsTransport = { name: "no", send: async () => Promise.reject(new DiagnosticsSendError("forbidden", 403, false)) };
    const d = createDiagnostics({ app: { id: "acme" }, transport, offline: { storage: memoryQueueStorage(), autoRetry: false } });
    await expect(d.send({ trigger: "manual" })).rejects.toThrow("forbidden");
    expect(await d.pending()).toBe(0);
  });
});

describe("submitFeedback", () => {
  it("sends the feedback naming its dump, then the dump linked to the new report", async () => {
    const order: string[] = [];
    const sent: DiagnosticReport[] = [];
    const transport: DiagnosticsTransport = {
      name: "two-step",
      feedbackSink: { submit: async (record) => (order.push(`feedback:${record.diagnosticsId}`), { id: FEEDBACK, attachmentsDropped: 0 }) },
      send: async (r) => (order.push(`dump:${r.feedbackId}`), sent.push(r), { id: r.id, shortId: diagnosticsShortId(r.id) }),
    };
    const d = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const delivery = await d.submitFeedback({ type: "bug", message: "x", context: {} });
    expect(order).toEqual([`feedback:${ID}`, `dump:${FEEDBACK}`]);
    expect(delivery).toEqual({ id: FEEDBACK, attachmentsDropped: 0, diagnostics: { id: ID, shortId: "3F2A9C1B", queued: false } });
    expect(sent[0]?.trigger).toBe("feedback");
  });

  it("never fails the feedback when its dump fails", async () => {
    const onProblem = vi.fn();
    const transport: DiagnosticsTransport = {
      name: "dump-down",
      feedbackSink: { submit: async () => ({ id: FEEDBACK, attachmentsDropped: 0 }) },
      send: async () => Promise.reject(new DiagnosticsSendError("no", 403, false)),
    };
    const d = createDiagnostics({ app: { id: "acme" }, transport, onProblem });
    expect(await d.submitFeedback({ type: "idea", message: "x", context: {} })).toEqual({ id: FEEDBACK, attachmentsDropped: 0, diagnostics: null });
    expect(onProblem).toHaveBeenCalled();
  });
});

describe("the offline queue", () => {
  it("retries with doubling backoff, gives up after its tries, and drops what isn't retryable", async () => {
    let t = 0;
    const storage = memoryQueueStorage();
    const attempts: string[] = [];
    let fail: Error | null = new DiagnosticsSendError("down", 503, true);
    const queue = createOfflineQueue<{ n: string }>({
      storage,
      now: () => t,
      autoRetry: false,
      baseDelayMs: 1000,
      maxAttempts: 3,
      send: async (item) => {
        attempts.push(item.n);
        if (fail) throw fail;
      },
    });
    await queue.add({ n: "a" });
    expect(JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!)).toHaveLength(1);
    t = 999;
    expect(await queue.flush()).toEqual({ sent: 0, kept: 1, dropped: 0 });
    t = 1000;
    expect(await queue.flush()).toEqual({ sent: 0, kept: 1, dropped: 0 });
    // Second failure: next try 2 s later.
    t = 2999;
    expect((await queue.flush()).sent).toBe(0);
    expect(attempts).toEqual(["a"]);
    t = 3000;
    expect(await queue.flush()).toEqual({ sent: 0, kept: 1, dropped: 0 });
    t = 100_000;
    // Out of tries.
    expect(await queue.flush()).toEqual({ sent: 0, kept: 0, dropped: 1 });
    expect(await queue.size()).toBe(0);

    await queue.add({ n: "b" });
    fail = new DiagnosticsSendError("bad", 400, false);
    expect(await queue.flush({ force: true })).toEqual({ sent: 0, kept: 0, dropped: 1 });

    await queue.add({ n: "c" });
    fail = null;
    expect(await queue.flush({ force: true })).toEqual({ sent: 1, kept: 0, dropped: 0 });
    expect(storage.data.size).toBe(0);
  });

  it("keeps at most maxItems, dropping the oldest, and survives broken storage", async () => {
    const onProblem = vi.fn();
    const storage = memoryQueueStorage();
    const queue = createOfflineQueue<number>({ storage, maxItems: 2, autoRetry: false, send: async () => {}, onProblem });
    await queue.add(1);
    await queue.add(2);
    await queue.add(3);
    expect(JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!).map((e: { item: number }) => e.item)).toEqual([2, 3]);
    storage.data.set("genesis-support.diagnostics.queue", "{not json");
    expect(await queue.size()).toBe(0);
    expect(onProblem).toHaveBeenCalled();
  });

  it("retries by itself at the next due time", async () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(async () => {});
      const queue = createOfflineQueue<number>({ storage: memoryQueueStorage(), baseDelayMs: 1000, send });
      await queue.add(1);
      await vi.advanceTimersByTimeAsync(1001);
      expect(send).toHaveBeenCalledWith(1);
      queue.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("supabaseTransport", () => {
  it("inserts the dump into support_diagnostics, linked to its feedback", async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ data: null, error: null }) });
    const report = redactReport(base({ feedbackId: FEEDBACK, trigger: "feedback", app: { id: "a", name: null, platform: "ios", environment: null }, build: { version: "1.4.0", build: "37" } as never }));
    expect(await supabaseTransport(client).send(report)).toEqual({ id: ID, shortId: "3F2A9C1B" });
    expect(calls[0]?.table).toBe("support_diagnostics");
    expect(arg(calls[0], "insert")).toEqual({ id: ID, feedback_id: FEEDBACK, trigger: "feedback", app_version: "1.4.0 (37)", platform: "ios", report });
  });

  it("treats a dump already stored as sent, and says which failures to retry", async () => {
    const answer = (code?: string) => fakeSupabase({ respond: () => ({ data: null, error: { message: "x", ...(code ? { code } : {}) } }) }).client;
    await expect(supabaseTransport(answer("23505")).send(base())).resolves.toMatchObject({ id: ID });
    await expect(supabaseTransport(answer("GS429")).send(base())).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(supabaseTransport(answer("42501")).send(base())).rejects.toMatchObject({ status: 403, retryable: false });
    await expect(supabaseTransport(answer()).send(base())).rejects.toMatchObject({ retryable: true });
  });

  it("gives the support client's sink for feedback, which stores the dump's id with the report", async () => {
    const { client, calls } = fakeSupabase({ respond: (c) => (c.ops.some(([op]) => op === "single") ? { data: { id: FEEDBACK }, error: null } : { data: null, error: null }) });
    const transport = supabaseTransport(client);
    await transport.feedbackSink!.submit({ type: "bug", message: "Broken", context: {}, diagnosticsId: ID });
    expect((arg(calls[0], "insert") as { context: unknown }).context).toEqual({ diagnosticsId: ID });
    // And the client on its own does the same.
    await createSupportClient(client).submit({ type: "bug", message: "x", context: { extra: { a: 1 } }, diagnosticsId: ID, severity: "high" });
    expect((arg(calls.at(-1), "insert") as { context: unknown }).context).toEqual({ a: 1, severity: "high", diagnosticsId: ID });
  });
});

describe("httpTransport", () => {
  it("posts a dump as JSON with the auth header, and reads the receipt", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: ID, shortId: "3F2A9C1B" }), { status: 201 }));
    const transport = httpTransport({ url: "https://api.test/support/diagnostics", auth: () => "tok", fetch: fetch as never });
    expect(await transport.send(base())).toEqual({ id: ID, shortId: "3F2A9C1B" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/support/diagnostics");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", "content-type": "application/json" });
    expect(JSON.parse(String(init.body)).id).toBe(ID);
  });

  it("marks network failures, 429 and 5xx retryable, other refusals not", async () => {
    const answer = (status: number) => httpTransport({ url: "https://api.test", fetch: (async () => new Response(JSON.stringify({ error: "nope" }), { status })) as never });
    await expect(answer(500).send(base())).rejects.toMatchObject({ status: 500, retryable: true });
    await expect(answer(429).send(base())).rejects.toMatchObject({ status: 429, retryable: true, code: "nope" });
    await expect(answer(413).send(base())).rejects.toMatchObject({ status: 413, retryable: false });
    const offline = httpTransport({ url: "https://api.test", fetch: (async () => Promise.reject(new TypeError("Failed to fetch"))) as never });
    await expect(offline.send(base())).rejects.toMatchObject({ status: 0, retryable: true });
  });

  it("sends feedback as multipart, screenshots as files (the intake sink drops them)", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: FEEDBACK, attachmentsDropped: 0 }), { status: 201 }));
    const transport = httpTransport({ url: "https://api.test/support", auth: async () => "Bearer t", fetch: fetch as never });
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const delivery = await transport.feedbackSink!.submit({
      type: "bug",
      message: "Broken",
      context: { route: "/x" },
      diagnosticsId: ID,
      attachments: [
        { kind: "screenshot", contentType: "image/png", base64: png, width: 10, height: 20 },
        { kind: "screenshot", contentType: "image/png" },
      ],
    });
    expect(delivery).toEqual({ id: FEEDBACK, attachmentsDropped: 1 });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const form = init.body as FormData;
    expect(init.headers).toEqual({ authorization: "Bearer t" });
    const feedback = JSON.parse(String(form.get("feedback")));
    expect(feedback).toMatchObject({ type: "bug", message: "Broken", diagnosticsId: ID, attachments: [{ kind: "screenshot", contentType: "image/png", width: 10, height: 20 }] });
    expect(JSON.stringify(feedback)).not.toContain("iVBOR");
    const files = form.getAll("screenshot") as File[];
    expect(files).toHaveLength(1);
    expect(files[0]?.type).toBe("image/png");
    expect(new Uint8Array(await files[0]!.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });
});

describe("captureConsole", () => {
  it("keeps the last lines, scrubbed and cut, and still calls the console", () => {
    const calls: unknown[][] = [];
    const fake = { log: (...a: unknown[]) => void calls.push(a), warn: (...a: unknown[]) => void calls.push(a) };
    const buffer = captureConsole({ console: fake, maxLines: 2, maxLineBytes: 40, now: () => 0 });
    fake.log("one");
    fake.warn("mail jane@example.test", { a: 1 });
    fake.log("x".repeat(100));
    expect(calls).toHaveLength(3);
    const lines = buffer.lines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ at: "1970-01-01T00:00:00.000Z", level: "warn", text: 'mail [email] {"a":1}' });
    expect(new TextEncoder().encode(lines[1]!.text).length).toBeLessThanOrEqual(40);
    expect(captureConsole({ console: fake })).toBe(buffer);
    buffer.restore();
    fake.log("after");
    expect(buffer.lines()).toHaveLength(2);
  });
});
