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
export { dropOffByQuestion, dropOffSummary, type DropOffSummary, type QuestionDropOff } from "./dropoff";
export { followUpOf, needsFollowUp, type FollowUp } from "./followups";
export {
  formAvailability,
  parseInstant,
  takesResponses,
  isFull,
  type FormAvailability,
  type AvailabilityInput,
} from "./availability";
export { formStatusChip, formCounts, formNavItems, type FormTab, type FormNavItem, type NavItemShape } from "./status";
// Moved to genesis-core (`@marktiderman/genesis-core/resource`, also re-exported by
// `@marktiderman/genesis-ui/resource/rules`); kept here, deprecated.
export {
  dayLabel,
  prefilledUrl,
  embedSnippet,
  SAVE_STATE_LABEL,
  readinessOf,
  readinessChip,
  FORM_READINESS_OPTIONS,
  FORM_READINESS_LABELS,
  type PrefillChoice,
  type SaveState,
  type ChipTone,
  type Readiness,
} from "./moved-rules";
export { slugFromTitle, SLUG_PATTERN, validateSlug, copyTitle, freeSlug } from "./slug";
export { offersSubmitAnother } from "./respondent";
