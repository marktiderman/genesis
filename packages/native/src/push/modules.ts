/**
 * What the push block reads from `expo-notifications` (SDK 58) and the app's
 * backend, as the shapes it needs. Pass the real module
 * (`import * as Notifications from "expo-notifications"`); tests pass fakes.
 * Every call here was checked against expo-notifications 58.1's own type
 * declarations.
 */

/** `{ remove() }`, as every expo-notifications listener returns. */
export interface SubscriptionLike {
  remove(): void;
}

/** `NotificationPermissionsStatus`: Expo's `PermissionResponse` plus the iOS detail. */
export interface PermissionStatusLike {
  status: "granted" | "denied" | "undetermined" | string;
  granted: boolean;
  canAskAgain: boolean;
  /** `IosAuthorizationStatus`: 0 not determined, 1 denied, 2 authorized, 3 provisional, 4 ephemeral. */
  ios?: { status: number } | null;
}

/** `NotificationPermissionsRequest`: iOS options; Android asks for posting notifications. */
export interface PermissionRequestLike {
  ios?: { allowAlert?: boolean; allowBadge?: boolean; allowSound?: boolean; allowProvisional?: boolean };
}

/** The parts of a received notification the block reads. */
export interface NotificationLike {
  request: {
    identifier: string;
    content: { data?: Record<string, unknown> | null; title?: string | null };
  };
}

/** A tap (or an action) on a notification. */
export interface NotificationResponseLike {
  notification: NotificationLike;
  actionIdentifier: string;
}

/** `NotificationBehavior` without the deprecated `shouldShowAlert`. */
export interface NotificationBehaviorLike {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

/** `NotificationChannelInput`, the fields the block sets. Importance and visibility are Expo's enum numbers. */
export interface ChannelInputLike {
  name: string;
  importance: number;
  description?: string | null;
  /** `AndroidNotificationVisibility`: 1 public, 2 private (content hidden on a secure lock screen), 3 secret. */
  lockscreenVisibility?: number;
  showBadge?: boolean;
}

/** `expo-notifications` (SDK 58). */
export interface NotificationsModuleLike {
  getPermissionsAsync(): Promise<PermissionStatusLike>;
  requestPermissionsAsync(request?: PermissionRequestLike): Promise<PermissionStatusLike>;
  /** Pass the EAS project id: without one there is no Expo push token. */
  getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: string }>;
  /** Fires when the OS hands the app a new device token; the Expo token is fetched again then. */
  addPushTokenListener(listener: (token: unknown) => void): SubscriptionLike;
  /** Android only (a no-op elsewhere). Must run before the permission prompt and the token on Android 13+. */
  setNotificationChannelAsync(channelId: string, channel: ChannelInputLike): Promise<unknown>;
  setNotificationHandler(handler: { handleNotification: (notification: NotificationLike) => Promise<NotificationBehaviorLike> } | null): void;
  addNotificationResponseReceivedListener(listener: (response: NotificationResponseLike) => void): SubscriptionLike;
  /** The tap that launched the app (synchronous since SDK 53). */
  getLastNotificationResponse(): NotificationResponseLike | null;
  clearLastNotificationResponse(): void;
  setBadgeCountAsync(count: number): Promise<boolean>;
  getBadgeCountAsync(): Promise<number>;
  /** `"expo.modules.notifications.actions.DEFAULT"`: the person tapped the notification itself. */
  DEFAULT_ACTION_IDENTIFIER: string;
}

/** AsyncStorage, MMKV's async adapter, or a stand-in. */
export interface PushStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

/** React Native's `AppState`. */
export interface PushAppStateLike {
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/** Where a reported error came from. */
export type PushErrorSource = "permission" | "register" | "forget" | "preferences" | "badge" | "channels" | "routing" | "storage" | "setup";

export type PushOnError = (error: Error, source: PushErrorSource) => void;

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  const message = (value as { message?: unknown } | null)?.message;
  return new Error(typeof message === "string" ? message : typeof value === "string" ? value : "Unknown error");
}

/** Calls the reporter, never letting a failing one break the block. */
export function report(onError: PushOnError | undefined, error: unknown, source: PushErrorSource) {
  try {
    onError?.(toError(error), source);
  } catch {
    // ignore a failing reporter
  }
}
