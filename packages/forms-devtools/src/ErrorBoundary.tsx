import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** What failed, for the message: "This panel", "The form". */
  label?: string | undefined;
  /** When this value changes, the boundary clears its error and renders children again. */
  resetKey?: unknown;
  onError?: ((error: Error, info: ErrorInfo) => void) | undefined;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

/**
 * Catches a render error below it and shows a readable message instead of
 * unmounting the whole page. React 19 still needs a class for this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return Object.is(props.resetKey, state.resetKey) ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="space-y-1 rounded-md border border-destructive/50 p-3 text-sm">
        <p className="font-medium text-destructive">{this.props.label ?? "This panel"} could not be shown.</p>
        <p className="break-words font-mono text-xs text-muted-foreground">{error.message.slice(0, 500)}</p>
      </div>
    );
  }
}
