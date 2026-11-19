/**
 * `@marktiderman/genesis-support/web`: the feedback panel and launcher (Genesis
 * UI), tab screenshots with pen marks and hidden areas, pins on the page, and
 * the loader that mounts the launcher on any page, and the context dump's
 * browser sections (`webSections`, with the console ring buffer).
 *
 * @stability Beta
 */
export {
  FeedbackPanel,
  undoMark,
  useFeedbackDraft,
  webContextCollector,
  type FeedbackDraft,
  type FeedbackDraftStore,
  type FeedbackPanelProps,
  type Marks,
} from "./feedback-panel";
export { webSections, flushDiagnosticsOnReconnect, type WebSectionsOptions } from "./diagnostics";
export { FeedbackLauncher, mountSupportWidget, type FeedbackLauncherProps, type LauncherPosition } from "./launcher";
export { annotateScreenshot, canCaptureScreenshot, captureScreenshot, type Redaction, type Stroke, type WebCapture } from "./capture";
export { createPinOverlay, pickPin, resolvePin, stableLocator, type FeedbackPin, type PinOverlay, type PinnedReport } from "./pin";
export { FEEDBACK_SHORTCUT, matchesShortcut, useFeedbackShortcut, type FeedbackShortcut } from "./shortcut";
export {
  SupportHelpArticle,
  SupportIdeaBoard,
  SupportIdeaStatusControl,
  SupportMyReports,
  SupportReportFeatureControl,
  SupportShippedIdeas,
  ideaVotable,
  ideaVotesLabel,
  supportBoardKeys,
  type SupportHelpArticleProps,
  type SupportIdeaBoardProps,
  type SupportIdeaRow,
  type SupportIdeaStatusControlProps,
  type SupportMyReportsProps,
  type SupportReportFeatureControlProps,
  type SupportReportRow,
  type SupportShippedIdeasProps,
} from "./boards";
