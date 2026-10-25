/**
 * `@marktiderman/genesis-notifications/core` (also the package root): the
 * registry (`defineNotifications`) and the types every part shares. No
 * dependencies; runs in the browser, React Native, Node and edge runtimes.
 *
 * @packageDocumentation
 */
export {
  CHANNELS,
  IOS_ID_PATTERN,
  KEY_PATTERN,
  MAX_EMAIL_DELAY_SECONDS,
  MESSAGE_ACTIONS,
  GENESIS_TEST_CATEGORY,
  GENESIS_TEST_TYPE,
  NotificationRegistryError,
  defineNotifications,
  type Channel,
  type ChannelImportance,
  type MatrixRow,
  type NotificationActionDef,
  type NotificationActionSetDef,
  type NotificationCategoryDef,
  type NotificationData,
  type NotificationRegistry,
  type NotificationTypeDef,
  type NotificationTypeRow,
  type NotificationsInput,
  type RenderedText,
} from "./registry";
export {
  DELIVERY_STATUSES,
  type ChannelChoices,
  type DeliveryStatus,
  type EmailRecipient,
  type NotificationBrand,
  type NotificationRow,
  type NotifyInput,
  type NotifyResult,
  type Recipient,
  type UserRecipient,
} from "./types";
export { recipientsToJson, assertNoSecrets, SecretInDataError } from "./validate";
