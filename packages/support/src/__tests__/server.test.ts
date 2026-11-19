// @feat:support-feedback
import { describe, expect, it, vi } from "vitest";
import { emptyReport, httpTransport, createDiagnostics, type DiagnosticReport } from "../index";
import {
  createDiagnosticsHandler,
  DiagnosticsStoreError,
  githubIssueNotifier,
  hmacSha256Hex,
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

    const byIp = createDiagnosticsHandler({ authenticate: auth, store: memoryStore().store });
    const from = (ip: string) => post(JSON.stringify(dump()), { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` });
    for (let i = 0; i < 5; i++) expect((await byIp(from("1.2.3.4"))).status).toBe(201);
    expect((await byIp(from("1.2.3.4"))).status).toBe(429);
    expect((await byIp(from("5.6.7.8"))).status).toBe(201);
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
    expect(body.body).toContain("``` `\n@everyone");
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
    expect((init.headers as Record<string, string>)["x-genesis-signature"]).toBe(`sha256=${await hmacSha256Hex("k", String(init.body))}`);
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
