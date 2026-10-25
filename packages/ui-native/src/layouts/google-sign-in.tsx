/**
 * Google sign-in for `AuthScreen` / `SocialAuthRow`: the provider entry,
 * drawn as the row's outline button. Nothing here imports
 * `@react-native-google-signin/google-signin`; sign in with
 * `signInWithGoogle` from `@marktiderman/genesis-supabase/native`.
 *
 * ```tsx
 * <AuthScreen providers={[appleProvider({ apple, onPress: onApple }), googleProvider({ onPress: onGoogle })]} … />
 * ```
 *
 * Google's branding guidelines want its "G" mark on the button: pass it as
 * `icon` (Genesis ships no Google artwork). On iOS, offer Sign in with Apple
 * too (App Store Review Guideline 4.8); `AuthScreen` warns in development
 * when it's missing.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import type { SocialAuthProvider } from "./auth";

export interface GoogleProviderOptions {
  /** Usually `() => signInWithGoogle(supabase, GoogleOneTapSignIn, { digest })`. */
  onPress: () => void | Promise<void>;
  /** Default "Continue with Google", Google's own wording. */
  label?: string;
  /** Google's "G" mark, as the app draws it. */
  icon?: ReactNode;
  disabled?: boolean;
  /** `false` (or `null`) gives `null`, so a switched-off provider goes in the list as is. Default true. */
  enabled?: boolean | null;
}

/**
 * A `SocialAuthProvider` (id `"google"`) for `AuthScreen`'s `providers`, or
 * `null` when `enabled` is false.
 *
 * @stability Beta
 */
export function googleProvider({ onPress, label = "Continue with Google", icon, disabled, enabled = true }: GoogleProviderOptions): SocialAuthProvider | null {
  if (!enabled) return null;
  return { id: "google", label, icon, onPress, disabled };
}
