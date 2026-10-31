// Per-table and per-column settings kept in Postgres comments:
//
//   comment on table public.customers is
//     'Customers of the business. @genesis {"label": "Customers", "labelField": "name"}';
//   comment on column public.customers.notes is
//     'Private to staff. @genesis {"label": "Internal notes", "widget": "textarea"}';
//
// The text before `@genesis` stays the description. Settings are a generator
// input only: the checked-in contract is what the app reviews and ships.

import type { FieldSettings, IntrospectedTable, TableSettings } from "./model.js";

const MARKER = "@genesis";
// Each setting and the JSON type it takes.
// `key` is a column name or a list of them: a view's key, which the catalog can't see once it joins.
const TABLE_KEYS = { label: "string", labelField: "string", description: "string", noun: "string", nounPlural: "string", key: "key" } as const;
const FIELD_KEYS = { label: "string", description: "string", widget: "string", readonly: "boolean", sensitive: "boolean" } as const;
type Kinds = Record<string, "string" | "boolean" | "key">;

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
  const settings: Record<string, string | boolean | string[]> = {};
  for (const [key, v] of Object.entries(value)) {
    const kind = keys[key];
    if (!kind) {
      throw new CommentSettingsError(`${where}: unknown ${MARKER} setting "${key}". Allowed: ${Object.keys(keys).join(", ")}.`);
    }
    if (kind === "key") {
      const list = typeof v === "string" ? [v] : v;
      if (!Array.isArray(list) || list.length === 0 || !list.every((c) => typeof c === "string" && c !== "")) {
        throw new CommentSettingsError(`${where}: ${MARKER} "${key}" must be a column name or a list of them.`);
      }
      const twice = (list as string[]).find((c, i) => (list as string[]).indexOf(c) !== i);
      if (twice) throw new CommentSettingsError(`${where}: ${MARKER} "${key}" names "${twice}" twice.`);
      settings[key] = list as string[];
      continue;
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

/**
 * A table or view whose comment names its key (`@genesis {"key": "id"}`) takes that key: the way to
 * key a read-only view that joins tables, which the catalog gives none. The setting wins over the
 * catalog's key, and every column it names must be one of the relation's. One that differs from a
 * primary key the catalog has is passed to `warn`: usually a mistake, but the comment is explicit.
 */
export function withKeySetting(table: IntrospectedTable, warn?: (message: string) => void): IntrospectedTable {
  const key = table.settings?.key;
  if (!key) return table;
  const columns = new Set(table.columns.map((c) => c.name));
  const missing = key.filter((k) => !columns.has(k));
  if (missing.length) throw new CommentSettingsError(`${table.name}: ${MARKER} key "${missing.join('", "')}" isn't one of its columns.`);
  if (table.key.length && table.key.join("\0") !== key.join("\0")) {
    warn?.(`${table.name}: ${MARKER} key (${key.join(", ")}) differs from its primary key (${table.key.join(", ")}); the comment's key is used.`);
  }
  return { ...table, key: [...key] };
}
