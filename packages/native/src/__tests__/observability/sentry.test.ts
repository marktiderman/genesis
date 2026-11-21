// @feat:observability
import { describe, expect, it, vi } from "vitest";
import { SENTRY_SETTINGS_CACHE_KEY, sentryEnvironment, sentryRelease, sentrySink, signatureTags, withoutTouchLabels, type SentryLike } from "../../observability/sentry";
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
  it("starts nothing without a DSN, and its methods do nothing", () => {
    const { sentry } = fakeSentry();
    const onMissingDsn = vi.fn();
    const sink = sentrySink(sentry, { dsn: "", onMissingDsn });
    expect(sentry.init).not.toHaveBeenCalled();
    sink.captureError?.(new Error("x"), { fatal: false, source: "query" });
    sink.breadcrumb?.({ category: "ui" });
    sink.event?.("a", {});
    sink.setUser?.("u1");
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
    // Nothing can start it before the root layout wraps: no wrapping.
    expect(sink.wrap).toBeUndefined();
    expect(sink.status()).toEqual({ running: false, source: null, restartPending: false, problem: null });
    // The settings haven't been read: no notice yet.
    expect(onMissingDsn).not.toHaveBeenCalled();
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

const DSN = "https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/42";
const OTHER = "https://fedcba9876543210fedcba9876543210@o1.ingest.us.sentry.io/43";

function withClose() {
  const fake = fakeSentry();
  const close = vi.fn(async () => true);
  return { ...fake, sentry: { ...fake.sentry, close } as typeof fake.sentry & { close: typeof close } };
}

function memoryCache(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    store,
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
    removeItem: vi.fn((key: string) => void store.delete(key)),
  };
}

describe("sentrySink from Genesis settings", () => {
  it("says once, when the settings have no DSN either, that Sentry isn't configured", () => {
    const { sentry } = fakeSentry();
    const onMissingDsn = vi.fn();
    const sink = sentrySink(sentry, { dsn: undefined, onMissingDsn });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": null } });
    sink.applySettings({ "observability.enabled": true, "observability.sentryDsn": null });
    expect(onMissingDsn).toHaveBeenCalledTimes(1);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sink.healthCheck().run()).toEqual({ status: "ok", message: "Sentry: not configured" });
    expect(sink.healthCheck().name).toBe("observability.sentry");
  });

  it("changes nothing for no settings, or settings without the observability keys", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: DSN });
    sink.applySettings(undefined);
    sink.applySettings({ values: { "support.enabled": true } });
    expect(sink.status()).toMatchObject({ running: true, source: "build" });
  });

  it("starts live from the settings' DSN, and passes on the user set before", () => {
    const { sentry, options } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: null });
    sink.setUser?.("u1");
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    expect(options().dsn).toBe(DSN);
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "u1" });
    expect(sink.status()).toEqual({ running: true, source: "settings", restartPending: false, problem: null });
    sink.captureError?.(new Error("x"), { fatal: false, source: "query" });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sink.healthCheck().run()).toEqual({ status: "ok", message: "Sentry: reporting (DSN from the settings)" });
  });

  it("lets the build's DSN win over the settings'", () => {
    const { sentry, options } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: OTHER });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(options().dsn).toBe(OTHER);
    expect(sink.status()).toEqual({ running: true, source: "build", restartPending: false, problem: null });
  });

  it("closes live when turned off, and waits for the next launch to turn on again", () => {
    const { sentry } = withClose();
    const sink = sentrySink(sentry, { dsn: OTHER });
    sink.applySettings({ values: { "observability.enabled": false, "observability.sentryDsn": null } });
    // Bounded, as the flush before an update reload is.
    expect(sentry.close).toHaveBeenCalledWith(2000);
    expect(sink.status()).toMatchObject({ running: false, restartPending: false });
    sink.captureError?.(new Error("x"), { fatal: false, source: "query" });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sink.healthCheck().run()).toEqual({ status: "ok", message: "Sentry: off (observability.enabled)" });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": null } });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sink.status()).toMatchObject({ running: false, restartPending: true });
    expect(sink.healthCheck().run()).toEqual({ status: "warn", message: "Sentry: the new settings apply at the next launch" });
  });

  it("keeps the running DSN when the settings change it, until the next launch", () => {
    const { sentry, options } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: null });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": OTHER } });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(options().dsn).toBe(DSN);
    expect(sink.status()).toEqual({ running: true, source: "settings", restartPending: true, problem: null });
    // Back to the running one: nothing waits.
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    expect(sink.status().restartPending).toBe(false);
  });

  it("reports a DSN of the wrong shape, from the settings or the build", () => {
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: null });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": "https://sentry.example.test/42" } });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sink.status().problem).toMatch(/^observability\.sentryDsn isn't a Sentry DSN/);
    expect(sink.healthCheck().run().status).toBe("fail");
    // resolveSettings skips a value its pattern refuses and says why: that is reported too.
    sink.applySettings({
      values: { "observability.enabled": true, "observability.sentryDsn": null },
      problems: [{ key: "observability.sentryDsn", kind: "type", layer: "database", message: "observability.sentryDsn must match …" }],
    } as never);
    expect(sink.status().problem).toBe("observability.sentryDsn must match …");
    const built = fakeSentry();
    const fromBuild = sentrySink(built.sentry, { dsn: "not a dsn" });
    expect(built.sentry.init).toHaveBeenCalledTimes(1);
    expect(fromBuild.status().problem).toMatch(/^EXPO_PUBLIC_SENTRY_DSN isn't a Sentry DSN/);
  });

  it("keeps the settings' values (not the DSN in use) for the next launch, and starts from them at once", () => {
    const cache = memoryCache();
    const first = fakeSentry();
    sentrySink(first.sentry, { dsn: null, cache }).applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN, "support.enabled": true } });
    expect(JSON.parse(cache.store.get(SENTRY_SETTINGS_CACHE_KEY)!)).toEqual({ "observability.enabled": true, "observability.sentryDsn": DSN });
    const next = fakeSentry();
    const sink = sentrySink(next.sentry, { dsn: null, cache });
    expect(next.options().dsn).toBe(DSN);
    expect(sink.status()).toMatchObject({ running: true, source: "cache" });
    expect(sink.wrap).toBeDefined();
    // A new build's own DSN still wins over the cached settings.
    const rebuilt = fakeSentry();
    expect(sentrySink(rebuilt.sentry, { dsn: OTHER, cache }).status().source).toBe("build");
    expect(rebuilt.options().dsn).toBe(OTHER);
  });

  it("starts from an async cache when it answers, unless the settings came first", async () => {
    const values = JSON.stringify({ "observability.enabled": true, "observability.sentryDsn": DSN });
    const later = { getItem: vi.fn(async () => values), setItem: vi.fn(async () => {}), removeItem: vi.fn(async () => {}) };
    const a = fakeSentry();
    const sink = sentrySink(a.sentry, { dsn: null, cache: later });
    expect(a.sentry.init).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(a.options().dsn).toBe(DSN);
    expect(sink.status().source).toBe("cache");

    const b = fakeSentry();
    const fresh = sentrySink(b.sentry, { dsn: null, cache: { ...later, getItem: vi.fn(async () => values) } });
    fresh.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": OTHER } });
    await Promise.resolve();
    await Promise.resolve();
    expect(b.sentry.init).toHaveBeenCalledTimes(1);
    expect(b.options().dsn).toBe(OTHER);
  });

  it("doesn't start a build DSN the cached settings turned off", () => {
    const cache = memoryCache({ [SENTRY_SETTINGS_CACHE_KEY]: JSON.stringify({ "observability.enabled": false, "observability.sentryDsn": null }) });
    const { sentry } = fakeSentry();
    const sink = sentrySink(sentry, { dsn: OTHER, cache });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sink.status().running).toBe(false);
  });

  it("isn't running when init throws, says why, and a later settings change can still start it", () => {
    const { sentry, options } = fakeSentry();
    sentry.init.mockImplementationOnce(() => {
      throw new Error("bad transport");
    });
    const sink = sentrySink(sentry, { dsn: null });
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    expect(sink.status()).toMatchObject({ running: false, problem: "Sentry didn't start: bad transport" });
    expect(sink.healthCheck().run().status).toBe("fail");
    sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } });
    expect(options()).toBeDefined();
    expect(sentry.init).toHaveBeenCalledTimes(2);
    expect(sink.status()).toMatchObject({ running: true, source: "settings" });
  });

  it("ignores a cache that throws or holds something else", () => {
    const { sentry } = fakeSentry();
    const broken = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    const sink = sentrySink(sentry, { dsn: null, cache: broken });
    expect(() => sink.applySettings({ values: { "observability.enabled": true, "observability.sentryDsn": DSN } })).not.toThrow();
    expect(sink.status().running).toBe(true);
    const odd = fakeSentry();
    sentrySink(odd.sentry, { dsn: null, cache: memoryCache({ [SENTRY_SETTINGS_CACHE_KEY]: "{not json" }) });
    expect(odd.sentry.init).not.toHaveBeenCalled();
  });
});
