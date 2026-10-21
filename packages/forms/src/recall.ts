import { summarizeValue } from "./fields";
import type { FieldBlock, Json } from "./types";

const TOKEN = /\{\{\s*(field|hidden):([A-Za-z0-9_-]+)\s*(?:\|([^}]*))?\}\}/g;

export interface RecallScope {
  /** Fields by key. */
  fieldsByKey: Map<string, FieldBlock>;
  values: Record<string, Json | undefined>;
  hidden: Record<string, Json | undefined>;
}

/**
 * Replace `{{field:key|fallback}}` and `{{hidden:name|fallback}}` tokens.
 * An unanswered value renders its fallback (default empty); the text is
 * never dropped.
 */
export function recall(text: string, scope: RecallScope): string {
  return text.replace(TOKEN, (_match, kind: string, name: string, fallback?: string) => {
    if (kind === "field") {
      const field = scope.fieldsByKey.get(name);
      const out = field ? summarizeValue(scope.values[field.id], field) : "";
      return out || (fallback ?? "").trim();
    }
    const value = scope.hidden[name];
    const out = value === undefined || value === null ? "" : String(value);
    return out || (fallback ?? "").trim();
  });
}

/** The keys a text recalls, for the checker. */
export function recallRefs(text: string): { kind: "field" | "hidden"; name: string }[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ kind: m[1] as "field" | "hidden", name: m[2]! }));
}
