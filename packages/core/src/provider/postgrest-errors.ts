// ---------------------------------------------------------------------------
// Postgres / PostgREST error codes → Genesis write outcomes
// ---------------------------------------------------------------------------

import {
  DataWriteError,
  isDataWriteError,
  type WriteOutcome,
} from "../schema/write-outcome";
import type { ReadOutcome } from "../schema/read-outcome";

/**
 * Maps a store error code to the read outcome it means: the write mapping,
 * with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116,
 * `42703` unknown column, `42P01` unknown table) read as `invalid`.
 */
export function readOutcomeFromCode(code: string | null | undefined): ReadOutcome {
  if (!code) return "error";
  if (code === "42703" || code === "42P01" || (/^PGRST1\d\d$/.test(code) && code !== "PGRST116")) {
    return "invalid";
  }
  const write = writeOutcomeFromCode(code);
  return write === "forbidden" || write === "gone" || write === "unauthenticated" || write === "invalid"
    ? write
    : "error";
}

/**
 * Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it
 * means. Anything not listed is `error`: a code is only read as a refusal or
 * a bad value when it says so.
 *
 * - `42501` (insufficient privilege, including "new row violates row-level
 *   security policy") → `forbidden`
 * - `22***` (data exception: bad type, out of range) and `23***` (integrity
 *   constraint: `23505` unique, `23503` foreign key, `23502` not null,
 *   `23514` check) → `invalid`
 * - `PGRST301`–`PGRST303` (JWT missing, expired or rejected), `28000`,
 *   `28P01` → `unauthenticated`
 * - `PGRST116` (one row was asked for and none came back) → `gone`
 */
export function writeOutcomeFromCode(code: string | null | undefined): WriteOutcome {
  if (!code) return "error";
  if (code === "42501") return "forbidden";
  if (code === "PGRST116") return "gone";
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") return "unauthenticated";
  if (code === "28000" || code === "28P01") return "unauthenticated";
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return "invalid";
  return "error";
}

/**
 * Turns anything a write threw, or the `{ message, code }` error a Supabase
 * client returned, into a `DataWriteError`. A `DataWriteError` passes through
 * unchanged; anything else keeps its message and `code`, and is kept as the
 * `cause`.
 */
export function toDataWriteError(error: unknown): DataWriteError {
  if (isDataWriteError(error)) return error;
  const shape = (typeof error === "object" && error !== null ? error : {}) as {
    message?: unknown;
    code?: unknown;
  };
  const code = typeof shape.code === "string" ? shape.code : undefined;
  const message =
    typeof shape.message === "string" && shape.message
      ? shape.message
      : error instanceof Error
        ? error.message
        : String(error);
  return new DataWriteError(writeOutcomeFromCode(code), message, { code, cause: error });
}
