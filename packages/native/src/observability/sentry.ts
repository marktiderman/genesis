/**
 * `sentrySink(Sentry, options)`: Sentry through the observability seam.
 * `@sentry/react-native` is an optional peer, passed in rather than
 * imported (`import * as Sentry from "@sentry/react-native"`), so an app
 * without it never bundles it.
 *
 * Calling it with the build's DSN runs `Sentry.init` at once, so call it at
 * module scope (where `createObservability` is built, before the root layout
 * renders): errors thrown while the app's modules load and the shell's first
 * render are then caught. A second call in the same process (Fast Refresh)
 * reuses the client.
 *
 * Without a build DSN, Genesis settings give it (`observability.sentryDsn`,
 * `observability.enabled`: see `./settings`): pass the resolved settings to
 * `applySettings` whenever they change, and a `cache` (AsyncStorage) so later
 * launches start at once from the last settings this device read. What
 * applies when:
 * - the first start, and turning reporting off (`Sentry.close`), are live;
 * - a new DSN, or turning it on again after it was closed, applies at the
 *   next launch (`status().restartPending`): Sentry is never started twice in
 *   one process.
 * The build's DSN (`EXPO_PUBLIC_SENTRY_DSN`) wins over the settings';
 * `observability.enabled` false stops either.
 *
 * What it sets up, on Expo SDK 58 with @sentry/react-native 8:
 * - `expoRouterIntegration` (navigation spans, time to initial display);
 * - release `<applicationId>@<version>+<build>` and dist `<build>` from the
 *   version signature (Sentry's own format, so release health lines up),
 *   with the update id, channel, runtime version and launch as tags;
 * - the PII scrubber on every event, transaction, span, breadcrumb and log
 *   (`beforeSend`, `beforeSendTransaction`, `beforeSendSpan`,
 *   `beforeBreadcrumb`, `beforeSendLog`), and the user as an id only;
 * - no default PII, screenshots, view hierarchy or accessibility labels, and
 *   touch breadcrumbs without the touched element's label (labels hold names);
 * - fatal errors and unhandled promise rejections marked unhandled, so
 *   release health counts them;
 * - trace headers (`sentry-trace`, `baggage`) sent only to the hosts in
 *   `tracePropagationTargets` (none by default), never to every request;
 * - `flush` before an update reloads the app (the observability block
 *   registers it), the last event id and the replay id for a support
 *   request, and `wrapExpoRouterErrorBoundary` around the block's screen
 *   boundary.
 *
 * Native crashes (sentry-cocoa, sentry-android) are built on the device's
 * native side and don't pass through these JavaScript hooks.
 *
 * Errors: the shell (`GenesisNativeApp`) reports every error it catches
 * through `captureError`. Sentry's own global handler stays on for errors
 * before the shell mounts; when both see one error object, Sentry's
 * deduplication (`__sentry_captured__`) sends it once.
 */
import type { ComponentType } from "react";
import type { VersionSignature } from "../updates/signature";
import { scrubEvent, scrubRecord, scrubString } from "./scrub";
import { own, resolveSentryDsn, settingsValuesOf, type ObservabilitySettingsInput, type SentryDsnSource } from "./settings";
import type { ObservabilitySink, RouteErrorBoundaryProps } from "./sink";

type Options = Record<string, unknown>;
type Hook<T> = (value: T, hint?: unknown) => T | null | PromiseLike<T | null>;

/**
 * `@sentry/react-native`'s namespace: the calls this sink makes. Method
 * syntax on purpose, so the real namespace (with wider option types) fits.
 */
export interface SentryLike {
  init(options: Options): unknown;
  getClient(): unknown;
  wrap<P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P>;
  captureException(error: unknown, context?: Options): string;
  addBreadcrumb(breadcrumb: Options): void;
  setUser(user: { id: string } | null): void;
  setTag(key: string, value: string): void;
  expoRouterIntegration?(options?: { enableTimeToInitialDisplay?: boolean }): unknown;
  /** Sentry 8.17+ (`wrapExpoRouterErrorBoundary`): reports a route's error from its `ErrorBoundary`. */
  wrapExpoRouterErrorBoundary?(boundary: ComponentType<RouteErrorBoundaryProps>): ComponentType<RouteErrorBoundaryProps>;
  /** Sends what is queued. Takes no timeout on React Native: the observability block holds the deadline. */
  flush?(): PromiseLike<boolean>;
  lastEventId?(): string | undefined;
  /** The active session replay integration, when replay is on (`getReplay()?.getReplayId()`). */
  getReplay?(): { getReplayId(): string | null | undefined } | undefined;
  metrics?: {
    distribution(name: string, value: number, options?: Options): void;
    count(name: string, value?: number, options?: Options): void;
  };
  /**
   * Stops the client (`Sentry.close(timeout)`): how `observability.enabled` false stops reporting
   * at once. The timeout bounds the flush of what is already queued.
   */
  close?(timeout?: number): PromiseLike<unknown> | void;
}

/**
 * Where the sink keeps the last settings it was given, for the next launch: AsyncStorage, or
 * localStorage. Sync or async.
 */
export interface SentrySettingsCache {
  getItem(key: string): string | null | undefined | PromiseLike<string | null | undefined>;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

/** The cache's key. It holds the settings' values (never the DSN in use), so a new build's DSN still wins. */
export const SENTRY_SETTINGS_CACHE_KEY = "genesis.observability.settings";

export interface SentrySinkOptions {
  /**
   * `process.env.EXPO_PUBLIC_SENTRY_DSN`: Sentry starts at once with it, and it wins over the
   * settings. Empty or missing: the settings give the DSN (`applySettings`, `cache`).
   */
  dsn: string | undefined | null;
  /**
   * Keeps the last settings `applySettings` was given (AsyncStorage), so the next launch starts
   * Sentry from them at once, before the settings are read again (they need a signed-in person).
   */
  cache?: SentrySettingsCache;
  /** Default `development` in `__DEV__`, else from the signature's channel: `production`, `preview` (`preview` and `pr-*`), `development`, else `production`. */
  environment?: string;
  /** The version signature (`versionSignature(…)` from `/updates`, or the updates block's `signature`): release, dist and update tags. */
  signature?: VersionSignature;
  /** `Application.applicationId` (expo-application): the release's prefix. */
  applicationId?: string | null;
  /** Default 0.2 in production and 1 elsewhere. */
  tracesSampleRate?: number;
  /** Navigation spans and time to initial display through Expo Router. Default true. */
  expoRouter?: boolean | { enableTimeToInitialDisplay?: boolean };
  /**
   * The URLs that get Sentry's trace headers (`sentry-trace`, `baggage`),
   * as strings (matched anywhere in the URL) or regular expressions: your
   * own API and Supabase project (`["https://abc.supabase.co"]`). Default
   * none: no request carries them, so third-party hosts never see your
   * trace ids and their CORS never trips on the extra headers. Wins over
   * `init.tracePropagationTargets`.
   */
  tracePropagationTargets?: readonly (string | RegExp)[];
  /** More integrations (replay, profiling). Masking is yours to set on them. */
  integrations?: readonly unknown[];
  /**
   * Other `Sentry.init` options. The scrubbing hooks run first and yours
   * after, on the scrubbed value; `sendDefaultPii` and the screenshot,
   * view-hierarchy and accessibility options can be set here on purpose.
   */
  init?: Options;
  /** False turns the scrubber off (not recommended; it is also the only thing reducing the user to an id). Default true. */
  scrub?: boolean;
  /**
   * Called once when no DSN is set anywhere (the build, the settings), instead of the notice
   * printed in development. Not called while the settings haven't been read.
   */
  onMissingDsn?: () => void;
}

declare const __DEV__: boolean | undefined;
const isDev = () => typeof __DEV__ !== "undefined" && __DEV__;

/** Sentry's release format: `<applicationId>@<version>+<build>`, with `dist` the build; `undefined` parts when unknown. */
export function sentryRelease(signature: VersionSignature | undefined, applicationId?: string | null): { release?: string; dist?: string } {
  const version = signature?.version;
  const build = signature?.build;
  if (!version || !build || !applicationId) return {};
  return { release: `${applicationId}@${version}+${build}`, dist: build };
}

/** The tags each event carries from the signature. Unknown values are written `unknown`, never left out. */
export function signatureTags(signature: VersionSignature | undefined): Record<string, string> {
  if (!signature) return {};
  return {
    "update.launch": signature.launch,
    "update.id": signature.launch === "update" ? (signature.updateId ?? "unknown") : signature.launch,
    "update.channel": signature.requestedChannel ?? signature.channel ?? (signature.launch === "off" ? "none" : "unknown"),
    "update.runtime": signature.runtimeVersion ?? "unknown",
    ...(signature.emergency ? { "update.emergency": "true" } : {}),
  };
}

/** One Sentry environment per kind of build, not one per channel (`pr-42` is `preview`). */
export function sentryEnvironment(channel: string | null | undefined): string {
  if (!channel || channel === "production") return "production";
  if (channel === "development") return "development";
  if (channel === "preview" || /^pr-\d+$/.test(channel)) return "preview";
  return "production";
}

/** A touch breadcrumb with the touched elements' names only: their labels (accessibility labels, test ids) can hold names. */
export function withoutTouchLabels<T extends { category?: unknown; message?: unknown; data?: unknown }>(crumb: T): T {
  if (crumb.category !== "touch" || !crumb.data || typeof crumb.data !== "object") return crumb;
  const data = crumb.data as { path?: unknown };
  const path = Array.isArray(data.path) ? data.path.map((p) => (p && typeof p === "object" ? { name: (p as { name?: unknown }).name } : p)) : undefined;
  const first = path?.[0] as { name?: unknown } | undefined;
  return { ...crumb, message: `Touch event within element: ${typeof first?.name === "string" ? first.name : "unknown"}`, data: { ...data, ...(path ? { path } : {}) } };
}

function chain<T>(ours: (value: T) => T | null, theirs: unknown): Hook<T> {
  return (value, hint) => {
    const scrubbed = ours(value);
    if (scrubbed === null) return null;
    return typeof theirs === "function" ? (theirs as Hook<T>)(scrubbed, hint) : scrubbed;
  };
}

/** Where the sink is. @stability Beta */
export interface SentrySinkStatus {
  /** Sentry is reporting. */
  running: boolean;
  /** Where the DSN in use came from, or null when not running. */
  source: SentryDsnSource | null;
  /** The latest settings want something only a new launch can do (a new DSN, or on again after off). */
  restartPending: boolean;
  /** A DSN that was given but can't be used, or null. */
  problem: string | null;
}

/** A health check, the shape genesis-support's `healthChecks.register` takes. @stability Beta */
export interface SentryHealthCheck {
  name: string;
  run(): { status: "ok" | "warn" | "fail"; message: string };
}

/** The Sentry sink, with its settings. @stability Beta */
export interface SentrySink extends ObservabilitySink {
  /**
   * The settings now (`resolveSettings`' result, or the values by full key). `undefined`, or
   * settings without the `observability.*` keys, changes nothing: a catalogue without them never
   * stops Sentry.
   */
  applySettings(settings: ObservabilitySettingsInput | undefined): void;
  status(): SentrySinkStatus;
  /** `observability.sentry`, for genesis-support's `healthChecks`: a bad DSN fails, a change waiting for the next launch warns. */
  healthCheck(): SentryHealthCheck;
}

/** How long closing may flush what is queued: the observability block's `flushBeforeReloadMs` default. */
const CLOSE_TIMEOUT_MS = 2000;

const ENABLED = "observability.enabled";
const DSN = "observability.sentryDsn";

function hasObservabilityKeys(values: { readonly [key: string]: unknown }): boolean {
  return own(values, ENABLED) !== undefined || own(values, DSN) !== undefined;
}

function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** A cached entry's values, or null when it isn't one. */
function cachedValues(text: string | null | undefined): { [key: string]: unknown } | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: { [key: string]: unknown } = {};
    const enabled = own(parsed as { [key: string]: unknown }, ENABLED);
    const dsn = own(parsed as { [key: string]: unknown }, DSN);
    if (typeof enabled === "boolean") out[ENABLED] = enabled;
    if (typeof dsn === "string" || dsn === null) out[DSN] = dsn;
    return hasObservabilityKeys(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Sentry as an observability sink. With the build's DSN it starts Sentry at once; otherwise the
 * settings start it (`applySettings`, or the `cache` at launch). While Sentry isn't running, every
 * method does nothing.
 *
 * @stability Beta
 */
export function sentrySink(sentry: SentryLike, options: SentrySinkOptions): SentrySink {
  const { signature, applicationId, scrub = true, cache } = options;
  const build = options.dsn?.trim() || null;
  const environment = options.environment ?? (isDev() ? "development" : sentryEnvironment(signature?.requestedChannel ?? signature?.channel));

  /** The DSN Sentry was started with in this process, and from where. */
  let started: { dsn: string; source: SentryDsnSource } | null = null;
  let closed = false;
  let restartPending = false;
  let problem: string | null = null;
  let settingsApplied = false;
  let noticed = false;
  let user: string | null = null;
  let lastEventId: string | undefined;
  const running = () => started !== null && !closed;

  const quietly = (run: () => unknown) => {
    try {
      const result = run();
      if (isThenable(result)) (result as PromiseLike<unknown>).then(undefined, () => undefined);
    } catch {
      // A failing cache or close never breaks reporting or the app.
    }
  };

  const start = (dsn: string, source: SentryDsnSource) => {
    // Fast Refresh runs this module again: a second init would stack integrations on the live client.
    if (sentry.getClient()) {
      started = { dsn, source };
      return;
    }
    const extra = options.init ?? {};
    const router = options.expoRouter ?? true;
    const integrations = [
      ...(router && sentry.expoRouterIntegration
        ? [sentry.expoRouterIntegration({ enableTimeToInitialDisplay: typeof router === "object" ? router.enableTimeToInitialDisplay : true })]
        : []),
      ...(options.integrations ?? []),
      ...(Array.isArray(extra.integrations) ? extra.integrations : []),
    ];
    const keep = <T>(value: T) => value;
    const span = (value: Options): Options => {
      const scrubbed = scrubRecord(value);
      // A span can't be dropped here: fail closed by sending it without its description and data.
      return scrubbed ?? { ...value, description: undefined, data: {} };
    };
    sentry.init({
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      tracesSampleRate: options.tracesSampleRate ?? (environment === "production" ? 0.2 : 1),
      ...extra,
      // Only the app's own hosts: Sentry's mobile default would add the headers to every request.
      tracePropagationTargets: [...(options.tracePropagationTargets ?? (Array.isArray(extra.tracePropagationTargets) ? extra.tracePropagationTargets : []))],
      dsn,
      environment,
      ...sentryRelease(signature, applicationId),
      integrations,
      beforeSend: chain(scrub ? scrubEvent : keep, extra.beforeSend),
      beforeSendTransaction: chain(scrub ? scrubEvent : keep, extra.beforeSendTransaction),
      beforeBreadcrumb: chain<Options>((crumb) => (scrub ? scrubRecord(withoutTouchLabels(crumb)) : crumb), extra.beforeBreadcrumb),
      beforeSendLog: chain(scrub ? scrubRecord : keep, extra.beforeSendLog),
      beforeSendMetric: chain(scrub ? scrubRecord : keep, extra.beforeSendMetric),
      beforeSendSpan: (value: Options) => {
        const scrubbed = scrub ? span(value) : value;
        return typeof extra.beforeSendSpan === "function" ? (extra.beforeSendSpan as (s: Options) => Options)(scrubbed) : scrubbed;
      },
    });
    // Only once init returned: a client that failed to start is never reported as running.
    started = { dsn, source };
    for (const [key, value] of Object.entries(signatureTags(signature))) sentry.setTag(key, value);
    // Signed in before the settings started Sentry: it still knows who.
    if (user) sentry.setUser({ id: user });
  };

  /** Bring Sentry to what these settings say, as far as this process can. */
  const apply = (settings: ObservabilitySettingsInput | null, source: "settings" | "cache") => {
    const resolved = resolveSentryDsn({ build, settings, source });
    problem = resolved.problem;
    const want = resolved.dsn;
    if (!want) {
      // Off, or no DSN any more: stopping is always live.
      if (running()) {
        closed = true;
        // Bounded as the flush before an update reloads is (the observability block's 2000 ms default).
        if (sentry.close) quietly(() => sentry.close!(CLOSE_TIMEOUT_MS));
      }
      restartPending = false;
      if (resolved.enabled && !problem && !started && !noticed) {
        noticed = true;
        if (options.onMissingDsn) options.onMissingDsn();
        // genesis-allow-console: a development set-up notice, before any reporter exists.
        else if (isDev()) console.info("[observability] No Sentry DSN (EXPO_PUBLIC_SENTRY_DSN or the observability.sentryDsn setting): errors are not reported to Sentry.");
      }
      return;
    }
    if (!started) {
      try {
        start(want, resolved.source ?? source);
      } catch (error) {
        // Sentry is optional: the app goes on without it, and the health check says why.
        problem = `Sentry didn't start: ${error instanceof Error ? error.message : String(error)}`;
      }
      restartPending = false;
      return;
    }
    // Sentry starts once per process: a new DSN, or on again after a close, waits for the next launch.
    restartPending = closed || started.dsn !== want;
  };

  // The build's DSN starts Sentry at once; a cache read in step can still say it is off.
  const read = cache ? (() => {
    try {
      return cache.getItem(SENTRY_SETTINGS_CACHE_KEY);
    } catch {
      return null;
    }
  })() : null;
  if (isThenable<string | null | undefined>(read)) {
    if (build) apply(null, "cache");
    read.then(
      (text) => {
        const values = cachedValues(text);
        // Settings read since are newer than this device's copy.
        if (values && !settingsApplied) apply(values, "cache");
      },
      () => undefined,
    );
  } else {
    const values = cachedValues(read);
    if (values || build) apply(values, "cache");
  }

  const canWrap = build !== null || cache !== undefined;
  return {
    name: "sentry",
    // Sentry deduplicates by error object, and `beforeSend` scrubs: it always gets the original.
    scrubsErrors: true,
    applySettings(settings) {
      if (settings === undefined) return;
      const values = settingsValuesOf(settings);
      if (!hasObservabilityKeys(values)) return;
      settingsApplied = true;
      if (cache) {
        const entry = { [ENABLED]: own(values, ENABLED) ?? true, [DSN]: own(values, DSN) ?? null };
        quietly(() => cache.setItem(SENTRY_SETTINGS_CACHE_KEY, JSON.stringify(entry)));
      }
      apply(settings, "settings");
    },
    status: () => ({ running: running(), source: running() ? started!.source : null, restartPending, problem }),
    healthCheck: () => ({
      name: "observability.sentry",
      run() {
        if (problem) return { status: "fail", message: `Sentry: ${problem}` };
        if (restartPending) return { status: "warn", message: "Sentry: the new settings apply at the next launch" };
        if (running()) return { status: "ok", message: `Sentry: reporting (DSN from the ${started!.source})` };
        if (closed) return { status: "ok", message: "Sentry: off (observability.enabled)" };
        return { status: "ok", message: "Sentry: not configured" };
      },
    }),
    captureError(error, context) {
      if (!running()) return;
      lastEventId = sentry.captureException(error, {
        // Unhandled when the app could not go on, or nothing caught it, so release health counts it.
        mechanism: { handled: context.handled ?? !context.fatal, type: `genesis.${context.source}` },
        captureContext: {
          level: context.fatal ? "fatal" : "error",
          tags: {
            ...(context.tags ? (scrub ? scrubRecord(context.tags) ?? {} : context.tags) : {}),
            "genesis.source": context.source,
            ...(context.route ? { route: context.route } : {}),
          },
          ...(context.componentStack ? { contexts: { react: { componentStack: scrub ? scrubString(context.componentStack) : context.componentStack } } } : {}),
        },
      });
    },
    breadcrumb(crumb) {
      if (!running()) return;
      // Sentry's Expo Router integration records navigation itself.
      if (crumb.category === "navigation" && (options.expoRouter ?? true)) return;
      sentry.addBreadcrumb({
        category: crumb.category,
        message: crumb.message,
        level: crumb.level ?? "info",
        data: crumb.data,
        ...(crumb.timestamp ? { timestamp: crumb.timestamp / 1000 } : {}),
      });
    },
    setUser(id) {
      user = id;
      if (running()) sentry.setUser(id ? { id } : null);
    },
    event(name, props) {
      if (!running()) return;
      sentry.addBreadcrumb({ category: "event", message: name, level: "info", data: props });
      sentry.metrics?.count(name, 1, { attributes: props });
    },
    timing(name, ms, tags) {
      if (running()) sentry.metrics?.distribution(name, ms, { unit: "millisecond", attributes: tags });
    },
    // Wrapping happens once, at the root layout's module load: only when Sentry can be running by then.
    wrap: canWrap ? (root) => sentry.wrap(root) : undefined,
    wrapRouteErrorBoundary: canWrap && sentry.wrapExpoRouterErrorBoundary ? (boundary) => sentry.wrapExpoRouterErrorBoundary!(boundary) : undefined,
    flush: sentry.flush ? () => (running() ? sentry.flush!() : true) : undefined,
    lastEventId: () => (running() ? (sentry.lastEventId?.() ?? lastEventId) : lastEventId),
    replayId: () => (running() ? (sentry.getReplay?.()?.getReplayId() ?? undefined) : undefined),
  };
}
