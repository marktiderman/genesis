// Following links between resources: labels for foreign-key cells (batched,
// one query per linked resource per page) and the target's schema.

import { useQueries, useQuery } from "@tanstack/react-query";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import { keyFields, type FieldSchema, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { displayText } from "../values";

export function useSchema(provider: DataProvider, sessionKey: unknown, resource: string | undefined) {
  return useQuery({
    queryKey: ["genesis-studio", sessionKey, "describe", resource],
    enabled: Boolean(resource && provider.describe),
    retry: false,
    queryFn: () => provider.describe!(resource!),
  });
}

/** The single key field of a resource, or null for a composite key. */
export function singleKey(schema: ResourceSchema | undefined): string | null {
  if (!schema) return null;
  const fields = keyFields(schema);
  return fields.length === 1 ? fields[0]! : null;
}

/**
 * Labels for every link field on a page of rows: field → (id → the target
 * row's `labelField`). One query per linked resource, never one per cell.
 * Ids the user can't see stay unlabelled.
 */
export function usePageLinkLabels(
  provider: DataProvider,
  sessionKey: unknown,
  fields: readonly FieldSchema[],
  rows: readonly Record<string, unknown>[],
): Map<string, Map<string, string>> {
  const links = fields.filter((f) => f.references);
  const schemas = useQueries({
    queries: links.map((f) => ({
      queryKey: ["genesis-studio", sessionKey, "describe", f.references!.resource],
      enabled: Boolean(provider.describe),
      retry: false,
      queryFn: () => provider.describe!(f.references!.resource),
    })),
  });
  const labels = useQueries({
    queries: links.map((f, i) => {
      const ids = [...new Set(rows.map((r) => r[f.name]).filter((v) => v !== null && v !== undefined).map(String))].sort();
      const labelField = schemas[i]?.data?.labelField;
      return {
        queryKey: ["genesis-studio", sessionKey, "labels", f.references!.resource, f.references!.field, ids],
        enabled: Boolean(schemas[i]?.data && ids.length),
        staleTime: 60_000,
        retry: false,
        queryFn: async () => {
          const result = await provider.getList<BaseRecord>(f.references!.resource, {
            pagination: { page: 1, perPage: Math.min(200, ids.length) },
            filters: [{ field: f.references!.field, operator: "in" as const, value: ids }],
          });
          return new Map(
            (result.data as Record<string, unknown>[]).map((row) => [
              String(row[f.references!.field]),
              displayText(row[labelField ?? f.references!.field]) ?? String(row[f.references!.field]),
            ]),
          );
        },
      };
    }),
  });
  const out = new Map<string, Map<string, string>>();
  links.forEach((f, i) => out.set(f.name, labels[i]?.data ?? new Map()));
  return out;
}
