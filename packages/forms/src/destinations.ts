/**
 * Delivery destinations: send a checked submission to an inbox, a Google
 * Sheet or a signed webhook. fetch and WebCrypto only, no dependencies, so
 * it runs on Node 20+, edge runtimes and Workers. Storage (the outbox,
 * claims, retry schedule) stays the app's: a destination delivers once and
 * reports whether a failure is worth retrying.
 */
export {
  DeliveryError,
  deliveryFailure,
  httpError,
  isRetryableStatus,
  REQUEST_TIMEOUT_MS,
  retryAfterSeconds,
  type Cell,
  type DeliveryFailure,
  type DeliveryItem,
  type DeliveryOptions,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
  type DestinationConfig,
  type HttpDeps,
} from "./destinations/types";
export { answerCell, escapeFormula, responseRow, SENSITIVE_MASK, visibleInputs, type ResponseRow, type RowOptions } from "./destinations/row";
export {
  emailBody,
  emailDestination,
  escapeHtml,
  headerSafe,
  idempotencyKey,
  isSafeAddress,
  isSafeFrom,
  MAX_RECIPIENTS,
  renderEmail,
  RESEND_API,
  resendProvider,
  type EmailConfig,
  type EmailContent,
  type EmailDestinationOptions,
  type EmailMessage,
  type EmailProvider,
  type EmailRenderInput,
  type ResendOptions,
} from "./destinations/email";
export {
  clearGoogleTokenCache,
  GOOGLE_TOKEN_URL,
  googleAccessToken,
  SHEETS_SCOPE,
  signJwt,
  type GoogleServiceAccount,
  type GoogleTokenOptions,
} from "./destinations/google-auth";
export {
  columnLetter,
  DEDUPE_WINDOW,
  DEFAULT_SHEET_NAME,
  HEADER_SCAN_ROWS,
  mergeHeader,
  rowFor,
  sheetsDestination,
  SHEETS_API,
  type SheetConfig,
  type SheetsDestinationOptions,
  type SheetState,
} from "./destinations/sheets";
export {
  checkWebhookUrl,
  isPrivateHost,
  signWebhook,
  verifyWebhook,
  webhookDestination,
  webhookPayload,
  type VerifyWebhookInput,
  type WebhookConfig,
  type WebhookDestinationOptions,
  type WebhookPayload,
} from "./destinations/webhook";
