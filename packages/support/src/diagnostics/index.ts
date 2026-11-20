/**
 * The context dump (`genesis.diagnostics/1`): the format, sections, the
 * privacy rules and caps, `createDiagnostics`, the transports and the
 * offline queue. Platform-neutral; re-exported from the package root.
 */
export * from "./report";
export { redactReport, type RedactOptions } from "./redact";
export { capReport, cutToBytes, type CapLimits } from "./cap";
export { createDiagnostics, type CollectOptions, type Diagnostics, type DiagnosticsDelivery, type DiagnosticsOptions, type DiagnosticsUser, type FeedbackSubmission, type SendDiagnosticsOptions } from "./create";
export {
  supabaseTransport,
  httpTransport,
  reportVersionLine,
  DIAGNOSTICS_TABLE,
  FEEDBACK_FORM_FIELDS,
  type DiagnosticsReceipt,
  type DiagnosticsTransport,
  type HttpTransportOptions,
} from "./transports";
export {
  createOfflineQueue,
  memoryQueueStorage,
  isRetryableError,
  DiagnosticsSendError,
  DEFAULT_QUEUE_KEY,
  type OfflineQueue,
  type OfflineQueueOptions,
  type QueueFlushResult,
  type QueueStorage,
} from "./queue";
export { captureConsole, type CaptureConsoleOptions, type ConsoleBuffer, type ConsoleLevel } from "./console";
export {
  createHealthChecks,
  healthChecks,
  healthChecksSection,
  supabaseHealthChecks,
  toDiagnosticCheck,
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_RESULTS_MAX_AGE_MS,
  HEALTH_STATUSES,
  type HealthAnswer,
  type HealthCheck,
  type HealthChecks,
  type HealthResult,
  type HealthStatus,
  type HealthSupabaseLike,
} from "./health";
export { diagnosticsViewSections, type DiagnosticsViewSection } from "./view";
