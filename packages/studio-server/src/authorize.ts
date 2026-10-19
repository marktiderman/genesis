import type { Authorize } from "./options";

export interface ResourceRule {
  /** `true` for every column, or `{ except }` to keep some columns from ever being sent. */
  read?: true | { except: readonly string[] };
  /** `true` for every column the database lets them update, or just these columns. */
  update?: true | readonly string[];
}

/**
 * The common case of `authorize`: a fixed allow-list by `schema.table`.
 * Anything not listed is denied, and a listed table without `update` is
 * read-only. For rules that depend on who is asking, write `authorize`
 * yourself — it receives the verified claims.
 *
 * @example
 * byResource({
 *   "public.clients": { read: true, update: ["notes", "status"] },
 *   "public.quiz_questions": { read: { except: ["answer_key"] } },
 * })
 */
export function byResource(rules: Readonly<Record<string, ResourceRule>>): Authorize {
  return ({ resource, action }) => {
    const rule = Object.prototype.hasOwnProperty.call(rules, resource) ? rules[resource] : undefined;
    if (!rule) return false;
    if (action === "read") {
      if (!rule.read) return false;
      return rule.read === true ? true : { allow: true, exceptColumns: rule.read.except };
    }
    if (!rule.update) return false;
    return rule.update === true ? true : { allow: true, columns: rule.update };
  };
}
