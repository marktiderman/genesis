// Per-table and per-column settings kept in Postgres comments:
//
//   comment on table public.customers is
//     'Customers of the business. @genesis {"label": "Customers", "labelField": "name"}';
//   comment on column public.customers.notes is
//     'Private to staff. @genesis {"label": "Internal notes", "widget": "textarea"}';
//
// The text before `@genesis` stays the description. Settings are a generator
// input only: the checked-in contract is what the app reviews and ships.

import type { FieldSettings, TableSettings } from "./model.js";

const MARKER = "@genesis";
const TABLE_KEYS = ["label", "labelField", "description"] as const;
const FIELD_KEYS = ["label", "description", "widget"] as const;

export interface ParsedComment<S> {
  description?: string;
  settings?: S;
}

/** Thrown for a malformed `@genesis` block, naming where it is. */
export class CommentSettingsError extends Error {}

function parse<K extends string>(
  comment: string | null | undefined,
  keys: readonly K[],
  where: string,
): ParsedComment<Partial<Record<K, string>>> {
  if (!comment) return {};
  const at = comment.indexOf(MARKER);
  if (at < 0) return { description: comment.trim() || undefined };
  const description = comment.slice(0, at).trim() || undefined;
  const raw = comment.slice(at + MARKER.length).trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CommentSettingsError(`${where}: the text after ${MARKER} must be one JSON object.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommentSettingsError(`${where}: the text after ${MARKER} must be one JSON object.`);
  }
  const settings: Partial<Record<K, string>> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!(keys as readonly string[]).includes(key)) {
      throw new CommentSettingsError(`${where}: unknown ${MARKER} setting "${key}". Allowed: ${keys.join(", ")}.`);
    }
    if (typeof v !== "string") throw new CommentSettingsError(`${where}: ${MARKER} "${key}" must be a string.`);
    settings[key as K] = v;
  }
  return { ...(description ? { description } : {}), ...(Object.keys(settings).length ? { settings } : {}) };
}

export function parseTableComment(comment: string | null | undefined, table: string): ParsedComment<TableSettings> {
  return parse(comment, TABLE_KEYS, table);
}

export function parseColumnComment(comment: string | null | undefined, column: string): ParsedComment<FieldSettings> {
  return parse(comment, FIELD_KEYS, column);
}
