/**
 * The context dump: `genesis.diagnostics/1`, one JSON object a person (or a
 * shake, a piece of feedback, a crash) sends to the app's own server, with
 * everything a developer wants to see about the app at that moment. Every
 * section is optional; a value nobody could read is `null`, never left out.
 *
 * Platform-neutral: no React, no React Native, no Supabase. The native and web
 * entries add the sections that read the device (`nativeSections`,
 * `webSections`), and `/server` takes the dump in.
 */

/** The format's name and version. A reader refuses any other. */
export const DIAGNOSTICS_SCHEMA = "genesis.diagnostics/1" as const;

/** What sent the dump. */
export type DiagnosticTrigger = "manual" | "shake" | "feedback" | "crash";

export const DIAGNOSTIC_TRIGGERS: readonly DiagnosticTrigger[] = ["manual", "shake", "feedback", "crash"];

/**
 * Every option of the diagnostics layer and its default, in one place, so
 * genesis-config can declare them as settings (`diagnostics.*`) without
 * renaming anything. The caps are the design's size table.
 */
export const DIAGNOSTICS_DEFAULTS = {
  /** The whole dump, JSON, before gzip. Over it, the oldest entries go first. */
  maxBytes: 262_144,
  /** One string. Longer ones are cut. */
  maxString: 4096,
  /** Errors kept, newest last. */
  maxErrors: 50,
  /** Breadcrumbs kept, newest last. */
  maxBreadcrumbs: 100,
  /** Console lines kept, newest last. */
  maxConsoleLines: 200,
  /** One console line, in bytes. */
  maxConsoleLineBytes: 1024,
  /** Health-check results kept. */
  maxChecks: 40,
  /** Routes kept in `session.recentRoutes`. */
  maxRecentRoutes: 20,
  /** One app section (`defineDiagnosticSection`), unless it sets its own. */
  sectionMaxBytes: 32_768,
  /** How long one section may take to collect before it is written as null. */
  sectionTimeoutMs: 2000,
  /** The server refuses a body larger than this (it re-caps anything smaller to `maxBytes`). */
  serverMaxBytes: 524_288,
  /** Dumps one person may send in an hour (the database and the server handler both hold it). */
  ratePerHour: 10,
  /** Requests one IP may make to the server handler in a minute. */
  ipRatePerMinute: 5,
  /** Days a dump is kept before the cleanup removes it. */
  retentionDays: 90,
  /** Send a dump when the phone is shaken (with `createSupport({ diagnostics })`). */
  dumpOnShake: true,
  /** Send a dump with every piece of feedback, linked by `diagnosticsId`. */
  dumpOnFeedback: true,
  /** What a GitHub issue carries: the summary only, or (private repositories only) the dump's detail too. */
  githubDetail: "summary" as "summary" | "full",
  /** Dumps the offline queue keeps waiting to be sent; the oldest go first. */
  queueMaxItems: 20,
  /** The offline queue's whole size, as stored JSON (it lives in one storage key: AsyncStorage on Android and localStorage hold a few MB). */
  queueMaxBytes: 1_000_000,
  /** First retry of a queued send; it doubles each time, up to `queueMaxDelayMs`. */
  queueBaseDelayMs: 5000,
  queueMaxDelayMs: 3_600_000,
  /** Tries before a queued dump is given up. */
  queueMaxAttempts: 12,
} as const;

export type DiagnosticsDefaults = typeof DIAGNOSTICS_DEFAULTS;

/** A caught error, scrubbed. */
export interface DiagnosticError {
  at: string | null;
  name: string | null;
  message: string | null;
  source: string | null;
  fatal: boolean | null;
}

/** A breadcrumb, scrubbed. */
export interface DiagnosticBreadcrumb {
  at: string | null;
  category: string | null;
  message: string | null;
  level: string | null;
  data: Record<string, unknown> | null;
}

/** A console line, scrubbed and cut to 1 KB. */
export interface DiagnosticConsoleLine {
  at: string | null;
  level: string;
  text: string;
}

/** A health check's result. */
export interface DiagnosticCheck {
  name: string;
  /** `ok`, `warn` or `fail` (health checks); absent in a dump from before them. */
  status?: "ok" | "warn" | "fail";
  /** False only when it failed. */
  ok: boolean;
  ms: number | null;
  detail: string | null;
}

export interface DiagnosticApp {
  id: string | null;
  name: string | null;
  platform: string | null;
  environment: string | null;
}

export interface DiagnosticBuild {
  version: string | null;
  build: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  requestedChannel: string | null;
  updateId: string | null;
  launch: string | null;
  emergency: boolean | null;
  commit: string | null;
  otaNumber: string | null;
  release: string | null;
  releasePublishedAt: string | null;
  jsBundle: string | null;
  [key: string]: unknown;
}

export interface DiagnosticServer {
  baseUrl: string | null;
  apiCommit: string | null;
  [key: string]: unknown;
}

export interface DiagnosticDevice {
  os: string | null;
  osVersion: string | null;
  model: string | null;
  locale: string | null;
  timeZone: string | null;
  screen: { width: number; height: number; scale?: number } | null;
  fontScale: number | null;
  network: { type: string | null; connected: boolean | null; reachable: boolean | null } | null;
  /** Each permission's state (`granted`, `denied`, `undetermined`), or `timeout` / `error`. */
  permissions: Record<string, string> | null;
  [key: string]: unknown;
}

/** The person: an id and a role, never an email or a name (the server looks those up). */
export interface DiagnosticUser {
  id: string | null;
  role: string | null;
}

export interface DiagnosticSession {
  uptimeMs: number | null;
  route: string | null;
  recentRoutes: string[];
  foreground: boolean | null;
  [key: string]: unknown;
}

export interface DiagnosticLogs {
  errors: DiagnosticError[];
  breadcrumbs: DiagnosticBreadcrumb[];
  console: DiagnosticConsoleLine[];
}

export interface DiagnosticSentry {
  lastEventId: string | null;
  replayId: string | null;
}

/** One dump. */
export interface DiagnosticReport {
  schema: typeof DIAGNOSTICS_SCHEMA;
  /** A UUID, made on the device, so feedback can name its dump before either is sent. */
  id: string;
  /** ISO time. */
  createdAt: string;
  trigger: DiagnosticTrigger;
  /** The feedback (ticket) this dump goes with. */
  feedbackId: string | null;
  app: DiagnosticApp;
  build: DiagnosticBuild | null;
  server: DiagnosticServer | null;
  device: DiagnosticDevice | null;
  user: DiagnosticUser | null;
  session: DiagnosticSession | null;
  flags: Record<string, unknown> | null;
  blocks: string[] | null;
  logs: DiagnosticLogs;
  sentry: DiagnosticSentry | null;
  checks: DiagnosticCheck[] | null;
  /** The app's own sections, by name (`defineDiagnosticSection`). */
  sections: Record<string, unknown>;
  /** What was cut to fit the caps, as paths (`logs.console`, `sections.game`). */
  truncated: string[];
}

/** The report's own keys a section can fill. Any other name goes under `sections`. */
export const CORE_SECTIONS = ["app", "build", "server", "device", "session", "flags", "blocks", "logs", "sentry", "checks"] as const;
export type CoreSectionName = (typeof CORE_SECTIONS)[number];

/** What a section's `collect` may return: a value, or a promise of one. Null or undefined writes nothing. */
export type SectionValue = unknown;

export interface DiagnosticSectionOptions {
  /**
   * The section's own cap, as JSON bytes (app sections default to 32 KB). Over it, the section
   * is replaced by `{ "truncated": true }` and named in `truncated`.
   */
  maxBytes?: number;
  /** Longest time to wait for `collect`, in ms (default 2000). After it the section is null. */
  timeoutMs?: number;
  /**
   * `"none"`: the section holds no personal data (numbers, counts), so the pattern rules for text
   * are skipped. Values under secret-looking keys are still filtered.
   */
  pii?: "none";
  /**
   * The value is part of a report (`{ logs, sentry }`): each core key in it fills that part, as a
   * section of that name would. For one source that feeds several parts (`observabilitySection`).
   */
  merge?: boolean;
}

/** One part of the dump: a name and how to read it now. */
export interface DiagnosticSection {
  readonly name: string;
  readonly collect: () => SectionValue | Promise<SectionValue>;
  readonly options: DiagnosticSectionOptions;
}

/**
 * A section of the dump. A core name (`build`, `device`, `session`, `flags`, `blocks`, `logs`,
 * `sentry`, `server`, `checks`, `app`) fills that part of the report, merged over what other
 * sections gave; any other name is an app section under `sections`.
 *
 *   defineDiagnosticSection("game", () => ({ round: 3, players: 4 }), { maxBytes: 8192 })
 */
export function defineDiagnosticSection(name: string, collect: () => SectionValue | Promise<SectionValue>, options: DiagnosticSectionOptions = {}): DiagnosticSection {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) throw new Error(`defineDiagnosticSection: "${name}" is not a section name (letters, digits, _ . -; up to 64).`);
  return { name, collect, options };
}

/**
 * The short id a person quotes to support: the first 8 hex digits of the dump's id, upper case
 * (`3F2A9C1B`). The database's `short_id` column is the same expression.
 */
export function diagnosticsShortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** An empty report: every section null, the lists empty. */
export function emptyReport(input: { id: string; createdAt: string; trigger: DiagnosticTrigger; feedbackId?: string | null; app?: Partial<DiagnosticApp> }): DiagnosticReport {
  return {
    schema: DIAGNOSTICS_SCHEMA,
    id: input.id,
    createdAt: input.createdAt,
    trigger: input.trigger,
    feedbackId: input.feedbackId ?? null,
    app: { id: input.app?.id ?? null, name: input.app?.name ?? null, platform: input.app?.platform ?? null, environment: input.app?.environment ?? null },
    build: null,
    server: null,
    device: null,
    user: null,
    session: null,
    flags: null,
    blocks: null,
    logs: { errors: [], breadcrumbs: [], console: [] },
    sentry: null,
    checks: null,
    sections: {},
    truncated: [],
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a UUID (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** A random UUID v4: `crypto.randomUUID` where there is one, else from `getRandomValues`, else Math.random. */
export function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** JSON size in UTF-8 bytes. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}
