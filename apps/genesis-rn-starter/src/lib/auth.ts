/**
 * Sign-in actions for the sign-in screen. Errors come back as copy from the
 * catalog, chosen by Supabase's error `code`, never the server's own text.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { storeAppleToken } from "@marktiderman/genesis-supabase";
import { signInWithApple, signInWithGoogle } from "@marktiderman/genesis-supabase/native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { googleModule } from "./google-signin";
import { supabase } from "./supabase";

// A switch that can't work fails where the sign-in screen loads, naming the fix.
if (starter.features.googleSignIn && !googleModule) {
  throw new Error("[starter] features.googleSignIn is on, but src/lib/google-signin.ts exports no module. See the README, \"Google sign-in\".");
}

type ErrorCode = keyof typeof copy.signIn.errors;

/** The catalog's message for an auth error code, or the default one. */
export function authErrorMessage(code: string | undefined): string {
  const errors = copy.signIn.errors;
  return code && code in errors ? errors[code as ErrorCode] : errors.default;
}

export type EmailResult = { ok: true; confirmEmail: boolean } | { ok: false; message: string };

/** Sign in, or create the account (`create`). `confirmEmail` is true when Supabase wants the email confirmed first. */
export async function emailSignIn(email: string, password: string, create: boolean): Promise<EmailResult> {
  const { data, error } = create
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: authErrorMessage(error.code) };
  return { ok: true, confirmEmail: data.session === null };
}

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

// Apple shares the name on the first sign-in only; kept here if saving it failed, for the retry.
let pendingName: string | null = null;

/** Sign in with Apple. Returns an error message, or null (signed in, or they closed Apple's sheet). */
export async function appleSignIn(): Promise<string | null> {
  // The nonce is the package default: 32 random bytes from crypto.getRandomValues, which
  // createGenesisSupabase installed from expo-crypto when it made `supabase`.
  const result = await signInWithApple(supabase, AppleAuthentication, { digest });
  if (result.canceled) return null;
  if (result.error) {
    pendingName = result.fullName ?? pendingName;
    return authErrorMessage(result.error.code);
  }
  const fullName = result.fullName ?? pendingName;
  if (fullName) {
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    pendingName = error ? fullName : null;
  }
  // Hand Apple's single-use code to the genesis-apple-revoke function, so deleting the account
  // can revoke the person's Apple tokens (App Review requires it). They're signed in either way.
  if (result.authorizationCode) {
    const stored = await storeAppleToken(supabase, { authorizationCode: result.authorizationCode, clientId: Constants.expoConfig?.ios?.bundleIdentifier });
    if (!stored.ok) console.warn(`genesis-apple-revoke: couldn't keep the Apple token: ${stored.error.message}`);
  }
  return null;
}

/** Sign in with Google (`features.googleSignIn`). Returns an error message, or null (signed in, or they closed Google's sheet). */
export async function googleSignIn(): Promise<string | null> {
  if (!googleModule) return authErrorMessage(undefined);
  const result = await signInWithGoogle(supabase, googleModule, { digest });
  if (result.canceled) return null;
  if (result.error) {
    if (result.error.code === "google_nonce_missing") console.error(`[starter] ${result.error.message}`);
    return authErrorMessage(result.error.code);
  }
  return null;
}

export { AppleAuthentication };
