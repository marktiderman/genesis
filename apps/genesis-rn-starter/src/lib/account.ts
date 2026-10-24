/**
 * Deleting the account (`features.accountDeletion`). `deleteMyAccount` runs the
 * `delete_my_account` RPC, then signs this device out; the result tells the
 * screen which of the two failed, so a refusal is never reported as a
 * deletion and a deletion is never reported as a refusal.
 */
import { SupabaseQueryError, deleteMyAccount } from "@marktiderman/genesis-supabase";
import { copy } from "@/copy";
import { supabase } from "./supabase";

export type DeleteRefusal = keyof typeof copy.settings.deleteErrors;

export type DeleteResult =
  | { ok: true }
  /** The database refused (nothing was deleted). `reason` picks the copy; `signInAgain` offers a fresh sign-in. */
  | { ok: false; reason: DeleteRefusal; signInAgain: boolean };

/** `SupabaseQueryError.code` from `delete_my_account` → why, in the catalog's words. See the package README. */
const REASONS: Record<string, DeleteRefusal> = {
  GA002: "recentSignIn", // the app requires a recent sign-in
  "42501": "notAllowed", // not signed in, or a verified MFA factor and an aal1 session
  GA001: "refused", // the app's own hook refused
  "23503": "inUse", // a row (or a Storage file) still points at the login
};

export async function deleteAccount(): Promise<DeleteResult> {
  try {
    // The delete queues the person's Apple tokens; this asks genesis-apple-revoke to revoke them now.
    await deleteMyAccount(supabase, { revokeAppleTokens: true });
    return { ok: true };
  } catch (error) {
    if (error instanceof SupabaseQueryError) {
      const code = error.code ?? "";
      const reason: DeleteRefusal = REASONS[code] ?? (code.startsWith("GA") ? "refused" : "unknown");
      return { ok: false, reason, signInAgain: reason === "recentSignIn" || reason === "notAllowed" };
    }
    // Not the database's refusal: the RPC succeeded and the local sign-out failed. The login is
    // gone, so clear this device's copy again and report the deletion.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: true };
  }
}
