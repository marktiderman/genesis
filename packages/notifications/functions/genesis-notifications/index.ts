// genesis-notifications: the notifier's sender, as a Supabase Edge Function.
// A template from @marktiderman/genesis-notifications: copy this folder to your
// app's `supabase/functions/`, put your registry (and email templates) in
// `notifications.ts` beside it, and deploy with `--no-verify-jwt` (it checks
// its own secrets).
//
//   POST /functions/v1/genesis-notifications/run                every minute
//   POST /functions/v1/genesis-notifications/receipts           every 15 minutes
//        (both with Authorization: Bearer <GENESIS_NOTIFICATIONS_CRON_SECRET>, from pg_cron + pg_net)
//   POST /functions/v1/genesis-notifications/webhooks/resend    Resend's webhook (bounces, complaints)
//   GET|POST /functions/v1/genesis-notifications/unsubscribe    the one-click unsubscribe link
//
// Secrets (`supabase secrets set …`): GENESIS_NOTIFICATIONS_CRON_SECRET and
// GENESIS_NOTIFICATIONS_UNSUBSCRIBE_SECRET (32 characters or more each),
// RESEND_API_KEY, RESEND_WEBHOOK_SECRET, EXPO_ACCESS_TOKEN, and
// NOTIFICATIONS_FROM_DOMAIN / NOTIFICATIONS_UPDATES_DOMAIN / APP_NAME / APP_URL.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  createNotificationRunner,
  createNotificationsHandler,
  expoPushProvider,
  resendProvider,
  supabaseNotificationStore,
} from "npm:@marktiderman/genesis-notifications@^0.3.0/server";
import { notifications, emailTemplates, secretLinks } from "./notifications.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const store = supabaseNotificationStore(admin);
const functionUrl = `${env("SUPABASE_URL")}/functions/v1/genesis-notifications`;

const runner = createNotificationRunner({
  store,
  registry: notifications,
  push: { provider: expoPushProvider({ accessToken: env("EXPO_ACCESS_TOKEN") || undefined }) },
  email: env("RESEND_API_KEY")
    ? {
        provider: resendProvider({ apiKey: env("RESEND_API_KEY") }),
        appName: env("APP_NAME") || "Notifications",
        domains: { transactional: env("NOTIFICATIONS_FROM_DOMAIN"), other: env("NOTIFICATIONS_UPDATES_DOMAIN") || undefined },
        templates: emailTemplates,
        secretLinks,
        unsubscribe: { url: `${functionUrl}/unsubscribe`, secret: env("GENESIS_NOTIFICATIONS_UNSUBSCRIBE_SECRET") },
      }
    : undefined,
  appUrl: env("APP_URL") || undefined,
  log: (message) => console.error(message),
});

Deno.serve(
  createNotificationsHandler({
    runner,
    store,
    cronSecret: env("GENESIS_NOTIFICATIONS_CRON_SECRET"),
    unsubscribeSecret: env("GENESIS_NOTIFICATIONS_UNSUBSCRIBE_SECRET") || undefined,
    resendWebhookSecret: env("RESEND_WEBHOOK_SECRET") || undefined,
    log: (message) => console.error(message),
  }),
);
