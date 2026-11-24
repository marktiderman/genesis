// genesis-apple-revoke: keeps Sign in with Apple refresh tokens server-side and
// revokes them when the account is deleted (App Store Review Guideline 5.1.1(v)).
// A template from @marktiderman/genesis-supabase: copy this folder to your app's
// `supabase/functions/`, beside migration 0003 (see the package README).
//
// Secrets (`supabase secrets set …`): APPLE_TEAM_ID, APPLE_KEY_ID,
// APPLE_PRIVATE_KEY (the .p8 file's text) and APPLE_CLIENT_IDS (your bundle ids,
// comma-separated). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase. Deploy with `--no-verify-jwt` (or `verify_jwt = false` in
// config.toml): the store action checks the caller itself, and the revoke
// action must run after the caller's login is gone.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type CallerUser, type DueRevocation, type TokenStore } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`);
  return data as T;
}

const store: TokenStore = {
  save: (userId, clientId, refreshToken) =>
    rpc<"stored" | "queued">("genesis_apple_token_save", { p_user_id: userId, p_client_id: clientId, p_refresh_token: refreshToken }),
  claim: (limit) => rpc<DueRevocation[]>("genesis_apple_revocations_claim", { p_limit: limit }),
  done: (id) => rpc<void>("genesis_apple_revocation_done", { p_id: id }),
  failed: (id, error) => rpc<"retry" | "gave_up">("genesis_apple_revocation_failed", { p_id: id, p_error: error }),
};

async function getUser(accessToken: string): Promise<CallerUser | null> {
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const appleUserIds = (data.user.identities ?? [])
    .filter((i) => i.provider === "apple")
    .map((i) => (typeof i.identity_data?.sub === "string" ? i.identity_data.sub : i.id))
    .filter((sub): sub is string => typeof sub === "string" && sub.length > 0);
  return { id: data.user.id, appleUserIds };
}

const runtime = (globalThis as { EdgeRuntime?: { waitUntil(work: Promise<unknown>): void } }).EdgeRuntime;

Deno.serve((req) =>
  handle(req, {
    env: (name) => Deno.env.get(name),
    fetch,
    getUser,
    store,
    log: (message) => console.error(message),
    // Supabase's edge runtime keeps the worker alive for this after the response.
    background: runtime?.waitUntil ? (work) => runtime.waitUntil(work) : undefined,
  }),
);
