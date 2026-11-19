// genesis-support-cleanup: removes support screenshots whose report or account was
// deleted, and uploads that were never attached, through the Storage API (Supabase
// refuses direct deletes from storage.objects), and context dumps past their retention
// (genesis-support 0019; GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS, default 90). Call it
// on a schedule. See handler.ts.
// A template from @marktiderman/genesis-supabase: copy this folder to your app's
// `supabase/functions/`, beside migration 0006 (see the package README).
//
// Secrets: GENESIS_SUPPORT_CLEANUP_SECRET (the schedule sends it as
// `x-genesis-support-secret`). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase. Deploy with `verify_jwt = false`: the secret is the check.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, DIAGNOSTICS_BATCH, type CleanupStore, type PurgeRow } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const store: CleanupStore = {
  async queued(limit) {
    const { data, error } = await admin.from("support_attachment_purges").select("id, bucket, path").order("id").limit(limit);
    if (error) throw new Error(`support_attachment_purges: ${error.code ?? ""} ${error.message}`);
    return (data ?? []) as PurgeRow[];
  },
  async orphans(limit) {
    const { data, error } = await admin.rpc("support_orphan_objects", { older_than: "1 day", max_rows: limit });
    if (error) throw new Error(`support_orphan_objects: ${error.code ?? ""} ${error.message}`);
    return ((data ?? []) as { path: string }[]).map((row) => row.path);
  },
  async remove(bucket, paths) {
    const { data, error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage remove: ${error.message}`);
    return (data ?? []).map((object) => object.name);
  },
  async purgeDiagnostics(retentionDays) {
    const { data, error } = await admin.rpc("support_purge_diagnostics", { older_than: `${retentionDays} days`, max_rows: DIAGNOSTICS_BATCH });
    // PGRST202 / 42883: genesis-support's migration 0019 isn't applied, so there are no dumps.
    if (error?.code === "PGRST202" || error?.code === "42883") return 0;
    if (error) throw new Error(`support_purge_diagnostics: ${error.code ?? ""} ${error.message}`);
    return typeof data === "number" ? data : 0;
  },
  async forget(ids) {
    const { error } = await admin.from("support_attachment_purges").delete().in("id", ids);
    if (error) throw new Error(`support_attachment_purges: ${error.code ?? ""} ${error.message}`);
  },
};

Deno.serve((req) => handle(req, { env: (name) => Deno.env.get(name), store, log: (message) => console.error(message) }));
