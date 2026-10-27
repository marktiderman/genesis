/**
 * Screen errors: one screen fails, the rest of the app (the tab bar, the
 * other tabs) keeps working. The error is reported non-fatal, and "Try
 * again" renders the screen again.
 *
 * With Expo Router, export the boundary from a route or layout file; it
 * catches errors in that route and the routes below it:
 *
 *   // src/lib/observability.ts
 *   export const ScreenErrorBoundary = observability.screenBoundary();
 *   // src/app/(app)/messages/_layout.tsx
 *   export { ScreenErrorBoundary as ErrorBoundary } from "@/lib/observability";
 *
 * `observability.screenBoundary()` reports through the block and wraps the
 * boundary with each sink's route wrapper (Sentry's
 * `wrapExpoRouterErrorBoundary`). Without the block,
 * `createScreenErrorBoundary()` reports through `reportError` from
 * genesis-core. Outside Expo Router, wrap a subtree in `<ScreenErrorBoundary>`.
 */
import { useEffect, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { NativeButton, NativeEmptyState } from "@marktiderman/genesis-ui-native/components";
import { reportError } from "@marktiderman/genesis-core/errors";
import { errorDetails, GenesisErrorBoundary, type ErrorReport, type FatalScreenProps, type OnError } from "./errors";

/** What Expo Router gives a route's `ErrorBoundary`: the error, and `retry` to render the route again. */
export interface ScreenErrorProps {
  error: Error;
  retry: () => Promise<void>;
}

/** The default screen fallback: the screen hit a problem, and "Try again". @stability Beta */
export function ScreenErrorScreen({ error, retry }: ScreenErrorProps) {
  return (
    <NativeEmptyState
      variant="error"
      title="This screen hit a problem"
      body="The rest of the app still works. Try again, or go back."
      details={errorDetails(error)}
      primaryAction={
        <NativeButton onPress={() => void Promise.resolve(retry()).catch((e: unknown) => reportError(e, "native:screen-retry"))} testID="genesis-screen-error-retry">
          Try again
        </NativeButton>
      }
      testID="genesis-screen-error"
    />
  );
}

const reportThroughCore = (error: Error, report: ErrorReport) =>
  reportError(error, { source: report.source, fatal: report.fatal, ...(report.tags ? { tags: report.tags } : {}) });

export interface ScreenErrorBoundaryOptions {
  /** What to show. Default `ScreenErrorScreen`. */
  fallback?: ComponentType<ScreenErrorProps>;
  /** Where the error goes. Default `reportError` from genesis-core (the observability block, when it is on). */
  onError?: OnError;
  /** Wrappers around the route boundary, innermost first (Sentry's `wrapExpoRouterErrorBoundary`). */
  wrap?: readonly ((boundary: ComponentType<ScreenErrorProps>) => ComponentType<ScreenErrorProps>)[];
}

/**
 * An Expo Router `ErrorBoundary`: reports each error once (non-fatal, source
 * `screen`) and shows `fallback`. Build it once, at module scope.
 *
 * @stability Beta
 */
export function createScreenErrorBoundary(options: ScreenErrorBoundaryOptions = {}): ComponentType<ScreenErrorProps> {
  const Fallback = options.fallback ?? ScreenErrorScreen;
  const onError = options.onError ?? reportThroughCore;
  function GenesisScreenErrorBoundary(props: ScreenErrorProps) {
    const reported = useRef<Error | null>(null);
    useEffect(() => {
      if (reported.current === props.error) return;
      reported.current = props.error;
      try {
        onError(props.error, { fatal: false, source: "screen" });
      } catch {
        // A failing reporter must not take the fallback down with it.
      }
    }, [props.error]);
    return <Fallback {...props} />;
  }
  return (options.wrap ?? []).reduce<ComponentType<ScreenErrorProps>>((inner, wrap) => wrap(inner), GenesisScreenErrorBoundary);
}

export interface ScreenErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ComponentType<ScreenErrorProps>;
  /** Default `reportError` from genesis-core. */
  onError?: OnError;
  /** Change it to clear a caught error. */
  resetKey?: unknown;
}

/**
 * A boundary around part of a screen tree, for apps without Expo Router's
 * per-route boundaries: non-fatal, reported, with "Try again".
 *
 * @stability Beta
 */
export function ScreenErrorBoundary({ children, fallback, onError, resetKey }: ScreenErrorBoundaryProps) {
  const Screen = fallback ?? ScreenErrorScreen;
  // The boundary's retry is synchronous; the screen's (Expo Router's shape) returns a promise.
  const Fallback = useMemo(
    () =>
      function ScreenFallback({ error, retry }: FatalScreenProps) {
        return <Screen error={error} retry={async () => retry()} />;
      },
    [Screen],
  );
  return (
    <GenesisErrorBoundary fallback={Fallback} onError={onError ?? reportThroughCore} resetKey={resetKey} fatal={false} source="screen">
      {children}
    </GenesisErrorBoundary>
  );
}
