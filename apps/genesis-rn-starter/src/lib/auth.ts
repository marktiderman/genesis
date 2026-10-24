/**
 * Sign-in actions for the sign-in screen. Errors come back as copy from the
 * catalog, chosen by Supabase's error `code`, never the server's own text.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { signInWithApple } from "@marktiderman/genesis-supabase/native";
import { copy } from "@/copy";
import { supabase } from "./supabase";

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
  const result = await signInWithApple(supabase, AppleAuthentication, { digest, randomNonce: Crypto.randomUUID });
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
  // Revoking Apple's tokens when the account is deleted needs result.authorizationCode on
  // your server: see "Not covered yet" in @marktiderman/genesis-supabase's README.
  return null;
}

export { AppleAuthentication };
