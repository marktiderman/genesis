/**
 * Errors: a boundary per screen tree, and a global handler for errors React
 * never sees (an event handler, a promise, a timer). Both report through one
 * `onError` (wire Sentry there) and show the fatal screen instead of letting
 * the app die; its "Try again" remounts the tree with fresh state.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { NativeButton, NativeEmptyState } from "@marktiderman/genesis-ui-native/components";
import { toError } from "./boot";

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
      details={error.message}
      primaryAction={
        <NativeButton onPress={retry} testID="genesis-fatal-retry">
          Try again
        </NativeButton>
      }
      testID="genesis-fatal"
    />
  );
}

export interface ErrorReport {
  /** True when the app could not go on (a render error, or a fatal global error). */
  fatal: boolean;
  source: "boundary" | "global" | "boot";
  componentStack?: string;
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
    this.props.onError?.(toError(error), { fatal: true, source: "boundary", componentStack: info.componentStack ?? undefined });
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
}

/**
 * Route global errors to `onError`. A fatal one goes to `onFatal` instead of
 * React Native's default handler, which would close the app; a non-fatal one
 * still reaches the previous handler (LogBox in development). Returns a
 * function that puts the previous handler back.
 */
export function installGlobalErrorHandler({ errorUtils, onError, onFatal }: GlobalErrorHandlerOptions): () => void {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((raw, isFatal) => {
    const error = toError(raw);
    try {
      onError?.(error, { fatal: Boolean(isFatal), source: "global" });
    } catch {
      // A failing reporter must not take the handler down with it.
    }
    if (isFatal) onFatal(error);
    else previous?.(raw, isFatal);
  });
  return () => {
    if (previous) errorUtils.setGlobalHandler(previous);
  };
}

/** `globalThis.ErrorUtils` in a React Native runtime, undefined elsewhere. */
export function defaultErrorUtils(): ErrorUtilsLike | undefined {
  const candidate = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  return candidate && typeof candidate.setGlobalHandler === "function" ? candidate : undefined;
}
