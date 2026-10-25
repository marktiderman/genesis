/**
 * The devtools overlay's slot on `GenesisNativeApp`. Types only, so the
 * shell can name it without bundling the overlay.
 */

/** What the `devtoolsFeedback` slot is given: the support block's "send feedback" fills it. */
export interface DevtoolsFeedbackProps {
  /** The overlay's debug report (version signature, user id, blocks, recent activity). */
  debugInfo: string;
  /** Closes the overlay (before a screenshot, say). */
  close: () => void;
}

// A type, not an interface, so it fits the slots contract's Record constraint.
export type DevtoolsSlots = {
  /** A "send feedback" action in the devtools overlay. Default nothing; the support block fills it. */
  devtoolsFeedback: DevtoolsFeedbackProps;
};
