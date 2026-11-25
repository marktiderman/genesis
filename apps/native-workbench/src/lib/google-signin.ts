/**
 * The Google sign-in module for `features.googleSignIn` (off by default).
 *
 * `signInWithGoogle` needs the Universal sign-in module (`GoogleOneTapSignIn`)
 * of `@react-native-google-signin/google-signin`: only it puts the sign-in's
 * nonce in Google's ID token, which Supabase checks. It ships in the library's
 * paid build, so the starter doesn't install it. To turn Google on, follow the
 * README ("Google sign-in"), then replace the `null` below with:
 *
 * ```ts
 * import { GoogleOneTapSignIn } from "@react-native-google-signin/google-signin";
 *
 * GoogleOneTapSignIn.configure({
 *   webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
 *   iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 * });
 *
 * export const googleModule: GoogleSignInLike | null = GoogleOneTapSignIn;
 * ```
 */
import type { GoogleSignInLike } from "@marktiderman/genesis-supabase/native";

export const googleModule: GoogleSignInLike | null = null;
