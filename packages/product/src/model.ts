import type { FeatureHorizon, FeatureStatus } from "@marktiderman/genesis-features";

/**
 * A feature as the product system reads it: one entry of `features.json` (the
 * registry's generated output), so the catalog is always the code's own list.
 *
 * @stability Experimental
 */
export interface CatalogFeature {
  id: string;
  name: string;
  summary: string;
  status: FeatureStatus;
  owner: string;
  horizon?: FeatureHorizon;
  claimedBy?: string;
  tagline?: string;
  visibility?: string;
  aliases?: readonly string[];
}

/** What someone sent: an idea, a piece of feedback or a bug. @stability Experimental */
export const SIGNAL_KINDS = ["idea", "feedback", "bug"] as const;

/** @stability Experimental */
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * How much a signal matters to the feature it is linked to, set by whoever
 * triages it: 1 nice to have, 2 important, 3 critical. Unset counts as 1.
 *
 * @stability Experimental
 */
export type Importance = 1 | 2 | 3;

/**
 * One piece of evidence from a person: the intake record every source maps to.
 * Linked to a feature by `featureId` once triaged; until then it waits in the
 * triage inbox.
 *
 * @stability Experimental
 */
export interface Signal {
  /** Unique within its source, e.g. `github#12`. */
  id: string;
  kind: SignalKind;
  title: string;
  url?: string;
  /**
   * The FeatureId it is evidence for, set by whoever triages it (on GitHub, a
   * `feature:<id>` label, which only triagers can add). Unset means not triaged
   * yet. Only a linked signal counts toward demand or is closed by a release.
   */
  featureId?: string;
  /** The FeatureId the sender named themselves: untrusted, shown in triage only. */
  suggestedFeatureId?: string;
  author?: string;
  /** People who added their support (a 👍 on GitHub), not counting the author or bots. */
  votes: number;
  importance?: Importance;
  state: "open" | "closed";
  /** ISO 8601. */
  createdAt: string;
}

/**
 * Where signals come from. GitHub issues today (`githubSignals` in `/node`); a
 * database source implements the same contract later, and nothing above it
 * changes.
 *
 * @stability Experimental
 */
export interface SignalSource {
  list(): Promise<Signal[]>;
}

/** Signals held in memory, for tests and demos. @stability Experimental */
export function memorySignals(signals: readonly Signal[]): SignalSource {
  return { list: async () => [...signals] };
}
