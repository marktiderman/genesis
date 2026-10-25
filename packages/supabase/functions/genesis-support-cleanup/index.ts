// genesis-support-cleanup: removes support screenshots whose report or account was
// deleted, and uploads that were never attached, through the Storage API (Supabase
// refuses direct deletes from storage.objects). Call it on a schedule. See handler.ts.
// A template from @marktiderman/genesis-supabase: copy this folder to your app's
// `supabase/functions/`, beside migration 0006 (see the package README).
//
// Secrets: GENESIS_SUPPORT_CLEANUP_SECRET (the schedule sends it as
// `x-genesis-support-secret`). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase. Deploy with `verify_jwt = false`: the secret is the check.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type CleanupStore, type PurgeRow } from "./handler.ts";

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
  async forget(ids) {
    const { error } = await admin.from("support_attachment_purges").delete().in("id", ids);
    if (error) throw new Error(`support_attachment_purges: ${error.code ?? ""} ${error.message}`);
  },
};

Deno.serve((req) => handle(req, { env: (name) => Deno.env.get(name), store, log: (message) => console.error(message) }));
