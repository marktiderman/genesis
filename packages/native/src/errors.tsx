/**
 * Errors: a boundary per screen tree, and handlers for errors React never sees
 * (a fatal global error from `ErrorUtils`, an unhandled promise rejection).
 * All of them report through one `onError` (wire Sentry there) and show the
 * fatal screen instead of letting the app die; its "Try again" remounts the
 * tree with fresh state.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeButton, NativeEmptyState } from "@marktiderman/genesis-ui-native/components";
import { classifyError } from "@marktiderman/genesis-core/errors";
import { toError } from "./boot";

declare const __DEV__: boolean | undefined;

/**
 * What a fatal or screen error says under its title: the safe sentence for
 * its kind (offline, signed out…), or nothing for a plain bug. The error's
 * own text can hold an email, an id or a store's internals, so it is shown
 * only in development builds.
 */
export function errorDetails(error: Error): string | undefined {
  if (typeof __DEV__ !== "undefined" && __DEV__) return error.message;
  const classified = classifyError(error);
  return classified.kind === "unexpected" ? undefined : classified.message;
}

export interface FatalScreenProps {
  error: Error;
  /** Clears the error and remounts the app below the shell (and re-runs a failed boot). */
  retry: () => void;
}

/** The default fatal screen: what went wrong and "Try again". */
export function FatalScreen({ error, retry }: FatalScreenProps) {
  return (
    <NativeEmptyState
      variant="error"
      title="Something went wrong"
      body="The app hit a problem. Try again, and if it keeps happening, close and reopen the app."
      details={errorDetails(error)}
      primaryAction={
        <NativeButton onPress={retry} testID="genesis-fatal-retry">
          Try again
        </NativeButton>
      }
      testID="genesis-fatal"
    />
  );
}

/**
 * The last-resort fatal screen: React Native primitives only, no theme, no
 * context, nothing that can itself fail. Shown when the providers could not
 * start, or when the `fatal` slot threw.
 */
export function PlainFatalScreen({ error, retry }: FatalScreenProps) {
  return (
    <View testID="genesis-fatal-plain" style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600" }}>
        Something went wrong
      </Text>
      <Text style={{ textAlign: "center" }}>{errorDetails(error) ?? "Try again, and if it keeps happening, close and reopen the app."}</Text>
      <Pressable accessibilityRole="button" onPress={retry} testID="genesis-fatal-plain-retry" style={{ padding: 12 }}>
        <Text style={{ fontSize: 17 }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export interface ErrorReport {
  /** True when the app could not go on (a render error, a failed boot, a fatal global error). */
  fatal: boolean;
  /**
   * `boundary` (the shell's), `screen` (a screen boundary), `global`, `boot`,
   * `rejection`, `query` and `mutation` (a failed query or mutation the
   * shell's query client saw).
   */
  source: "boundary" | "screen" | "global" | "boot" | "rejection" | "query" | "mutation";
  componentStack?: string;
  /** False when nothing caught it (an unhandled promise rejection). Default: handled unless fatal. */
  handled?: boolean;
  /** Low-cardinality labels (`query.key`), never ids. */
  tags?: Readonly<Record<string, string>>;
}

export type OnError = (error: Error, report: ErrorReport) => void;

export interface GenesisErrorBoundaryProps {
  children?: ReactNode;
  /** What to render instead of the tree that threw. */
  fallback: ComponentType<FatalScreenProps>;
  onError?: OnError;
  /** Change it to clear a caught error (the tree remounts). */
  resetKey?: unknown;
  /** Called by the fallback's retry, after the error is cleared. */
  onRetry?: () => void;
  /** Reported as fatal (the app could not go on). Default true; a screen boundary reports false. */
  fatal?: boolean;
  /** The report's source. Default `boundary`. */
  source?: ErrorReport["source"];
}

interface BoundaryState {
  error: Error | null;
}

/** An error boundary whose fallback gets `{ error, retry }`. */
export class GenesisErrorBoundary extends Component<GenesisErrorBoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: toError(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    try {
      this.props.onError?.(toError(error), {
        fatal: this.props.fatal ?? true,
        source: this.props.source ?? "boundary",
        componentStack: info.componentStack ?? undefined,
      });
    } catch {
      // A failing reporter must not stop the fallback.
    }
  }

  override componentDidUpdate(previous: GenesisErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children ?? null;
    const Fallback = this.props.fallback;
    return <Fallback error={error} retry={this.retry} />;
  }
}

/** React Native's `ErrorUtils` (a global in every RN app), or a stand-in. */
export interface ErrorUtilsLike {
  getGlobalHandler(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

export interface GlobalErrorHandlerOptions {
  errorUtils: ErrorUtilsLike;
  onError?: OnError;
  /** A fatal error: show the fatal screen. The previous handler (which would end the app) is not called. */
  onFatal: (error: Error) => void;
  /**
   * True while a fatal screen is already up. Another fatal error then goes to
   * the previous handler, which ends the app (it restarts clean) rather than
   * leaving it stuck behind a screen that may itself be broken.
   */
  alreadyFatal?: () => boolean;
}

/**
 * Route global errors to `onError`. A fatal one goes to `onFatal` instead of
 * React Native's default handler, which would close the app; a non-fatal one
 * still reaches the previous handler (LogBox in development). Returns a
 * function that puts the previous handler back.
 */
export function installGlobalErrorHandler({ errorUtils, onError, onFatal, alreadyFatal }: GlobalErrorHandlerOptions): () => void {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((raw, isFatal) => {
    const error = toError(raw);
    try {
      onError?.(error, { fatal: Boolean(isFatal), source: "global" });
    } catch {
      // A failing reporter must not take the handler down with it.
    }
    if (isFatal && !alreadyFatal?.()) onFatal(error);
    else previous?.(raw, isFatal);
  });
  return () => {
    // With no previous handler, leave one that only logs, never ours (it would call an unmounted app).
    // genesis-allow-console: the last handler left once the shell is gone; nothing else is listening.
    errorUtils.setGlobalHandler(previous ?? ((error) => console.error(error)));
  };
}

/** `globalThis.ErrorUtils` in a React Native runtime, undefined elsewhere. */
export function defaultErrorUtils(): ErrorUtilsLike | undefined {
  const candidate = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  return candidate && typeof candidate.setGlobalHandler === "function" ? candidate : undefined;
}

/** Hermes's `HermesInternal.enablePromiseRejectionTracker`, or a stand-in. */
export type EnableRejectionTracker = (options: {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled: (id: number) => void;
}) => void;

/**
 * Hermes's rejection tracker, when the app runs on Hermes. React Native sends
 * unhandled rejections to `ExceptionsManager` (LogBox in development), never
 * to `ErrorUtils`' global handler, so without this they never reach `onError`.
 */
export function defaultRejectionTracker(): EnableRejectionTracker | undefined {
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: EnableRejectionTracker } }).HermesInternal;
  const enable = hermes?.enablePromiseRejectionTracker;
  return typeof enable === "function" ? enable.bind(hermes) : undefined;
}

/**
 * Report unhandled promise rejections to `onError`: non-fatal, and unhandled
 * (`handled: false`), so release health counts them. This replaces React
 * Native's own tracker, so each rejection is also written with
 * `console.warn`, which LogBox shows in development as before.
 */
export function installRejectionTracker({ enable, onError }: { enable: EnableRejectionTracker; onError: OnError }): void {
  enable({
    allRejections: true,
    onUnhandled: (id, rejection) => {
      const error = toError(rejection);
      // genesis-allow-console: React Native's own tracker writes this warning; replacing it must too (LogBox).
      console.warn(`Uncaught (in promise, id: ${id}): ${error.message}`);
      try {
        onError(error, { fatal: false, handled: false, source: "rejection" });
      } catch {
        // A failing reporter must not throw inside the promise machinery.
      }
    },
    onHandled: () => {},
  });
}
