// @feat:support-feedback
// Cases from the adversarial review of the context dump: each one leaked or broke before.
import { describe, expect, it, vi } from "vitest";
import {
  capReport,
  captureConsole,
  cleanRoute,
  createDiagnostics,
  diagnosticsShortId,
  DIAGNOSTICS_DEFAULTS,
  emptyReport,
  jsonByteLength,
  memoryQueueStorage,
  redactReport,
  DiagnosticsSendError,
  type DiagnosticReport,
  type DiagnosticsTransport,
} from "../index";
import { parseDiagnosticReport } from "../server/index";
import { scrubString } from "../diagnostics/scrub";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const base = (over: Partial<DiagnosticReport> = {}): DiagnosticReport => ({ ...emptyReport({ id: ID, createdAt: "2026-11-19T10:00:00.000Z", trigger: "manual" }), ...over });

describe("no key is trusted to hold an id in a dump", () => {
  it("scrubs values under Sentry's id field names in sections, device, flags, breadcrumbs and extras, on the device and the server", () => {
    const leak = "jane@example.test +15555550101";
    const report = base({
      sections: { game: { environment: leak, release: leak, trace_id: leak } },
      device: { os: "ios", event_id: leak } as never,
      flags: { dist: leak },
      build: { version: "1", public_key: leak } as never,
      session: { uptimeMs: 1, route: "/", recentRoutes: [], foreground: true, environment: leak } as never,
      logs: { errors: [], breadcrumbs: [{ at: null, category: "x", message: null, level: null, data: { span_id: leak } }], console: [] },
    });
    for (const out of [redactReport(report), (parseDiagnosticReport(JSON.stringify(report)) as { report: DiagnosticReport }).report]) {
      const text = JSON.stringify(out);
      expect(text).not.toContain("jane@");
      expect(text).not.toContain("5555550101");
    }
  });
});

describe("captureConsole", () => {
  it("filters secret keys in logged objects before they become text", () => {
    const fake = { log: (..._a: unknown[]) => {} };
    const buffer = captureConsole({ console: fake });
    fake.log("login", { password: "hunter2", token: "abc", apiKey: "k-123", user: { email: "x" } });
    const text = buffer.lines()[0]!.text;
    for (const secret of ["hunter2", '"abc"', "k-123"]) expect(text).not.toContain(secret);
    expect(text).toContain("[Filtered]");
    buffer.restore();
  });
});

describe("capReport", () => {
  it("keeps extras beside the build, server and session within the caps (a 441 KB dump used to pass whole)", () => {
    const big = "x".repeat(4000);
    const report = base({
      build: { version: "1.0", ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`extra${i}`, big])) } as never,
      server: { baseUrl: "https://api.test", apiCommit: null, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, big])) } as never,
      session: { uptimeMs: 1, route: "/", recentRoutes: [], foreground: true, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, big])) } as never,
      blocks: Array.from({ length: 1000 }, (_, i) => `block-${i}-${big.slice(0, 200)}`),
      checks: Array.from({ length: 40 }, (_, i) => ({ name: `c${i}`, ok: false, ms: 1, detail: big })),
    });
    expect(jsonByteLength(report)).toBeGreaterThan(400_000);
    const out = capReport(report);
    expect(jsonByteLength(out)).toBeLessThanOrEqual(DIAGNOSTICS_DEFAULTS.maxBytes);
    expect(out.build?.version).toBe("1.0");
    expect(out.server?.baseUrl).toBe("https://api.test");
    expect(out.session?.route).toBe("/");
    expect(out.truncated).toEqual(expect.arrayContaining(["build", "server", "session", "blocks"]));
  });
});

describe("routes and text", () => {
  it("replaces phone numbers and short codes in paths", () => {
    expect(cleanRoute("/call/+15555550101")).toBe("/call/:phone");
    expect(cleanRoute("/invite/ab12cd")).toBe("/invite/:token");
    // Ordinary words and versions stay.
    expect(cleanRoute("/settings/oauth2/v2/help-center")).toBe("/settings/oauth2/v2/help-center");
    expect(cleanRoute("/redeem/x7k9q2")).toBe("/redeem/:token");
    // Slugs that end in a number, or have separators, are ordinary words.
    for (const route of ["/game/round42", "/docs/ios17-setup", "/blog/top-10-tips-2024", "/release/v2024"]) expect(cleanRoute(route)).toBe(route);
  });

  it("scrubs phone numbers written without a separator or in spaced groups", () => {
    expect(scrubString("call +15555550101 now")).toBe("call [phone] now");
    expect(scrubString("ring 44 20 7946 0958")).toBe("ring [phone]");
    expect(scrubString("on 2026-11-19, v1.4.0")).toBe("on 2026-11-19, v1.4.0");
    expect(scrubString("ring 020 7946 0958")).toBe("ring [phone]");
    expect(scrubString("call 5555550101 or 15555550101")).toBe("call [phone] or [phone]");
    // Counts, durations, dates, epoch times and ids are not phone numbers.
    for (const text of ["took 120 340 560 ms", "build 2024 11 19", "at 1732012345", "at 1732012345678", "id 5555550101abcdef", "n 12345678901234567", "uuid 3f2a9c1b-0000-4000-8000-000000000001"]) {
      expect(scrubString(text)).toBe(text);
    }
  });
});

describe("the offline queue across people", () => {
  const transport = (online: () => boolean): DiagnosticsTransport & { sent: DiagnosticReport[] } => {
    const sent: DiagnosticReport[] = [];
    return {
      name: "t",
      sent,
      send: async (r) => {
        if (!online()) throw new DiagnosticsSendError("offline", 0, true);
        sent.push(r);
        return { id: r.id, shortId: diagnosticsShortId(r.id) };
      },
    };
  };

  it("drops a dump queued for someone else when another person is signed in, and clears on sign-out", async () => {
    let online = false;
    let user = "user-a";
    const t = transport(() => online);
    const storage = memoryQueueStorage();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: user }), offline: { storage, autoRetry: false } });
    expect((await d.send({ trigger: "manual" })).queued).toBe(true);
    online = true;
    user = "user-b";
    // `flush` keeps backoff; force it through the queue API by waiting out the delay instead.
    const queued = JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!);
    queued[0].nextAt = 0;
    storage.data.set("genesis-support.diagnostics.queue", JSON.stringify(queued));
    expect(await d.flush()).toEqual({ sent: 0, kept: 0, dropped: 1 });
    expect(t.sent).toEqual([]);

    online = false;
    await d.send({ trigger: "manual" });
    expect(await d.pending()).toBe(1);
    await d.clearQueue();
    expect(await d.pending()).toBe(0);
  });

  it("keeps a queued dump while nobody is signed in yet (a session restored late), then sends it", async () => {
    const storage = memoryQueueStorage();
    const first = createDiagnostics({ app: { id: "acme" }, transport: transport(() => false), user: () => ({ id: "user-a" }), offline: { storage, autoRetry: false } });
    await first.send({ trigger: "manual" });
    const due = () => {
      const queued = JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!);
      for (const e of queued) e.nextAt = 0;
      storage.data.set("genesis-support.diagnostics.queue", JSON.stringify(queued));
    };
    due();
    // Restart: online, but `user` is null until the session is back.
    let user: string | null = null;
    const t = transport(() => true);
    const second = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => (user ? { id: user } : null), offline: { storage, autoRetry: false } });
    await second.flush();
    expect(await second.pending()).toBe(1);
    expect(t.sent).toEqual([]);
    user = "user-a";
    due();
    expect(await second.flush()).toEqual({ sent: 1, kept: 0, dropped: 0 });
    expect(t.sent).toHaveLength(1);
  });

  it("matches a queued dump to its person by the raw id, even one the scrubber rewrites in the dump", async () => {
    const hexId = "0123456789abcdef0123456789abcdef";
    let online = false;
    const storage = memoryQueueStorage();
    const t = transport(() => online);
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: hexId }), offline: { storage, autoRetry: false } });
    await d.send({ trigger: "manual" });
    const queued = JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!);
    expect(queued[0].item.userId).toBe(hexId);
    expect(queued[0].item.report.user.id).toBe("[hex]");
    queued[0].nextAt = 0;
    storage.data.set("genesis-support.diagnostics.queue", JSON.stringify(queued));
    online = true;
    expect(await d.flush()).toEqual({ sent: 1, kept: 0, dropped: 0 });
  });

  it("caps the stored queue by bytes, dropping the oldest", async () => {
    const storage = memoryQueueStorage();
    const onProblem = vi.fn();
    const d = createDiagnostics({
      app: { id: "acme" },
      transport: transport(() => false),
      offline: { storage, autoRetry: false, maxBytes: 9_000 },
      onProblem,
      sections: [{ name: "pad", collect: () => ({ v: "p".repeat(8000) }), options: {} }],
    });
    for (let i = 0; i < 5; i++) await d.send({ trigger: "manual" });
    expect(new TextEncoder().encode(storage.data.get("genesis-support.diagnostics.queue")!).length).toBeLessThanOrEqual(9_000);
    expect(await d.pending()).toBeGreaterThanOrEqual(1);
    expect(await d.pending()).toBeLessThan(5);
    expect(onProblem).toHaveBeenCalledWith(expect.stringContaining("over its size"), undefined);
  });

  it("sends what was left from the last run as soon as it is created", async () => {
    const storage = memoryQueueStorage();
    const first = createDiagnostics({ app: { id: "acme" }, transport: transport(() => false), offline: { storage, autoRetry: false } });
    await first.send({ trigger: "manual" });
    const queued = JSON.parse(storage.data.get("genesis-support.diagnostics.queue")!);
    queued[0].nextAt = 0;
    storage.data.set("genesis-support.diagnostics.queue", JSON.stringify(queued));
    const t = transport(() => true);
    createDiagnostics({ app: { id: "acme" }, transport: t, offline: { storage, autoRetry: false } });
    await vi.waitFor(() => expect(t.sent).toHaveLength(1));
  });
});
