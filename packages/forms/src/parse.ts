import { getFieldType } from "./fields";
import { recallRefs } from "./recall";
import type { Condition, FormDefinition, Operand } from "./types";

export interface FormIssue {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; form: FormDefinition; warnings: FormIssue[] }
  | { ok: false; issues: FormIssue[]; warnings: FormIssue[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Check a definition before it is stored or rendered: structure, unique ids
 * and keys, known field types, references that resolve, operators that fit
 * the field type. Warnings flag things that work but are probably mistakes.
 */
export function parseForm(input: unknown): ParseResult {
  const issues: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  const fail = () => ({ ok: false as const, issues, warnings });

  if (!isObject(input)) {
    issues.push({ path: "", message: "A form definition must be an object." });
    return fail();
  }
  if (input.schemaVersion !== 1) {
    issues.push({ path: "schemaVersion", message: "Unsupported schemaVersion; expected 1." });
  }
  if (typeof input.id !== "string" || !input.id) issues.push({ path: "id", message: "Required." });
  if (typeof input.title !== "string") issues.push({ path: "title", message: "Required." });
  if (!Array.isArray(input.blocks)) {
    issues.push({ path: "blocks", message: "Must be an array." });
    return fail();
  }

  const def = input as unknown as FormDefinition;
  const ids = new Set<string>();
  const keys = new Map<string, string>();
  const fieldTypes = new Map<string, string>();
  const order = new Map<string, number>();

  def.blocks.forEach((block, i) => {
    const path = `blocks[${i}]`;
    if (!isObject(block) || typeof block.id !== "string" || !block.id) {
      issues.push({ path, message: "Every block needs a string id." });
      return;
    }
    if (ids.has(block.id)) issues.push({ path: `${path}.id`, message: `Duplicate id "${block.id}".` });
    ids.add(block.id);
    order.set(block.id, i);
    if (block.kind === "field") {
      if (!getFieldType(block.type)) {
        issues.push({ path: `${path}.type`, message: `Unknown field type "${block.type}".` });
      }
      if (keys.has(block.key)) issues.push({ path: `${path}.key`, message: `Duplicate key "${block.key}".` });
      keys.set(block.key, block.id);
      fieldTypes.set(block.id, block.type);
    } else if (block.kind !== "content" && block.kind !== "page-break") {
      issues.push({ path: `${path}.kind`, message: `Unknown block kind.` });
    }
  });

  const hiddenNames = new Set<string>();
  (def.hidden ?? []).forEach((h, i) => {
    if (!["url", "host", "server"].includes(h.source)) {
      issues.push({ path: `hidden[${i}].source`, message: "Must be url, host or server." });
    }
    if (!["string", "number", "boolean"].includes(h.type)) {
      issues.push({ path: `hidden[${i}].type`, message: "Must be string, number or boolean." });
    }
    hiddenNames.add(h.name);
  });

  const endingIds = new Set((def.endings ?? []).map((e) => e.id));

  const checkOperand = (o: Operand | undefined, path: string) => {
    if (!o) return;
    if ("field" in o && !fieldTypes.has(o.field)) issues.push({ path, message: `No field "${o.field}".` });
    if ("hidden" in o && !hiddenNames.has(o.hidden)) issues.push({ path, message: `No hidden input "${o.hidden}".` });
  };
  const checkCondition = (c: Condition, path: string) => {
    if ("all" in c) return c.all.forEach((x, i) => checkCondition(x, `${path}.all[${i}]`));
    if ("any" in c) return c.any.forEach((x, i) => checkCondition(x, `${path}.any[${i}]`));
    if ("not" in c) return checkCondition(c.not, `${path}.not`);
    checkOperand(c.left, `${path}.left`);
    checkOperand(c.right, `${path}.right`);
    if ("field" in c.left) {
      const manifest = getFieldType(fieldTypes.get(c.left.field) ?? "");
      if (manifest && !manifest.operators.includes(c.op)) {
        issues.push({ path: `${path}.op`, message: `"${c.op}" does not apply to a ${manifest.type} field.` });
      }
    }
  };

  const ruleIds = new Set<string>();
  (def.logic ?? []).forEach((rule, i) => {
    const path = `logic[${i}]`;
    if (ruleIds.has(rule.id)) issues.push({ path: `${path}.id`, message: `Duplicate rule id "${rule.id}".` });
    ruleIds.add(rule.id);
    checkCondition(rule.when, `${path}.when`);
    if (rule.effect === "jump") {
      if (!ids.has(rule.from)) issues.push({ path: `${path}.from`, message: `No block "${rule.from}".` });
      if (typeof rule.to === "object") {
        if (!endingIds.has(rule.to.ending)) issues.push({ path: `${path}.to`, message: `No ending "${rule.to.ending}".` });
      } else if (!ids.has(rule.to)) {
        issues.push({ path: `${path}.to`, message: `No block "${rule.to}".` });
      } else if ((order.get(rule.to) ?? 0) <= (order.get(rule.from) ?? 0)) {
        warnings.push({ path: `${path}.to`, message: "Jumps only go forward; this one is ignored." });
      }
    } else if (!ids.has(rule.target)) {
      issues.push({ path: `${path}.target`, message: `No block "${rule.target}".` });
    }
  });

  def.blocks.forEach((block, i) => {
    const texts =
      block.kind === "field" ? [block.label, block.description ?? ""] : block.kind === "content" ? [block.text] : [];
    for (const text of texts) {
      for (const ref of recallRefs(text)) {
        if (ref.kind === "hidden" && !hiddenNames.has(ref.name)) {
          issues.push({ path: `blocks[${i}]`, message: `Recalls unknown hidden input "${ref.name}".` });
        }
        if (ref.kind === "field") {
          const target = keys.get(ref.name);
          if (!target) issues.push({ path: `blocks[${i}]`, message: `Recalls unknown field "${ref.name}".` });
          else if ((order.get(target) ?? 0) >= i) {
            warnings.push({ path: `blocks[${i}]`, message: `Recalls "${ref.name}", which comes later.` });
          }
        }
      }
    }
  });

  return issues.length ? fail() : { ok: true, form: def, warnings };
}
