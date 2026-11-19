/**
 * The devtools overlay's slot on `GenesisNativeApp`. Types only, so the
 * shell can name it without bundling the overlay.
 */

/** What the `devtoolsFeedback` slot is given: the support block's "send feedback" fills it. */
export interface DevtoolsFeedbackProps {
  /** The overlay's debug report (version signature, user id, blocks, recent activity). */
  debugInfo: string;
  /**
   * Closes the overlay (before a screenshot, say). Resolves once the sheet has finished sliding
   * away, so a capture after it shows the app, not the closing sheet.
   */
  close: () => Promise<void> | void;
}

/** What the `devtoolsDiagnostics` slot is given: the support block's "Send diagnostics" fills it. */
export interface DevtoolsDiagnosticsProps {
  /** The overlay's debug report, as text (what "Copy debug info" copies). */
  debugInfo: string;
  /** Closes the overlay. */
  close: () => Promise<void> | void;
  /** Copies text, as the overlay's own "Copy debug info" does (the app's `copy` option, or the share sheet). */
  copy: (text: string) => unknown;
}

// A type, not an interface, so it fits the slots contract's Record constraint.
export type DevtoolsSlots = {
  /** A "send feedback" action in the devtools overlay. Default nothing; the support block fills it. */
  devtoolsFeedback: DevtoolsFeedbackProps;
  /**
   * A "Send diagnostics" action beside "Copy debug info": sends the context dump and shows its
   * short id. Default nothing; the support block fills it when it has `diagnostics`.
   */
  devtoolsDiagnostics: DevtoolsDiagnosticsProps;
};
