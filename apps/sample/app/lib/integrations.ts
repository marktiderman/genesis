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
  { name: "Supabase", what: "Postgres, auth, storage and realtime: the default data provider, with migrations and row-level security.", category: "Data and auth", status: "available", feature: "supabase-kit" },
  { name: "Google sign-in", what: "Sign in with Google on web and native.", category: "Data and auth", status: "available", feature: "account" },
  { name: "Apple sign-in", what: "Sign in with Apple, with the token revocation app stores require.", category: "Data and auth", status: "available", feature: "account" },
  { name: "Google services", what: "OAuth connections to Google Drive and Sheets, with refresh tokens sealed in the app's store.", category: "Data and auth", status: "available", feature: "connect" },
  { name: "Resend", what: "Sends notification and support email, and receives it: one signed webhook routes mail to tickets, inboxes and agents.", category: "Messaging", status: "available", feature: "notifications-email" },
  { name: "Slack", what: "Form responses posted to a channel.", category: "Messaging", status: "available", feature: "forms-destinations" },
  { name: "Expo push", what: "Push notifications to iPhone and Android, with per-person preferences.", category: "Messaging", status: "available", feature: "push" },
  { name: "Twilio", what: "Text messages in and out, routed the same way as inbound email.", category: "Messaging", status: "planned", feature: "inbound-email" },
  { name: "Anthropic", what: "Claude models behind Genesis's AI provider contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "OpenAI", what: "OpenAI models behind the same provider contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "Vercel AI SDK", what: "Streaming responses on the server, under the same contract.", category: "AI", status: "available", feature: "ai-providers" },
  { name: "Sentry", what: "Errors and traces from native apps.", category: "Observability", status: "available", feature: "observability" },
  { name: "EAS Observe", what: "Launch times and app metrics from native builds.", category: "Observability", status: "available", feature: "observability" },
  { name: "Airtable", what: "Bring a base into an app's own tables, or keep one in sync.", category: "Content", status: "available", feature: "switchboard" },
  { name: "Notion", what: "Bring pages and databases into an app.", category: "Content", status: "available", feature: "switchboard" },
  { name: "Google Sheets", what: "Form responses appended as rows.", category: "Content", status: "available", feature: "forms-destinations" },
  { name: "Stripe", what: "Plans, checkout and invoices for an app's customers.", category: "Payments", status: "planned", feature: "entitlements" },
  { name: "Stripe Connect", what: "Payments taken by an app's tenants, paid out to them.", category: "Payments", status: "planned", feature: "tenant-payments" },
  { name: "RevenueCat", what: "In-app purchases and subscriptions on iPhone and Android.", category: "Payments", status: "planned", feature: "tenant-payments" },
  { name: "Mux", what: "Video upload, encoding, captions and playback in chat; a media library for every app is next.", category: "Media", status: "available", feature: "chat" },
  { name: "Cloudflare R2", what: "Object storage for media, with copies and retention.", category: "Media", status: "planned", feature: "media-library" },
  { name: "Documenso", what: "Documents sent for signature.", category: "Content", status: "planned", feature: "e-sign" },
  { name: "Cal.com", what: "Booking pages and calendar sync for sessions.", category: "Scheduling", status: "planned", feature: "calendar-sessions" },
  { name: "PostHog", what: "Product analytics fed from Genesis's own events, which stay the source of truth.", category: "Analytics", status: "planned", feature: "product-analytics" },
];
