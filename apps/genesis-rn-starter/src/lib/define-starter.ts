/**
 * The typed shape of `starter.config.ts`. Kept free of React Native imports so
 * `app.config.ts` (run by Node) and the tests can read it too.
 */

/** Who the app is: the store name and the ids the variants are built from. */
export interface StarterApp {
  /** The app's name on the home screen. Development and preview builds add " (Dev)" / " (Preview)". */
  name: string;
  /** The Expo slug, also the prefix of the Keychain key the session is stored under. */
  slug: string;
  /** The URL scheme, without `://`: `myapp://settings` opens Settings. */
  scheme: string;
  /** iOS bundle id and Android package. Development and preview builds add `.dev` / `.preview`. */
  bundleId: string;
}

/** Every universal feature the Genesis packages ship. `true` is on; set one to `false` to turn it off. */
export interface StarterFeatures {
  /** Email and password sign-in and sign-up on `AuthScreen` (Supabase Auth). The only sign-in on Android: off, the app builds for iOS only. */
  emailSignIn: boolean;
  /** Sign in with Apple on iOS (`signInWithApple` + `appleProvider`). Needs the Apple provider in Supabase Auth. */
  appleSignIn: boolean;
  /** "Delete account" in Settings (`deleteMyAccount` + the `delete_my_account` migration). */
  accountDeletion: boolean;
  /** The Notifications tab (`NotificationsPage`). */
  notifications: boolean;
  /** Save the listed queries to the phone for 24 hours, per user (`persistQueries`). */
  queryPersistence: boolean;
  /** Refetch when the app comes to the front and follow the network (`lifecycle`: AppState + NetInfo). */
  queryLifecycle: boolean;
  /** Keep the focused field above the keyboard on form screens (react-native-keyboard-controller). */
  keyboardScroll: boolean;
  /** Open universal links and `scheme://` links in the app, and follow one after sign-in (`normalizeLink`). */
  deepLinks: boolean;
  /** Start signed out after a reinstall (iOS keeps the Keychain across uninstalls). */
  wipeSessionOnReinstall: boolean;
  /** Refresh the session only while the app is in front, as Supabase recommends on React Native. */
  refreshWhileActive: boolean;
}

export interface StarterConfig {
  app: StarterApp;
  features: StarterFeatures;
}

/**
 * The platforms the app builds for. Sign in with Apple only shows on iOS, so
 * with email sign-in off an Android build would have no way to sign in: the
 * app is iOS only then (`platforms` in app.config.ts).
 */
export function nativePlatforms(features: Pick<StarterFeatures, "emailSignIn">): ("ios" | "android")[] {
  return features.emailSignIn ? ["ios", "android"] : ["ios"];
}

/** Checks the config once, where it is written, so a combination that can't work fails at start-up. */
export function defineStarter<const C extends StarterConfig>(config: C): C {
  const { features } = config;
  if (!features.emailSignIn && !features.appleSignIn) {
    throw new Error("[starter] emailSignIn and appleSignIn are both off in starter.config.ts, so nobody can sign in. Turn one on.");
  }
  if (!/^[a-z][a-z0-9+.-]*$/.test(config.app.scheme)) {
    throw new Error(`[starter] app.scheme "${config.app.scheme}" in starter.config.ts must be lower case letters, digits, "+", "." or "-", without "://".`);
  }
  return config;
}
