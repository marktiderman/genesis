/**
 * What the server handler tells its notifiers, and the notifier seam. A
 * notifier gets the summary of a new report or dump; the dump itself only
 * where the notifier asks for detail (a private GitHub repository, the app's
 * own staff alert). The person is an id: the app looks up a name or an email
 * itself, in its own users table (D5).
 */
import type { DiagnosticReport } from "../diagnostics/report";
import type { FeedbackType } from "../record";
import type { FindingSeverity } from "../contract";

export interface FeedbackSummary {
  type: FeedbackType;
  title: string;
  /** What the person wrote, cut to 2,000 characters. */
  message: string;
  severity: FindingSeverity | null;
  route: string | null;
  appVersion: string | null;
  platform: string | null;
}

/** New feedback was stored. `report` is its dump, when one came with it. */
export interface FeedbackCreatedEvent {
  kind: "feedback";
  id: string;
  userId: string;
  createdAt: string;
  feedback: FeedbackSummary;
  screenshots: number;
  diagnosticsId: string | null;
  diagnosticsShortId: string | null;
  report: DiagnosticReport | null;
}

/** A dump was stored (on demand, a shake, a crash, or after its feedback). */
export interface DiagnosticsCreatedEvent {
  kind: "diagnostics";
  id: string;
  shortId: string;
  userId: string;
  createdAt: string;
  feedbackId: string | null;
  report: DiagnosticReport;
}

export type SupportEvent = FeedbackCreatedEvent | DiagnosticsCreatedEvent;

/** Something that hears about new reports: GitHub, a webhook, the app's email or push. */
export interface SupportNotifier {
  readonly name: string;
  notify(event: SupportEvent): Promise<void> | void;
}

/** A staff alert, for the app's email or push (genesis-notifications fills this later). */
export interface StaffAlert {
  kind: SupportEvent["kind"];
  id: string;
  /** `3F2A9C1B` for a dump; the dump's short id for feedback that has one. */
  shortId: string | null;
  /** One line: `[bug] Save fails` or `Diagnostics 3F2A9C1B (shake)`. */
  title: string;
  /** A few lines of summary. No personal data beyond what the person typed. */
  body: string;
  /** The report in the app's admin view, when the app gave `adminUrl`. */
  url: string | null;
  /** Who sent it: an id. The app joins the name or email for staff. */
  userId: string;
}

/** Thanks to the person who sent feedback (an email or a push the app sends). */
export interface ReporterThanks {
  userId: string;
  feedbackId: string;
  type: FeedbackType;
  /** The id to quote to support. */
  shortId: string | null;
}

/** What an app implements for email or push. Either half may be left out. */
export interface SupportMessenger {
  staffAlert?(alert: StaffAlert): Promise<void> | void;
  thankReporter?(thanks: ReporterThanks): Promise<void> | void;
}

/**
 * A fenced code block the text can't break out of: the fence is longer than the longest run of
 * backticks in it (at least four). Inside a fence, mentions, links and images don't render.
 */
export function fenced(text: string, lang = ""): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(4, longest + 1));
  return [`${fence}${lang}`, text, fence].join("\n");
}

/** Text safe outside a fence (an issue title): no mention, link, image or HTML can form. */
export function neutralise(text: string): string {
  // A zero-width space after each character that starts a mention, an issue link, a link, an image,
  // HTML or code: the text reads the same and nothing renders.
  return text.replace(/[@#[!<`]/g, (c) => `${c}\u200b`);
}

/** A short title for an event. */
export function eventTitle(event: SupportEvent): string {
  if (event.kind === "feedback") return `[${event.feedback.type}] ${event.feedback.title}`.slice(0, 256);
  return `Diagnostics ${event.shortId} (${event.report.trigger})`;
}

/** A few plain lines about an event: no person beyond the id, no device or logs. */
export function eventSummaryLines(event: SupportEvent): string[] {
  if (event.kind === "feedback") {
    const f = event.feedback;
    return [
      `${f.type}${f.severity ? ` (${f.severity})` : ""} from the app${f.platform ? ` (${f.platform})` : ""}`,
      f.message,
      `Route: ${f.route ?? "none"}`,
      `Version: ${f.appVersion ?? "unknown"}`,
      `Report: ${event.id}`,
      ...(event.diagnosticsId ? [`Diagnostics: ${event.diagnosticsShortId ?? event.diagnosticsId}`] : []),
    ];
  }
  const r = event.report;
  return [
    `Diagnostics ${event.shortId}, sent on ${r.trigger}`,
    `App: ${r.app.name ?? r.app.id ?? "unknown"} ${r.app.platform ?? ""}`.trim(),
    `Version: ${r.build ? `${r.build.version ?? "unknown"} (${r.build.build ?? "unknown"})` : "unknown"}`,
    `Route: ${r.session?.route ?? "none"}`,
    `Errors: ${r.logs.errors.length}`,
    ...(event.feedbackId ? [`Report: ${event.feedbackId}`] : []),
  ];
}


