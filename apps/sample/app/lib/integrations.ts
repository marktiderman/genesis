/**
 * The outside services Genesis works with, for the site's /integrations page. Genesis owns the
 * contract (flags, events, email, sign-in); each vendor is an adapter or a connector behind it,
 * so an app can switch or add one. `feature` is the key in features.ts that holds the code.
 */
import type { features } from "../../../../features";

export type IntegrationStatus = "available" | "planned";

export interface Integration {
  name: string;
  what: string;
  category: "Data and auth" | "Messaging" | "AI" | "Observability" | "Content" | "Payments" | "Media" | "Analytics" | "Scheduling";
  status: IntegrationStatus;
  feature: keyof typeof features;
}

export const INTEGRATIONS: Integration[] = [
  { name: "Supabase", what: "Postgres, auth, storage and realtime: the default data provider, with migrations and row-level security.", category: "Data and auth", status: "available", feature: "account" },
  { name: "Google sign-in", what: "Sign in with Google on web and native, and OAuth connections to Google services (Drive, Sheets, Calendar).", category: "Data and auth", status: "available", feature: "connect" },
  { name: "Resend", what: "Sends notification and support email, and receives it: one signed webhook routes mail to tickets, inboxes and agents.", category: "Messaging", status: "available", feature: "inbound-email" },
  { name: "Expo push", what: "Push notifications to iPhone and Android, with per-person preferences.", category: "Messaging", status: "available", feature: "push" },
  { name: "Twilio", what: "Text messages in and out, routed the same way as inbound email.", category: "Messaging", status: "planned", feature: "inbound-email" },
  { name: "Anthropic", what: "Claude models behind Genesis's AI provider contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "OpenAI", what: "OpenAI models behind the same provider contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "Vercel AI SDK", what: "Streaming and tool calls on the web, under the same contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "Sentry", what: "Errors and performance traces from web, native and server.", category: "Observability", status: "available", feature: "observability" },
  { name: "EAS Observe", what: "Launch times and app metrics from native builds.", category: "Observability", status: "available", feature: "observability" },
  { name: "Airtable", what: "Bring a base into an app's own tables, or keep one in sync.", category: "Content", status: "available", feature: "switchboard" },
  { name: "Notion", what: "Bring pages and databases into an app.", category: "Content", status: "available", feature: "switchboard" },
  { name: "Google Sheets", what: "Form responses appended as rows.", category: "Content", status: "available", feature: "forms-destinations" },
  { name: "Stripe", what: "Plans, checkout and invoices for an app's customers.", category: "Payments", status: "planned", feature: "entitlements" },
  { name: "Stripe Connect", what: "Payments taken by an app's tenants, paid out to them.", category: "Payments", status: "planned", feature: "tenant-payments" },
  { name: "RevenueCat", what: "In-app purchases and subscriptions on iPhone and Android.", category: "Payments", status: "planned", feature: "tenant-payments" },
  { name: "Mux", what: "Video upload, encoding and playback, with a plain MP4 fallback.", category: "Media", status: "planned", feature: "media-library" },
  { name: "Cloudflare R2", what: "Object storage for media, with copies and retention.", category: "Media", status: "planned", feature: "media-library" },
  { name: "Documenso", what: "Documents sent for signature.", category: "Content", status: "planned", feature: "e-sign" },
  { name: "Cal.com", what: "Booking pages and calendar sync for sessions.", category: "Scheduling", status: "planned", feature: "calendar-sessions" },
  { name: "PostHog", what: "Product analytics fed from Genesis's own events, which stay the source of truth.", category: "Analytics", status: "planned", feature: "product-analytics" },
];
