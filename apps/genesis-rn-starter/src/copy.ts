/**
 * Every string the starter shows a person, in one typed catalog. Screens read
 * `copy`; none of them holds user-facing text of its own (the starter's tests
 * fail on JSX text or a literal label in `src/app`).
 *
 * To translate: add a catalog of the same shape (`const fr: Catalog = { … }`;
 * TypeScript lists any key it misses) and export the one for the device's
 * locale as `copy` (`expo-localization`'s `getLocales()[0].languageCode`).
 */

const en = {
  tabs: {
    home: "Home",
    notifications: "Notifications",
    settings: "Settings",
  },
  signIn: {
    headline: "Welcome",
    subhead: "Sign in to continue.",
    submit: "Sign in",
    createSubmit: "Create account",
    switchToCreate: "New here? Create an account",
    switchToSignIn: "Have an account? Sign in",
    emailRequired: "Enter your email.",
    passwordRequired: "Enter your password.",
    checkInboxTitle: "Check your email",
    checkInboxBody: "We sent a confirmation link to {email}. Open it, then sign in.",
    errors: {
      invalid_credentials: "That email and password don't match an account.",
      email_not_confirmed: "Confirm your email first: open the link we sent you.",
      user_already_exists: "There's already an account with that email. Sign in instead.",
      weak_password: "Choose a longer password.",
      over_request_rate_limit: "Too many tries. Wait a minute, then try again.",
      apple_unavailable: "Sign in with Apple isn't available on this device.",
      default: "Sign-in didn't work. Try again.",
    },
  },
  home: {
    title: "Home",
    emptyTitle: "Your app starts here",
    emptyBody: "This is the first tab. Replace this screen with your own.",
  },
  notifications: {
    title: "Notifications",
    emptyTitle: "No notifications yet",
    emptyBody: "When something needs your attention, it shows up here.",
  },
  settings: {
    title: "Settings",
    accountSection: "Account",
    signedInAs: "Signed in as",
    aboutSection: "About",
    version: "Version",
    signOut: "Sign out",
    deleteAccount: "Delete account",
    deleteConfirmTitle: "Delete your account?",
    deleteConfirmBody: "This removes your account and its data for good. It can't be undone.",
    deleteConfirm: "Delete",
    cancel: "Cancel",
    deleteFailedTitle: "Your account wasn't deleted",
    deleteErrors: {
      recentSignIn: "For your security, sign in again, then delete your account.",
      notAllowed: "Sign in again (with your second factor, if you use one), then delete your account.",
      refused: "This account can't be deleted yet. Contact support for help.",
      inUse: "Some of your data couldn't be removed. Contact support to finish deleting your account.",
      unknown: "Something went wrong. Check your connection and try again.",
    },
    signInAgain: "Sign in again",
    ok: "OK",
    deletedTitle: "Account deleted",
    deletedBody: "Your account and its data have been deleted.",
    notifications: "Notifications",
  },
  push: {
    settingsTitle: "Notifications",
    activityTitle: "Activity",
    activityDescription: "When something needs you",
    promptReason: "when something needs you",
    status: {
      unknown: "Checking…",
      undetermined: "Off",
      granted: "On",
      provisional: "Delivered quietly",
      denied: "Off in Settings",
      unavailable: "Not available on this device",
    },
  },
} as const;

/** The shape every translation fills: the English catalog's keys, with any string as the value. */
export type Catalog<T = typeof en> = { readonly [K in keyof T]: T[K] extends string ? string : Catalog<T[K]> };

export const copy: Catalog = en;

/** Fill `{name}` placeholders: `format(copy.signIn.checkInboxBody, { email })`. */
export function format(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (token, name: string) => values[name] ?? token);
}
