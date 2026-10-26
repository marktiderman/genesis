// The pure half of the resource workspace moved to genesis-core
// (`@marktiderman/genesis-core/resource`; genesis-ui's `/resource/rules` re-exports it).
// These names stay here, deprecated, so
// existing imports keep working; the form's own words (an empty form says "Add a
// question") are passed from here.
import {
  SAVE_STATE_LABEL as UI_SAVE_STATE_LABEL,
  dayLabel as uiDayLabel,
  embedSnippet as uiEmbedSnippet,
  prefilledUrl as uiPrefilledUrl,
  readinessChip as uiReadinessChip,
  readinessOf as uiReadinessOf,
  type ChipTone as UiChipTone,
  type PrefillChoice as UiPrefillChoice,
  type Readiness as UiReadiness,
  type ReadinessFinding,
  type ReadinessLabels,
  type ReadinessOptions,
  type SaveState as UiSaveState,
} from "@marktiderman/genesis-core/resource";

/** A form's readiness rule: the builder's `no-questions` finding means "nothing to publish yet". */
export const FORM_READINESS_OPTIONS = { emptyCode: "no-questions" } as const satisfies ReadinessOptions;

/** A form's readiness words: an empty form says "Add a question". */
export const FORM_READINESS_LABELS = { empty: "Add a question" } as const satisfies ReadinessLabels;

/** @deprecated import from @marktiderman/genesis-core/resource */
export type SaveState = UiSaveState;
/** @deprecated import from @marktiderman/genesis-core/resource */
export type ChipTone = UiChipTone;
/** @deprecated import from @marktiderman/genesis-core/resource */
export type Readiness = UiReadiness;
/** @deprecated import from @marktiderman/genesis-core/resource */
export type PrefillChoice = UiPrefillChoice;

/** @deprecated import from @marktiderman/genesis-core/resource */
export const SAVE_STATE_LABEL: Record<SaveState, string> = UI_SAVE_STATE_LABEL;
/** @deprecated import from @marktiderman/genesis-core/resource */
export const dayLabel: typeof uiDayLabel = uiDayLabel;
/** @deprecated import from @marktiderman/genesis-core/resource */
export const prefilledUrl: typeof uiPrefilledUrl = uiPrefilledUrl;
/** @deprecated import from @marktiderman/genesis-core/resource */
export const embedSnippet: typeof uiEmbedSnippet = uiEmbedSnippet;

/**
 * Readiness from a form builder's findings (`no-questions` is "empty").
 * @deprecated import from @marktiderman/genesis-core/resource: `readinessOf(findings, { ...FORM_READINESS_OPTIONS, pending })`
 */
export function readinessOf(
  findings: readonly ReadinessFinding[],
  options: ReadinessOptions = {},
): Readiness {
  return uiReadinessOf(findings, { ...FORM_READINESS_OPTIONS, ...options });
}

/**
 * The readiness chip's label and tone, in a form's words.
 * @deprecated import from @marktiderman/genesis-core/resource: `readinessChip(readiness, FORM_READINESS_LABELS)`
 */
export function readinessChip(
  readiness: Readiness,
  labels: ReadinessLabels = {},
): { label: string; tone: ChipTone } {
  return uiReadinessChip(readiness, { ...FORM_READINESS_LABELS, ...labels });
}
