// Words for a resource page's chips (save state, readiness). Pure, and not about forms: courses, lessons and worksheets use the
// same page pattern.

/** Where the host's draft saving stands. */
export type SaveState = "saved" | "saving" | "unsaved" | "failed" | "stopped" | "conflict";

export const SAVE_STATE_LABEL: Record<SaveState, string> = {
  saved: "Changes saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  failed: "Couldn't save; trying again",
  stopped: "Couldn't save",
  conflict: "Changed elsewhere; reload",
};

export type ChipTone = "success" | "warning" | "danger" | "info" | "muted";

/** Whether something can be published, from an editor's checks. */
export interface Readiness {
  state: "ready" | "problems" | "warnings" | "empty" | "pending";
  /** Problems or warnings to look at (0 when ready, empty or pending). */
  count: number;
}

/**
 * Readiness from an editor's findings (genesis-forms-builder's `Analysis.findings`, or any
 * list shaped like it): errors block publishing; `no-questions` (nothing to answer yet)
 * is "empty", not broken. `pending` says errors are held back while a new question is being written.
 */
export function readinessOf(
  findings: readonly { level: "error" | "warning" | "info"; code?: string }[],
  options: { pending?: boolean } = {},
): Readiness {
  if (findings.some((f) => f.code === "no-questions")) return { state: "empty", count: 0 };
  const errors = findings.filter((f) => f.level === "error").length;
  if (errors) return { state: "problems", count: errors };
  if (options.pending) return { state: "pending", count: 0 };
  const warnings = findings.filter((f) => f.level === "warning").length;
  if (warnings) return { state: "warnings", count: warnings };
  return { state: "ready", count: 0 };
}

export function readinessChip(readiness: Readiness): { label: string; tone: ChipTone } {
  switch (readiness.state) {
    case "ready":
      return { label: "Ready to publish", tone: "success" };
    case "empty":
      return { label: "Add a question", tone: "muted" };
    case "pending":
      return { label: "In progress", tone: "muted" };
    case "problems":
      return {
        label: `${readiness.count} ${readiness.count === 1 ? "problem" : "problems"} to fix`,
        tone: "danger",
      };
    case "warnings":
      return { label: `${readiness.count} to check`, tone: "warning" };
  }
}
