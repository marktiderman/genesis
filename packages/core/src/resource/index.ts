// @marktiderman/genesis-core/resource: the resource workspace's pure rules (a form, a
// course, a lesson, a worksheet), with no React: safe on a server (a list page's loader, a
// submit endpoint) and on a phone. genesis-ui's `/resource` components draw them, and
// `@marktiderman/genesis-ui/resource/rules` re-exports them.

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
export type { HeadlineNumber, HeadlineTone } from "./headline";
