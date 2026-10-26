// @marktiderman/genesis-forms-studio: the form workspace around a Genesis Forms builder.
// Components hold state, so this entry is a client module; the pure rules are also at
// `@marktiderman/genesis-forms-studio/rules`.
//
// The pieces that aren't about forms (a resource page's header, its readiness chip, its
// settings layout, headline numbers, summary cards, a follow-up list, the share dialog)
// moved to genesis-ui (`@marktiderman/genesis-ui/resource`), for courses, lessons and
// worksheets too. Their names stay here, deprecated, with the form's words passed in.
export * from "./rules";

// Moved to genesis-ui (deprecated here)
export {
  ResourceHeader,
  ReadinessChip,
  Chip,
  ResponsesToolbar,
  HeadlineNumbers,
  SummaryCard,
  FollowUpList,
  ShareDialog,
  SettingsSection,
  ResourceSettingsPage,
  FORM_SHARE_LABELS,
  type ResourceHeaderProps,
  type ResponsesView,
  type HeadlineNumber,
  type FollowUpEntry,
  type SettingsPageSection,
} from "./moved";

// Forms
export { FORM_NAV_ICONS } from "./navIcons";
export { ResponsesFilters, type ChoiceFilter } from "./ResponsesFilters";
export { QuestionSummaryCards, QuestionSummaryCard } from "./QuestionSummaryCards";
export { DropOffByQuestion } from "./DropOffByQuestion";
export { PhotoAnswer } from "./PhotoAnswer";
