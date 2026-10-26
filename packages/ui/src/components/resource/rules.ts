/**
 * The resource workspace's pure rules: no React, safe on a server (a list page's loader,
 * a submit endpoint). `@marktiderman/genesis-ui/resource/rules`. The components are at
 * `@marktiderman/genesis-ui/resource`, which re-exports these too.
 */
export {
  SAVE_STATE_LABEL,
  readinessOf,
  readinessChip,
  type SaveState,
  type ChipTone,
  type Readiness,
  type ReadinessFinding,
  type ReadinessOptions,
  type ReadinessLabels,
} from "./status";
export { dayLabel } from "./days";
export { prefilledUrl, embedSnippet, type PrefillChoice } from "./share";
