/**
 * `@marktiderman/genesis-support/web-chat`: a report's thread on genesis-chat, for the web (the
 * support-chat block). `SupportReportThread` is the person's view: the report, then the live
 * conversation with support (photos, files, voice notes). `SupportStaffThread` is staff's: the
 * report's status and assignee over the same conversation, with internal notes in the composer.
 * `SupportAgentInbox` is the help desk's whole inbox: a tenant's queues, the open ticket and its details.
 * `SupportMessenger` and `SupportMessengerLauncher` are the person's side (Home, Messages, Help), and
 * `SupportHelpCenterAdmin` is where agents write articles.
 *
 * Needs `@marktiderman/genesis-chat` (an optional peer of genesis-support): render under its
 * `ChatProvider` in a TanStack QueryClientProvider, with a support client made with the `chat`
 * option. The details panel's and the admin screens' lists are views (genesis-ui's `ResourceView`),
 * so render those under `GenesisProvider` too. Kept out of `/web` so apps without genesis-chat
 * never import it.
 *
 * @stability Beta
 */
export { SupportReportThread, supportWebKeys, type SupportReportThreadProps } from "./report-thread";
export { SupportStaffThread, type SupportStaffThreadProps } from "./staff-thread";
export { SupportAgentInbox, supportInboxKeys, type SupportAgentInboxProps } from "./agent-inbox";
export { SupportContact, type SupportContactProps } from "./contact";
export { SupportTicketDiagnostics, diagnosticsText, supportDiagnosticsKeys, type SupportDiagnosticsLinks, type SupportTicketDiagnosticsProps } from "./diagnostics-viewer";
export {
  SupportDeskControls,
  SupportDeskPicker,
  SupportDeskSwitch,
  SupportLinkRequester,
  SupportRequesterPanel,
  deskName,
  lastMoveLabel,
  supportDeskKeys,
  supportDeskScope,
  useSupportDesks,
  type SupportDeskControlsProps,
  type SupportDeskPickerProps,
  type SupportDeskSwitchProps,
  type SupportFindPeople,
  type SupportLinkRequesterProps,
  type SupportRequesterPanelProps,
} from "./desks";
export { SupportMessenger, SupportMessengerLauncher, supportMessengerKeys, type MessengerSpace, type SupportMessengerLauncherProps, type SupportMessengerProps } from "./messenger";
export { SupportHelpCenterAdmin, type SupportHelpCenterAdminProps } from "./help-admin";
export {
  SupportSavedRepliesAdmin,
  SupportAgentReports,
  SupportAgentsAdmin,
  SupportMyMentions,
  type SupportSavedRepliesAdminProps,
  type SupportAgentReportsProps,
  type SupportAgentsAdminProps,
  type SupportMyMentionsProps,
} from "./agent-tools";
export type { HelpAnswerResponse, HelpAskState } from "../help-ask";
