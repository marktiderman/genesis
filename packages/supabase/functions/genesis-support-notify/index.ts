// genesis-support-notify: an optional server-side sink for new support reports.
// A Database Webhook on INSERT into public.support_reports calls it; it opens a
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
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, { env: (name) => Deno.env.get(name), fetch, log: (message) => console.error(message) }));
