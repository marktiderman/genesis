/**
 * Genesis UI-native page layouts.
 *
 * Layer-2 primitive: ScreenContainer (composable chrome).
 * Layer-3/4 layouts: SettingsPage, SettingsSubPage, NotificationsPage,
 * AuthForm + SocialAuthRow + AuthBranding.
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
  type NotificationItem,
} from "./notifications-page";

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
