/**
 * `capReport`: the size table (support-platform §3.6). Over a cap, the oldest
 * entries go first and what was cut is named in `truncated`. The dump is
 * always sent, never refused: the last resort empties the app sections and the
 * logs rather than drop the report.
 */
import { DIAGNOSTICS_DEFAULTS, jsonByteLength, type DiagnosticReport } from "./report";

export interface CapLimits {
  maxBytes?: number;
  maxString?: number;
  maxErrors?: number;
  maxBreadcrumbs?: number;
  maxConsoleLines?: number;
  maxConsoleLineBytes?: number;
  maxChecks?: number;
  maxRecentRoutes?: number;
  /** Every app section's cap, unless `sectionMaxBytes` names its own. */
  sectionMaxBytes?: number;
  /** Per app section caps, by name. */
  sectionLimits?: Readonly<Record<string, number>>;
}

const TRUNCATED_MARK = "…[truncated]";

/** The format's own keys in each core part; anything else there is an extra a section added. */
const KNOWN: Record<"build" | "server" | "session" | "device", readonly string[]> = {
  build: ["version", "build", "runtimeVersion", "channel", "requestedChannel", "updateId", "launch", "emergency", "commit", "otaNumber", "release", "releasePublishedAt", "jsBundle"],
  server: ["baseUrl", "apiCommit"],
  session: ["uptimeMs", "route", "recentRoutes", "foreground"],
  device: ["os", "osVersion", "model", "locale", "timeZone", "screen", "fontScale", "network", "permissions"],
};
const MAX_BLOCKS = 200;
const encoder = new TextEncoder();

/** A string cut to `maxBytes` UTF-8 bytes without splitting a character. */
export function cutToBytes(value: string, maxBytes: number): string {
  if (encoder.encode(value).length <= maxBytes) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (encoder.encode(value.slice(0, mid)).length + 3 <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  // Don't end on half a surrogate pair.
  let end = lo;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}…`;
}

/** Cuts every string longer than `max` characters; says whether it cut one (or found one the scrubber cut). */
function cutStrings(value: unknown, max: number, depth = 0): { value: unknown; cut: boolean } {
  if (typeof value === "string") {
    if (value.length > max) return { value: `${value.slice(0, max)}${TRUNCATED_MARK}`, cut: true };
    return { value, cut: value.endsWith(TRUNCATED_MARK) };
  }
  if (value === null || typeof value !== "object" || depth > 10) return { value, cut: false };
  let cut = false;
  if (Array.isArray(value)) {
    const out = value.map((item) => {
      const r = cutStrings(item, max, depth + 1);
      cut ||= r.cut;
      return r.value;
    });
    return { value: out, cut };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const r = cutStrings(v, max, depth + 1);
    cut ||= r.cut;
    out[k] = r.value;
  }
  return { value: out, cut };
}

/** The report within every cap. Returns a new report; the input is left as it was. */
export function capReport(input: DiagnosticReport, limits: CapLimits = {}): DiagnosticReport {
  const L = { ...DIAGNOSTICS_DEFAULTS, ...limits };
  const truncated = new Set(input.truncated ?? []);
  const report: DiagnosticReport = { ...input, logs: { ...input.logs }, sections: { ...input.sections } };

  const keepLast = <T,>(items: readonly T[] | undefined, max: number, path: string): T[] => {
    const all = items ?? [];
    if (all.length <= max) return [...all];
    truncated.add(path);
    return all.slice(all.length - max);
  };

  report.logs.errors = keepLast(report.logs.errors, L.maxErrors, "logs.errors");
  report.logs.breadcrumbs = keepLast(report.logs.breadcrumbs, L.maxBreadcrumbs, "logs.breadcrumbs");
  report.logs.console = keepLast(report.logs.console, L.maxConsoleLines, "logs.console").map((line) => {
    const text = cutToBytes(line.text, L.maxConsoleLineBytes);
    if (text !== line.text) truncated.add("logs.console");
    return text === line.text ? line : { ...line, text };
  });
  if (report.checks && report.checks.length > L.maxChecks) {
    report.checks = report.checks.slice(0, L.maxChecks);
    truncated.add("checks");
  }
  if (report.session && report.session.recentRoutes.length > L.maxRecentRoutes) {
    report.session = { ...report.session, recentRoutes: keepLast(report.session.recentRoutes, L.maxRecentRoutes, "session.recentRoutes") };
  }

  // One string: 4,096 characters, everywhere.
  for (const key of ["app", "build", "server", "device", "user", "session", "flags", "blocks", "sentry", "checks"] as const) {
    const { value, cut } = cutStrings(report[key], L.maxString);
    if (cut) {
      truncated.add(key);
      (report as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const key of ["errors", "breadcrumbs", "console"] as const) {
    const { value, cut } = cutStrings(report.logs[key], L.maxString);
    if (cut) {
      truncated.add(`logs.${key}`);
      (report.logs as unknown as Record<string, unknown>)[key] = value;
    }
  }

  // The core parts within an app section's cap too: over it, the extras a section added go first.
  const known = (part: keyof typeof KNOWN, value: object): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value).filter(([k]) => KNOWN[part].includes(k)));
  for (const part of ["build", "server", "session", "device"] as const) {
    const value = report[part];
    if (!value || jsonByteLength(value) <= L.sectionMaxBytes) continue;
    const trimmed = known(part, value);
    (report as unknown as Record<string, unknown>)[part] = jsonByteLength(trimmed) <= L.sectionMaxBytes || part === "session" ? trimmed : null;
    truncated.add(part);
  }
  for (const part of ["flags", "app", "sentry", "user"] as const) {
    const value = report[part];
    if (value && jsonByteLength(value) > L.sectionMaxBytes) {
      (report as unknown as Record<string, unknown>)[part] = part === "app" ? { id: report.app.id, name: null, platform: null, environment: null } : null;
      truncated.add(part);
    }
  }
  if (report.blocks && report.blocks.length > MAX_BLOCKS) {
    report.blocks = report.blocks.slice(0, MAX_BLOCKS);
    truncated.add("blocks");
  }
  if (report.checks && jsonByteLength(report.checks) > L.sectionMaxBytes) {
    report.checks = report.checks.map((c) => ({ ...c, detail: c.detail ? cutToBytes(c.detail, 256) : c.detail }));
    truncated.add("checks");
  }

  // Each app section within its own cap.
  for (const [name, value] of Object.entries(report.sections)) {
    const { value: cutValue, cut } = cutStrings(value, L.maxString);
    let next = cutValue;
    if (cut) truncated.add(`sections.${name}`);
    const max = L.sectionLimits?.[name] ?? L.sectionMaxBytes;
    const bytes = jsonByteLength(next ?? null);
    if (bytes > max) {
      next = { truncated: true, bytes };
      truncated.add(`sections.${name}`);
    }
    report.sections[name] = next;
  }

  // The whole dump. Oldest first: console, then breadcrumbs, then errors, in halves; then the
  // largest app sections; then the flags. Never refused.
  const size = () => jsonByteLength({ ...report, truncated: [...truncated] });
  const halve = (path: "console" | "breadcrumbs" | "errors") => {
    const items = report.logs[path] as unknown[];
    if (!items.length) return false;
    (report.logs as unknown as Record<string, unknown[]>)[path] = items.slice(Math.ceil(items.length / 2));
    truncated.add(`logs.${path}`);
    return true;
  };
  while (size() > L.maxBytes) {
    if (halve("console") || halve("breadcrumbs")) continue;
    const largest = Object.entries(report.sections)
      .map(([name, value]) => [name, jsonByteLength(value ?? null)] as const)
      .filter(([, bytes]) => bytes > 64)
      .sort((a, b) => b[1] - a[1])[0];
    if (largest) {
      report.sections[largest[0]] = { truncated: true, bytes: largest[1] };
      truncated.add(`sections.${largest[0]}`);
      continue;
    }
    if (halve("errors")) continue;
    if (report.flags && Object.keys(report.flags).length) {
      report.flags = null;
      truncated.add("flags");
      continue;
    }
    if (report.device) {
      report.device = null;
      truncated.add("device");
      continue;
    }
    if (report.checks?.length) {
      report.checks = [];
      truncated.add("checks");
      continue;
    }
    if (report.blocks?.length) {
      report.blocks = null;
      truncated.add("blocks");
      continue;
    }
    // Last: the extras a section put beside the build, server and session facts.
    let trimmed = false;
    for (const part of ["build", "server", "session"] as const) {
      const value = report[part];
      if (value && Object.keys(value).some((k) => !KNOWN[part].includes(k))) {
        (report as unknown as Record<string, unknown>)[part] = known(part, value);
        truncated.add(part);
        trimmed = true;
      }
    }
    if (trimmed) continue;
    // Nothing left to cut but the identity and build facts: send what there is.
    break;
  }

  report.truncated = [...truncated];
  return report;
}
