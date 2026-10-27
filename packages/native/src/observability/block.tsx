/**
 * `createObservability(options)`: the observability block. Build it once at
 * module scope (it starts the sinks, Sentry's `init` included), then:
 *
 *   <GenesisNativeApp blocks={[observability]}>   every error the shell catches → captureError
 *   export default observability.wrap(RootLayout) Sentry's `wrap` (touch and profiler boundaries)
 *   observability.track("auth.signed_in", { method: "email" })
 *
 * Its root (inside the shell) sets the user to the signed-in login's id and,
 * with `useSegments` from expo-router, leaves a breadcrumb per route change
 * and a `route.time_on_screen` timing for the route left. Route patterns
 * (`/(app)/clients/[id]`) are used, never the values in them.
 *
 * Creating it also:
 * - registers it as genesis-core's error reporter (`setErrorReporter`), so a
 *   package's `reportError(e, "chat:…")` reaches the sinks as a non-fatal error;
 * - registers a before-reload hook (`onBeforeReload`) that flushes the sinks
 *   before an update reloads the app.
 *
 * `observability.screenBoundary()` is an Expo Router `ErrorBoundary` for a
 * route (reported non-fatal, wrapped by Sentry's route wrapper), and
 * `lastEventId()` / `replayId()` let a support or feedback screen point at
 * the event.
 *
 * Everything a sink receives has been scrubbed (see `scrub.ts`), and the
 * last breadcrumbs and errors are kept, scrubbed, for the devtools overlay
 * (`recent`).
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { defineBlock } from "@marktiderman/genesis-features/blocks";
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import { useSession } from "../auth";
import { onBeforeReload } from "../reload";
import { createScreenErrorBoundary, type ScreenErrorProps } from "../screen-boundary";
import type { NativeBlock, NativeBlockRootProps } from "../blocks";
import type { ErrorReport } from "../errors";
import { checkEvent, type EventProps, type EventSchema } from "./events";
import { scrubString, scrubValue } from "./scrub";
import { scrubBreadcrumb, scrubbedError, type Breadcrumb, type ErrorContext, type ObservabilitySink, type TimingTags } from "./sink";

/** The FeatureId of the observability block. */
export const OBSERVABILITY_BLOCK_ID = "observability";

/** A caught error as the devtools overlay shows it (scrubbed). */
export interface RecentError {
  at: number;
  name: string;
  message: string;
  source: string;
  fatal: boolean;
}

export interface RecentActivity {
  /** Oldest first. Navigation, events and the app's breadcrumbs. */
  breadcrumbs: readonly Breadcrumb[];
  /** Oldest first. */
  errors: readonly RecentError[];
}

export interface RecentStore {
  getState(): RecentActivity;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export interface ObservabilityOptions<E extends EventSchema = EventSchema> {
  /** Where everything goes: `sentrySink(Sentry, …)`, `consoleSink()` in development, `observeSink(Observe)`. */
  sinks: readonly (ObservabilitySink | null | undefined | false)[];
  /** The app's analytics events (`defineEvents`). Without it, `track` accepts nothing. */
  events?: E;
  /** `useSegments` from expo-router: route breadcrumbs and `route.time_on_screen` timings. */
  useSegments?: () => readonly string[];
  /** How many breadcrumbs and errors `recent` keeps. Default 50 and 20. */
  recent?: { breadcrumbs?: number; errors?: number };
  /** A sink threw, or `track` was called with something the schema doesn't allow. Default `console.warn` in development. */
  onProblem?: (problem: string, error?: unknown) => void;
  /**
   * Become genesis-core's error reporter, so packages' `reportError` calls
   * reach the sinks. Default true; the last block created wins.
   */
  reportErrors?: boolean;
  /** Flush the sinks before an update reloads the app, within this many milliseconds. Default 2000; 0 turns it off. */
  flushBeforeReloadMs?: number;
  now?: () => number;
}

export interface ObservabilityBlock<E extends EventSchema = EventSchema> extends NativeBlock<typeof OBSERVABILITY_BLOCK_ID> {
  readonly sinks: readonly ObservabilitySink[];
  readonly events: E | undefined;
  /** Report an error. The shell calls it for every error it catches. */
  captureError(error: unknown, context?: Partial<ErrorContext>): void;
  breadcrumb(crumb: Breadcrumb): void;
  /** The login's id only. The block's root sets it from the session. */
  setUser(id: string | null): void;
  /** An analytics event from the schema. Anything else is dropped and reported. */
  track<N extends keyof E & string>(name: N, props?: EventProps<E[N]>): void;
  timing(name: string, ms: number, tags?: TimingTags): void;
  /** The root layout wrapped by each sink that wraps (Sentry's `wrap`). Use once: `export default observability.wrap(RootLayout)`. */
  wrap<P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P>;
  /** The last breadcrumbs and errors, scrubbed, for the devtools overlay. */
  readonly recent: RecentStore;
  /** Send what every sink has queued; resolves false when one didn't finish within `timeoutMs` (default 2000). */
  flush(timeoutMs?: number): Promise<boolean>;
  /** The id of the last error event a sink sent (Sentry's), for a support request or feedback. */
  lastEventId(): string | undefined;
  /** The current session replay's id, when a sink records replays. */
  replayId(): string | undefined;
  /**
   * An Expo Router `ErrorBoundary` for a route: reports the error non-fatal
   * (source `screen`), shows `fallback` (default `ScreenErrorScreen`) with
   * "Try again", and is wrapped by each sink's route wrapper (Sentry's
   * `wrapExpoRouterErrorBoundary`). Build it once, at module scope.
   */
  screenBoundary(fallback?: ComponentType<ScreenErrorProps>): ComponentType<ScreenErrorProps>;
  /** For the shell: every error it catches. */
  readonly onError: (error: Error, report: ErrorReport) => void;
  readonly Root: ComponentType<NativeBlockRootProps>;
}

declare const __DEV__: boolean | undefined;

let releaseReloadHook: (() => void) | undefined;

const TIMING_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

function createRecentStore(maxCrumbs: number, maxErrors: number): RecentStore & { addCrumb(c: Breadcrumb): void; addError(e: RecentError): void } {
  let state: RecentActivity = { breadcrumbs: [], errors: [] };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const push = <T,>(list: readonly T[], item: T, max: number) => (list.length >= max ? [...list.slice(list.length - max + 1), item] : [...list, item]);
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      state = { breadcrumbs: [], errors: [] };
      emit();
    },
    addCrumb(crumb) {
      state = { ...state, breadcrumbs: push(state.breadcrumbs, crumb, maxCrumbs) };
      emit();
    },
    addError(error) {
      state = { ...state, errors: push(state.errors, error, maxErrors) };
      emit();
    },
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(typeof value === "string" ? value : "Unknown error");
}

/** Build the block once, at module scope, before the root layout renders. @stability Beta */
export function createObservability<const E extends EventSchema = EventSchema>(options: ObservabilityOptions<E>): ObservabilityBlock<E> {
  const sinks = options.sinks.filter((s): s is ObservabilitySink => Boolean(s));
  const now = options.now ?? Date.now;
  const problem =
    options.onProblem ??
    ((message: string, error?: unknown) => {
      // genesis-allow-console: the block's own development warning; it can't report to itself.
      if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(`[observability] ${message}`, error ?? "");
    });
  const recent = createRecentStore(options.recent?.breadcrumbs ?? 50, options.recent?.errors ?? 20);
  let route: string | null = null;
  let user: string | null | undefined;

  // One sink failing never stops the others, and never throws into the caller (an error handler, a render).
  const each = (method: string, call: (sink: ObservabilitySink) => void) => {
    for (const sink of sinks) {
      try {
        call(sink);
      } catch (error) {
        try {
          problem(`${sink.name}.${method} threw`, error);
        } catch {
          // ignore a failing reporter
        }
      }
    }
  };

  // Never throws into the caller (an effect, a handler): a record that can't be scrubbed is dropped.
  const breadcrumb = (input: Breadcrumb) => {
    let crumb: Breadcrumb;
    try {
      crumb = scrubBreadcrumb({ ...input, timestamp: input.timestamp ?? now() });
    } catch (error) {
      problem("breadcrumb dropped: it could not be scrubbed", error);
      return;
    }
    recent.addCrumb(crumb);
    each("breadcrumb", (s) => s.breadcrumb?.(crumb));
  };

  const captureError = (value: unknown, context: Partial<ErrorContext> = {}, skip?: ReadonlySet<ObservabilitySink>) => {
    const error = toError(value);
    const full: ErrorContext = {
      fatal: context.fatal ?? false,
      source: context.source ?? "app",
      route: context.route ?? route,
      componentStack: context.componentStack,
      ...(context.handled !== undefined ? { handled: context.handled } : {}),
      ...(context.tags ? { tags: context.tags } : {}),
    };
    let safe: Error | undefined;
    const scrubbed = () => (safe ??= scrubbedError(error));
    try {
      recent.addError({ at: now(), name: error.name, message: scrubString(error.message), source: full.source, fatal: full.fatal });
    } catch {
      // never let the overlay's list stop a report
    }
    let forSinks: ErrorContext = full;
    try {
      forSinks = {
        ...full,
        ...(full.componentStack ? { componentStack: scrubString(full.componentStack) } : {}),
        ...(full.tags ? { tags: scrubValue(full.tags) as Record<string, string> } : {}),
      };
    } catch {
      // Tags that can't be scrubbed are dropped, never sent raw.
      forSinks = { ...full, componentStack: undefined, tags: undefined };
    }
    each("captureError", (s) => {
      if (skip?.has(s)) return;
      s.captureError?.(s.scrubsErrors ? error : scrubbed(), s.scrubsErrors ? full : forSinks);
    });
  };

  const flush = async (timeoutMs = 2000): Promise<boolean> => {
    const results = sinks.map(async (sink) => {
      if (!sink.flush) return true;
      try {
        return (await sink.flush(timeoutMs)) !== false;
      } catch (error) {
        problem(`${sink.name}.flush threw`, error);
        return false;
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([Promise.all(results).then((all) => all.every(Boolean)), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const firstOf = (read: (sink: ObservabilitySink) => string | undefined): string | undefined => {
    for (const sink of sinks) {
      try {
        const value = read(sink);
        if (value) return value;
      } catch (error) {
        problem(`${sink.name} threw reading an id`, error);
      }
    }
    return undefined;
  };

  const setUser = (id: string | null) => {
    if (id === user) return;
    user = id;
    each("setUser", (s) => s.setUser?.(id));
  };

  const track = (name: string, props?: Readonly<Record<string, unknown>>) => {
    const check = options.events ? checkEvent(options.events, name, props) : ({ ok: false, problem: "no event schema: pass `events: defineEvents({…})`" } as const);
    if (!check.ok) {
      problem(`track dropped: ${check.problem}`);
      return;
    }
    recent.addCrumb({ category: "event", message: name, level: "info", data: check.props, timestamp: now() });
    each("event", (s) => s.event?.(name, check.props));
  };

  const timing = (name: string, ms: number, tags?: TimingTags) => {
    if (!Number.isFinite(ms) || ms < 0) return;
    // A name like an event's (`route.time_on_screen`), never text with values in it.
    if (!TIMING_NAME.test(name)) {
      problem(`timing dropped: "${scrubString(name)}" is not lower-case words joined by "."`);
      return;
    }
    let safeTags: TimingTags | undefined;
    try {
      safeTags = tags ? (scrubValue(tags) as TimingTags) : undefined;
    } catch (error) {
      problem("timing dropped: its tags could not be scrubbed", error);
      return;
    }
    each("timing", (s) => s.timing?.(name, ms, safeTags));
  };

  const declaration = defineBlock<typeof OBSERVABILITY_BLOCK_ID, ComponentType<never>>({
    id: OBSERVABILITY_BLOCK_ID,
    platforms: ["native"],
    contributes: {
      privacy: {
        collects: [
          // genesis-cli's PRIVACY_BLOCKS.observability mirrors this (with events) for the iOS
          // privacy manifest; observability/block.test.tsx keeps the two the same.
          { type: "crash data", purposes: ["app functionality"], linked: true, tracking: false },
          { type: "performance data", purposes: ["app functionality"], linked: true, tracking: false },
          // Sentry's device and OS details, breadcrumbs and sessions.
          { type: "other diagnostic data", purposes: ["app functionality"], linked: true, tracking: false },
          { type: "user id", purposes: options.events ? ["app functionality", "analytics"] : ["app functionality"], linked: true, tracking: false },
          ...(options.events ? [{ type: "product interaction", purposes: ["analytics"], linked: true, tracking: false }] : []),
        ],
        notes: [
          "Crash reports, timings and analytics events carry the login's id only; emails, tokens, keys and query strings are removed on the device before anything is sent.",
        ],
      },
    },
  });

  const useSegments = options.useSegments;
  function RouteTracker() {
    const segments = (useSegments as () => readonly string[])();
    const path = `/${segments.join("/")}`;
    const last = useRef<{ path: string; at: number } | null>(null);
    useEffect(() => {
      const at = now();
      const previous = last.current;
      if (previous?.path === path) return;
      route = path;
      breadcrumb({ category: "navigation", message: path, data: previous ? { from: previous.path } : undefined, timestamp: at });
      if (previous) timing("route.time_on_screen", at - previous.at, { route: previous.path });
      last.current = { path, at };
    }, [path]);
    return null;
  }

  function UserTracker() {
    const { userId } = useSession();
    useEffect(() => setUser(userId ?? null), [userId]);
    return null;
  }

  const block: ObservabilityBlock<E> = {
    ...declaration,
    sinks,
    events: options.events,
    captureError,
    breadcrumb,
    setUser,
    track: track as ObservabilityBlock<E>["track"],
    timing,
    recent,
    wrap(root) {
      return sinks.reduce((wrapped, sink) => (sink.wrap ? sink.wrap(wrapped) : wrapped), root);
    },
    onError: (error, report) =>
      captureError(error, {
        fatal: report.fatal,
        source: report.source,
        componentStack: report.componentStack,
        ...(report.handled !== undefined ? { handled: report.handled } : {}),
        ...(report.tags ? { tags: report.tags } : {}),
      }),
    flush,
    lastEventId: () => firstOf((s) => s.lastEventId?.()),
    replayId: () => firstOf((s) => s.replayId?.()),
    screenBoundary(fallback) {
      const wrapping = sinks.filter((s) => s.wrapRouteErrorBoundary);
      // A sink whose wrapper reports the route's error (Sentry's) isn't sent it a second time.
      const skip = new Set(wrapping);
      return createScreenErrorBoundary({
        fallback,
        onError: (error, report) => captureError(error, { fatal: report.fatal, source: report.source }, skip),
        wrap: wrapping.map((sink) => (boundary: ComponentType<ScreenErrorProps>) => {
          try {
            return sink.wrapRouteErrorBoundary!(boundary);
          } catch (error) {
            problem(`${sink.name}.wrapRouteErrorBoundary threw`, error);
            skip.delete(sink);
            return boundary;
          }
        }),
      });
    },
    Root: function ObservabilityRoot({ children }: NativeBlockRootProps) {
      return (
        <ObservabilityContext.Provider value={block as ObservabilityBlock}>
          <UserTracker />
          {useSegments ? <RouteTracker /> : null}
          {children}
        </ObservabilityContext.Provider>
      );
    },
  };
  if (options.reportErrors !== false) {
    setErrorReporter((value, context) =>
      captureError(value, { fatal: context.fatal ?? false, source: context.source, ...(context.tags ? { tags: context.tags } : {}) }),
    );
  }
  const flushMs = options.flushBeforeReloadMs ?? 2000;
  // The newest block replaces the last one's hook (Fast Refresh builds the block again).
  releaseReloadHook?.();
  releaseReloadHook = flushMs > 0 && sinks.some((s) => s.flush) ? onBeforeReload(() => flush(flushMs)) : undefined;
  return block;
}

const ObservabilityContext = createContext<ObservabilityBlock | null>(null);

/** Provides a block to the hooks without its root (rung 4). @stability Beta */
export function ObservabilityProvider({ block, children }: { block: ObservabilityBlock; children?: ReactNode }) {
  return <ObservabilityContext.Provider value={block}>{children}</ObservabilityContext.Provider>;
}

/** The block, or `null` when it is off (so a screen can call it whether or not the block is on). @stability Beta */
export function useObservability(): ObservabilityBlock | null {
  return useContext(ObservabilityContext);
}

/** The last breadcrumbs and errors, scrubbed; empty when the block is off. @stability Beta */
export function useRecentActivity(block?: ObservabilityBlock | null): RecentActivity {
  const fromContext = useObservability();
  const store = (block ?? fromContext)?.recent ?? EMPTY_STORE;
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

const EMPTY: RecentActivity = { breadcrumbs: [], errors: [] };
const EMPTY_STORE: RecentStore = { getState: () => EMPTY, subscribe: () => () => {}, clear: () => {} };
