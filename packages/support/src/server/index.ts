/**
 * `@marktiderman/genesis-support/server`: the app's own server end of support.
 * `createDiagnosticsHandler` takes dumps and feedback with screenshots as a
 * Fetch handler (`Request → Response`), mountable in NestJS, a Supabase Edge
 * Function or a TanStack Start server route; `parseDiagnosticReport` checks,
 * scrubs and caps a dump; the store and files seams with Supabase adapters;
 * and the notifiers (GitHub issues, a signed webhook, the app's email or push).
 *
 * Runs wherever the Fetch API does (Node 18+, Deno, workers). No React.
 *
 * @stability Beta
 */
export { parseDiagnosticReport, type ParseDiagnosticsError, type ParseDiagnosticsOptions, type ParsedDiagnostics } from "./parse";
export {
  createDiagnosticsHandler,
  memoryRateLimiter,
  parseFeedbackSubmission,
  looksLikeImage,
  DiagnosticsStoreError,
  readBodyLimited,
  type DiagnosticsCaller,
  type DiagnosticsCors,
  type DiagnosticsFiles,
  type DiagnosticsHandler,
  type DiagnosticsHandlerOptions,
  type DiagnosticsStore,
  type FeedbackSubmission,
  type RateLimiter,
  type StoredFile,
} from "./handler";
export {
  eventSummaryLines,
  eventTitle,
  fenced,
  neutralise,
  type DiagnosticsCreatedEvent,
  type FeedbackCreatedEvent,
  type FeedbackSummary,
  type ReporterThanks,
  type StaffAlert,
  type SupportEvent,
  type SupportMessenger,
  type SupportNotifier,
} from "./events";
export {
  githubIssueNotifier,
  webhookNotifier,
  verifyWebhookSignature,
  WEBHOOK_HEADERS,
  messengerNotifier,
  notificationsNotifier,
  supportNotifiersFromSettings,
  hmacSha256Hex,
  issueBody,
  issueDetail,
  type GithubIssueNotifierOptions,
  type MessengerNotifierOptions,
  type WebhookNotifierOptions,
} from "./notifiers";
export { supabaseAuthenticate, supabaseDiagnosticsFiles, supabaseDiagnosticsStore } from "./supabase";
export { DIAGNOSTICS_SCHEMA, DIAGNOSTICS_DEFAULTS, redactReport, capReport, type DiagnosticReport } from "../diagnostics";
