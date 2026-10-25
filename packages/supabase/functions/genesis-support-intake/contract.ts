/**
 * The Genesis support wire contract: what a support client (the web loader, a
 * native app, any HTTP caller) and the `genesis-support-intake` Edge Function
 * say to each other. One file, kept byte-identical in two places:
 * `@marktiderman/genesis-support` (`src/contract.ts`) and the function template
 * (`functions/genesis-support-intake/contract.ts`); a test fails when they drift.
 *
 * Dependency-free and additive: `CONTRACT_VERSION` changes only with a shape
 * change, and a reader tolerates fields and widget types it doesn't know, so an
 * old client keeps working.
 */

/** Bumped only on a shape change. Old clients must keep working. */
export const CONTRACT_VERSION = 1 as const;

/** The widget kinds a boot can turn on. */
export type WidgetType = "feedback" | "roadmap" | "changelog" | "survey" | "messaging";

/** On the wire the type is open: a client switches on the known ones and ignores the rest. */
export type WidgetTypeWire = WidgetType | (string & {});

/**
 * How the person is known to the server.
 * - `genesis-session`: signed in to the app's own Supabase (a user access token). The default.
 * - `signed`: the app's backend mints a short-lived token for the person (reserved).
 * - `anonymous`: a device id only (reserved; the database refuses writes without a session).
 */
export type IdentityMode = "anonymous" | "signed" | "genesis-session";

export type LauncherPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** Theme hints a web launcher may use. Genesis apps use their own theme instead. */
export interface ThemeTokens {
  colorBg?: string;
  colorFg?: string;
  colorPrimary?: string;
  colorPrimaryFg?: string;
  radius?: string;
  fontFamily?: string;
  launcherLabel?: string;
  launcherPosition?: LauncherPosition;
}

/** One enabled widget and its public config (never a secret). */
export interface WidgetConfig {
  type: WidgetTypeWire;
  config: Record<string, unknown>;
}

/** The boot handshake (`GET`): world-readable, so only public values. */
export interface BootConfig {
  contractVersion: number;
  project: { id: string; name: string };
  identityMode: IdentityMode;
  theme: ThemeTokens;
  widgets: WidgetConfig[];
  flags: Record<string, boolean>;
}

export type FeedbackReportType = "bug" | "idea" | "question" | "praise";
export type FeedbackStatus = "open" | "submitted" | "in_progress" | "addressed" | "wont_fix";
export type FindingSeverity = "low" | "medium" | "high" | "critical";

export const FEEDBACK_REPORT_TYPES: readonly FeedbackReportType[] = ["bug", "idea", "question", "praise"];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ["open", "submitted", "in_progress", "addressed", "wont_fix"];
const SEVERITIES: readonly FindingSeverity[] = ["low", "medium", "high", "critical"];

/** Client to server: open a report. Screenshots go to storage, not in this body. */
export interface SubmitFeedbackInput {
  type?: FeedbackReportType;
  title?: string;
  body: string;
  route?: string;
  appVersion?: string;
  envType?: string;
  severity?: FindingSeverity;
  tags?: string[];
  /** Small, free-form context (breadcrumbs, a pin on the page). At most 16 KB as JSON. */
  context?: Record<string, unknown>;
}

/** Server to client: the report created. `findingId` is the report's id (one finding per report here). */
export interface SubmitFeedbackResult {
  reportId: string;
  findingId: string;
  status: FeedbackStatus;
}

/** One of the caller's own reports. */
export interface FeedbackReportSummary {
  id: string;
  type: FeedbackReportType;
  title: string;
  status: FeedbackStatus;
  route: string | null;
  createdAt: string;
  findingCount: number;
}

/** The operations the intake function multiplexes on (`{ op, ...args }`). */
export type FeedbackOp = "submit" | "list";

/** Headers a client sends. The person's access token goes in `Authorization: Bearer …`. */
export const WIDGET_HEADERS = {
  /** The project's publishable key (an identifier, not a secret). */
  key: "x-genesis-key",
  /** `signed` mode: the minted short-lived token. */
  identity: "x-genesis-identity",
  /** `anonymous` mode: the device id. */
  device: "x-genesis-device",
  /** A proof-of-work or captcha token, for anonymous writes. */
  challenge: "x-genesis-challenge",
  /** The contract version the client was built against. */
  contract: "x-genesis-contract",
} as const;

/** Text limits, the same as the database's checks. */
export const LIMITS = { title: 300, body: 20000, route: 2000, appVersion: 200, tag: 60, tags: 50, contextBytes: 16384 } as const;

/**
 * A route as a path only: the query string and fragment (tokens, codes, emails)
 * are dropped before anything is stored or sent.
 */
export function cleanRoute(route: string | null | undefined): string | undefined {
  if (typeof route !== "string") return undefined;
  const path = route.replace(/[?#].*$/, "").trim();
  return path ? path.slice(0, LIMITS.route) : undefined;
}

export type SubmitValidation =
  | { ok: true; value: SubmitFeedbackInput }
  | { ok: false; error: "invalid_args" | "payload_too_large"; field: string };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Checks a `submit` body the way the server does: known keys only, every limit. */
export function validateSubmitInput(raw: unknown): SubmitValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid_args", field: "body" };
  const input = raw as Record<string, unknown>;
  const known = new Set(["type", "title", "body", "route", "appVersion", "envType", "severity", "tags", "context"]);
  for (const key of Object.keys(input)) if (!known.has(key)) return { ok: false, error: "invalid_args", field: key };
  const optionalString = (key: string, max: number): boolean => input[key] == null || (typeof input[key] === "string" && (input[key] as string).length <= max);
  if (typeof input.body !== "string" || !input.body.trim()) return { ok: false, error: "invalid_args", field: "body" };
  if (input.body.length > LIMITS.body) return { ok: false, error: "payload_too_large", field: "body" };
  if (input.type != null && !FEEDBACK_REPORT_TYPES.includes(input.type as FeedbackReportType)) return { ok: false, error: "invalid_args", field: "type" };
  if (input.severity != null && !SEVERITIES.includes(input.severity as FindingSeverity)) return { ok: false, error: "invalid_args", field: "severity" };
  if (!optionalString("title", LIMITS.title)) return { ok: false, error: "invalid_args", field: "title" };
  if (!optionalString("route", LIMITS.route)) return { ok: false, error: "invalid_args", field: "route" };
  if (!optionalString("appVersion", LIMITS.appVersion)) return { ok: false, error: "invalid_args", field: "appVersion" };
  if (!optionalString("envType", 60)) return { ok: false, error: "invalid_args", field: "envType" };
  if (input.tags != null) {
    if (!Array.isArray(input.tags) || input.tags.length > LIMITS.tags) return { ok: false, error: "invalid_args", field: "tags" };
    if (!input.tags.every((t) => typeof t === "string" && t.length <= LIMITS.tag)) return { ok: false, error: "invalid_args", field: "tags" };
  }
  if (input.context != null) {
    if (typeof input.context !== "object" || Array.isArray(input.context)) return { ok: false, error: "invalid_args", field: "context" };
    if (byteLength(JSON.stringify(input.context)) > LIMITS.contextBytes) return { ok: false, error: "payload_too_large", field: "context" };
  }
  const value: SubmitFeedbackInput = { body: input.body };
  if (input.type != null) value.type = input.type as FeedbackReportType;
  if (input.title != null) value.title = input.title as string;
  const route = cleanRoute(input.route as string | undefined);
  if (route) value.route = route;
  if (input.appVersion != null) value.appVersion = input.appVersion as string;
  if (input.envType != null) value.envType = input.envType as string;
  if (input.severity != null) value.severity = input.severity as FindingSeverity;
  if (input.tags != null) value.tags = input.tags as string[];
  if (input.context != null) value.context = input.context as Record<string, unknown>;
  return { ok: true, value };
}
