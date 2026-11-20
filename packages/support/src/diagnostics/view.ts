/**
 * A dump as plain text, section by section, for the staff viewer (support-features 4.7): the
 * web agent inbox and the phone's agent desk both draw these. Text only: a dump was scrubbed on
 * the device and again on the server, and nothing in it becomes a link or markup.
 */
import { DIAGNOSTICS_SCHEMA, diagnosticsShortId, type DiagnosticReport } from "./report";

export interface DiagnosticsViewSection {
  /** The report's key (`build`, `logs.console`, `sections.game`). */
  key: string;
  title: string;
  /** Lines of plain text. */
  text: string;
}

const TITLES: Record<string, string> = {
  summary: "Summary",
  build: "Build",
  server: "Server",
  device: "Device",
  user: "User",
  session: "Session",
  flags: "Flags",
  blocks: "Blocks",
  checks: "Health checks",
  sentry: "Sentry",
  "logs.errors": "Errors",
  "logs.breadcrumbs": "Breadcrumbs",
  "logs.console": "Console",
  truncated: "Cut to fit",
};

const value = (v: unknown): string => (v === null || v === undefined ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));

const lines = (record: Record<string, unknown>): string =>
  Object.entries(record)
    .map(([k, v]) => `${k}: ${value(v)}`)
    .join("\n");

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * The dump's sections as text, in reading order. Sections nobody collected are left out; an empty
 * list of errors, breadcrumbs or console lines is too. A value that isn't a `genesis.diagnostics/1`
 * report gives one section saying so.
 */
export function diagnosticsViewSections(input: unknown): DiagnosticsViewSection[] {
  const r = record(input) as Partial<DiagnosticReport> | null;
  if (!r || r.schema !== DIAGNOSTICS_SCHEMA) return [{ key: "summary", title: TITLES["summary"]!, text: `Not a ${DIAGNOSTICS_SCHEMA} dump.` }];
  const out: DiagnosticsViewSection[] = [];
  const add = (key: string, text: string, title = TITLES[key] ?? key) => {
    if (text) out.push({ key, title, text });
  };
  const id = typeof r.id === "string" ? r.id : "";
  add(
    "summary",
    lines({
      id: id || null,
      shortId: id ? diagnosticsShortId(id) : null,
      createdAt: r.createdAt ?? null,
      trigger: r.trigger ?? null,
      feedbackId: r.feedbackId ?? null,
      ...(record(r.app) ?? {}),
    }),
  );
  for (const key of ["build", "server", "device", "user", "session", "flags", "sentry"] as const) {
    const part = record(r[key]);
    if (part) add(key, lines(part));
  }
  if (Array.isArray(r.blocks) && r.blocks.length) add("blocks", r.blocks.map(value).join("\n"));
  if (Array.isArray(r.checks) && r.checks.length) {
    add(
      "checks",
      r.checks
        .map((c) => `${c.status ?? (c.ok ? "ok" : "fail")}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}${typeof c.ms === "number" ? ` (${c.ms} ms)` : ""}`)
        .join("\n"),
    );
  }
  const logs = record(r.logs) as Partial<DiagnosticReport["logs"]> | null;
  if (Array.isArray(logs?.errors) && logs.errors.length) {
    add("logs.errors", logs.errors.map((e) => `${e.at ?? "?"} ${e.fatal ? "fatal " : ""}${e.source ?? ""} ${e.name ?? "Error"}: ${e.message ?? ""}`.replace(/\s+/g, " ").trim()).join("\n"));
  }
  if (Array.isArray(logs?.breadcrumbs) && logs.breadcrumbs.length) {
    add("logs.breadcrumbs", logs.breadcrumbs.map((b) => `${b.at ?? "?"} ${b.category ?? ""} ${b.message ?? ""}${b.data ? ` ${value(b.data)}` : ""}`.replace(/\s+/g, " ").trim()).join("\n"));
  }
  if (Array.isArray(logs?.console) && logs.console.length) {
    add("logs.console", logs.console.map((l) => `${l.at ?? "?"} [${l.level}] ${l.text}`).join("\n"));
  }
  for (const [name, part] of Object.entries(record(r.sections) ?? {})) {
    const obj = record(part);
    add(`sections.${name}`, obj ? lines(obj) : value(part), name);
  }
  if (Array.isArray(r.truncated) && r.truncated.length) add("truncated", r.truncated.map(value).join("\n"));
  return out;
}
