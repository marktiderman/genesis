// @feat:support-feedback
// Phase 2c (rest): feedback in the offline queue, the dump as text for staff, the health-check
// registry and its dump section.
import { describe, expect, it } from "vitest";
import {
  createDiagnostics,
  createHealthChecks,
  diagnosticsShortId,
  diagnosticsViewSections,
  emptyReport,
  healthChecksSection,
  memoryQueueStorage,
  redactReport,
  supabaseHealthChecks,
  DiagnosticsSendError,
  SupportError,
  type DiagnosticReport,
  type DiagnosticsTransport,
  type FeedbackRecord,
} from "../index";

const KEY = "genesis-support.diagnostics.queue";
const due = (storage: ReturnType<typeof memoryQueueStorage>) => {
  const queued = JSON.parse(storage.data.get(KEY)!);
  for (const e of queued) e.nextAt = 0;
  storage.data.set(KEY, JSON.stringify(queued));
};

const record: FeedbackRecord = {
  type: "bug",
  message: "It broke",
  context: { route: "/home" },
  attachments: [{ kind: "screenshot", contentType: "image/png", base64: "iVBORw0KGgo=" }],
};

describe("feedback in the offline queue", () => {
  const transport = (online: () => boolean) => {
    const feedback: FeedbackRecord[] = [];
    const dumps: DiagnosticReport[] = [];
    const t: DiagnosticsTransport = {
      name: "t",
      feedbackSink: {
        async submit(r) {
          // A support client offline: an error with no code.
          if (!online()) throw new SupportError("TypeError: Failed to fetch", "", "submit");
          feedback.push(r);
          return { id: `ticket-${feedback.length}`, attachmentsDropped: 0 };
        },
      },
      async send(r) {
        if (!online()) throw new DiagnosticsSendError("offline", 0, true);
        dumps.push(r);
        return { id: r.id, shortId: diagnosticsShortId(r.id) };
      },
    };
    return { t, feedback, dumps };
  };

  it("keeps feedback written offline (without its screenshot) and sends it with its dump later", async () => {
    let online = false;
    const { t, feedback, dumps } = transport(() => online);
    const storage = memoryQueueStorage();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: "user-a" }), offline: { storage, autoRetry: false } });
    const answer = await d.submitFeedback(record);
    expect(answer.queued).toBe(true);
    expect(answer.id).toBe("");
    expect(answer.attachmentsDropped).toBe(1);
    expect(answer.diagnostics?.queued).toBe(true);
    expect(await d.pending()).toBe(1);
    expect(storage.data.get(KEY)).not.toContain("iVBORw0KGgo");

    online = true;
    due(storage);
    expect(await d.flush()).toEqual({ sent: 1, kept: 0, dropped: 0 });
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.message).toBe("It broke");
    expect(feedback[0]!.attachments).toBeUndefined();
    expect(feedback[0]!.diagnosticsId).toBe(answer.diagnostics!.id);
    expect(dumps).toHaveLength(1);
    expect(dumps[0]!.feedbackId).toBe("ticket-1");
  });

  it("never queues feedback the server refused", async () => {
    const t: DiagnosticsTransport = {
      name: "t",
      feedbackSink: {
        submit: async () => {
          throw new SupportError("Sign in to send feedback.", "42501", "submit");
        },
      },
      send: async (r) => ({ id: r.id, shortId: diagnosticsShortId(r.id) }),
    };
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, offline: { storage: memoryQueueStorage(), autoRetry: false } });
    await expect(d.submitFeedback(record)).rejects.toThrow("Sign in");
    expect(await d.pending()).toBe(0);
  });

  it("never queues feedback without a known author, and never sends it as someone else", async () => {
    let online = false;
    const { t, feedback } = transport(() => online);
    const anonymous = createDiagnostics({ app: { id: "acme" }, transport: t, offline: { storage: memoryQueueStorage(), autoRetry: false } });
    await expect(anonymous.submitFeedback(record)).rejects.toBeInstanceOf(SupportError);
    expect(await anonymous.pending()).toBe(0);

    let user = "alice";
    const storage = memoryQueueStorage();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: user }), offline: { storage, autoRetry: false } });
    expect((await d.submitFeedback(record)).queued).toBe(true);
    online = true;
    user = "bob";
    due(storage);
    expect(await d.flush()).toEqual({ sent: 0, kept: 0, dropped: 1 });
    expect(feedback).toEqual([]);
  });

  it("takes the author from the transport's session when the app gives no `user`", async () => {
    const { t } = transport(() => false);
    const d = createDiagnostics({ app: { id: "acme" }, transport: { ...t, userId: async () => "alice" }, offline: { storage: memoryQueueStorage(), autoRetry: false } });
    expect((await d.submitFeedback(record)).queued).toBe(true);
  });

  it("queues feedback from the form's own sink only in the help desk that sink names", async () => {
    const { t } = transport(() => false);
    const offlineSink = { submit: async () => Promise.reject(new SupportError("TypeError: Failed to fetch", "", "submit")) };
    const storage = memoryQueueStorage();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: "alice" }), offline: { storage, autoRetry: false } });
    // A sink that can't say its tenant: not queued (the transport's might file it elsewhere).
    await expect(d.submitFeedback(record, { sink: offlineSink })).rejects.toBeInstanceOf(SupportError);
    expect(await d.pending()).toBe(0);
    // A support client names it: the queued record carries it.
    expect((await d.submitFeedback(record, { sink: { ...offlineSink, currentTenant: async () => "acme-desk" } })).queued).toBe(true);
    expect(JSON.parse(storage.data.get(KEY)!)[0].item.record.tenantId).toBe("acme-desk");
  });

  it("keeps queued feedback when diagnostics are switched off, and evicts dumps before it", async () => {
    const { t } = transport(() => false);
    const storage = memoryQueueStorage();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, user: () => ({ id: "alice" }), offline: { storage, autoRetry: false, maxItems: 2 } });
    await d.submitFeedback(record);
    await d.send({ trigger: "manual" });
    await d.send({ trigger: "manual" });
    const kinds = () => JSON.parse(storage.data.get(KEY)!).map((e: { item: { kind?: string } }) => e.item.kind ?? "dump");
    expect(kinds()).toEqual(["feedback", "dump"]);
    createDiagnostics({ app: { id: "acme" }, transport: t, offline: { storage, autoRetry: false }, appSettings: { "diagnostics.enabled": false } });
    await new Promise((r) => setTimeout(r, 0));
    expect(kinds()).toEqual(["feedback"]);
  });

  it("throws, as before, without an offline queue", async () => {
    const { t } = transport(() => false);
    const d = createDiagnostics({ app: { id: "acme" }, transport: t });
    await expect(d.submitFeedback(record)).rejects.toBeInstanceOf(SupportError);
  });
});

describe("the dump as text for staff", () => {
  it("lists the collected sections in order, as plain text, and leaves out empty ones", () => {
    const report = redactReport({
      ...emptyReport({ id: "3f2a9c1b-0000-4000-8000-000000000001", createdAt: "2026-11-19T10:00:00.000Z", trigger: "shake", app: { id: "acme" } }),
      build: { version: "1.4.0", commit: "abc1234" } as never,
      checks: [{ name: "auth.session", status: "warn", ok: true, ms: 3, detail: "signed out" }],
      logs: { errors: [], breadcrumbs: [], console: [{ at: null, level: "warn", text: "<b>hi</b>" }] },
      sections: { game: { round: 3 } },
    });
    const sections = diagnosticsViewSections(report);
    expect(sections.map((s) => s.key)).toEqual(["summary", "build", "checks", "logs.console", "sections.game"]);
    expect(sections[0]!.text).toContain("shortId: 3F2A9C1B");
    expect(sections[2]!.text).toBe("warn  auth.session — signed out (3 ms)");
    // Text, kept as written: the viewers render it as text, never markup.
    expect(sections[3]!.text).toContain("<b>hi</b>");
  });

  it("skips list items that aren't objects, so a hand-made dump can't break the viewer", () => {
    const report = {
      ...emptyReport({ id: "3f2a9c1b-0000-4000-8000-000000000001", createdAt: "2026-11-19T10:00:00.000Z", trigger: "manual" }),
      checks: [null, "x", { name: "ok.one", ok: true, ms: 1, detail: null }],
      logs: { errors: [null, 3], breadcrumbs: ["a", null], console: [null, "line", { at: null, level: "log", text: "kept" }] },
    };
    const sections = diagnosticsViewSections(report);
    expect(sections.map((s) => s.key)).toEqual(["summary", "checks", "logs.console"]);
    expect(sections[2]!.text).toBe("? [log] kept");
  });

  it("says so for something that isn't a dump", () => {
    expect(diagnosticsViewSections({ hello: 1 })).toEqual([{ key: "summary", title: "Summary", text: "Not a genesis.diagnostics/1 dump." }]);
  });
});

describe("health checks", () => {
  it("runs every check, with ok, warn and fail, a throw and a timeout failing", async () => {
    const checks = createHealthChecks();
    checks.register(
      { name: "a", run: () => ({ status: "ok" }) },
      { name: "b", run: async () => ({ status: "warn", message: "slow" }) },
      {
        name: "c",
        run: () => {
          throw new Error("boom");
        },
      },
      { name: "d", run: () => new Promise(() => undefined), timeoutMs: 10 },
    );
    const results = await checks.run();
    expect(results.map((r) => [r.name, r.status, r.message])).toEqual([
      ["a", "ok", null],
      ["b", "warn", "slow"],
      ["c", "fail", "boom"],
      ["d", "fail", "timed out after 10 ms"],
    ]);
    expect(checks.latest()).toBe(results);
  });

  it("puts the latest results in the dump's checks section, running them once if none ran", async () => {
    const checks = createHealthChecks();
    const remove = checks.register({ name: "x", run: () => ({ status: "fail", message: "down" }) });
    const d = createDiagnostics({
      app: { id: "acme" },
      transport: { name: "t", send: async (r) => ({ id: r.id, shortId: "" }) },
      sections: [healthChecksSection(checks)],
    });
    const report = await d.collect();
    expect(report.checks).toEqual([expect.objectContaining({ name: "x", status: "fail", ok: false, detail: "down" })]);
    remove();
    expect(checks.list()).toEqual([]);
  });

  it("keeps when each check ran, and runs them again when the last run is over 5 minutes old", async () => {
    let clock = Date.parse("2026-11-19T10:00:00.000Z");
    const checks = createHealthChecks({ now: () => clock });
    let runs = 0;
    checks.register({ name: "x", run: () => ((runs += 1), { status: "ok" }) });
    const d = createDiagnostics({ app: { id: "acme" }, transport: { name: "t", send: async (r) => ({ id: r.id, shortId: "" }) }, sections: [healthChecksSection(checks, { now: () => clock })] });
    expect((await d.collect()).checks?.[0]?.at).toBe("2026-11-19T10:00:00.000Z");
    clock += 60_000;
    await d.collect();
    expect(runs).toBe(1);
    clock += 5 * 60_000;
    expect((await d.collect()).checks?.[0]?.at).toBe("2026-11-19T10:06:00.000Z");
    expect(runs).toBe(2);
  });

  it("checks Supabase is there and a session is present", async () => {
    const fake = (status: number, session: unknown) => ({
      auth: { getSession: async () => ({ data: { session }, error: null }) },
      from: () => ({ select: () => ({ limit: async () => ({ status, error: status ? null : { message: "fetch failed" } }) }) }),
    });
    const run = async (status: number, session: unknown) => {
      const checks = createHealthChecks();
      checks.register(...supabaseHealthChecks(fake(status, session)));
      return (await checks.run()).map((r) => r.status);
    };
    expect(await run(200, { user: {} })).toEqual(["ok", "ok"]);
    expect(await run(401, null)).toEqual(["ok", "warn"]);
    expect(await run(0, null)).toEqual(["fail", "warn"]);
    expect(await run(503, null)).toEqual(["warn", "warn"]);
  });
});
