// @feat:observability
import { describe, expect, it, vi } from "vitest";
import { sentryEnvironment, sentryRelease, sentrySink, signatureTags, withoutTouchLabels, type SentryLike } from "../../observability/sentry";
import { versionSignature } from "../../updates/signature";

function fakeSentry(client: unknown = undefined) {
  let current = client;
  const sentry = {
    init: vi.fn((options: Record<string, unknown>) => {
      current = { options };
    }),
    getClient: vi.fn(() => current),
    wrap: vi.fn((root) => root),
    captureException: vi.fn(() => "event-id"),
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    expoRouterIntegration: vi.fn((options?: object) => ({ name: "ExpoRouter", options })),
    metrics: { distribution: vi.fn(), count: vi.fn() },
  } satisfies SentryLike;
  const options = () => sentry.init.mock.calls[0]?.[0] as Record<string, (...args: unknown[]) => unknown> & Record<string, unknown>;
  return { sentry, options };
}

const signature = versionSignature({
  platform: "ios",
  application: { nativeApplicationVersion: "1.4.0", nativeBuildVersion: "37" },
  updates: {
    isEnabled: true,
    updateId: "3f2a9c1b-0000-4000-8000-000000000000",
    channel: "preview",
    runtimeVersion: "abc123",
    isEmbeddedLaunch: false,
    checkForUpdateAsync: async () => ({ isAvailable: false }),
    fetchUpdateAsync: async () => ({ isNew: false }),
    reloadAsync: async () => {},
  },
});

describe("sentrySink", () => {
  it("starts nothing without a DSN", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: "", onMissingDsn: () => {} });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sink.captureError).toBeUndefined();
  });

  it("inits once with no default PII, the Expo Router integration, release, dist and update tags", () => {
    const { sentry, options } = fakeSentry();
    sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2", signature, applicationId: "com.example.app" });
    const o = options();
    expect(o).toMatchObject({
      dsn: "https://k@o1.ingest.sentry.io/2",
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      environment: "preview",
      release: "com.example.app@1.4.0+37",
      dist: "37",
    });
    expect(sentry.expoRouterIntegration).toHaveBeenCalledWith({ enableTimeToInitialDisplay: true });
    expect(sentry.setTag).toHaveBeenCalledWith("update.id", "3f2a9c1b-0000-4000-8000-000000000000");
    expect(sentry.setTag).toHaveBeenCalledWith("update.channel", "preview");
  });

  it("does not init again when a client exists (Fast Refresh)", () => {
    const { sentry } = fakeSentry({ existing: true });
    sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("scrubs events, transactions, breadcrumbs and spans before the app's own hooks", () => {
    const { sentry, options } = fakeSentry();
    const theirs = vi.fn((event: unknown) => event);
    sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2", init: { beforeSend: theirs } });
    const o = options();
    const sent = o.beforeSend!({ message: "for a@b.co", user: { id: "u1", email: "a@b.co" } }, {});
    expect(sent).toEqual({ message: "for [email]", user: { id: "u1" } });
    expect(theirs).toHaveBeenCalledWith({ message: "for [email]", user: { id: "u1" } }, {});
    expect(o.beforeSendTransaction!({ request: { url: "https://x.co/a?token=1" } })).toEqual({ request: { url: "https://x.co/a" } });
    expect(o.beforeBreadcrumb!({ category: "http", data: { url: "https://x.co/rest/v1/people?id=eq.1" } })).toEqual({
      category: "http",
      data: { url: "https://x.co/rest/v1/people" },
    });
    expect(o.beforeSendSpan!({ description: "GET https://x.co/rest?id=eq.2", data: { "http.query": "id=eq.2" } })).toEqual({
      description: "GET https://x.co/rest",
      data: {},
    });
  });

  it("hands Sentry the original error object (so its deduplication works) with level and source", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    const error = new Error("boom");
    sink.captureError?.(error, { fatal: true, source: "boundary", componentStack: "in Screen (a@b.co)", route: "/(app)" });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: "genesis.boundary" },
      captureContext: {
        level: "fatal",
        tags: { "genesis.source": "boundary", route: "/(app)" },
        contexts: { react: { componentStack: "in Screen ([email])" } },
      },
    });
    sink.captureError?.(error, { fatal: false, source: "rejection" });
    expect(sentry.captureException.mock.calls[1]).toEqual([error, { mechanism: { handled: true, type: "genesis.rejection" }, captureContext: { level: "error", tags: { "genesis.source": "rejection" } } }]);
    expect(sink.scrubsErrors).toBe(true);
  });

  it("sends trace headers to no host by default, and only to the hosts the app names", () => {
    const none = fakeSentry();
    sentrySink(none.sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    expect(none.options().tracePropagationTargets).toEqual([]);
    const own = fakeSentry();
    sentrySink(own.sentry, { dsn: "https://k@o1.ingest.sentry.io/2", tracePropagationTargets: ["https://abc.supabase.co", /^https:\/\/api\.example\.com/] });
    expect(own.options().tracePropagationTargets).toEqual(["https://abc.supabase.co", /^https:\/\/api\.example\.com/]);
    // The option wins over `init`; `init` alone still works.
    const both = fakeSentry();
    sentrySink(both.sentry, { dsn: "https://k@o1.ingest.sentry.io/2", tracePropagationTargets: ["a.co"], init: { tracePropagationTargets: ["b.co"] } });
    expect(both.options().tracePropagationTargets).toEqual(["a.co"]);
    const initOnly = fakeSentry();
    sentrySink(initOnly.sentry, { dsn: "https://k@o1.ingest.sentry.io/2", init: { tracePropagationTargets: ["b.co"] } });
    expect(initOnly.options().tracePropagationTargets).toEqual(["b.co"]);
  });

  it("marks an unhandled rejection unhandled, at error level, and adds scrubbed tags", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    const error = new Error("x");
    sink.captureError?.(error, { fatal: false, handled: false, source: "rejection" });
    expect((sentry.captureException.mock.calls[0] as unknown[])[1]).toMatchObject({ mechanism: { handled: false }, captureContext: { level: "error" } });
    sink.captureError?.(error, { fatal: false, source: "query", tags: { "query.key": "tasks", odd: "a@b.co" } });
    expect((sentry.captureException.mock.calls[1] as unknown[])[1]).toMatchObject({
      mechanism: { handled: true, type: "genesis.query" },
      captureContext: { tags: { "query.key": "tasks", odd: "[email]", "genesis.source": "query" } },
    });
  });

  it("flushes, gives the last event id and the replay id, and wraps a route's ErrorBoundary", async () => {
    const { sentry } = fakeSentry();
    const Boundary = () => null;
    const wrapped = () => null;
    const extended = Object.assign(sentry, {
      flush: vi.fn(async () => true),
      getReplay: () => ({ getReplayId: () => "replay-1" }),
      wrapExpoRouterErrorBoundary: vi.fn(() => wrapped),
    });
    const sink = sentrySink(extended, { dsn: "https://k@o1.ingest.sentry.io/2" });
    expect(await sink.flush?.(1500)).toBe(true);
    // React Native's flush takes no timeout: the block's deadline bounds it.
    expect(extended.flush).toHaveBeenCalledWith();
    expect(sink.lastEventId?.()).toBeUndefined();
    sink.captureError?.(new Error("x"), { fatal: false, source: "app" });
    expect(sink.lastEventId?.()).toBe("event-id");
    expect(sink.replayId?.()).toBe("replay-1");
    expect(sink.wrapRouteErrorBoundary?.(Boundary)).toBe(wrapped);
  });

  it("has no flush or route wrapper when this Sentry doesn't", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    expect(sink.flush).toBeUndefined();
    expect(sink.wrapRouteErrorBoundary).toBeUndefined();
    expect(sink.replayId?.()).toBeUndefined();
  });

  it("sets the user as an id only, and leaves navigation breadcrumbs to the router integration", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    sink.setUser?.("u1");
    sink.setUser?.(null);
    expect(sentry.setUser.mock.calls).toEqual([[{ id: "u1" }], [null]]);
    sink.breadcrumb?.({ category: "navigation", message: "/settings" });
    sink.breadcrumb?.({ category: "ui", message: "tap" });
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    sink.timing?.("route.time_on_screen", 1200, { route: "/" });
    expect(sentry.metrics.distribution).toHaveBeenCalledWith("route.time_on_screen", 1200, { unit: "millisecond", attributes: { route: "/" } });
  });
});

describe("touch breadcrumbs and environments", () => {
  it("drop the touched element's label (it can hold a name) and keep its component name", () => {
    const crumb = withoutTouchLabels({
      category: "touch",
      message: "Touch event within element: Open Jane Doe",
      data: { path: [{ name: "Pressable", label: "Open Jane Doe" }, { name: "View" }] },
    });
    expect(crumb).toEqual({ category: "touch", message: "Touch event within element: Pressable", data: { path: [{ name: "Pressable" }, { name: "View" }] } });
    const { sentry, options } = fakeSentry();
    sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2" });
    expect(JSON.stringify(options().beforeBreadcrumb!({ category: "touch", message: "Touch event within element: Jane", data: { path: [{ name: "Text", label: "Jane" }] } }))).not.toContain("Jane");
  });

  it("map channels to one environment per kind of build", () => {
    expect(sentryEnvironment("pr-42")).toBe("preview");
    expect(sentryEnvironment("preview")).toBe("preview");
    expect(sentryEnvironment("development")).toBe("development");
    expect(sentryEnvironment(null)).toBe("production");
    expect(sentryEnvironment("production")).toBe("production");
  });

  it("merge the app's own integrations", () => {
    const { sentry, options } = fakeSentry();
    sentrySink(sentry, { dsn: "https://k@o1.ingest.sentry.io/2", integrations: ["a"], init: { integrations: ["b"] } });
    expect(options().integrations).toEqual([{ name: "ExpoRouter", options: { enableTimeToInitialDisplay: true } }, "a", "b"]);
  });
});

describe("release and tags", () => {
  it("leave out a release that can't be built rather than guess", () => {
    expect(sentryRelease(signature, null)).toEqual({});
    expect(sentryRelease(undefined, "com.example.app")).toEqual({});
  });

  it("print unknown values as unknown", () => {
    const off = versionSignature({ platform: "ios" });
    expect(signatureTags(off)).toEqual({ "update.launch": "off", "update.id": "off", "update.channel": "none", "update.runtime": "unknown" });
  });
});
