// @marktiderman/genesis-forms-studio: the form workspace around a Genesis Forms builder.
// Components hold state, so this entry is a client module; the pure rules are also at
// `@marktiderman/genesis-forms-studio/rules`.
//
// src/generic/ holds the pieces that aren't about forms (a resource page's header, its
// settings layout, headline numbers, summary cards, a follow-up list, the share dialog),
// for courses, lessons and worksheets too; they are meant to move to genesis-ui later.
export * from "./rules";

// Generic (src/generic)
export { ResourceHeader, type ResourceHeaderProps } from "./generic/ResourceHeader";
export { ReadinessChip } from "./generic/nav";
export { Chip } from "./generic/chip";
export { ResponsesToolbar, type ResponsesView } from "./generic/ResponsesToolbar";
export { HeadlineNumbers, type HeadlineNumber } from "./generic/HeadlineNumbers";
export { SummaryCard } from "./generic/SummaryCard";
export { FollowUpList, type FollowUpEntry } from "./generic/FollowUpList";
export { ShareDialog } from "./generic/ShareDialog";
export { SettingsSection, ResourceSettingsPage, type SettingsPageSection } from "./generic/settings";

// Forms
export { FORM_NAV_ICONS } from "./navIcons";
export { ResponsesFilters, type ChoiceFilter } from "./ResponsesFilters";
export { QuestionSummaryCards, QuestionSummaryCard } from "./QuestionSummaryCards";
