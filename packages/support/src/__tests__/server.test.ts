// @feat:support-feedback
import { describe, expect, it, vi } from "vitest";
import { emptyReport, httpTransport, createDiagnostics, type DiagnosticReport } from "../index";
import {
  createDiagnosticsHandler,
  DiagnosticsStoreError,
  githubIssueNotifier,
  hmacSha256Hex,
  verifyWebhookSignature,
  memoryRateLimiter,
  messengerNotifier,
  parseDiagnosticReport,
  supabaseDiagnosticsStore,
  webhookNotifier,
  type DiagnosticsStore,
  type FeedbackCreatedEvent,
  type SupportEvent,
  type StoredFile,
} from "../server/index";
import { arg, fakeSupabase } from "./fake-supabase";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000a1";
const TICKET = "11111111-1111-4111-8111-111111111111";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const dump = (over: Partial<DiagnosticReport> = {}): DiagnosticReport => ({ ...emptyReport({ id: ID, createdAt: "2026-11-19T10:00:00.000Z", trigger: "manual", app: { id: "acme" } }), ...over });

function memoryStore() {
  const reports: Array<{ report: DiagnosticReport; userId: string; feedbackId: string | null }> = [];
  const feedback: Array<Parameters<NonNullable<DiagnosticsStore["saveFeedback"]>>[0]> = [];
  const files: StoredFile[] = [];
  const store: DiagnosticsStore = {
    saveReport: async (input) => (reports.push(input), { id: input.report.id }),
    saveFeedback: async (input) => (feedback.push(input), { id: TICKET }),
    attachFile: async (file) => void files.push(file),
  };
  return { store, reports, feedback, files };
}

const post = (body: BodyInit, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://api.test/support/diagnostics", { method: "POST", headers: { authorization: "Bearer t", ...headers }, body });

const auth = async (req: Request) => (req.headers.get("authorization") === "Bearer t" ? { userId: USER, role: "member" } : null);

describe("parseDiagnosticReport", () => {
  it("accepts a dump, scrubs it again and caps it", () => {
    const parsed = parseDiagnosticReport(JSON.stringify(dump({ logs: { errors: [], breadcrumbs: [], console: [{ at: null, level: "log", text: "mail jane@example.test" }] } })));
    expect(parsed.ok && parsed.report.logs.console[0]?.text).toBe("mail [email]");
  });

  it("refuses what isn't a dump, and anything over 512 KB", () => {
    expect(parseDiagnosticReport("{nope")).toMatchObject({ ok: false, error: "invalid_json", status: 400 });
    expect(parseDiagnosticReport(JSON.stringify({ ...dump(), schema: "genesis.diagnostics/2" }))).toMatchObject({ ok: false, error: "unknown_schema" });
    expect(parseDiagnosticReport(JSON.stringify({ ...dump(), id: "x" }))).toMatchObject({ ok: false, field: "id" });
    expect(parseDiagnosticReport(JSON.stringify({ ...dump(), trigger: "boot" }))).toMatchObject({ ok: false, field: "trigger" });
    expect(parseDiagnosticReport(JSON.stringify({ ...dump(), feedbackId: "x" }))).toMatchObject({ ok: false, field: "feedbackId" });
    const big = JSON.stringify(dump({ sections: { blob: "x".repeat(600_000) } }));
    expect(parseDiagnosticReport(big)).toMatchObject({ ok: false, error: "payload_too_large", status: 413 });
    // Between 256 and 512 KB: capped, not refused.
    const mid = parseDiagnosticReport(JSON.stringify(dump({ sections: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, { v: "v".repeat(30_000) }])) })));
    expect(mid.ok).toBe(true);
    expect(mid.ok && mid.report.truncated.length).toBeGreaterThan(0);
  });
});

describe("createDiagnosticsHandler: dumps", () => {
  it("stores a dump for the signed-in person (never the one the dump names) and notifies", async () => {
    const { store, reports } = memoryStore();
    const events: SupportEvent[] = [];
    const handle = createDiagnosticsHandler({ authenticate: auth, store, notify: [{ name: "spy", notify: (e) => void events.push(e) }] });
    const res = await handle(post(JSON.stringify(dump({ user: { id: "someone-else", role: "admin" } }))));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID, shortId: "3F2A9C1B" });
    expect(reports[0]).toMatchObject({ userId: USER, feedbackId: null, report: { user: { id: USER, role: "member" } } });
    expect(events[0]).toMatchObject({ kind: "diagnostics", id: ID, shortId: "3F2A9C1B", userId: USER });
  });

  it("answers 405, 415, 401, 400 and 413 where it should", async () => {
    const handle = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, rateLimit: false });
    expect((await handle(new Request("https://api.test", { method: "GET" }))).status).toBe(405);
    expect((await handle(post("x", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handle(new Request("https://api.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status).toBe(401);
    const bad = await handle(post(JSON.stringify({ ...dump(), schema: "nope" })));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "unknown_schema", field: "schema" });
    expect((await handle(post(JSON.stringify(dump({ sections: { b: "x".repeat(600_000) } }))))).status).toBe(413);
    // A declared length over the cap is refused before the body is read.
    const text = vi.fn();
    const declared = { method: "POST", headers: new Headers({ "content-type": "application/json", "content-length": String(10_000_000) }), text } as unknown as Request;
    expect((await handle(declared)).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
  });

  it("limits 10 dumps an hour per person and 5 requests a minute per IP", async () => {
    let t = 0;
    const handle = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, rateLimit: memoryRateLimiter(() => t), limits: { ipPerMinute: 100 } });
    for (let i = 0; i < 10; i++) expect((await handle(post(JSON.stringify(dump())))).status).toBe(201);
    const limited = await handle(post(JSON.stringify(dump())));
    expect(limited.status).toBe(429);
    t = 3_600_001;
    expect((await handle(post(JSON.stringify(dump())))).status).toBe(201);

    // The IP comes only from where the app says it can be trusted (here, its own proxy's header).
    const byIp = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, clientIp: (r) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
    const from = (ip: string) => post(JSON.stringify(dump()), { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` });
    for (let i = 0; i < 5; i++) expect((await byIp(from("1.2.3.4"))).status).toBe(201);
    expect((await byIp(from("1.2.3.4"))).status).toBe(429);
    expect((await byIp(from("5.6.7.8"))).status).toBe(201);

    // Without clientIp, a header the client wrote decides nothing: no per-IP limit to dodge or abuse.
    const noIp = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, limits: { diagnosticsPerHour: 100 } });
    for (let i = 0; i < 8; i++) expect((await noIp(from("1.2.3.4"))).status).toBe(201);
  });

  it("never takes the role a dump claims: the caller's, or none", async () => {
    const { store, reports } = memoryStore();
    const handle = createDiagnosticsHandler({ authenticate: async () => ({ userId: USER }), store });
    await handle(post(JSON.stringify(dump({ user: { id: USER, role: "admin" } }))));
    expect(reports[0]?.report.user).toEqual({ id: USER, role: null });
  });

  it("stops reading a body with no length at the limit (413), however it is sent", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 400) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const handle = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store });
    const res = await handle(new Request("https://api.test", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit));
    expect(res.status).toBe(413);
    // 512 KB is 8 chunks: it stopped soon after, not at 25 MB.
    expect(pulled).toBeLessThan(20);
  });

  it("refuses a dump linked to someone else's feedback when the store can tell", async () => {
    const { store, reports } = memoryStore();
    const ownsFeedback = vi.fn(async () => false);
    const handle = createDiagnosticsHandler({ authenticate: auth, store: { ...store, ownsFeedback } });
    const res = await handle(post(JSON.stringify(dump({ feedbackId: TICKET }))));
    expect(res.status).toBe(403);
    expect(ownsFeedback).toHaveBeenCalledWith(USER, TICKET);
    expect(reports).toEqual([]);
  });

  it("answers a CORS preflight and adds CORS headers only for allowed origins", async () => {
    // happy-dom's Request drops a browser-only header like Origin: wrap one that keeps it.
    const withOrigin = (req: Request, origin: string) => {
      const map = new Map([...req.headers, ["origin", origin]]);
      return { method: req.method, body: req.body, headers: { get: (k: string) => map.get(k.toLowerCase()) ?? null } } as unknown as Request;
    };
    const handle = createDiagnosticsHandler({ authenticate: (r) => (r.headers.get("authorization") === "Bearer t" ? { userId: USER } : null), store: memoryStore().store, cors: { origins: ["https://app.test"], headers: ["x-tenant"] } });
    const preflight = await handle(withOrigin(new Request("https://api.test", { method: "OPTIONS" }), "https://app.test"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.test");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("authorization, content-type, x-tenant");
    expect((await handle(withOrigin(new Request("https://api.test", { method: "OPTIONS" }), "https://evil.test"))).status).toBe(403);
    const res = await handle(withOrigin(post(JSON.stringify(dump())), "https://app.test"));
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.test");
    const other = await handle(withOrigin(post(JSON.stringify(dump())), "https://evil.test"));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    // Without cors, OPTIONS is the framework's business.
    expect((await createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store })(new Request("https://api.test", { method: "OPTIONS" }))).status).toBe(405);
  });

  it("passes the store's refusals on, and a failing notifier never fails the request", async () => {
    const onError = vi.fn();
    const handle = createDiagnosticsHandler({
      authenticate: auth,
      store: { saveReport: async () => Promise.reject(new DiagnosticsStoreError("rate_limited", 429, "rate_limited")) },
      onError,
    });
    expect((await handle(post(JSON.stringify(dump())))).status).toBe(429);
    const ok = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, onError, notify: [{ name: "boom", notify: () => Promise.reject(new Error("down")) }] });
    expect((await ok(post(JSON.stringify(dump())))).status).toBe(201);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "notify:boom");
    const broken = createDiagnosticsHandler({ authenticate: auth, store: { saveReport: async () => Promise.reject(new Error("db down")) }, onError });
    expect((await broken(post(JSON.stringify(dump())))).status).toBe(500);
  });

  it("hands notifiers to waitUntil instead of waiting for them", async () => {
    const pending: Promise<unknown>[] = [];
    let done = false;
    const handle = createDiagnosticsHandler({
      authenticate: auth,
      store: memoryStore().store,
      waitUntil: (p) => void pending.push(p),
      notify: [{ name: "slow", notify: () => new Promise<void>((r) => setTimeout(() => ((done = true), r()), 10)) }],
    });
    expect((await handle(post(JSON.stringify(dump())))).status).toBe(201);
    expect(done).toBe(false);
    await Promise.all(pending);
    expect(done).toBe(true);
  });
});

describe("createDiagnosticsHandler: feedback with screenshots", () => {
  it("round-trips httpTransport's multipart: the record, its dump and the screenshots", async () => {
    const { store, reports, feedback, files } = memoryStore();
    const put = vi.fn(async () => {});
    const events: SupportEvent[] = [];
    const handle = createDiagnosticsHandler({ authenticate: auth, store, files: { put }, notify: [{ name: "spy", notify: (e) => void events.push(e) }] });
    const transport = httpTransport({ url: "https://api.test/support/diagnostics", auth: () => "t", fetch: ((url: string, init: RequestInit) => handle(new Request(url, init))) as never });
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    let b64 = "";
    for (const b of PNG) b64 += String.fromCharCode(b);
    const delivery = await diagnostics.submitFeedback({
      type: "bug",
      message: "Save fails",
      context: { route: "/orders/42?x=1", device: { email: "jane@example.test" } },
      attachments: [
        { kind: "screenshot", contentType: "image/png", base64: btoa(b64), width: 100, height: 200 },
        { kind: "screenshot", contentType: "image/jpeg", base64: btoa(b64) },
      ],
    });
    expect(delivery).toEqual({ id: TICKET, attachmentsDropped: 1, diagnostics: { id: ID, shortId: "3F2A9C1B", queued: false } });
    expect(feedback[0]?.feedback).toMatchObject({ type: "bug", message: "Save fails", route: "/orders/:id", diagnosticsId: ID, device: { email: "[Filtered]" } });
    expect(reports[0]).toMatchObject({ feedbackId: TICKET, report: { trigger: "feedback", feedbackId: TICKET } });
    expect(files).toEqual([expect.objectContaining({ feedbackId: TICKET, contentType: "image/png", byteSize: PNG.length, width: 100, height: 200 })]);
    expect(files[0]?.path).toMatch(new RegExp(`^${USER}/${TICKET}/[0-9a-f]{32}\\.png$`));
    expect(put).toHaveBeenCalledTimes(1);
    const event = events[0] as FeedbackCreatedEvent;
    expect(event).toMatchObject({ kind: "feedback", id: TICKET, screenshots: 1, diagnosticsShortId: "3F2A9C1B" });
    expect(event.report?.feedbackId).toBe(TICKET);
  });

  it("takes back a stored screenshot whose record failed", async () => {
    const { store } = memoryStore();
    const removed: string[] = [];
    const handle = createDiagnosticsHandler({
      authenticate: auth,
      store: { ...store, attachFile: async () => Promise.reject(new Error("42501")) },
      files: { put: async () => {}, remove: async (path) => void removed.push(path) },
      onError: () => {},
    });
    const f = new FormData();
    f.append("feedback", JSON.stringify({ type: "bug", message: "x" }));
    f.append("screenshot", new Blob([PNG], { type: "image/png" }), "a.png");
    const res = await handle(new Request("https://api.test", { method: "POST", headers: { authorization: "Bearer t" }, body: f }));
    expect(await res.json()).toMatchObject({ id: TICKET, attachmentsDropped: 1 });
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(new RegExp(`^${USER}/${TICKET}/`));
  });

  it("drops a diagnosticsId the feedback names but doesn't bring, unless it is the caller's own", async () => {
    const send = async (store: DiagnosticsStore) => {
      const f = new FormData();
      f.append("feedback", JSON.stringify({ type: "bug", message: "x", diagnosticsId: ID }));
      await createDiagnosticsHandler({ authenticate: auth, store })(new Request("https://api.test", { method: "POST", headers: { authorization: "Bearer t" }, body: f }));
    };
    const plain = memoryStore();
    await send(plain.store);
    expect(plain.feedback[0]?.feedback.diagnosticsId).toBeNull();
    const owned = memoryStore();
    await send({ ...owned.store, ownsReport: async (userId, id) => userId === USER && id === ID });
    expect(owned.feedback[0]?.feedback.diagnosticsId).toBe(ID);
  });

  it("refuses bad feedback, and answers 501 when the store takes none", async () => {
    const form = (feedback: unknown) => {
      const f = new FormData();
      f.append("feedback", JSON.stringify(feedback));
      return f;
    };
    const handle = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store, rateLimit: false });
    const req = (body: FormData) => new Request("https://api.test", { method: "POST", headers: { authorization: "Bearer t" }, body });
    expect((await handle(req(form({ type: "rant", message: "x" })))).status).toBe(400);
    expect(await (await handle(req(form({ type: "bug", message: " " })))).json()).toEqual({ error: "invalid_feedback", field: "message" });
    expect((await handle(req(form({ type: "bug", message: "ok" })))).status).toBe(201);
    const noFeedback = createDiagnosticsHandler({ authenticate: auth, store: { saveReport: async () => ({ id: ID }) } });
    expect((await noFeedback(req(form({ type: "bug", message: "ok" })))).status).toBe(501);
  });

  it("drops a screenshot that isn't the image it says, or comes without a file store", async () => {
    const { store, files } = memoryStore();
    const handle = createDiagnosticsHandler({ authenticate: auth, store, files: { put: async () => {} }, onError: () => {} });
    const f = new FormData();
    f.append("feedback", JSON.stringify({ type: "bug", message: "x" }));
    f.append("screenshot", new Blob(["<svg/>"], { type: "image/png" }), "a.png");
    f.append("screenshot", new Blob(["x"], { type: "image/gif" }), "b.gif");
    const res = await handle(new Request("https://api.test", { method: "POST", headers: { authorization: "Bearer t" }, body: f }));
    expect(await res.json()).toEqual({ id: TICKET, attachmentsDropped: 2, diagnostics: null });
    expect(files).toEqual([]);
  });
});

describe("notifiers", () => {
  const feedbackEvent = (report: DiagnosticReport | null = null): FeedbackCreatedEvent => ({
    kind: "feedback",
    id: TICKET,
    userId: USER,
    createdAt: "2026-11-19T10:00:00.000Z",
    feedback: { type: "bug", title: "Save fails", message: "````\n@everyone", severity: "high", route: "/s", appVersion: "1.0", platform: "ios" },
    screenshots: 0,
    diagnosticsId: ID,
    diagnosticsShortId: "3F2A9C1B",
    report,
  });

  it("GitHub: the summary only by default, fenced, without the person's id", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    await githubIssueNotifier({ token: "ghp", repo: "acme/app", fetch: fetch as never }).notify(feedbackEvent(dump({ device: { model: "SECRET-MODEL" } as never })));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/app/issues");
    const body = JSON.parse(String(init.body));
    expect(body.labels).toEqual(["feedback", "bug"]);
    expect(body.body).not.toContain(USER);
    expect(body.body).not.toContain("SECRET-MODEL");
    // The whole body is one fence the person's backticks can't close.
    expect(body.body.startsWith("````\n") || body.body.startsWith("`````\n")).toBe(true);
    expect(body.body).toContain("@everyone");
  });

  it("GitHub: no backtick run, mention or link escapes the fence or the title", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    const event = feedbackEvent();
    event.feedback = { ...event.feedback, title: "@everyone [click](https://evil) ![x](https://evil/x.png) #1", message: "```````\n@everyone [x](https://evil)" };
    await githubIssueNotifier({ token: "t", repo: "a/b", fetch: fetch as never }).notify(event);
    const sent = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    const lines = sent.body.split("\n");
    expect(lines[0]).toBe("````````");
    expect(lines.at(-1)).toBe("````````");
    expect(lines.slice(1, -1).some((l: string) => /^`{8,}$/.test(l))).toBe(false);
    expect(sent.title).not.toMatch(/@everyone|\[click\]|!\[|#1/);
    expect(sent.title.replace(/\u200b/g, "")).toContain("@everyone [click](https://evil)");
  });

  it("GitHub: asks again whether the repository is private after the TTL", async () => {
    let t = 0;
    let isPrivate = true;
    const issues: string[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ private: isPrivate }));
      issues.push(JSON.parse(String(init.body)).body);
      return new Response("{}", { status: 201 });
    });
    const n = githubIssueNotifier({ token: "t", repo: "a/b", detail: "full", fetch: fetch as never, now: () => t });
    const event = feedbackEvent(dump({ device: { model: "Pixel 9" } as never }));
    await n.notify(event);
    isPrivate = false;
    t = 599_000;
    await n.notify(event);
    t = 600_000;
    await n.notify(event);
    expect(issues.map((b) => b.includes("Pixel 9"))).toEqual([true, true, false]);
  });

  it("GitHub full detail: only on a repository GitHub says is private", async () => {
    const issues: string[] = [];
    const github = (isPrivate: boolean) =>
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!init?.method) return new Response(JSON.stringify({ private: isPrivate }));
        issues.push(JSON.parse(String(init.body)).body);
        return new Response("{}", { status: 201 });
      });
    const onProblem = vi.fn();
    const event = feedbackEvent(dump({ device: { model: "Pixel 9" } as never }));
    const priv = github(true);
    const n = githubIssueNotifier({ token: "t", repo: "acme/app", detail: "full", fetch: priv as never });
    await n.notify(event);
    await n.notify(event);
    expect(priv.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1);
    expect(issues[0]).toContain("Pixel 9");
    await githubIssueNotifier({ token: "t", repo: "acme/app", detail: "full", fetch: github(false) as never, onProblem }).notify(event);
    expect(issues[2]).not.toContain("Pixel 9");
    expect(onProblem).toHaveBeenCalled();
    expect(() => githubIssueNotifier({ token: "t", repo: "not a repo" })).toThrow();
  });

  it("GitHub skips dumps unless asked", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    const dumpEvent: SupportEvent = { kind: "diagnostics", id: ID, shortId: "3F2A9C1B", userId: USER, createdAt: "x", feedbackId: null, report: dump() };
    await githubIssueNotifier({ token: "t", repo: "a/b", fetch: fetch as never }).notify(dumpEvent);
    expect(fetch).not.toHaveBeenCalled();
    await githubIssueNotifier({ token: "t", repo: "a/b", fetch: fetch as never, on: ["diagnostics"] }).notify(dumpEvent);
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).labels).toEqual(["feedback", "diagnostics"]);
  });

  it("webhook: signed, https only, the dump left out unless asked", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    await webhookNotifier({ url: "https://hooks.test/x", secret: "k", fetch: fetch as never }).notify(feedbackEvent(dump()));
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-genesis-signature"]).toBe(`sha256=${await hmacSha256Hex("k", `${headers["x-genesis-timestamp"]}.${String(init.body)}`)}`);
    const check = (over: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
      verifyWebhookSignature({ secret: "k", body: String(init.body), signature: headers["x-genesis-signature"], timestamp: headers["x-genesis-timestamp"], ...over });
    expect(await check()).toBe(true);
    expect(await check({ secret: "other" })).toBe(false);
    expect(await check({ body: `${String(init.body)} ` })).toBe(false);
    expect(await check({ timestamp: String(Number(headers["x-genesis-timestamp"]) + 1) })).toBe(false);
    // A replay ten minutes later is refused.
    expect(await check({ now: () => Date.now() + 600_000 })).toBe(false);
    const body = JSON.parse(String(init.body));
    expect(body.event).toBe("support.feedback.created");
    expect(body).not.toHaveProperty("report");
    expect(() => webhookNotifier({ url: "http://hooks.test" })).toThrow();
    const failing = webhookNotifier({ url: "https://hooks.test", fetch: (async () => new Response("", { status: 500 })) as never });
    await expect(failing.notify(feedbackEvent())).rejects.toThrow("500");
  });

  it("messenger: a staff alert and thanks to the person, by id", async () => {
    const staffAlert = vi.fn();
    const thankReporter = vi.fn();
    await messengerNotifier({ staffAlert, thankReporter }, { adminUrl: (e) => `https://admin.test/r/${e.id}` }).notify(feedbackEvent());
    expect(staffAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: "feedback", id: TICKET, shortId: "3F2A9C1B", title: "[bug] Save fails", url: `https://admin.test/r/${TICKET}`, userId: USER }));
    expect(thankReporter).toHaveBeenCalledWith({ userId: USER, feedbackId: TICKET, type: "bug", shortId: "3F2A9C1B" });
  });
});

describe("supabaseDiagnosticsStore", () => {
  it("records a screenshot with the person's id (the service role has no session)", async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ data: null, error: null }) });
    await supabaseDiagnosticsStore(client).attachFile!({ feedbackId: TICKET, userId: USER, path: `${USER}/${TICKET}/a.png`, contentType: "image/png", byteSize: 12, width: null, height: null });
    expect(calls[0]?.table).toBe("ticket_attachments");
    expect(arg(calls[0], "insert")).toMatchObject({ user_id: USER, report_id: TICKET, path: `${USER}/${TICKET}/a.png` });
  });

  it("refuses a tenant the person may not write to, asking the database first", async () => {
    const rpc = vi.fn((_fn: string, _args: unknown) => ({ data: false, error: null }));
    const { client, calls } = fakeSupabase({ rpc, respond: () => ({ data: { id: TICKET }, error: null }) });
    const feedback = { type: "bug" as const, title: null, message: "x", severity: null, route: null, appVersion: null, platform: null, device: {}, extra: {}, tenantId: "00000000-0000-4000-8000-0000000000b0", diagnosticsId: null };
    await expect(supabaseDiagnosticsStore(client).saveFeedback!({ userId: USER, feedback })).rejects.toMatchObject({ status: 403 });
    expect(rpc).toHaveBeenCalledWith("support_ticket_tenant_allowed", { person: USER, tenant: feedback.tenantId });
    expect(calls).toEqual([]);
    rpc.mockReturnValueOnce({ data: true, error: null });
    await expect(supabaseDiagnosticsStore(client).saveFeedback!({ userId: USER, feedback })).resolves.toEqual({ id: TICKET });
    // No tenant: the app's own, nothing to ask.
    rpc.mockClear();
    await supabaseDiagnosticsStore(client).saveFeedback!({ userId: USER, feedback: { ...feedback, tenantId: null } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("checks ownership of a ticket and a dump by the person's id", async () => {
    const { client, calls } = fakeSupabase({ respond: (c) => ({ data: c.ops.some(([op, a]) => op === "eq" && a[1] === USER) ? { id: TICKET } : null, error: null }) });
    const store = supabaseDiagnosticsStore(client);
    expect(await store.ownsFeedback!(USER, TICKET)).toBe(true);
    expect(calls[0]?.table).toBe("tickets");
    expect(await store.ownsReport!("someone-else", ID)).toBe(false);
    expect(calls[1]?.table).toBe("support_diagnostics");
  });

  it("writes the dump for the person, and maps the database's rate limit to 429", async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ data: null, error: null }) });
    await supabaseDiagnosticsStore(client).saveReport({ report: dump(), userId: USER, feedbackId: TICKET });
    expect(arg(calls[0], "insert")).toMatchObject({ id: ID, user_id: USER, feedback_id: TICKET, trigger: "manual" });
    const limited = fakeSupabase({ respond: () => ({ data: null, error: { message: "too many", code: "GS429" } }) }).client;
    await expect(supabaseDiagnosticsStore(limited).saveReport({ report: dump(), userId: USER, feedbackId: null })).rejects.toMatchObject({ status: 429 });
  });

  it("writes feedback as a ticket with the dump's id in its context", async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ data: { id: TICKET }, error: null }) });
    const store = supabaseDiagnosticsStore(client);
    const { id } = await store.saveFeedback!({
      userId: USER,
      feedback: { type: "bug", title: null, message: "x", severity: "low", route: "/a", appVersion: null, platform: "ios", device: {}, extra: { a: 1 }, tenantId: null, diagnosticsId: ID },
    });
    expect(id).toBe(TICKET);
    expect(calls[0]?.table).toBe("tickets");
    expect(arg(calls[0], "insert")).toMatchObject({ user_id: USER, context: { a: 1, severity: "low", diagnosticsId: ID } });
  });
});
