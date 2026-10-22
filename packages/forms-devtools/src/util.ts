import { isFormEvent, isSensitive, type FormDefinition, type FormEvent } from "@marktiderman/genesis-forms";

export { isFormEvent, isSensitive };

// ── Sensitive fields ─────────────────────────────────────────────────────────

/** Ids of the sensitive fields in a definition. */
export const sensitiveIds = (definition: FormDefinition): Set<string> =>
  new Set(definition.blocks.filter((b) => b.kind === "field" && isSensitive(b)).map((b) => b.id));

/** Names of the hidden inputs marked `sensitive`. */
export const sensitiveHiddenNames = (definition: FormDefinition): Set<string> =>
  new Set((definition.hidden ?? []).filter((h) => h.sensitive === true).map((h) => h.name));

/** What the inspector shows in place of a sensitive value. */
export const SENSITIVE_MASK = "•••• (sensitive)";

/** Replace the values of sensitive ids in a record keyed by field id. */
export function maskRecord<T>(record: Record<string, T>, sensitive: Set<string>): Record<string, T | string> {
  if (!sensitive.size) return record;
  return Object.fromEntries(
    Object.entries(record).map(([id, v]) => [id, sensitive.has(id) && v !== undefined && v !== null ? SENSITIVE_MASK : v]),
  );
}

// ── Hostile values ───────────────────────────────────────────────────────────

/** Share links and the frame protocol reject values nested deeper than this. */
export const MAX_VALUE_DEPTH = 32;

/**
 * True when `value` nests arrays or objects deeper than `limit`. Iterative, so
 * a hostile 200,000-deep value cannot blow the stack while it is checked.
 */
export function exceedsDepth(value: unknown, limit = MAX_VALUE_DEPTH): boolean {
  const stack: Array<[unknown, number]> = [[value, 0]];
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (!v || typeof v !== "object") continue;
    if (depth + 1 > limit) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) {
      if (child && typeof child === "object") stack.push([child, depth + 1]);
    }
  }
  return false;
}

/** Structural equality for two events, used to tell whether a log still extends another. */
export function sameEvent(a: FormEvent, b: FormEvent): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;
  if (a.type !== "answer" || b.type !== "answer") return true;
  if (a.field !== b.field) return false;
  if (a.value === b.value) return true;
  try {
    return JSON.stringify(a.value) === JSON.stringify(b.value);
  } catch {
    return false;
  }
}

export const isPrefix = (prefix: FormEvent[], log: FormEvent[]) =>
  prefix.length <= log.length && prefix.every((e, i) => sameEvent(e, log[i]!));
