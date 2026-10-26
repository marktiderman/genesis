/**
 * Resource workspace — the page around one publishable thing (a form, a course, a lesson,
 * a worksheet): its header, the readiness chip for the shell's tab row, the Responses
 * toolbar, headline numbers and summary cards, a follow-up list, the settings page and the
 * Share dialog.
 *
 * Admission test: the pieces know what a resource page looks like, not what the resource
 * is. Every noun ("form", "course") and every rule about one kind of resource comes from
 * the host, through props, labels and slots. Moved up from genesis-forms-studio.
 */
export * from "./rules";
export { Chip } from "./chip";
export { ResourceHeader, type ResourceHeaderProps } from "./ResourceHeader";
export { ReadinessChip } from "./ReadinessChip";
export { ResponsesToolbar, type ResponsesView } from "./ResponsesToolbar";
export { HeadlineNumbers, type HeadlineNumber } from "./HeadlineNumbers";
export { SummaryCard } from "./SummaryCard";
export { FollowUpList, type FollowUpEntry } from "./FollowUpList";
export { ResourceSettingsPage, SettingsSection, type ResourceSettingsSection } from "./ResourceSettingsPage";
export { ShareDialog } from "./ShareDialog";
