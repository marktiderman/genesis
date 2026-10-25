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
 * - no default PII, screenshots, view hierarchy or accessibility labels.
 *
 * Errors: the shell (`GenesisNativeApp`) reports every error it catches
 * through `captureError`. Sentry's own global handler stays on for errors
 * before the shell mounts; when both see one error object, Sentry's
 * deduplication (`__sentry_captured__`) sends it once.
 */
import type { ComponentType } from "react";
import type { VersionSignature } from "../updates/signature";
import { scrubEvent, scrubRecord, scrubString } from "./scrub";
import type { ObservabilitySink } from "./sink";

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
  metrics?: {
    distribution(name: string, value: number, options?: Options): void;
    count(name: string, value?: number, options?: Options): void;
  };
}

export interface SentrySinkOptions {
  /** `process.env.EXPO_PUBLIC_SENTRY_DSN`. Empty or missing: Sentry is not started and the sink does nothing. */
  dsn: string | undefined | null;
  /** `development`, `preview`, `production`… Default the signature's channel, else `development` in `__DEV__`, else `production`. */
  environment?: string;
  /** The version signature (`versionSignature(…)` from `/updates`, or the updates block's `signature`): release, dist and update tags. */
  signature?: VersionSignature;
  /** `Application.applicationId` (expo-application): the release's prefix. */
  applicationId?: string | null;
  /** Default 0.2 in production and 1 elsewhere. */
  tracesSampleRate?: number;
  /** Navigation spans and time to initial display through Expo Router. Default true. */
  expoRouter?: boolean | { enableTimeToInitialDisplay?: boolean };
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
    if (!isDev()) (options.onMissingDsn ?? (() => console.warn("[observability] EXPO_PUBLIC_SENTRY_DSN is not set: errors are not reported to Sentry.")))();
    return { name: "sentry (no DSN)" };
  }
  const environment = options.environment ?? (isDev() ? "development" : (signature?.channel ?? "production"));
  // Fast Refresh runs this module again: a second init would stack integrations on the live client.
  if (!sentry.getClient()) {
    const extra = options.init ?? {};
    const router = options.expoRouter ?? true;
    const integrations = [
      ...(router && sentry.expoRouterIntegration
        ? [sentry.expoRouterIntegration({ enableTimeToInitialDisplay: typeof router === "object" ? router.enableTimeToInitialDisplay : true })]
        : []),
      ...(options.integrations ?? []),
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
      dsn,
      environment,
      ...sentryRelease(signature, applicationId),
      integrations,
      beforeSend: chain(scrub ? scrubEvent : keep, extra.beforeSend),
      beforeSendTransaction: chain(scrub ? scrubEvent : keep, extra.beforeSendTransaction),
      beforeBreadcrumb: chain(scrub ? scrubRecord : keep, extra.beforeBreadcrumb),
      beforeSendLog: chain(scrub ? scrubRecord : keep, extra.beforeSendLog),
      beforeSendSpan: (value: Options) => {
        const scrubbed = scrub ? span(value) : value;
        return typeof extra.beforeSendSpan === "function" ? (extra.beforeSendSpan as (s: Options) => Options)(scrubbed) : scrubbed;
      },
    });
    for (const [key, value] of Object.entries(signatureTags(signature))) sentry.setTag(key, value);
  }

  return {
    name: "sentry",
    scrubsErrors: scrub,
    captureError(error, context) {
      sentry.captureException(error, {
        level: context.fatal ? "fatal" : "error",
        tags: { "genesis.source": context.source, ...(context.route ? { route: context.route } : {}) },
        ...(context.componentStack ? { contexts: { react: { componentStack: scrub ? scrubString(context.componentStack) : context.componentStack } } } : {}),
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
  };
}
