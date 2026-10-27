/**
 * `sentrySink(Sentry, options)`: Sentry through the observability seam.
 * `@sentry/react-native` is an optional peer, passed in rather than
 * imported (`import * as Sentry from "@sentry/react-native"`), so an app
 * without it never bundles it.
 *
 * Calling it runs `Sentry.init` at once, so call it at module scope (where
 * `createObservability` is built, before the root layout renders): errors
 * thrown while the app's modules load and the shell's first render are then
 * caught. A second call in the same process (Fast Refresh) reuses the client.
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
}

export interface SentrySinkOptions {
  /** `process.env.EXPO_PUBLIC_SENTRY_DSN`. Empty or missing: Sentry is not started and the sink does nothing. */
  dsn: string | undefined | null;
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
  /** Called instead of `console.warn` when the DSN is missing outside development. */
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

/**
 * Start Sentry and return a sink for it. Without a DSN it starts nothing and
 * returns a sink that does nothing (a warning outside development says so).
 *
 * @stability Beta
 */
export function sentrySink(sentry: SentryLike, options: SentrySinkOptions): ObservabilitySink {
  const { dsn, signature, applicationId, scrub = true } = options;
  if (!dsn) {
    // genesis-allow-console: a build set-up warning, before any reporter exists.
    if (!isDev()) (options.onMissingDsn ?? (() => console.warn("[observability] EXPO_PUBLIC_SENTRY_DSN is not set: errors are not reported to Sentry.")))();
    return { name: "sentry (no DSN)" };
  }
  const environment = options.environment ?? (isDev() ? "development" : sentryEnvironment(signature?.requestedChannel ?? signature?.channel));
  // Fast Refresh runs this module again: a second init would stack integrations on the live client.
  if (!sentry.getClient()) {
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
    for (const [key, value] of Object.entries(signatureTags(signature))) sentry.setTag(key, value);
  }

  let lastEventId: string | undefined;
  return {
    name: "sentry",
    // Sentry deduplicates by error object, and `beforeSend` scrubs: it always gets the original.
    scrubsErrors: true,
    captureError(error, context) {
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
    setUser: (id) => sentry.setUser(id ? { id } : null),
    event(name, props) {
      sentry.addBreadcrumb({ category: "event", message: name, level: "info", data: props });
      sentry.metrics?.count(name, 1, { attributes: props });
    },
    timing: (name, ms, tags) => sentry.metrics?.distribution(name, ms, { unit: "millisecond", attributes: tags }),
    wrap: (root) => sentry.wrap(root),
    wrapRouteErrorBoundary: sentry.wrapExpoRouterErrorBoundary ? (boundary) => sentry.wrapExpoRouterErrorBoundary!(boundary) : undefined,
    flush: sentry.flush ? () => sentry.flush!() : undefined,
    lastEventId: () => sentry.lastEventId?.() ?? lastEventId,
    replayId: () => sentry.getReplay?.()?.getReplayId() ?? undefined,
  };
}
