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
// Each setting and the JSON type it takes.
const TABLE_KEYS = { label: "string", labelField: "string", description: "string", noun: "string", nounPlural: "string" } as const;
const FIELD_KEYS = { label: "string", description: "string", widget: "string", readonly: "boolean", sensitive: "boolean" } as const;
type Kinds = Record<string, "string" | "boolean">;

export interface ParsedComment<S> {
  description?: string;
  settings?: S;
}

/** Thrown for a malformed `@genesis` block, naming where it is. */
export class CommentSettingsError extends Error {}

function parse<S>(
  comment: string | null | undefined,
  keys: Kinds,
  where: string,
): ParsedComment<S> {
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
  const settings: Record<string, string | boolean> = {};
  for (const [key, v] of Object.entries(value)) {
    const kind = keys[key];
    if (!kind) {
      throw new CommentSettingsError(`${where}: unknown ${MARKER} setting "${key}". Allowed: ${Object.keys(keys).join(", ")}.`);
    }
    if (typeof v !== kind) throw new CommentSettingsError(`${where}: ${MARKER} "${key}" must be a ${kind}.`);
    settings[key] = v as string | boolean;
  }
  return {
    ...(description ? { description } : {}),
    ...(Object.keys(settings).length ? { settings: settings as S } : {}),
  };
}

export function parseTableComment(comment: string | null | undefined, table: string): ParsedComment<TableSettings> {
  return parse(comment, TABLE_KEYS, table);
}

export function parseColumnComment(comment: string | null | undefined, column: string): ParsedComment<FieldSettings> {
  return parse(comment, FIELD_KEYS, column);
}
