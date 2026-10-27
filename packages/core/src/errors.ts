// ---------------------------------------------------------------------------
// Errors: one way for every Genesis package to report a caught error, and one
// way to say what kind of error it is.
//
// `reportError(error, context)` is the seam a package calls when it catches
// something it can't handle itself (a card's action that threw, a draft that
// couldn't be saved). The host app decides where it goes: a native app's
// observability block registers itself with `setErrorReporter` and sends it,
// scrubbed, to Sentry; with nothing registered it is written with
// `console.warn` in development and dropped in production.
//
// `classifyError(error)` sorts anything thrown into a few kinds a screen can
// act on (offline, signed out, refused, gone, conflict, bad input, a bug),
// with a sentence that is safe to show and whether it is worth reporting.
// It is built on the provider's read and write outcomes.
// ---------------------------------------------------------------------------

import { readOutcomeFromCode, writeOutcomeFromCode } from "./provider/postgrest-errors";
import { isDataReadError } from "./schema/read-outcome";
import { isDataWriteError } from "./schema/write-outcome";

/** Where a reported error came from. */
export interface ErrorReportContext {
  /**
   * Which part caught it, as `package:part` (`chat:attachment-action`,
   * `forms-native:draft-save`). Low-cardinality: never an id or text.
   */
  source: string;
  /** True when the app could not go on. Default false: a package that reports has handled it. */
  fatal?: boolean;
  /** Low-cardinality labels (`query.key: "tasks"`), never ids, emails or text someone typed. */
  tags?: Readonly<Record<string, string>>;
}

/** Where `reportError` sends errors. A throw inside it is ignored. */
export type ErrorReporter = (error: unknown, context: ErrorReportContext) => void;

declare const __DEV__: boolean | undefined;

/** True in a development build (`__DEV__` on React Native, `NODE_ENV` elsewhere). */
function isDevelopment(): boolean {
  if (typeof __DEV__ !== "undefined") return Boolean(__DEV__);
  const env = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
  return env !== "production";
}

/** The reporter used when the app registered none: `console.warn` in development, nothing in production. */
export const defaultErrorReporter: ErrorReporter = (error, context) => {
  if (!isDevelopment()) return;
  // genesis-allow-console: the development fallback of the reporting seam itself.
  console.warn(`[genesis] ${context.source}:`, error);
};

// Kept on globalThis so two copies of this package (a bundling slip) still share one reporter.
const KEY = Symbol.for("genesis.errorReporter");
type Holder = { [KEY]?: ErrorReporter };

/** The reporter `reportError` uses now. */
export function getErrorReporter(): ErrorReporter {
  return (globalThis as Holder)[KEY] ?? defaultErrorReporter;
}

/**
 * Send every `reportError` to `reporter` (`null` puts the default back).
 * Returns a function that restores the reporter that was there before.
 * The native observability block calls it when it is created.
 */
export function setErrorReporter(reporter: ErrorReporter | null): () => void {
  const holder = globalThis as Holder;
  const previous = holder[KEY];
  if (reporter) holder[KEY] = reporter;
  else delete holder[KEY];
  return () => {
    if (previous) holder[KEY] = previous;
    else delete holder[KEY];
  };
}

/**
 * Report an error a package caught and handled. Never throws: a failing
 * reporter must not take the caller (an event handler, a render) down.
 * `context` may be just the source.
 */
export function reportError(error: unknown, context: ErrorReportContext | string): void {
  const full: ErrorReportContext = typeof context === "string" ? { source: context } : context;
  try {
    getErrorReporter()(error, full);
  } catch {
    // A failing reporter is ignored; reporting is never worth a second error.
  }
}

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

/**
 * - `offline`: the request never reached the server (no network).
 * - `unauthenticated`: nobody is signed in, or the session ended.
 * - `forbidden`: the server refused this user.
 * - `not-found`: the record doesn't exist, or this user can't see it.
 * - `conflict`: someone else changed it first, or it already exists.
 * - `invalid`: the request or a value in it was rejected.
 * - `unexpected`: anything else (a bug, a server error).
 */
export type ErrorKind = "offline" | "unauthenticated" | "forbidden" | "not-found" | "conflict" | "invalid" | "unexpected";

/** The sentence shown for each kind. Override any of them with `classifyError(e, { messages })`. */
export type ErrorMessages = Readonly<Record<ErrorKind, string>>;

/** The English catalogue. Plain words, never the store's text. */
export const errorMessages: ErrorMessages = {
  offline: "You're offline. Check your connection and try again.",
  unauthenticated: "Your session has ended. Sign in again to continue.",
  forbidden: "You don't have permission to do that.",
  "not-found": "This isn't here any more, or you can't see it.",
  conflict: "Someone else changed this first. Refresh and try again.",
  invalid: "Something in this couldn't be accepted. Check it and try again.",
  unexpected: "Something went wrong. Try again.",
};

export interface ClassifiedError {
  kind: ErrorKind;
  /** Safe to show: from the messages catalogue, never the error's own text. */
  message: string;
  /** Worth reporting to a crash tracker: a bug or a server failure, not something the user or the network caused. */
  report: boolean;
}

export interface ClassifyErrorOptions {
  /** Reworded or translated sentences; what you leave out stays English. */
  messages?: Partial<ErrorMessages>;
  /** True when the device knows it is offline (TanStack's `onlineManager`, NetInfo). */
  isOffline?: () => boolean;
}

// The text each runtime's fetch throws when the request never left the device.
const NETWORK_MESSAGES = [
  /^network request failed$/i, // React Native
  /^failed to fetch$/i, // Chromium
  /^load failed$/i, // Safari
  /^networkerror when attempting to fetch resource\.?$/i, // Firefox
  /^network error$/i,
  /^the internet connection appears to be offline\.?$/i,
];
// Supabase's wrappers around a fetch that never reached the server.
const NETWORK_NAMES = new Set(["AuthRetryableFetchError", "FunctionsFetchError", "StorageUnknownError"]);

function field(error: unknown, name: string): unknown {
  return typeof error === "object" && error !== null ? (error as Record<string, unknown>)[name] : undefined;
}

function isNetworkError(error: unknown): boolean {
  const name = field(error, "name");
  const message = field(error, "message");
  if (typeof name === "string" && NETWORK_NAMES.has(name)) {
    // StorageUnknownError covers other failures too; only its network form counts.
    return name !== "StorageUnknownError" || (typeof message === "string" && NETWORK_MESSAGES.some((re) => re.test(message)));
  }
  return typeof message === "string" && NETWORK_MESSAGES.some((re) => re.test(message.trim()));
}

function fromStatus(status: number): Omit<ClassifiedError, "message"> | null {
  if (status === 401) return { kind: "unauthenticated", report: false };
  if (status === 403) return { kind: "forbidden", report: false };
  if (status === 404 || status === 410) return { kind: "not-found", report: false };
  if (status === 409 || status === 412) return { kind: "conflict", report: false };
  if (status === 400 || status === 422) return { kind: "invalid", report: true };
  if (status === 429) return { kind: "unexpected", report: false };
  return null;
}

function kindOf(error: unknown, options: ClassifyErrorOptions): Omit<ClassifiedError, "message"> {
  if (isDataWriteError(error)) {
    switch (error.outcome) {
      case "conflict":
      case "duplicate":
        return { kind: "conflict", report: false };
      case "gone":
        return { kind: "not-found", report: false };
      case "forbidden":
        return { kind: "forbidden", report: false };
      case "invalid":
        return { kind: "invalid", report: false };
      case "unauthenticated":
        return { kind: "unauthenticated", report: false };
      default:
        // `error` and `audit_failed`: a network failure surfaces here as the write's cause.
        if (isNetworkError(error.cause ?? error) || options.isOffline?.()) return { kind: "offline", report: false };
        return { kind: "unexpected", report: true };
    }
  }
  if (isDataReadError(error)) {
    switch (error.outcome) {
      case "unauthenticated":
        return { kind: "unauthenticated", report: false };
      case "forbidden":
        return { kind: "forbidden", report: false };
      case "gone":
        return { kind: "not-found", report: false };
      case "invalid":
        // The request itself was wrong (an unknown column): a bug worth seeing.
        return { kind: "invalid", report: true };
      default:
        if (isNetworkError(error.cause ?? error) || options.isOffline?.()) return { kind: "offline", report: false };
        return { kind: "unexpected", report: true };
    }
  }
  if (isNetworkError(error)) return { kind: "offline", report: false };
  const code = field(error, "code");
  if (typeof code === "string" && code) {
    const read = readOutcomeFromCode(code);
    if (read === "invalid" && writeOutcomeFromCode(code) === "error") return { kind: "invalid", report: true };
    switch (writeOutcomeFromCode(code)) {
      case "unauthenticated":
        return { kind: "unauthenticated", report: false };
      case "forbidden":
        return { kind: "forbidden", report: false };
      case "gone":
        return { kind: "not-found", report: false };
      case "duplicate":
        return { kind: "conflict", report: false };
      case "invalid":
        return { kind: "invalid", report: false };
      default:
        break;
    }
  }
  const name = field(error, "name");
  if (name === "AuthSessionMissingError") return { kind: "unauthenticated", report: false };
  const status = field(error, "status") ?? field(error, "statusCode");
  const numeric = typeof status === "number" ? status : typeof status === "string" ? Number(status) : NaN;
  if (Number.isInteger(numeric)) {
    const byStatus = fromStatus(numeric);
    if (byStatus) return byStatus;
  }
  if (options.isOffline?.()) return { kind: "offline", report: false };
  return { kind: "unexpected", report: true };
}

/**
 * What kind of error this is, a sentence that is safe to show, and whether it
 * is worth reporting. Understands the provider's `DataWriteError` and
 * `DataReadError`, Postgres and PostgREST codes, HTTP statuses, Supabase's
 * auth and fetch errors, and each runtime's "network request failed".
 *
 * Use it for a toast (`toast.error(classifyError(e).message)`) and to decide
 * whether to report (`if (classifyError(e).report) reportError(e, …)`).
 */
export function classifyError(error: unknown, options: ClassifyErrorOptions = {}): ClassifiedError {
  let base: Omit<ClassifiedError, "message">;
  try {
    base = kindOf(error, options);
  } catch {
    // A getter that throws on an exotic value: still an answer, never a second error.
    base = { kind: "unexpected", report: true };
  }
  const message = options.messages?.[base.kind] ?? errorMessages[base.kind];
  return { ...base, message };
}
