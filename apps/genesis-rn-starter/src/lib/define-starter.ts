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
  /**
   * The EAS project id (a UUID, from `eas init`), or `""` before there is one. It sets the
   * update URL (`https://u.expo.dev/<id>`) and `extra.eas.projectId`; empty, builds have no
   * update URL, so expo-updates is off in them.
   */
  easProjectId: string;
}

/** Every universal feature the Genesis packages ship. `true` is on; set one to `false` to turn it off. */
export interface StarterFeatures {
  /** Email and password sign-in and sign-up on `AuthScreen` (Supabase Auth). With Google off, the only sign-in on Android: off, the app builds for iOS only. */
  emailSignIn: boolean;
  /** Sign in with Apple on iOS (`signInWithApple` + `appleProvider`). Needs the Apple provider in Supabase Auth. */
  appleSignIn: boolean;
  /**
   * Native Google sign-in (`signInWithGoogle` + `googleProvider`), off by default: it needs Google
   * client ids, the Google provider in Supabase Auth and the Universal sign-in module of
   * `@react-native-google-signin/google-signin` in `src/lib/google-signin.ts` (README, "Google
   * sign-in"). On iOS it needs `appleSignIn` too (App Store Review Guideline 4.8).
   */
  googleSignIn: boolean;
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
  /**
   * The updates block (`createUpdates`): force upgrade and maintenance from the
   * `app_release_policy` table, the update banner, what's new, and the version signature in
   * Settings. JavaScript only: turning it off leaves the native build and its fingerprint alone.
   */
  updates: boolean;
  /**
   * The push block (`createPush`): this device's push token on sign-in and off on sign-out, taps
   * routed through the deep-link map, the badge, the soft prompt (offered on the Notifications tab,
   * never at launch) and Settings → Notifications (categories, quiet hours, previews), on the
   * `push_devices` and `notification_preferences` migration. JavaScript only: expo-notifications
   * stays in the build either way. Needs an EAS project id for a push token.
   */
  push: boolean;
  /**
   * The observability block (`createObservability`, `src/lib/observability.ts`): every error the
   * shell catches, route breadcrumbs and timings, the user's id and typed analytics events, to
   * Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set (and the console in development), scrubbed of
   * emails, tokens and query strings on the phone. JavaScript only.
   */
  observability: boolean;
  /**
   * The devtools overlay (`createDevtools`, `src/lib/devtools.ts`) in development and preview
   * builds: a three-finger hold, the dev menu or Settings > About open a sheet with the version
   * signature, channel switch, user id, blocks, flags and recent errors. Left out of production
   * bundles at build time. JavaScript only.
   */
  devtools: boolean;
  /**
   * The support block (`createSupport` from @marktiderman/genesis-support): Send feedback and Help
   * in Settings, a feedback screen with a screenshot (shake the phone to capture the screen you're
   * on), the person's reports with staff replies, and the idea board with votes, on the
   * `genesis_support` migration. JavaScript only: react-native-view-shot and expo-sensors stay in
   * the build either way.
   */
  support: boolean;
  /**
   * The check-in example on Home (`@marktiderman/genesis-forms-native`'s `FormFocus`): a sample
   * form one question at a time, with a draft per user and the offline outbox. A demo: replace
   * the form in `src/forms/check-in.json`, or turn it off. JavaScript only.
   */
  checkIn: boolean;
}

export interface StarterConfig {
  app: StarterApp;
  features: StarterFeatures;
}

/**
 * The platforms the app builds for. Sign in with Apple only shows on iOS, so
 * with email and Google sign-in off an Android build would have no way to
 * sign in: the app is iOS only then (`platforms` in app.config.ts).
 */
export function nativePlatforms(features: Pick<StarterFeatures, "emailSignIn"> & Partial<Pick<StarterFeatures, "googleSignIn">>): ("ios" | "android")[] {
  return features.emailSignIn || features.googleSignIn ? ["ios", "android"] : ["ios"];
}

/**
 * The Genesis blocks that send data off the phone, for the privacy manifest
 * (`withGenesis({ privacy: { blocks } })` in app.config.ts): a switch turned
 * off declares nothing. Sign-in is always on, so `account` always is.
 */
export function privacyBlocks(features: Pick<StarterFeatures, "observability" | "push">): string[] {
  return ["account", ...(features.observability ? ["observability"] : []), ...(features.push ? ["push"] : [])];
}

/** Checks the config once, where it is written, so a combination that can't work fails at start-up. */
export function defineStarter<const C extends StarterConfig>(config: C): C {
  const { features } = config;
  if (!features.emailSignIn && !features.appleSignIn && !features.googleSignIn) {
    throw new Error("[starter] emailSignIn, appleSignIn and googleSignIn are all off in starter.config.ts, so nobody can sign in. Turn one on.");
  }
  if (features.googleSignIn && !features.appleSignIn) {
    throw new Error("[starter] googleSignIn is on without appleSignIn. App Store Review Guideline 4.8 wants Sign in with Apple beside Google on iOS: turn appleSignIn on.");
  }
  if (!/^[a-z][a-z0-9+.-]*$/.test(config.app.scheme)) {
    throw new Error(`[starter] app.scheme "${config.app.scheme}" in starter.config.ts must be lower case letters, digits, "+", "." or "-", without "://".`);
  }
  if (config.app.easProjectId !== "" && !UUID.test(config.app.easProjectId)) {
    throw new Error(`[starter] app.easProjectId "${config.app.easProjectId}" in starter.config.ts must be the UUID \`eas init\` prints, or "" for none.`);
  }
  return config;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The EAS part of the Expo config: the update URL and the project id. Before `eas init` there is
 * no project, so expo-updates is turned off in the build rather than left without a URL. Kept here
 * so app.config.ts and the tests read one rule.
 */
export function easConfig(app: Pick<StarterApp, "easProjectId">): { updates: { enabled: boolean; url?: string }; extra?: { eas: { projectId: string } } } {
  if (!app.easProjectId) return { updates: { enabled: false } };
  return { updates: { enabled: true, url: `https://u.expo.dev/${app.easProjectId}` }, extra: { eas: { projectId: app.easProjectId } } };
}
