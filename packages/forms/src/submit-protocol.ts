/**
 * What a respondent's device sends to submit a response, and what comes back. Shared by
 * `submitResponse` (server) and `createSubmitOutbox` (client), so both sides read one
 * definition. Plain JSON both ways: a host's endpoint passes the request body to
 * `submitResponse` and answers with its result as it is.
 */
import type { SubmissionInput } from "./server";

/**
 * One submission as the device sends it: the answers (or the event log) and hidden inputs
 * `validateSubmission` takes, plus a key that stays the same across every retry of it.
 */
export interface SubmitRequest extends SubmissionInput {
  /**
   * Made once, on the device, when the respondent submits (a UUID), and sent again on every
   * retry, so the server stores the response once however often it arrives.
   * 16 to 128 characters: letters, digits, `-` and `_` (`isIdempotencyKey`).
   */
  idempotencyKey: string;
  /**
   * When the respondent submitted, by the device's clock (milliseconds since 1970). Untrusted
   * and informational: an outbox may deliver it hours later. The server's own time is
   * `receivedAt`.
   */
  clientSubmittedAt?: number | undefined;
  /**
   * The visit's attempt id (a UUID made when the form opened), when the form has upload
   * fields: the server hashes it (`attemptHash`) to find the uploads this visit made. Sent in
   * the body so a retry from the outbox, after a restart or from a native app, still carries it.
   */
  attemptId?: string | undefined;
}

/** Why a submission was not stored as a new response. */
export type SubmitFailureReason = "invalid" | "duplicate" | "conflict" | "closed" | "rate_limited" | "store_failed";

/**
 * What `submitResponse` answers. A new response was stored only when `ok` is true.
 *
 * - `invalid`: the submission (or its idempotency key) doesn't pass; `errors` is keyed by
 *   field id, `""` for the submission as a whole. Sending it again won't help.
 * - `duplicate`: a response with this idempotency key and these answers is already stored,
 *   as `id`. The device's earlier attempt went through: treat it as delivered, and deliver
 *   nothing again.
 * - `conflict`: a response with this idempotency key is stored, with other answers. The
 *   device must not take it as delivered, and sending it again won't help.
 * - `closed`: the form isn't taking responses. Sending it again won't help.
 * - `rate_limited`: too many from this client; try again later, after `retryAfterSeconds`
 *   when it is given.
 * - `store_failed`: it couldn't be checked or stored this time; try again later.
 *
 * More reasons may be added. A device treats one it doesn't know as `retry`
 * (`submitOutcome`), so it keeps the submission.
 */
export type SubmitResult =
  | { ok: true; id: string; receivedAt: string }
  | { ok: false; reason: "duplicate"; id: string; receivedAt: string }
  | { ok: false; reason: "invalid"; errors: Record<string, string> }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "closed" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds?: number }
  | { ok: false; reason: "store_failed" };

/** What an idempotency key matches: 16 to 128 letters, digits, `-` and `_`. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

/** What a device does with an answer to a submit. */
export type SubmitOutcome = "delivered" | "retry" | "rejected";

/**
 * What a device does with an answer: `delivered` (stored now or before: drop it from the
 * outbox), `retry` (keep it and try again later) or `rejected` (keep it, marked failed, for
 * the respondent to fix or discard). Anything that isn't a `SubmitResult` is `retry`, so an
 * unexpected answer (a proxy's error page, say) never loses a submission.
 */
export function submitOutcome(result: unknown): SubmitOutcome {
  if (!isSubmitResult(result)) return "retry";
  if (result.ok || result.reason === "duplicate") return "delivered";
  if (result.reason === "invalid" || result.reason === "conflict" || result.reason === "closed") return "rejected";
  return "retry";
}

/** Whether `value` is a `SubmitResult`, for a device reading an endpoint's JSON. */
export function isSubmitResult(value: unknown): value is SubmitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const stored = typeof v.id === "string" && v.id !== "" && typeof v.receivedAt === "string";
  if (v.ok === true) return stored;
  if (v.ok !== false) return false;
  switch (v.reason) {
    case "duplicate":
      return stored;
    case "invalid":
      return !!v.errors && typeof v.errors === "object" && !Array.isArray(v.errors);
    case "rate_limited":
      return v.retryAfterSeconds === undefined || (typeof v.retryAfterSeconds === "number" && Number.isFinite(v.retryAfterSeconds));
    case "conflict":
    case "closed":
    case "store_failed":
      return true;
    default:
      return false;
  }
}
