/**
 * The vendor-neutral seam: a sink is where errors, breadcrumbs, the user id,
 * analytics events and timings go. `createObservability` fans every call out
 * to its sinks, scrubbed first; a sink that throws is reported to
 * `onSinkError` and never takes the others (or the app) down with it.
 *
 * Shipped sinks: `sentrySink` (Sentry), `observeSink` (EAS Observe) and
 * `consoleSink` (development). A vendor adapter (PostHog, Datadog…) is one
 * object with the methods it supports.
 */
import type { ComponentType } from "react";
import { scrubString, scrubValue } from "./scrub";
import type { EventValues } from "./events";

/** Where a caught error came from and whether the app could go on. */
export interface ErrorContext {
  /** True when the app could not go on (a render error, a failed boot, a fatal global error). */
  fatal: boolean;
  /** `boundary`, `global`, `boot`, `rejection` (the shell's), or the app's own (`updates:policy`, `sync`). */
  source: string;
  componentStack?: string;
  /** The route pattern on screen (`/(app)/settings`), when known. */
  route?: string | null;
}

export type BreadcrumbLevel = "debug" | "info" | "warning" | "error";

/** One step that led up to an error: a navigation, a tap, a request. */
export interface Breadcrumb {
  /** `navigation`, `ui`, `http`, `event`, or the app's own. */
  category: string;
  message?: string;
  level?: BreadcrumbLevel;
  data?: Readonly<Record<string, unknown>>;
  /** Milliseconds since the epoch. Default now. */
  timestamp?: number;
}

/** Low-cardinality labels on a timing (`route`, `step`), never ids or text someone typed. */
export type TimingTags = Readonly<Record<string, string>>;

/**
 * One destination. Every method is optional: a sink takes what its vendor
 * supports. Errors arrive as an `Error` whose message is already scrubbed,
 * unless the sink sets `scrubsErrors` (it scrubs the whole event itself and
 * needs the original object, as Sentry does to deduplicate).
 *
 * @stability Beta
 */
export interface ObservabilitySink {
  readonly name: string;
  /** The sink scrubs error events itself; give it the original `Error`. */
  readonly scrubsErrors?: boolean;
  captureError?(error: Error, context: ErrorContext): void;
  breadcrumb?(crumb: Breadcrumb): void;
  /** The signed-in login's id, or `null` when signed out. Never an email or a name. */
  setUser?(id: string | null): void;
  /** An analytics event, its props checked against the schema. */
  event?(name: string, props: EventValues): void;
  timing?(name: string, ms: number, tags?: TimingTags): void;
  /** Wraps the root layout (Sentry's `wrap`, EAS Observe's `ObserveRoot.wrap`). */
  wrap?<P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P>;
}

/** A copy of `error` whose message and stack have been scrubbed (for sinks that don't scrub themselves). */
export function scrubbedError(error: Error): Error {
  const copy = new Error(scrubString(error.message));
  copy.name = error.name;
  if (error.stack) copy.stack = scrubString(error.stack);
  return copy;
}

export interface ConsoleSinkOptions {
  /** Default `console`. */
  console?: Pick<Console, "log" | "warn" | "error">;
  /** Also log breadcrumbs (noisy). Default false. */
  breadcrumbs?: boolean;
}

/**
 * Logs what would be sent, for development: fatal errors with `console.error`, others with `console.warn`,
 * events and timings with `console.log`. Already scrubbed, so what you read
 * is what a vendor sink would get.
 *
 * @stability Beta
 */
export function consoleSink(options: ConsoleSinkOptions = {}): ObservabilitySink {
  const out = options.console ?? console;
  return {
    name: "console",
    // `warn` for what the app survives: `console.error` would raise a LogBox error for every one in development.
    captureError: (error, context) => {
      const line = `[observability] ${context.fatal ? "fatal " : ""}${context.source}: ${error.message}`;
      if (context.fatal) out.error(line);
      else out.warn(line);
    },
    breadcrumb: options.breadcrumbs ? (crumb) => out.log(`[observability] · ${crumb.category} ${crumb.message ?? ""}`) : undefined,
    setUser: (id) => out.log(`[observability] user ${id ?? "(signed out)"}`),
    event: (name, props) => out.log(`[observability] event ${name}`, props),
    timing: (name, ms, tags) => out.log(`[observability] timing ${name} ${Math.round(ms)}ms`, tags ?? {}),
  };
}

/**
 * `expo-observe`'s `Observe` (SDK 56+), or a stand-in: the calls `observeSink`
 * uses. Pass `import { Observe } from "expo-observe"`.
 */
export interface ObserveLike {
  logEvent(name: string, options?: { severity?: "debug" | "info" | "warn" | "error"; body?: string; attributes?: Record<string, unknown> }): void;
  /** Error reporting, in preview on SDK 57+. */
  reportError?(error: unknown): void;
}

export interface ObserveSinkOptions {
  /** Report caught errors with `Observe.reportError` (in preview). Default false: Sentry is the error tracker. */
  errors?: boolean;
}

/**
 * EAS Observe. It measures launch (cold, warm, bundle load, first render),
 * time to interactive and, with its Expo Router integration, per-route
 * render times on its own; it has no API for a custom timing metric, so
 * `timing` is logged as an event (`timing.<name>` with `duration_ms`) and
 * shows on the Events page, not as a metric. Analytics events go to
 * `Observe.logEvent` as they are.
 *
 * @stability Beta
 */
export function observeSink(observe: ObserveLike, options: ObserveSinkOptions = {}): ObservabilitySink {
  return {
    name: "eas-observe",
    event: (name, props) => observe.logEvent(name, { attributes: { ...props } }),
    timing: (name, ms, tags) => observe.logEvent(`timing.${name}`, { severity: "info", attributes: { duration_ms: Math.round(ms), ...(tags ?? {}) } }),
    captureError: options.errors && observe.reportError ? (error) => observe.reportError?.(error) : undefined,
  };
}

/** Breadcrumb data scrubbed and made plain (for sinks and the devtools overlay). */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  return {
    category: scrubString(crumb.category),
    level: crumb.level,
    timestamp: crumb.timestamp,
    ...(crumb.message !== undefined ? { message: scrubString(crumb.message) } : {}),
    ...(crumb.data ? { data: scrubValue(crumb.data) as Record<string, unknown> } : {}),
  };
}
