/**
 * Patterns — the layer between primitives and layouts.
 *
 * Admission test (docs/FRAMEWORK.md): "Does it combine 2+ primitives into a
 * recurring shape?" Patterns may lean on primitives only. Banned from the
 * tier: data fetching and routing.
 *
 * Domain vocabulary is NOT banned here — it is banned from *primitives*, and
 * carrying it is one of the things that makes a component a pattern. Per the
 * contract's most load-bearing test: "A primitive that knows the words
 * `onTrack`, `atRisk`, `engagement` or `rock` is not a primitive — it is a
 * pattern." `StatusBadge` is exactly that case and lives here for that reason.
 *
 * Everything here previously lived in `components/ui/` (primitives) or
 * `components/data/` (data-bound), in both cases one layer away from where
 * the contract puts it. Rule 2 — downward dependencies only — is only
 * enforceable once each component sits in the folder its layer names.
 */

export { EmptyState, NoFeaturesFound, NoFeedbackFound, NoSearchResults, type EmptyStateProps } from "./empty-state";
export { FormField, FormLabel, FormError, FormDescription } from "./form-field";
export { PageLoading, pageLoadingVariants, type PageLoadingProps } from "./page-loading";
export { SettingsRow, type SettingsRowProps } from "./settings-row";
export {
  StatusBadge,
  statusBadgeVariants,
  type StatusBadgeProps,
  type StatusBadgeStatus,
} from "./status-badge";
export { ToggleRow, type ToggleRowProps } from "./toggle-row";
export { UserAvatar, userAvatarVariants, type UserAvatarProps } from "./user-avatar";
export { ViewToggle, type ViewMode } from "./view-toggle";
export { ViewSettings } from "./view-settings";
