/**
 * The link from a context dump to its Sentry event, built from Genesis settings: the
 * `observability.sentryOrg` and `observability.sentryDsn` keys genesis-native declares, so the
 * staff dump viewer links to Sentry with no code in the app. Platform-neutral: the web viewer
 * can't import genesis-native (an optional peer), so the small DSN read lives here too.
 *
 *   sentry.io:    https://<org>.sentry.io/issues/?project=<id>&query=<event id>
 *   self-hosted:  https://<host>/organizations/<org>/issues/?project=<id>&query=<event id>
 *
 * @stability Beta
 */
import { own, valuesOf } from "../settings-values";
import type { SupportSettingsInput } from "../settings";

/** The DSN's shape, as genesis-native's `SENTRY_DSN_PATTERN` (and the database) check it. */
const DSN = /^https?:\/\/[0-9a-f]{16,64}@([A-Za-z0-9.-]+(?::[0-9]{1,5})?)((?:\/[A-Za-z0-9._~-]+)*)\/([0-9]+)$/;
const ORG = /^[a-z0-9][a-z0-9_-]{0,99}$/;

/** What a Sentry link is built from: a dump's event id (and replay id, unused here). */
export type SentryEventLink = (ids: { eventId: string; replayId: string | null }) => string | null;

/**
 * A dump's Sentry event link from the settings, or null when they don't say where Sentry is
 * (no organization, or no DSN, or either of the wrong shape).
 *
 * ```ts
 * <SupportTicketDiagnostics client={client} ticketId={id} settings={appSettings} />
 * ```
 *
 * @stability Beta
 */
export function sentryEventLink(settings: SupportSettingsInput | null | undefined): SentryEventLink | null {
  const values = valuesOf(settings);
  const org = own(values, "observability.sentryOrg");
  const dsn = own(values, "observability.sentryDsn");
  if (typeof org !== "string" || !ORG.test(org) || typeof dsn !== "string") return null;
  const m = DSN.exec(dsn.trim());
  if (!m) return null;
  const [, host, path, project] = m as unknown as [string, string, string, string];
  // An ingest host (o1.ingest.us.sentry.io) is sentry.io's: its pages are on the organization's subdomain.
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const base = hostname === "sentry.io" || hostname.endsWith(".sentry.io") ? `https://${org}.sentry.io` : `https://${host}${path}/organizations/${org}`;
  return ({ eventId }) => (eventId ? `${base}/issues/?project=${project}&query=${encodeURIComponent(eventId)}` : null);
}
