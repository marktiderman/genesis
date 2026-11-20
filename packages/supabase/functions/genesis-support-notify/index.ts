// genesis-support-notify: an optional server-side sink for new support reports.
// A Database Webhook on INSERT into public.tickets (public.support_reports before
// genesis-support's migration 0004) calls it; it opens a
// GitHub issue per report and/or posts a signed webhook, with a summary only
// (no person id, email, device, context or screenshot). See handler.ts.
// A template from @marktiderman/genesis-supabase: copy this folder to your app's
// `supabase/functions/`, beside migration 0006 (see the package README).
//
// Secrets (`supabase secrets set …`): GENESIS_SUPPORT_WEBHOOK_SECRET (required; the
// database webhook sends it as `x-genesis-support-secret`), and for each sink you
// want: GITHUB_TOKEN + GITHUB_REPO (+ GITHUB_LABELS), SUPPORT_WEBHOOK_URL
// (+ SUPPORT_WEBHOOK_SIGNING_SECRET). Deploy with `verify_jwt = false`: the
// webhook secret is the check.
// Where GITHUB_REPO or SUPPORT_WEBHOOK_URL isn't set, it reads support.githubRepo and
// support.webhookUrl from the app's settings (genesis-supabase 0020's genesis_settings_layers,
// with the function's own SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).
import { handle, settingsFromLayers } from "./handler.ts";

async function settings(): Promise<Record<string, unknown>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return {};
  const res = await fetch(`${url}/rest/v1/rpc/genesis_settings_layers`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: "{}",
  });
  // No settings migration (404) or any other answer: the environment alone.
  return res.ok ? settingsFromLayers(await res.json()) : {};
}

Deno.serve((req) => handle(req, { env: (name) => Deno.env.get(name), fetch, log: (message) => console.error(message), settings }));
