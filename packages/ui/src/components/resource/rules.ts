/**
 * The resource workspace's pure rules: no React, safe on a server (a list page's loader,
 * a submit endpoint). `@marktiderman/genesis-ui/resource/rules`. They live in
 * `@marktiderman/genesis-core/resource`, so a host without React (a phone app's summary,
 * a server) can use them without installing genesis-ui; these are the same functions. The
 * components are at `@marktiderman/genesis-ui/resource`, which re-exports these too.
 */
export {
  SAVE_STATE_LABEL,
  readinessOf,
  readinessChip,
  dayLabel,
  prefilledUrl,
  embedSnippet,
  type SaveState,
  type ChipTone,
  type Readiness,
  type ReadinessFinding,
  type ReadinessOptions,
  type ReadinessLabels,
  type PrefillChoice,
} from "@marktiderman/genesis-core/resource";
