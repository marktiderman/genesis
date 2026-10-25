/**
 * `@marktiderman/genesis-native/push`: push registration, the soft
 * permission prompt, Android channels, the foreground handler, tap routing,
 * the badge, and the notification preferences screen (categories, quiet
 * hours, privacy previews), on migration 0005 of @marktiderman/genesis-supabase.
 *
 * Rung 1: `<GenesisNativeApp blocks={[createPush(…)]}>` and `<NotificationSettings />`.
 * Rung 2: the `pushPrompt` slot, and NotificationSettings' `permission`,
 * `categories`, `quietHours` and `privacy` slots. Rung 3: the stores
 * (`createRegistration`, …) and row builders. Rung 4: the hooks
 * (`usePushPrompt`, `useQuietHours`, …) under `PushProvider`.
 *
 * Optional peer: `expo-notifications`, passed in rather than imported.
 *
 * @stability Beta
 */
export {
  createPush,
  PushProvider,
  PushRoot,
  usePush,
  useOptionalPush,
  usePushPermissionState,
  usePushRegistration,
  useNotificationPreferences,
  usePushPrompt,
  useBadge,
  useSuppressNotifications,
  type PushBlock,
  type PushChannel,
  type PushOptions,
  type PushRootProps,
  type PushSlots,
} from "./block";
export { PushPromptSheet, type PushPromptProps } from "./screens";
export {
  NotificationSettings,
  notificationSettingsCopy,
  usePushPermission,
  useNotificationCategories,
  useQuietHours,
  usePrivacyPreviews,
  permissionRows,
  categoryRows,
  quietHoursRows,
  privacyRows,
  type CategoriesPartProps,
  type CategoryRow,
  type NotificationSettingsCopy,
  type NotificationSettingsProps,
  type NotificationSettingsSlots,
  type PermissionPartProps,
  type PrivacyPartProps,
  type QuietHoursPartProps,
} from "./settings";
export {
  supabasePushBackend,
  PushBackendError,
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
  type PushBackend,
  type PushSupabaseLike,
  type QuietHours,
} from "./backend";
export {
  createPermissionStore,
  createPromptStore,
  statusOf,
  canPush,
  type PermissionState,
  type PermissionStore,
  type PromptOptions,
  type PromptState,
  type PromptStore,
  type PushPermissionStatus,
} from "./permission";
export { createRegistration, type Registration, type RegistrationState, type RegistrationStatus } from "./registration";
export {
  createPreferencesStore,
  validPreferences,
  type ChannelImportance,
  type NotificationCategory,
  type PreferencesState,
  type PreferencesStatus,
  type PreferencesStore,
} from "./preferences";
export { pathForResponse, notificationData } from "./routing";
export { parseClock, formatClock, clockOf, dateAt, deviceTimeZone, minutesIn, isQuietAt } from "./quiet-hours";
export type {
  ChannelInputLike,
  NotificationBehaviorLike,
  NotificationLike,
  NotificationResponseLike,
  NotificationsModuleLike,
  PermissionRequestLike,
  PermissionStatusLike,
  PushAppStateLike,
  PushErrorSource,
  PushOnError,
  PushStorageLike,
  SubscriptionLike,
} from "./modules";
