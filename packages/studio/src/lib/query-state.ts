// The list's search, sorts, filters and grouping, read from and written to
// the URL so every view is a link.

import type { FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import type { FieldSchema, FilterOperator } from "@marktiderman/genesis-core/schema";

export function parseSorts(sort: string | undefined): SortParam[] {
  if (!sort) return [];
  return sort
    .split(",")
    .map((part) => {
      const at = part.lastIndexOf(":");
      const field = at > 0 ? part.slice(0, at) : part;
      return { field, order: part.slice(at + 1) === "desc" ? ("desc" as const) : ("asc" as const) };
    })
    .filter((s) => s.field);
}

export function formatSorts(sorts: SortParam[]): string | undefined {
  return sorts.length ? sorts.map((s) => `${s.field}:${s.order}`).join(",") : undefined;
}

type Encoded = [string, FilterOperator, unknown?];

export function parseFilters(raw: string | undefined): FilterParam[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Encoded[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((f) => Array.isArray(f) && typeof f[0] === "string" && typeof f[1] === "string")
      .map(([field, operator, value]) =>
        operator === "is_null" || operator === "is_not_null"
          ? ({ field, operator } as FilterParam)
          : ({ field, operator, value } as FilterParam),
      );
  } catch {
    return [];
  }
}

export function formatFilters(filters: FilterParam[]): string | undefined {
  if (!filters.length) return undefined;
  return JSON.stringify(filters.map((f) => ("value" in f ? [f.field, f.operator, f.value] : [f.field, f.operator])));
}

/** Operators that make sense for a field, by its storage type. */
export function operatorsFor(field: FieldSchema): FilterOperator[] {
  if (field.array) return ["is_null", "is_not_null"];
  if (field.enumValues || field.type === "boolean") return ["eq", "neq", "is_null", "is_not_null"];
  if (field.type === "number" || field.type === "datetime") {
    return ["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "is_not_null"];
  }
  if (field.type === "json") return ["contains", "is_null", "is_not_null"];
  return ["contains", "eq", "neq", "is_null", "is_not_null"];
}

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is after / more than",
  gte: "is on or after / at least",
  lt: "is before / less than",
  lte: "is on or before / at most",
  contains: "contains",
  in: "is any of",
  between: "is between",
  is_null: "is empty",
  is_not_null: "is not empty",
};

export function needsValue(operator: FilterOperator): boolean {
  return operator !== "is_null" && operator !== "is_not_null";
}
