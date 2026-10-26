// HOOK NAMESPACE CONVENTION (PRD-07 Phase A1.8 — locked at v0.1.1 publish)
//
// Hooks are grouped by domain. New hook categories live under
// `src/hooks/<category>/` (e.g., haptics, motion, theme, forms) and re-export
// from this root index. Consumers can import flat or by-category subpath:
//
//   import { useResource } from "@marktiderman/genesis-core";              // root
//   import { useResource } from "@marktiderman/genesis-core/hooks";        // category subpath
//
// FUTURE categories (planned per PRD-07 Track D):
//   - haptics  → src/hooks/haptics/   (haptics.useTier — useHaptics, etc.)
//   - motion   → src/hooks/motion/    (motion.useReducedMotion, spring presets)
//   - theme    → src/hooks/theme/     (theme.useScheme, theme.useColorMode)
//   - forms    → src/hooks/forms/     (forms.useField, useResourceForm migrates here)
//
// When adding a new hook, place it in the matching category directory and
// re-export from this index. Don't add hooks at the flat root — categorize
// them so the surface stays discoverable as the count grows.
//
// Today's hooks are data/form-shaped (resource fetching, form state, wizard
// flows). They live flat at `./` until forms category lands; at that point
// useResourceForm + useWizard migrate to `./forms/`.

export { useResource, type UseResourceOptions, type UseResourceReturn } from "./use-resource";
export { useOne, type UseOneOptions } from "./use-one";
export {
  useInfiniteResource,
  type UseInfiniteResourceOptions,
  type UseInfiniteResourceReturn,
  type InfinitePageParam,
} from "./use-infinite-resource";
export { useCapabilities } from "./use-capabilities";
export { useWrite, WRITE_FAILED, type UseWriteOptions, type UseWriteReturn } from "./use-write";
export { useDraft, type UseDraftReturn } from "./use-draft";
export {
  DraftController,
  DEFAULT_DRAFT_DELAY_MS,
  DRAFT_NOT_SAVED,
  isNetworkFailure,
  stableJson,
  type DraftAdoption,
  type DraftOptions,
  type DraftSeed,
  type DraftState,
  type DraftStatus,
  type DraftValue,
} from "./draft-controller";
export {
  ViewerScope,
  clearViewerCache,
  useViewerScope,
  useOptionalViewerScope,
  type ViewerScopeProps,
  type ViewerContext,
  type ResourceScope,
} from "./viewer-scope";
export { DEFAULT_LIVE_DEBOUNCE_MS, DEFAULT_LIVE_RESYNC_MS, type LiveOptions } from "./use-live";
export { useResourceForm, buildArrayItemDefaults, type UseResourceFormOptions, type UseResourceFormReturn } from "./use-resource-form";
export { useWizard, type WizardStep, type UseWizardReturn } from "./use-wizard";
export {
  DEFAULT_UNDO_DELAY_MS,
  pendingWriteCount,
  flushPendingWrites,
  dropPendingWrites,
  type MutationMode,
  type MutationModeOptions,
  type UndoableWrite,
} from "./mutation-mode";
export {
  useUnsavedChangesGuard,
  DEFAULT_UNSAVED_CHANGES_MESSAGE,
  type UseUnsavedChangesGuardOptions,
  type UseUnsavedChangesGuardReturn,
} from "./use-unsaved-changes-guard";
