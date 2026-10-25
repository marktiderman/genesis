/**
 * `@marktiderman/genesis-support/native`: the support block for
 * `GenesisNativeApp` (`createSupport`), the feedback form with screenshot
 * mark-up, shake to report, and hooks that feed genesis-ui-native's
 * `InboxPage` and `ThreadPage` for the person's reports, the idea board and
 * "you asked, we shipped".
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
export { ScreenshotAnnotator, strokeDots, boxOf, type ScreenshotAnnotatorProps } from "./annotator";
export { useSupportInbox, useSupportThread, useIdeaBoard, useShippedIdeas, VoteButton, SendFeedbackButton } from "./screens";
export { listenForShake, type AccelerometerLike, type AccelerometerMeasurement, type CaptureOptions, type ShakeOptions, type ViewShotLike } from "./modules";
