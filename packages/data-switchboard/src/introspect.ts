// =====================================================================
// Introspection (WC46.015) — wholesale / zero-config schema discovery.
//
// THE WIN: "point at a source → all fields auto (see → configure)."
//
// A provider's `describe()` used to ECHO the hand-authored contract field
// list. That meant: (a) adding a column to the backing source required
// hand-editing the contract before the framework could see it, and (b)
// schema drift between two Levels was UNDETECTABLE — both sides echoed the
// same contract, so `driftReport` could never surface "a field exists in
// Airtable but not in Supabase."
//
// `introspectFields` DERIVES the live schema from the source's actual DATA:
//   • the set of fields = the UNION of keys actually present across the rows,
//   • each field's TYPE = inferred from the first non-null value seen,
//   • `optional` = true when at least one row omits the field,
//   • `array`    = true when the value is an ordered list.
//
// The contract is no longer the source of truth for `describe()` — the DATA
// is. The contract is consulted only to ENRICH an introspected field (carry a
// human `description`, and prefer a more-specific declared type — datetime /
// relation / json — when inference fell back to the generic "string"). When a
// source has NO rows to introspect, we fall back to the declared contract
// fields (you cannot introspect nothing) — the one documented exception.
// =====================================================================

import type { DataRow, FieldSchema, FieldType, ResourceContract } from "./types";

/** ISO-8601-ish date / datetime detector (e.g. 2026-06-25, 2026-06-25T09:48:40Z). */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Infer the canonical FieldType (+ array-ness) of a single value. */
export function inferFieldType(value: unknown): { type: FieldType; array: boolean } {
  if (Array.isArray(value)) {
    // Element type from the first non-null member; an empty/all-null array is a
    // string[] by default (the safest scalar). `array: true` preserves cardinality.
    const first = value.find((v) => v != null);
    return { type: inferScalarType(first), array: true };
  }
  return { type: inferScalarType(value), array: false };
}

function inferScalarType(value: unknown): FieldType {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
    case "bigint":
      return "number";
    case "string":
      return ISO_DATETIME.test(value) ? "datetime" : "string";
    case "object":
      // null is unknowable here (caller skips nulls); a real object is JSON.
      return value === null ? "string" : "json";
    default:
      return "string";
  }
}

/**
 * Derive a resource's live field schema from its actual DATA. Fields = the union
 * of keys across `rows`; types are inferred from values; `optional`/`array` come
 * from the data. The optional `contract` ENRICHES (description + a more-specific
 * declared type) but is NOT the source of truth. Empty `rows` ⇒ fall back to the
 * contract's declared fields (the one case introspection cannot derive).
 */
export function introspectFields(
  rows: readonly DataRow[],
  contract?: Pick<ResourceContract, "fields">,
): FieldSchema[] {
  if (rows.length === 0) {
    return (contract?.fields ?? []).map((f) => ({ ...f }));
  }

  const declared = new Map<string, FieldSchema>((contract?.fields ?? []).map((f) => [f.name, f]));

  // First-appearance order across rows (a stable, deterministic field order).
  const order: string[] = [];
  const stats = new Map<string, { present: number; inferred?: FieldType; array: boolean }>();
  for (const row of rows) {
    for (const name of Object.keys(row)) {
      let s = stats.get(name);
      if (!s) {
        s = { present: 0, array: false };
        stats.set(name, s);
        order.push(name);
      }
      s.present += 1;
      const v = row[name];
      // Lock the inferred type on the FIRST non-null value seen for the field.
      if (v != null && s.inferred === undefined) {
        const inf = inferFieldType(v);
        s.inferred = inf.type;
        s.array = inf.array;
      }
    }
  }

  const total = rows.length;
  return order.map((name) => {
    const s = stats.get(name)!;
    const d = declared.get(name);
    let type: FieldType = s.inferred ?? d?.type ?? "string";
    // Prefer a contract's MORE-SPECIFIC declared type when data inference fell to
    // the generic "string" (e.g. a relation id, or an ISO-less stored date) — so
    // a known semantic type survives introspection without spurious downgrades.
    if (d && type === "string" && d.type !== "string") type = d.type;

    const array = s.array || d?.array === true;
    const optional = s.present < total || d?.optional === true;

    // Build mutable, then widen to the readonly FieldSchema on return.
    const field: { -readonly [K in keyof FieldSchema]: FieldSchema[K] } = { name, type };
    if (array) field.array = true;
    if (optional) field.optional = true;
    if (d?.description) field.description = d.description;
    return field;
  });
}
