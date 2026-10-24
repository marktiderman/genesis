import type { FormDefinition, Json } from "./types";

/**
 * Answers given to one version of a form, as answers to another (by field id), matched
 * by field key: what an edit link prefills when the form has a newer version. Answers
 * to fields the other version doesn't have are dropped; `extra` (by key) fills fields
 * the stored answers leave out, such as contact details kept apart.
 */
export function carryAnswers(
  from: FormDefinition,
  to: FormDefinition,
  answers: Record<string, Json>,
  extra: Record<string, Json | null | undefined> = {},
): Record<string, Json> {
  const byKey = new Map<string, Json>();
  for (const block of from.blocks) {
    if (block.kind === "field" && answers[block.id] !== undefined) byKey.set(block.key, answers[block.id]!);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined && !byKey.has(key)) byKey.set(key, value);
  }
  const out: Record<string, Json> = {};
  for (const block of to.blocks) {
    if (block.kind === "field" && byKey.has(block.key)) out[block.id] = byKey.get(block.key)!;
  }
  return out;
}
