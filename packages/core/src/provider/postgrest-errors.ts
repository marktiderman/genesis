// ---------------------------------------------------------------------------
// Postgres / PostgREST error codes → Genesis write outcomes
// ---------------------------------------------------------------------------

import {
  DataWriteError,
  isDataWriteError,
  type WriteOutcome,
} from "../schema/write-outcome";
import type { ReadOutcome } from "../schema/read-outcome";
import { titleCase } from "../utils";

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

/** A column name as Postgres reports it unquoted; anything else is not mapped. */
const COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The columns of a `Key (a, b)=(...)` detail line, or none when any is not a plain column. */
function keyColumns(details: string, tail: RegExp): string[] {
  const match = /^Key \(([^()]*)\)=\(/.exec(details);
  if (!match || !tail.test(details)) return [];
  const columns = match[1]!.split(",").map((c) => c.trim());
  return columns.length > 0 && columns.every((c) => COLUMN.test(c)) ? columns : [];
}

function listLabels(columns: string[]): string {
  const labels = columns.map((c) => titleCase(c));
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Field errors read from a store error, with the safe sentence that sums them up. */
export interface PostgrestFieldErrors {
  /** Column name → safe message for that input. */
  fields: Record<string, string>;
  /** One safe sentence for the whole error, to replace the store's raw text. */
  message: string;
}

/**
 * Reads which columns a Postgres constraint error is about, from PostgREST's
 * `message` / `details`, and gives safe messages for them. Only plain column
 * names are taken from the store's text; the values it echoes are never
 * used. Returns `undefined` when nothing can be mapped safely.
 *
 * - `23505` unique violation, `Key (email)=(…) already exists.` → each
 *   column: "This value is already in use." (several columns: "This
 *   combination is already in use.")
 * - `23502` not-null, `null value in column "title" …` → "This field is
 *   required."
 * - `23503` foreign key on insert/update, `Key (owner_id)=(…) is not present
 *   in table …` → "The selected item doesn't exist."
 */
export function fieldErrorsFromPostgrest(error: {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}): PostgrestFieldErrors | undefined {
  const code = typeof error.code === "string" ? error.code : undefined;
  const details = typeof error.details === "string" ? error.details.trim() : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (code === "23505") {
    const columns = keyColumns(details, /\) already exists\.?$/);
    if (columns.length === 0) return undefined;
    const each = columns.length === 1 ? "This value is already in use." : "This combination is already in use.";
    return {
      fields: Object.fromEntries(columns.map((c) => [c, each])),
      message:
        columns.length === 1
          ? `${listLabels(columns)} is already in use.`
          : `This combination of ${listLabels(columns)} is already in use.`,
    };
  }
  if (code === "23502") {
    const column = /^null value in column "([A-Za-z_][A-Za-z0-9_]*)"(?: |$)/.exec(message)?.[1];
    if (!column || !COLUMN.test(column)) return undefined;
    return {
      fields: { [column]: "This field is required." },
      message: `${titleCase(column)} is required.`,
    };
  }
  if (code === "23503") {
    const columns = keyColumns(details, /\) is not present in table "[^"]*"\.?$/);
    if (columns.length === 0) return undefined;
    return {
      fields: Object.fromEntries(columns.map((c) => [c, "The selected item doesn't exist."])),
      message: `${listLabels(columns)}: the selected item doesn't exist.`,
    };
  }
  return undefined;
}

/**
 * Turns anything a write threw, or the `{ message, code }` error a Supabase
 * client returned, into a `DataWriteError`. A `DataWriteError` passes through
 * unchanged; anything else keeps its message and `code`, and is kept as the
 * `cause`.
 *
 * When the error names the columns it is about (`fieldErrorsFromPostgrest`:
 * unique, not-null and foreign-key violations), the result carries `fields`
 * and its message is replaced with a safe sentence; the raw text stays on
 * the `cause`.
 */
export function toDataWriteError(error: unknown): DataWriteError {
  if (isDataWriteError(error)) return error;
  const shape = (typeof error === "object" && error !== null ? error : {}) as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
  };
  const code = typeof shape.code === "string" ? shape.code : undefined;
  const mapped = fieldErrorsFromPostgrest(shape);
  if (mapped) {
    return new DataWriteError(writeOutcomeFromCode(code), mapped.message, {
      code,
      fields: mapped.fields,
      cause: error,
    });
  }
  const message =
    typeof shape.message === "string" && shape.message
      ? shape.message
      : error instanceof Error
        ? error.message
        : String(error);
  return new DataWriteError(writeOutcomeFromCode(code), message, { code, cause: error });
}
