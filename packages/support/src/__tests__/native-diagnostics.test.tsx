// @feat:support-feedback
import { StrictMode, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createDiagnostics, diagnosticsShortId, DiagnosticsSendError, type DiagnosticReport, type DiagnosticsTransport } from "../index";
import { createSupport, FeedbackForm, nativeSections, observabilitySection, SendDiagnosticsRow, type AccelerometerLike } from "../native";
import { fakeSupabase, type Call } from "./fake-supabase";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const REPORT = "11111111-1111-4111-8111-111111111111";

function memoryTransport(fail?: Error): DiagnosticsTransport & { sent: DiagnosticReport[] } {
  const sent: DiagnosticReport[] = [];
  return {
    name: "memory",
    sent,
    send: async (r) => {
      if (fail) throw fail;
      sent.push(r);
      return { id: r.id, shortId: diagnosticsShortId(r.id) };
    },
  };
}

describe("nativeSections", () => {
  it("reads the build, update, commit and device, probing permissions with a timeout", async () => {
    vi.useFakeTimers();
    try {
      const transport = memoryTransport();
      const d = createDiagnostics({
        app: { id: "acme" },
        transport,
        randomId: () => ID,
        sections: nativeSections({
          platform: "ios",
          application: { nativeApplicationVersion: "1.4.0", nativeBuildVersion: "37", applicationId: "com.acme.app" },
          updates: { isEnabled: true, updateId: "u-1", channel: "production", runtimeVersion: "1.4.0", isEmbeddedLaunch: false },
          requestedChannel: async () => "pr-42",
          buildMetadata: { commit: "0123abc", otaNumber: 7, release: "2026.11.19", publishedAt: "2026-11-19T09:00:00Z" },
          device: { modelName: "iPhone 17", osName: "iOS", osVersion: "26.0" },
          netInfo: { fetch: async () => ({ type: "wifi", isConnected: true, isInternetReachable: true }) },
          permissions: {
            camera: async () => "granted",
            notifications: async () => ({ status: "denied" }),
            microphone: () => new Promise(() => {}),
            photos: async () => Promise.reject(new Error("no module")),
          },
          appState: { currentState: "active" },
          flags: () => ({ beta: true, apiKey: "secret" }),
          blocks: () => ["support-feedback", "observability"],
          server: { baseUrl: "https://x.supabase.co/rest/v1?apikey=k", apiCommit: async () => "abcdef1" },
        }),
      });
      const pending = d.collect();
      await vi.advanceTimersByTimeAsync(1100);
      const r = await pending;
      expect(r.build).toMatchObject({ version: "1.4.0", build: "37", channel: "production", requestedChannel: "pr-42", updateId: "u-1", launch: "update", commit: "0123abc", otaNumber: "7", release: "2026.11.19", releasePublishedAt: "2026-11-19T09:00:00Z" });
      expect(r.device).toMatchObject({ os: "iOS", osVersion: "26.0", model: "iPhone 17", network: { type: "wifi", connected: true, reachable: true }, permissions: { camera: "granted", notifications: "denied", microphone: "timeout", photos: "error" } });
      expect(r.session?.foreground).toBe(true);
      expect(r.flags).toEqual({ beta: true, apiKey: "[Filtered]" });
      expect(r.blocks).toEqual(["support-feedback", "observability"]);
      expect(r.server).toEqual({ baseUrl: "https://x.supabase.co/rest/v1", apiCommit: "abcdef1" });
      expect(r.app.platform).toBe("iOS");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("observabilitySection", () => {
  it("fills logs and sentry from the observability block", async () => {
    const observability = {
      recent: {
        getState: () => ({
          breadcrumbs: [{ category: "navigation", message: "/clients/42?tab=1", timestamp: 0 }],
          errors: [{ at: 0, name: "TypeError", message: "x of undefined (jane@example.test)", source: "screen", fatal: false }],
        }),
      },
      lastEventId: () => "0123456789abcdef0123456789abcdef",
      replayId: () => undefined,
    };
    const d = createDiagnostics({ app: { id: "acme" }, transport: memoryTransport(), sections: [observabilitySection(observability), observabilitySection(null)] });
    const r = await d.collect();
    expect(r.logs.breadcrumbs).toEqual([{ at: "1970-01-01T00:00:00.000Z", category: "navigation", message: "/clients/:id", level: null, data: null }]);
    expect(r.logs.errors[0]).toMatchObject({ name: "TypeError", message: "x of undefined ([email])", source: "screen", fatal: false });
    expect(r.sentry).toEqual({ lastEventId: "0123456789abcdef0123456789abcdef", replayId: null });
    expect(r.sections).toEqual({});
  });
});

function accelerometer() {
  let listener: ((m: { x: number; y: number; z: number }) => void) | null = null;
  const fake: AccelerometerLike & { jolt: (g: number) => void } = {
    addListener: (l) => {
      listener = l;
      return { remove: () => {} };
    },
    setUpdateInterval: vi.fn(),
    jolt: (g) => listener?.({ x: g, y: 0, z: 0 }),
  };
  return fake;
}

function harness(diagnostics: ReturnType<typeof createDiagnostics>, extra: Partial<Parameters<typeof createSupport>[0]> = {}, respond?: (call: Call) => { data: unknown; error: null } | undefined) {
  const fake = fakeSupabase({ respond: respond ?? ((call) => (call.table === "support_reports" ? { data: { id: REPORT }, error: null } : { data: null, error: null })) });
  const navigate = vi.fn();
  const block = createSupport({ supabase: fake.client, navigate, platform: "ios", useCurrentRoute: () => "/orders/42", basePath: "/settings/support", diagnostics, ...extra });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Root = block.Root;
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <Root>{children}</Root>
    </QueryClientProvider>
  );
  return { fake, navigate, block, wrap };
}

describe("createSupport({ diagnostics })", () => {
  it("records the route and makes a dump on a shake; left without a report, it goes on its own", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const acc = accelerometer();
    const { navigate, wrap } = harness(diagnostics, { accelerometer: acc });
    const view = render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // The feedback screen opens, and the person leaves it without sending.
    view.rerender(wrap(<FeedbackForm sentAlert={false} />));
    expect(transport.sent).toHaveLength(0);
    view.rerender(wrap(<span />));
    await waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(transport.sent[0]).toMatchObject({ trigger: "shake", session: { route: "/orders/:id" } });
    vi.restoreAllMocks();
  });

  it("sends a shake's dump with the report it opens: one dump, linked both ways", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const acc = accelerometer();
    const onSent = vi.fn();
    const { fake, navigate, wrap } = harness(diagnostics, { accelerometer: acc });
    const view = render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    vi.restoreAllMocks();
    view.rerender(wrap(<FeedbackForm sentAlert={false} onSent={onSent} />));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "It froze" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const insert = fake.calls.find((c) => c.table === "support_reports")?.ops.find(([op]) => op === "insert")?.[1][0] as { context: Record<string, unknown> };
    expect(insert.context["diagnosticsId"]).toBe(ID);
    view.rerender(wrap(<span />));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "shake", feedbackId: REPORT });
  });

  it("leaving the screen while its report is being sent never sends the shake's dump twice", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const acc = accelerometer();
    let deliver: () => void = () => {};
    const feedbackSink = { submit: vi.fn(() => new Promise<{ id: string }>((resolve) => (deliver = () => resolve({ id: REPORT })))) };
    const { navigate, wrap } = harness(diagnostics, { accelerometer: acc, feedbackSink });
    const view = render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    vi.restoreAllMocks();
    view.rerender(wrap(<FeedbackForm sentAlert={false} />));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "It froze" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(feedbackSink.submit).toHaveBeenCalled());
    // The person leaves while the report is still on its way.
    view.rerender(wrap(<span />));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transport.sent).toHaveLength(0);
    await act(async () => deliver());
    await waitFor(() => expect(transport.sent).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "shake", feedbackId: REPORT });
  });

  it("a shake's dump left unclaimed isn't sent once support's diagnostics.enabled turns off", async () => {
    const transport = memoryTransport();
    // The dump's own instance has no settings source: only support's settings say off.
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const acc = accelerometer();
    let on = true;
    const { navigate, wrap } = harness(diagnostics, { accelerometer: acc, appSettings: () => ({ "diagnostics.enabled": on }) });
    const view = render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    vi.restoreAllMocks();
    view.rerender(wrap(<FeedbackForm sentAlert={false} />));
    on = false;
    view.rerender(wrap(<span />));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(transport.sent).toHaveLength(0);
  });

  it("sends a shake's dump once under StrictMode, which mounts the feedback screen twice", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const acc = accelerometer();
    const onSent = vi.fn();
    const { navigate, wrap } = harness(diagnostics, { accelerometer: acc });
    const view = render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    vi.restoreAllMocks();
    view.rerender(
      <StrictMode>
        {wrap(<FeedbackForm sentAlert={false} onSent={onSent} />)}
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transport.sent).toHaveLength(0);
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "It froze" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    view.rerender(wrap(<span />));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "shake", feedbackId: REPORT });
  });

  it("keeps no routes while diagnostics are off", async () => {
    const transport = memoryTransport();
    let on = false;
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const { wrap } = harness(diagnostics, { appSettings: () => ({ "diagnostics.enabled": on }) });
    render(wrap(<span />));
    await new Promise((resolve) => setTimeout(resolve, 10));
    on = true;
    const report = await diagnostics.collect();
    expect(report.session?.route ?? null).toBeNull();
    expect(report.session?.recentRoutes ?? []).toEqual([]);
  });

  it("sends no dump on a shake with dumpOnShake false", async () => {
    const transport = memoryTransport();
    const acc = accelerometer();
    const { navigate, wrap } = harness(createDiagnostics({ app: { id: "acme" }, transport }), { accelerometer: acc, dumpOnShake: false });
    render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(transport.sent).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("sends a dump with every piece of feedback, the report naming it and it naming the report", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID });
    const onSent = vi.fn();
    const { fake, block, wrap } = harness(diagnostics);
    const view = render(wrap(<span />));
    await block.openFeedback({ screenshot: false });
    view.rerender(wrap(<FeedbackForm sentAlert={false} onSent={onSent} />));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "Save fails" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const insert = fake.calls.find((c) => c.table === "support_reports")?.ops.find(([op]) => op === "insert")?.[1][0] as { context: Record<string, unknown> };
    expect(insert.context["diagnosticsId"]).toBe(ID);
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "feedback", feedbackId: REPORT });
    expect(onSent.mock.calls[0]?.[0]).toMatchObject({ id: REPORT, diagnostics: { id: ID, shortId: "3F2A9C1B", queued: false } });
  });

  it("still sends the feedback when its dump fails", async () => {
    const onSent = vi.fn();
    const { block, wrap } = harness(createDiagnostics({ app: { id: "acme" }, transport: memoryTransport(new DiagnosticsSendError("no", 403, false)) }));
    const view = render(wrap(<span />));
    await block.openFeedback({ screenshot: false });
    view.rerender(wrap(<FeedbackForm sentAlert={false} onSent={onSent} />));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "Save fails" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: REPORT, diagnostics: null })));
  });

  it("fills the devtools overlay's devtoolsDiagnostics slot only with diagnostics", () => {
    const withIt = harness(createDiagnostics({ app: { id: "acme" }, transport: memoryTransport() })).block;
    expect(Object.keys(withIt.contributes?.slots ?? {})).toEqual(["devtoolsFeedback", "devtoolsDiagnostics"]);
    const fake = fakeSupabase();
    const without = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios" });
    expect(Object.keys(without.contributes?.slots ?? {})).toEqual(["devtoolsFeedback"]);
    expect(without.diagnostics).toBeNull();
  });
});

describe("SendDiagnosticsRow", () => {
  it("sends a dump and shows the short id to quote, with Copy id", async () => {
    const transport = memoryTransport();
    const copy = vi.fn();
    render(<SendDiagnosticsRow diagnostics={createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID })} copy={copy} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send-diagnostics-send"));
    });
    await waitFor(() => expect(screen.getByTestId("genesis-support-send-diagnostics-id").textContent).toBe("Sent. Quote 3F2A9C1B to support."));
    expect(transport.sent[0]?.trigger).toBe("manual");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send-diagnostics-copy"));
    });
    expect(copy).toHaveBeenCalledWith(`3F2A9C1B (${ID})`);
  });

  it("says when it failed", async () => {
    render(<SendDiagnosticsRow diagnostics={createDiagnostics({ app: { id: "acme" }, transport: memoryTransport(new DiagnosticsSendError("no", 403, false)) })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send-diagnostics-send"));
    });
    await waitFor(() => expect(screen.getByTestId("genesis-support-send-diagnostics-failed")).toBeTruthy());
  });
});
