import { isEmptyValue } from "./fields";
import type { Block, Condition, FieldBlock, FormDefinition, Json, Operand } from "./types";

export interface EvalScope {
  values: Record<string, Json | undefined>;
  hidden: Record<string, Json | undefined>;
  fields: Map<string, FieldBlock>;
}

function resolve(operand: Operand, scope: EvalScope): Json | undefined {
  if ("field" in operand) return scope.values[operand.field];
  if ("hidden" in operand) return scope.hidden[operand.hidden];
  return operand.value;
}

function deepEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

/** Evaluate a condition. Never throws: unanswered values fail comparisons, and pass `neq`. */
export function evaluate(condition: Condition, scope: EvalScope): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluate(c, scope));
  if ("any" in condition) return condition.any.some((c) => evaluate(c, scope));
  if ("not" in condition) return !evaluate(condition.not, scope);

  const left = resolve(condition.left, scope);
  const right = condition.right ? resolve(condition.right, scope) : undefined;
  const field = "field" in condition.left ? scope.fields.get(condition.left.field) : undefined;

  switch (condition.op) {
    case "answered":
      return !isEmptyValue(left, field);
    case "empty":
      return isEmptyValue(left, field);
    case "eq":
      return left !== undefined && deepEqual(left, right);
    case "neq":
      // An unanswered field is "not" any value.
      return !deepEqual(left, right);
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (typeof left !== "number" || typeof right !== "number") return false;
      if (condition.op === "lt") return left < right;
      if (condition.op === "lte") return left <= right;
      if (condition.op === "gt") return left > right;
      return left >= right;
    }
    case "in":
      return Array.isArray(right) && right.some((r) => deepEqual(r, left));
    case "contains":
      if (Array.isArray(left)) return left.some((l) => deepEqual(l, right));
      return (
        typeof left === "string" &&
        typeof right === "string" &&
        left.toLowerCase().includes(right.toLowerCase())
      );
  }
}

/** Blocks a respondent steps through: fields and content, in order. */
export function steps(def: FormDefinition): Block[] {
  return def.blocks.filter((b) => b.kind !== "page-break");
}

/**
 * Visibility from show/hide rules alone. A block with any `show` rule is
 * hidden until one matches; a matching `hide` rule always wins.
 */
export function ruleVisible(def: FormDefinition, blockId: string, scope: EvalScope): boolean {
  const rules = (def.logic ?? []).filter(
    (r): r is Extract<typeof r, { target: string }> =>
      (r.effect === "show" || r.effect === "hide") && r.target === blockId,
  );
  if (rules.some((r) => r.effect === "hide" && evaluate(r.when, scope))) return false;
  const shows = rules.filter((r) => r.effect === "show");
  return shows.length === 0 || shows.some((r) => evaluate(r.when, scope));
}

export interface PathResult {
  /** Block ids the respondent will step through, given the answers so far. */
  path: string[];
  /** The ending reached by a jump, or the default ending. */
  ending: string | null;
}

/**
 * The respondent's path, derived only from answers, so the client, the
 * server and a replay always agree. A block jumped over is off the path and
 * counts as hidden: it is not validated and its value is cleared on submit.
 * A jump never revisits a block; a jump to an earlier block is ignored (the
 * checker in `parseForm` reports it).
 */
export function computePath(def: FormDefinition, scope: EvalScope): PathResult {
  const list = steps(def);
  const index = new Map(list.map((b, i) => [b.id, i]));
  const jumps = (def.logic ?? []).filter(
    (r): r is Extract<typeof r, { effect: "jump" }> => r.effect === "jump",
  );
  const defaultEnding = def.endings?.find((e) => e.id === "default")?.id ?? def.endings?.[0]?.id ?? null;

  const nextVisible = (from: number) => {
    for (let i = from; i < list.length; i++) {
      if (ruleVisible(def, list[i]!.id, scope)) return i;
    }
    return list.length;
  };

  const path: string[] = [];
  let i = nextVisible(0);
  while (i < list.length) {
    const block = list[i]!;
    path.push(block.id);
    const jump = jumps.find((r) => r.from === block.id && evaluate(r.when, scope));
    if (jump) {
      if (typeof jump.to === "object") return { path, ending: jump.to.ending };
      const target = index.get(jump.to);
      if (target !== undefined && target > i) {
        i = ruleVisible(def, jump.to, scope) ? target : nextVisible(target);
        continue;
      }
    }
    i = nextVisible(i + 1);
  }
  return { path, ending: defaultEnding };
}

export function fieldMap(def: FormDefinition): Map<string, FieldBlock> {
  const map = new Map<string, FieldBlock>();
  for (const block of def.blocks) if (block.kind === "field") map.set(block.id, block);
  return map;
}
