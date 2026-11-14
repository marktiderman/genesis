// @marktiderman/genesis-core/headless: the behaviour of genesis-ui's controls and their
// genesis-ui-native twins, written once with no React and no DOM. Each twin draws its own platform
// and leaves the rules here: clamping and stepping a number, matching typed text, moving an item
// in a list, reading a time, shaping a chart's axis, holding a one-time code, a form's repeat and
// upload limits, and the small display rules (a trend, a status's tone, a step's state).

export {
  clampNumber,
  snapToStep,
  stepNumber,
  canStepNumber,
  parseNumberInput,
  readNumberDraft,
  clampRange,
  type NumberStepOptions,
  type ParseNumberOptions,
} from "./number";
export { matchesQuery, filterOptions, type ComboboxOption } from "./text";
export { moveItem, dropIndex, movedAnnouncement } from "./reorder";
export {
  parseTimeOfDay,
  timeToValue,
  formatTimeOfDay,
  timeOfDate,
  withTimeOfDay,
  timeSlots,
  type TimeOfDay,
} from "./time";
export {
  chartSeriesColor,
  chartTokenOf,
  defaultChartToken,
  chartDomain,
  chartPosition,
  chartSummary,
  type ChartScheme,
  type ChartSeriesConfig,
} from "./chart";
export {
  OTP_PATTERN_DIGITS,
  stripOtpSeparators,
  sanitizeOtp,
  otpSlots,
  otpComplete,
  type OtpSlot,
} from "./otp";
export {
  fieldArrayLimits,
  fieldArrayAddLabel,
  wizardStepFields,
  wizardProgressLabel,
  DEFAULT_MAX_FILE_SIZE,
  formatFileSize,
  fileProblem,
  fieldAccept,
  type PickedFileInfo,
} from "./forms";
export {
  formatTrend,
  STATUS_BADGE_TONES,
  statusBadgeLabel,
  stepState,
  NOTIFICATION_DAY_BUCKETS,
  notificationDayBucket,
  groupNotificationsByDay,
  customViewStatus,
  type StatusBadgeStatus,
  type StepState,
  type NotificationDayBucket,
  type NotificationClock,
  type CustomViewStatus,
} from "./display";
export { carouselIndex, carouselOffset } from "./carousel";
export { dayOfDate, dateOfDay, monthWeeks, dayInRange, pickRangeDay, weekdayDays } from "./calendar";
