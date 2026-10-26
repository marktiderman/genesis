/**
 * `@marktiderman/genesis-notifications/server`: `notify()`, the runner that
 * sends what it queued (Expo push, Resend email), the HTTP handler (cron,
 * webhooks, one-click unsubscribe), `resolveSecretLink` and the sender
 * domain check. Runs wherever `fetch` and WebCrypto do (Node 20+, Deno,
 * workers). Never import it into a browser or app bundle: it is for the
 * service role.
 *
 * @packageDocumentation
 */
export { notify, cancelNotification, syncNotificationTypes, type CancelInput, type NotifyOptions } from "./notify";
export {
  supabaseNotificationStore,
  NotificationStoreError,
  type ClaimedDevice,
  type ClaimedJob,
  type NotificationStore,
  type PushTicketRow,
  type RenderedEmail,
  type RpcClient,
  type SenderIdentity,
  type SettleOutcome,
} from "./store";
export { createNotificationRunner, type EmailOptions, type NotificationRunner, type NotificationRunnerOptions } from "./runner";
export { createNotificationsHandler, type NotificationsHandlerOptions } from "./handler";
export {
  expoPushProvider,
  expoErrorCode,
  refusedOutright,
  EXPO_RECEIPTS_BATCH,
  EXPO_RECEIPTS_URL,
  EXPO_SEND_BATCH,
  EXPO_SEND_URL,
  type ExpoOptions,
  type PushMessage,
  type PushProvider,
  type PushReceipt,
  type PushTicket,
} from "./expo";
export { resendProvider, RESEND_API, type EmailMessage, type EmailProvider, type EmailSendResult, type ResendOptions } from "./resend";
export { resolveSecretLink, SecretLinkError, SECRET_LINK_PLACEHOLDER, type SecretLinkRef, type SecretLinks } from "./secret-links";
export { createUnsubscribeToken, verifyUnsubscribeToken, unsubscribeHeaders, type UnsubscribeClaims } from "./unsubscribe";
export { verifyResendWebhook, emailEventOf, WEBHOOK_TOLERANCE_SECONDS } from "./webhook";
export { checkSenderDomain, type DomainCheck, type DomainCheckOptions } from "./dns";
export {
  canonicalJson,
  defaultEmailTemplate,
  displayName,
  escapeHtml,
  headerSafe,
  isSafeAddress,
  type EmailContent,
  type EmailTemplate,
  type EmailTemplateContext,
} from "./email-render";
export { SendError, isRetryableStatus, retryAfterSeconds, REQUEST_TIMEOUT_MS, type HttpDeps } from "./errors";
