/**
 * Genesis UI-native page layouts.
 *
 * Layer-2 primitive: ScreenContainer (composable chrome).
 * Layer-3/4 layouts: SettingsPage, SettingsSubPage, NotificationsPage,
 * InboxPage, ThreadPage, AuthScreen (assembled from AuthForm +
 * SocialAuthRow + AuthBranding).
 *
 * See standards/usage-doctrine.md for the Layer 1-4 progression.
 */

export {
  ScreenContainer,
  composeHeaderOptions,
  type ScreenContainerProps,
  type ScreenHeaderProps,
  type SafeAreaEdge,
  type ScrollEdgeBehavior,
} from "./screen-container";

export {
  NavBarSaveButton,
  NavBarSearchBar,
  NavBarTitle,
  type NavBarSaveButtonProps,
  type NavBarSearchBarProps,
  type NavBarTitleProps,
} from "./nav-bar";

export {
  SettingsPage,
  getSettingsPageStackOptions,
  type SettingsPageProps,
  type SettingsPageSection,
  type SettingsPageRow,
  type SettingsPageSlotMap,
  type SettingsPageDangerousAction,
} from "./settings-page";

export {
  SettingsSubPage,
  confirmDiscardChanges,
  getSettingsSubPageStackOptions,
  type SettingsSubPageProps,
} from "./settings-sub-page";

export {
  NotificationsPage,
  getNotificationsPageStackOptions,
  type NotificationsPageProps,
  type NotificationsPageSlotMap,
  type NotificationItem,
} from "./notifications-page";

export {
  InboxPage,
  formatInboxTime,
  getInboxPageStackOptions,
  showInboxActions,
  type InboxItem,
  type InboxPageProps,
  type InboxPageSlotMap,
  type InboxSwipeAction,
} from "./inbox-page";

export {
  ThreadPage,
  getThreadPageStackOptions,
  readReceiptFor,
  type ThreadAttachment,
  type ThreadComposer,
  type ThreadLabels,
  type ThreadMessage,
  type ThreadPageProps,
  type ThreadPageSlotMap,
} from "./thread-page";

export {
  AuthForm,
  SocialAuthRow,
  AuthBranding,
  ForgotPasswordLink,
  type AuthFormProps,
  type AuthFormValues,
  type SocialAuthRowProps,
  type SocialAuthProvider,
  type AuthBrandingProps,
} from "./auth";

export { AuthScreen, type AuthScreenProps, type AuthScreenSlotMap } from "./auth-screen";
export {
  KEYBOARD_TOOLBAR_HEIGHT,
  KeyboardScrollProvider,
  useKeyboardScroll,
  useKeyboardToolbar,
  type KeyboardScrollProps,
  type KeyboardToolbarProps,
} from "./keyboard";

export {
  AppleSignInButton,
  appleProvider,
  type AppleButtonModuleLike,
  type AppleProviderOptions,
  type AppleSignInButtonProps,
} from "./apple-sign-in";
