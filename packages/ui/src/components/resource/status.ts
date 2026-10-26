// Words for a resource page's chips (save state, readiness). Pure: no React, safe on a
// server. Not about any one kind of resource: forms, courses, lessons and worksheets use
// the same page pattern.

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

// Readiness and chip tones live in genesis-core (resource-view), so native draws the same chip.
export {
  readinessChip,
  readinessOf,
  type ChipTone,
  type Readiness,
  type ReadinessFinding,
  type ReadinessLabels,
  type ReadinessOptions,
} from "@marktiderman/genesis-core/resource-view";
