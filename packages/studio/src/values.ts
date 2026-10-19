// How a stored value is shown, edited, and sent back. Postgres parses what
// comes back (the handler casts every value to the column's type), so the
// studio only decides what text the user sees and what "empty" means.

import type { FieldSchema } from "@marktiderman/genesis-core/schema";

/** The text a cell starts editing from. JSON is edited as JSON text. */
export function editText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The text a cell shows, or `null` for an empty cell. */
export function displayText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return editText(value);
}

/**
 * The value to save for what the user typed. An emptied cell becomes `null`
 * when the field accepts null, and the empty string otherwise.
 */
export function parseDraft(field: FieldSchema, draft: string): unknown {
  if (draft === "" && field.nullable) return null;
  return draft;
}

/** The choices for a select-style cell, or `undefined` for free text. */
export function choicesFor(field: FieldSchema): string[] | undefined {
  if (field.enumValues) return [...field.enumValues];
  if (field.type === "boolean") return ["true", "false"];
  return undefined;
}
