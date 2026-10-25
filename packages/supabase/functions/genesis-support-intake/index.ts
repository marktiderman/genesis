// genesis-support-intake: the support wire contract over HTTP (boot, submit, list)
// for clients that don't run supabase-js, such as a script-tag web loader.
// A template from @marktiderman/genesis-supabase: copy this folder to your app's
// `supabase/functions/`, beside migration 0006 (see the package README).
//
// It acts as the caller: every query runs with the person's access token and the
// publishable key, so row level security decides. It never uses the service role.
//
// Settings (`supabase secrets set …`, all optional): GENESIS_SUPPORT_ORIGINS (the web
// origins allowed to call it, comma-separated; none means browsers can't),
// GENESIS_SUPPORT_WIDGETS (default "feedback,roadmap"), GENESIS_SUPPORT_APP_ID and
// GENESIS_SUPPORT_APP_NAME (shown in the boot handshake). SUPABASE_URL and
// SUPABASE_ANON_KEY are set by Supabase. Deploy with the gateway's JWT check off
// (`verify_jwt = false`): the boot handshake has no caller, and submit and list
// check the caller's token through the database.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type CallerClient } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function clientFor(accessToken: string): CallerClient {
  const db = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  return {
    async insertReport(row) {
      const { data, error } = await db.from("support_reports").insert(row).select("id, status").single();
      return error ? { error: error.code ?? "unknown" } : (data as { id: string; status: string });
    },
    async listReports(limit) {
      // The caller's own reports only, even when the caller is staff (who can read everyone's).
      const { data: user, error: userError } = await db.auth.getUser(accessToken);
      if (userError || !user.user) return { error: "42501" };
      const { data, error } = await db
        .from("support_reports")
        .select("id, type, title, message, status, route, created_at")
        .eq("user_id", user.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      return error ? { error: error.code ?? "unknown" } : (data ?? []);
    },
  };
}

Deno.serve((req) => handle(req, { env: (name) => Deno.env.get(name), clientFor, log: (message) => console.error(message) }));
