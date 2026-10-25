// genesis-push-send: sends pushes through Expo's push service to the devices
// migration 0005 says may get them now (categories, quiet hours, hidden
// previews), records a receipt per ticket, polls the receipts and forgets dead
// devices. A template from @marktiderman/genesis-supabase: copy this folder to
// your app's `supabase/functions/`, beside migration 0005 (see the package README).
//
// Secrets (`supabase secrets set …`): GENESIS_PUSH_SECRET (at least 32
// characters; every caller sends it as a bearer token) and, when your Expo
// project requires it (recommended), EXPO_ACCESS_TOKEN. Optional:
// PUSH_HIDDEN_TITLE and PUSH_HIDDEN_BODY, the neutral text a person who hides
// previews sees. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// Deploy with `--no-verify-jwt` (or `verify_jwt = false` in config.toml): the
// function checks GENESIS_PUSH_SECRET itself.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type PushStatus, type PushStore, type PushTarget } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  // The code only: a database message can quote the row it refused.
  if (error) throw new Error(`${fn}: ${error.code ?? "error"}`);
  return data as T;
}

const store: PushStore = {
  targets: (userId, category, defaultOn, urgent) =>
    rpc<PushTarget[]>("genesis_push_targets", { p_user_id: userId, p_category: category, p_default_on: defaultOn, p_bypass_quiet_hours: urgent }),
  status: async (userId, category, defaultOn, urgent) => {
    const rows = await rpc<PushStatus[]>("genesis_push_status", { p_user_id: userId, p_category: category, p_default_on: defaultOn, p_bypass_quiet_hours: urgent });
    return rows[0] ?? { deliver: false, reason: "error", quiet_until: null };
  },
  recordTickets: async (rows) => {
    await rpc<number>("genesis_push_tickets_record", { p_tickets: rows });
  },
  forgetDevices: async (deviceIds) => {
    await rpc<number>("genesis_push_devices_forget", { p_device_ids: deviceIds });
  },
  claimReceipts: (limit) => rpc<{ id: number; ticket_id: string }[]>("genesis_push_receipts_claim", { p_limit: limit }),
  settleReceipts: async (results) => {
    await rpc<number>("genesis_push_receipts_settle", { p_results: results });
  },
};

Deno.serve((req) =>
  handle(req, {
    env: (name) => Deno.env.get(name),
    fetch,
    store,
    log: (message) => console.error(message),
  }),
);
