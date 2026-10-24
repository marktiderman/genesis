/**
 * `submitResponse`: the one call a submit endpoint makes. It checks the submission again
 * on the server (`validateSubmission`, then `checkUploads`), snapshots the options picked,
 * and hands one record to the app's `SubmissionStore`, keyed by the device's idempotency
 * key so a retry never stores a second response. No IO of its own and no HTTP: the
 * endpoint, the store and delivery (destinations, their outbox, retries) are the app's.
 */
import { withHostOptions } from "./fields";
import { canonicalJson, fingerprint } from "./hash";
import { answerSnapshots, type AnswerSnapshot } from "./options";
import { parseForm } from "./parse";
import { validateSubmission, type SubmissionOptions } from "./server";
import { isIdempotencyKey, type SubmitRequest, type SubmitResult } from "./submit-protocol";
import type { FormDefinition, Json } from "./types";
import { checkUploads, uploadFields, type UploadOwner, type UploadStore } from "./uploads";

/** What the store keeps for one response: everything `submitResponse` checked, as JSON. */
export interface SubmissionRecord {
  /** `options.formId`, else the definition's id. */
  formId: string;
  /** The device's key. The store keeps one response per `formId` and key (a unique index). */
  idempotencyKey: string;
  /**
   * Hex SHA-256 of the answers, events and hidden inputs as sent. A retry sends the same
   * body, so the same hash; the store hands it back with a duplicate so a key reused for
   * other answers is refused instead of being taken as delivered.
   */
  inputHash: string;
  /** `options.version`, else `fingerprint` of the published definition. */
  definitionVersion: string;
  /** The server's time, ISO 8601. */
  receivedAt: string;
  /** The device's time of submitting, ISO 8601, or null. Untrusted. */
  clientSubmittedAt: string | null;
  /** Checked answers by field id: visible ones only, uploads as stored, calculated fields worked out here. */
  answers: Record<string, Json>;
  /** Untrusted URL and host inputs, coerced to their types. */
  hidden: Record<string, Json>;
  /** Trusted server inputs (`options.context`). */
  context: Record<string, Json>;
  ending: string | null;
  /** Client-sent keys that were dropped (see `CheckedSubmission.ignored`). */
  ignored: string[];
  /** Each answer to a question with options from the app, as `{ value, label }` now (`answerSnapshots`). */
  snapshots: Record<string, AnswerSnapshot>;
}

/** A response the store already holds under an idempotency key. */
export interface StoredSubmissionRef {
  id: string;
  /** ISO 8601, as it was saved. */
  receivedAt: string;
  /** `SubmissionRecord.inputHash` as it was saved. */
  inputHash: string;
}

/** Where responses go: the app's database (a service-role client, say). */
export interface SubmissionStore {
  /**
   * Store one response. Exactly one response per `formId` and `idempotencyKey`: when one is
   * already there (a unique index refused the insert), answer `{ duplicate }` with it rather
   * than storing again. Throw when it can't store (answered `store_failed`, and the device
   * retries). Save the response and queue its deliveries in one transaction, so a stored
   * response is always delivered.
   */
  save(record: SubmissionRecord): Promise<{ id: string } | { duplicate: StoredSubmissionRef }>;
  /**
   * The response stored under this key, or null. Optional, and recommended: with it, a retry
   * of a response that went through is answered `duplicate` even after the form has closed
   * or the client is rate limited. `save` must still refuse a duplicate on its own (two
   * retries can race).
   */
  find?(formId: string, idempotencyKey: string): Promise<StoredSubmissionRef | null>;
}

export interface SubmitResponseOptions extends Omit<SubmissionOptions, "complete" | "hostOptions"> {
  /** The published definition respondents answer, loaded by the server. */
  definition: FormDefinition;
  store: SubmissionStore;
  /**
   * The option lists for `optionsFrom: { source: "host" }` questions, loaded here afresh
   * (never taken from the client): an answer must be one of them.
   */
  hostOptions?: SubmissionOptions["hostOptions"];
  /** The id the store keys this form's responses (and uploads) by. Default `definition.id`. */
  formId?: string | undefined;
  /** The published version's label, stored as `definitionVersion`. Default `fingerprint(definition)`. */
  version?: string | undefined;
  /** Whether the form takes responses now (not paused, closed, full). Default true; false answers `closed`. */
  open?: boolean | undefined;
  /**
   * The rate limit: true lets the submission on, false answers `rate_limited`. Typically
   * `() => allow(store, { key: await rateLimitKey(...), ...RATE_LIMIT_DEFAULTS.submit })`.
   * A throw lets it on (fails open, as `allow` does) and is logged.
   */
  rateLimit?: (() => boolean | Promise<boolean>) | undefined;
  /**
   * Needed when the form has upload fields: who may use the uploads named (the visit's
   * attempt) and where they are recorded. Without it such a form throws, on every submit.
   */
  uploads?: { owner: UploadOwner; store: Pick<UploadStore, "uploadRefs"> } | undefined;
  /** The current time (tests). */
  now?: (() => Date) | undefined;
  /** Where failures are said; `console.error` with a `[submit]` prefix by default. Never holds an answer. */
  log?: ((message: string) => void) | undefined;
}

const INVALID_KEY: SubmitResult = {
  ok: false,
  reason: "invalid",
  errors: { "": "Missing or malformed idempotency key: 16 to 128 letters, digits, - or _." },
};
const MALFORMED: SubmitResult = { ok: false, reason: "invalid", errors: { "": "Malformed submission." } };
const KEY_REUSED: SubmitResult = {
  ok: false,
  reason: "invalid",
  errors: { "": "This idempotency key was already used for a different submission." },
};

const parsed = new WeakMap<object, true>();

/** Throws when the published definition doesn't parse: that is the server's fault, not the respondent's. */
function assertPublishable(definition: FormDefinition): void {
  if (typeof definition === "object" && definition !== null && parsed.has(definition)) return;
  const result = parseForm(definition);
  if (!result.ok) {
    throw new Error(`submitResponse: the published definition is invalid: ${result.issues.map((i) => i.message).join("; ")}`);
  }
  parsed.set(definition, true);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** The hash a duplicate is compared by: the parts of the request that make the response. */
function hashInput(input: SubmitRequest): Promise<string> {
  return sha256Hex(canonicalJson({ answers: input.answers, events: input.events, hidden: input.hidden }));
}

function isoOrNull(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A stored response for this key, answered as `duplicate` when it was these answers, else refused. */
function duplicateOf(ref: StoredSubmissionRef, inputHash: string): SubmitResult {
  if (ref.inputHash !== inputHash) return KEY_REUSED;
  return { ok: false, reason: "duplicate", id: ref.id, receivedAt: ref.receivedAt };
}

/**
 * Check one submission and store it once. In order: the idempotency key, a response already
 * stored under it (`store.find`), the form being open, the rate limit, `validateSubmission`
 * (always complete: drafts aren't submitted here), the uploads named, then `store.save`.
 *
 * Never throws for anything the client sent. It throws for the server's own mistakes: a
 * published definition that doesn't parse, or a form with upload fields and no `uploads`.
 * A store that throws (or an upload store) is answered `store_failed` and logged.
 */
export async function submitResponse(input: SubmitRequest, options: SubmitResponseOptions): Promise<SubmitResult> {
  const { definition, store } = options;
  assertPublishable(definition);
  if (uploadFields(definition).length > 0 && !options.uploads) {
    throw new Error("submitResponse: this form has upload fields; pass `uploads` (the attempt and the upload store).");
  }
  const log = options.log ?? ((m: string) => console.error(`[submit] ${m}`));
  if (!input || typeof input !== "object" || Array.isArray(input)) return MALFORMED;
  if (!isIdempotencyKey(input.idempotencyKey)) return INVALID_KEY;
  const formId = options.formId ?? definition.id;
  const key = input.idempotencyKey;
  let hash: Promise<string> | undefined;
  const inputHash = () => (hash ??= hashInput(input));

  if (store.find) {
    let existing: StoredSubmissionRef | null;
    try {
      existing = await store.find(formId, key);
    } catch (e) {
      log(`find failed for form ${formId}: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, reason: "store_failed" };
    }
    if (existing) return duplicateOf(existing, await inputHash());
  }
  if (options.open === false) return { ok: false, reason: "closed" };
  if (options.rateLimit) {
    let allowed = true;
    try {
      allowed = await options.rateLimit();
    } catch (e) {
      log(`the rate limit could not be checked; letting the submission through: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!allowed) return { ok: false, reason: "rate_limited" };
  }

  const checked = validateSubmission(
    definition,
    { answers: input.answers, events: input.events, hidden: input.hidden },
    {
      context: options.context,
      validators: options.validators,
      maxEvents: options.maxEvents,
      maxValues: options.maxValues,
      maxReplayWork: options.maxReplayWork,
      hostOptions: options.hostOptions,
      complete: true,
    },
  );
  if (!checked.ok) return { ok: false, reason: "invalid", errors: checked.errors };
  const submission = checked.submission;

  let answers = submission.answers;
  if (options.uploads) {
    try {
      const files = await checkUploads(definition, answers, { formId, owner: options.uploads.owner, store: options.uploads.store });
      if (!files.ok) return { ok: false, reason: "invalid", errors: files.errors };
      answers = files.answers;
    } catch (e) {
      log(`upload check failed for form ${formId}: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, reason: "store_failed" };
    }
  }

  const record: SubmissionRecord = {
    formId,
    idempotencyKey: key,
    inputHash: await inputHash(),
    definitionVersion: options.version ?? fingerprint(definition),
    receivedAt: (options.now?.() ?? new Date()).toISOString(),
    clientSubmittedAt: isoOrNull(input.clientSubmittedAt),
    answers,
    hidden: submission.hidden,
    context: submission.context,
    ending: submission.ending,
    ignored: submission.ignored,
    snapshots: answerSnapshots(withHostOptions(definition, options.hostOptions), answers),
  };
  let saved: Awaited<ReturnType<SubmissionStore["save"]>>;
  try {
    saved = await store.save(record);
  } catch (e) {
    log(`save failed for form ${formId}: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "store_failed" };
  }
  if ("duplicate" in saved) return duplicateOf(saved.duplicate, record.inputHash);
  if (typeof saved.id !== "string" || saved.id === "") {
    log(`save for form ${formId} answered without an id`);
    return { ok: false, reason: "store_failed" };
  }
  return { ok: true, id: saved.id, receivedAt: record.receivedAt };
}
