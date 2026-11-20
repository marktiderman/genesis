/**
 * `@marktiderman/genesis-support/native`: the support block for
 * `GenesisNativeApp` (`createSupport`), the feedback form with screenshot
 * mark-up, shake to report, and hooks that feed genesis-ui-native's
 * `InboxPage` and `ThreadPage` for the person's reports, the idea board and
 * "you asked, we shipped", an agent's help desk queues and ticket threads
 * (`useAgentInbox`, `useAgentThread`) with desk controls and a Settings row into it, and the context dump's phone sections and "Send
 * diagnostics" (`nativeSections`, `observabilitySection`, `SendDiagnosticsRow`).
 *
 * @stability Beta
 */
export {
  createSupport,
  useSupport,
  useOptionalSupport,
  usePendingFeedback,
  useUnreadReplies,
  SupportProvider,
  SUPPORT_QUERY_ROOT,
  type PendingFeedback,
  type PendingScreenshot,
  type SupportBlock,
  type SupportOptions,
} from "./support";
export { FeedbackForm, type FeedbackFormProps } from "./feedback-form";
export {
  nativeSections,
  observabilitySection,
  useSendDiagnostics,
  SendDiagnosticsRow,
  type DiagnosticsApplicationLike,
  type DiagnosticsBuildMetadata,
  type DiagnosticsDeviceLike,
  type DiagnosticsNetInfoLike,
  type DiagnosticsUpdatesLike,
  type NativeSectionsOptions,
  type ObservabilityLike,
  type SendDiagnosticsRowProps,
  type SendDiagnosticsState,
  type SendDiagnosticsStatus,
} from "./diagnostics";
export { HelpAnswerCard, HelpArticleBody, SupportContactRow, useHelpArticle, useHelpCenter, useMessengerHome, useStartConversation, type HelpAnswerCardProps } from "./help";
export type { HelpAnswerResponse, HelpAskState } from "../help-ask";
export { ScreenshotAnnotator, strokeDots, boxOf, type ScreenshotAnnotatorProps } from "./annotator";
export { useSupportInbox, useSupportThread, useSupportConversation, useIdeaBoard, useShippedIdeas, VoteButton, SendFeedbackButton } from "./screens";
export {
  useIsSupportAgent,
  useAgentInbox,
  useAgentThread,
  useAgentUnreadCount,
  supportAgentKeys,
  AGENT_INBOX_VIEWS,
  AGENT_TICKET_STATUSES,
  type AgentDeskLabels,
  type AgentInboxOptions,
  type AgentInboxProps,
  type AgentThreadOptions,
  type AgentThreadProps,
} from "./agent";
export { AgentTicketDiagnostics, dumpHeading, type AgentTicketDiagnosticsProps } from "./diagnostics-viewer";
export { AgentDeskControls, AgentDeskSwitch, type AgentDeskControlsProps, type AgentDeskSwitchProps } from "./desks";
export { SupportRoute, type SupportRouteProps, type SupportScreenProps } from "./route";
export { listenForShake, type AccelerometerLike, type AccelerometerMeasurement, type CaptureOptions, type ShakeOptions, type ViewShotLike } from "./modules";
