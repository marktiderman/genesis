/**
 * `@marktiderman/genesis-support/web`: the feedback panel and launcher (Genesis
 * UI), tab screenshots with pen marks and hidden areas, pins on the page, and
 * the loader that mounts the launcher on any page.
 *
 * @stability Beta
 */
export { FeedbackPanel, undoMark, webContextCollector, type FeedbackPanelProps, type Marks } from "./feedback-panel";
export { FeedbackLauncher, mountSupportWidget, type FeedbackLauncherProps, type LauncherPosition } from "./launcher";
export { annotateScreenshot, canCaptureScreenshot, captureScreenshot, type Redaction, type Stroke, type WebCapture } from "./capture";
export { createPinOverlay, pickPin, resolvePin, stableLocator, type FeedbackPin, type PinOverlay, type PinnedReport } from "./pin";
