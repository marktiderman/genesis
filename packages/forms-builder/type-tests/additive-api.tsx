// Compiled against the built .d.ts: what 0.3 code wrote against the handle and
// history types still compiles now that they have more (optional) members.
import type { FormDefinition } from "@marktiderman/genesis-forms";
import type { BuilderHistory, FormBuilderHandle } from "@marktiderman/genesis-forms-builder";

declare const definition: FormDefinition;

// A mock handle with only the members 0.3 had.
export const mockHandle: FormBuilderHandle = {
  getValue: () => definition,
  getAnalysis: () => ({ findings: [], canPublish: true }),
  flush: () => definition,
  revealChecks: () => {},
};

// A mock history with only the members 0.3 had.
export const mockHistory: BuilderHistory = {
  value: definition,
  get: () => definition,
  apply: () => {},
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
  reset: () => {},
};

// The new members are there to call on a real handle.
export function undoFromHost(handle: FormBuilderHandle | null): boolean {
  handle?.undo?.();
  return handle?.canRedo?.() ?? false;
}
