// The pure half of the studio: no React, safe on a server (a submit endpoint, a Sheet
// delivery, a forms list). `@marktiderman/genesis-forms-studio/rules`.
export {
  carryAnswers,
  answerCell,
  plainLabel,
  answerColumns,
  answersByKey,
  valuesByKey,
  toCsv,
  type Cell,
  type AnswerColumn,
} from "./answers";
export {
  summarizeResponses,
  highestRating,
  lowestRating,
  lowRatingAtMost,
  lowScaleAtMost,
  hasLowRating,
  lowRatingLabel,
  isFiltered,
  filterResponses,
  presetRange,
  toResponseFilter,
  lowThisWeek,
  NO_FILTERS,
  type SummaryItem,
  type ScaleSummary,
  type ChoiceSummary,
  type TextSummary,
  type QuestionSummary,
  type ResponseFilter,
  type DatePreset,
  type FiltersValue,
} from "./summary";
export { headlineNumbers, comparisonFilter, headlineCards, type Headline } from "./headline";
export { followUpOf, needsFollowUp, type FollowUp } from "./followups";
export { dayLabel } from "./generic/days";
export { prefilledUrl, embedSnippet, type PrefillChoice } from "./generic/share";
export {
  formAvailability,
  takesResponses,
  isFull,
  type FormAvailability,
  type AvailabilityInput,
} from "./availability";
export { formStatusChip, formCounts, formNavItems, type FormTab, type FormNavItem } from "./status";
export {
  SAVE_STATE_LABEL,
  readinessOf,
  readinessChip,
  type SaveState,
  type ChipTone,
  type Readiness,
  type NavItem,
} from "./generic/status";
