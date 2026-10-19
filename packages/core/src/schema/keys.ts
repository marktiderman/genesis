// ---------------------------------------------------------------------------
// Record identity for single and composite keys (DATA-STUDIO.md decision 13)
//
// `DataProvider` methods take one `Identifier`. A composite key travels
// through that same slot as a canonical string, so every existing provider
// signature stays as it is and a junction table still has one id per row.
// ---------------------------------------------------------------------------

import type { Identifier } from "../provider/types";
import type { DataRow, ResourceContract } from "./types";

/** The key of a contract as a list, whichever form `key` was declared in. */
export function keyFields(contract: Pick<ResourceContract, "key">): readonly string[] {
  return typeof contract.key === "string" ? [contract.key] : contract.key;
}

function keyValue(row: DataRow, field: string): string | number {
  const value = row[field];
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint" || typeof value === "boolean") return String(value);
  throw new Error(
    `Record key field "${field}" is ${value === null ? "null" : typeof value}; ` +
      "a key value must be a string or a number.",
  );
}

/**
 * One `Identifier` for a row.
 *
 * A single-field key returns the raw value, so `id`-keyed resources look
 * exactly as they always have. A composite key returns a JSON array of the
 * values in key order, e.g. `'["c-1","u-7"]'`.
 */
export function encodeRecordKey(
  contract: Pick<ResourceContract, "key">,
  row: DataRow,
): Identifier {
  const fields = keyFields(contract);
  if (fields.length === 0) throw new Error("This resource has no key, so its rows cannot be addressed.");
  if (fields.length === 1) return keyValue(row, fields[0]!);
  return JSON.stringify(fields.map((field) => keyValue(row, field)));
}

/**
 * The inverse of {@link encodeRecordKey}: field name → value.
 *
 * Throws on an id that does not fit the key, rather than guessing, because a
 * guessed key addresses the wrong row.
 */
export function decodeRecordKey(
  contract: Pick<ResourceContract, "key">,
  id: Identifier,
): Record<string, string | number> {
  const fields = keyFields(contract);
  if (fields.length === 0) throw new Error("This resource has no key, so its rows cannot be addressed.");
  if (fields.length === 1) return { [fields[0]!]: id };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(id));
  } catch {
    throw new Error(`"${String(id)}" is not a composite key for (${fields.join(", ")}).`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== fields.length ||
    !parsed.every((v) => typeof v === "string" || typeof v === "number")
  ) {
    throw new Error(`"${String(id)}" is not a composite key for (${fields.join(", ")}).`);
  }
  const out: Record<string, string | number> = {};
  fields.forEach((field, i) => {
    out[field] = parsed[i] as string | number;
  });
  return out;
}
