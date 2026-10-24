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
  hasLowRatingExcept,
  lowRatingLabel,
  isFiltered,
  filterResponses,
  presetRange,
  toResponseFilter,
  lowThisWeek,
  NO_FILTERS,
  matchesStatus,
  STATUS_FILTER_LABEL,
  RESPONSE_STATUS_LABEL,
  type ResponseStatus,
  type StatusFilter,
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
export { dropOffByQuestion, type QuestionDropOff } from "./dropoff";
export { followUpOf, needsFollowUp, type FollowUp } from "./followups";
export { dayLabel } from "./generic/days";
export { prefilledUrl, embedSnippet, type PrefillChoice } from "./generic/share";
export {
  formAvailability,
  parseInstant,
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
} from "./generic/status";
export { slugFromTitle, SLUG_PATTERN, validateSlug, copyTitle, freeSlug } from "./slug";
export { offersSubmitAnother } from "./respondent";
