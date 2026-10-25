// @feat:observability
import { describe, expect, it, vi } from "vitest";
import { sentryRelease, sentrySink, signatureTags, type SentryLike } from "../../observability/sentry";
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
      level: "fatal",
      tags: { "genesis.source": "boundary", route: "/(app)" },
      contexts: { react: { componentStack: "in Screen ([email])" } },
    });
    expect(sink.scrubsErrors).toBe(true);
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
