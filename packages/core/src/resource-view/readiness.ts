// Readiness: whether a record is ready (to publish, to send), from its checks. Pure words and
// tones, no React: web and native draw the same chip (moved here from genesis-ui, which
// re-exports it unchanged).

import type { ViewTone } from "./types";

/** A chip's colour: the tinted, AA-safe Genesis badge tones. The same set as `ViewTone`. */
export type ChipTone = ViewTone;

/** Whether something can be published, from an editor's checks. */
export interface Readiness {
  state: "ready" | "problems" | "warnings" | "empty" | "pending";
  /** Problems or warnings to look at (0 when ready, empty or pending). */
  count: number;
}

/** One of an editor's findings, as readinessOf reads it. */
export interface ReadinessFinding {
  level: "error" | "warning" | "info";
  code?: string | undefined;
}

export interface ReadinessOptions {
  /** Errors are held back while something new is being written: "pending", not "problems". */
  pending?: boolean | undefined;
  /**
   * The finding code that means "nothing to publish yet" (for example a form builder's
   * `no-questions`): it makes the result "empty", not broken. None by default.
   */
  emptyCode?: string | undefined;
}

/**
 * Readiness from an editor's findings (any list of `{ level, code? }`): errors block
 * publishing, warnings ask for a look. One pass over the findings.
 */
export function readinessOf(
  findings: readonly ReadinessFinding[],
  options: ReadinessOptions = {},
): Readiness {
  const { emptyCode, pending } = options;
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (emptyCode !== undefined && f.code === emptyCode) return { state: "empty", count: 0 };
    if (f.level === "error") errors++;
    else if (f.level === "warning") warnings++;
  }
  if (errors) return { state: "problems", count: errors };
  if (pending) return { state: "pending", count: 0 };
  if (warnings) return { state: "warnings", count: warnings };
  return { state: "ready", count: 0 };
}

/** The readiness chip's words, each optional; the defaults are resource-neutral. */
export interface ReadinessLabels {
  /** Default "Ready to publish". */
  ready?: string | undefined;
  /** When there is nothing yet. Default "Nothing to publish yet"; a form says "Add a question". */
  empty?: string | undefined;
  /** Default "In progress". */
  pending?: string | undefined;
  /** Default "1 problem to fix" / "3 problems to fix". */
  problems?: ((count: number) => string) | undefined;
  /** Default "2 to check". */
  warnings?: ((count: number) => string) | undefined;
}

/** The readiness chip's label and tone. */
export function readinessChip(
  readiness: Readiness,
  labels: ReadinessLabels = {},
): { label: string; tone: ChipTone } {
  switch (readiness.state) {
    case "ready":
      return { label: labels.ready ?? "Ready to publish", tone: "success" };
    case "empty":
      return { label: labels.empty ?? "Nothing to publish yet", tone: "muted" };
    case "pending":
      return { label: labels.pending ?? "In progress", tone: "muted" };
    case "problems":
      return {
        label:
          labels.problems?.(readiness.count) ??
          `${readiness.count} ${readiness.count === 1 ? "problem" : "problems"} to fix`,
        tone: "danger",
      };
    case "warnings":
      return { label: labels.warnings?.(readiness.count) ?? `${readiness.count} to check`, tone: "warning" };
  }
}
