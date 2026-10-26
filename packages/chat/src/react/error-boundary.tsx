/**
 * @feat:chat
 * `ChatErrorBoundary`: what one message (or one app attachment card) draws can't take the whole
 * thread down. Messages carry what other people sent, and app renderers get sender-controlled
 * data, so a render that throws shows its fallback instead, and the error goes to `onError`
 * (console.error by default) so it is never silent.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ChatErrorBoundaryProps {
  /** Drawn instead of the children once they throw. */
  fallback: ReactNode;
  /** Told about the error; console.error by default. */
  onError?: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

export class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    if (this.props.onError) this.props.onError(error, info);
    else console.error("genesis-chat: a message couldn't be drawn", error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
