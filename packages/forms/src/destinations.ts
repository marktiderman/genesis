/**
 * Delivery destinations: send a checked submission to an inbox, a Google
 * Sheet, Slack or a signed webhook. fetch and WebCrypto only, no
 * dependencies, so it runs on Node 20+, edge runtimes and Workers. Storage
 * (the outbox, claims, leases) stays the app's: a destination delivers once
 * and reports whether a failure is worth retrying, and `createDeliveryRunner`
 * drives an app's outbox through a claim / record interface it maps to its
 * own tables.
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
  type OptionResolver,
  type ResolveContext,
  type WebCryptoKey,
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
  MIN_WEBHOOK_SECRET_BYTES,
  newWebhookSecret,
  signWebhook,
  verifyWebhook,
  webhookDestination,
  webhookPayload,
  type VerifyWebhookInput,
  type WebhookConfig,
  type WebhookDestinationOptions,
  type WebhookPayload,
} from "./destinations/webhook";
export {
  slackDestination,
  slackMessage,
  escapeSlack,
  SLACK_VALUE_LIMIT,
  type SlackDestinationOptions,
  type SlackMessageInput,
  type SlackMessageOptions,
} from "./destinations/slack";
export {
  checkHookHost,
  hookHost,
  HookUrlError,
  isPublicAddress,
  MAX_HOOK_URL_LENGTH,
  parseHookUrl,
  SLACK_HOSTS,
  type HookKind,
  type ResolveHost,
} from "./destinations/hook-url";
export { conditionOf, isCondition, MAX_CONDITION_DEPTH, passesCondition } from "./destinations/condition";
export {
  clearGoogleOAuthTokenCache,
  DRIVE_FILE_SCOPE,
  googleOAuthAccessToken,
  refreshGoogleAccessToken,
  type GoogleOAuthClient,
  type GoogleOAuthTokenOptions,
  type RefreshedGoogleToken,
} from "./destinations/google-oauth";
export { deriveSecretKey, openSecret, sealSecret, secretKeyBytes, type DeriveSecretKeyOptions } from "./destinations/secret-box";
export {
  createDeliveryRunner,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_DEFERRALS,
  defaultBackoff,
  deliveryOutcome,
  type ClaimedDelivery,
  type ClaimRequest,
  type DeliveryOutcome,
  type DeliveryReport,
  type DeliveryRunner,
  type DeliveryRunnerOptions,
  type RunOptions,
} from "./destinations/runner";
