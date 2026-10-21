import { isEmptyValue } from "./fields";
import type { Block, Condition, FieldBlock, FormDefinition, Json, LogicRule, Operand } from "./types";

export interface EvalScope {
  values: Record<string, Json | undefined>;
  hidden: Record<string, Json | undefined>;
  fields: Map<string, FieldBlock>;
}

/** `record[key]` if it is the record's own property: `values.constructor` is not an answer. */
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function resolve(operand: Operand, scope: EvalScope): Json | undefined {
  if ("field" in operand) return own(scope.values, operand.field);
  if ("hidden" in operand) return own(scope.hidden, operand.hidden);
  return operand.value;
}

function deepEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

/**
 * Evaluate a condition. Never throws. An empty value (unanswered, `null`,
 * blank text, an empty list: see `isEmptyValue`) is unanswered: it fails
 * every comparison, including `eq`, `in` and `contains`, and passes `neq`.
 */
export function evaluate(condition: Condition, scope: EvalScope): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluate(c, scope));
  if ("any" in condition) return condition.any.some((c) => evaluate(c, scope));
  if ("not" in condition) return !evaluate(condition.not, scope);

  const left = resolve(condition.left, scope);
  const right = condition.right ? resolve(condition.right, scope) : undefined;
  const field = "field" in condition.left ? scope.fields.get(condition.left.field) : undefined;
  const unanswered = isEmptyValue(left, field);

  switch (condition.op) {
    case "answered":
      return !unanswered;
    case "empty":
      return unanswered;
    case "eq":
      return !unanswered && deepEqual(left, right);
    case "neq":
      // An unanswered field is "not" any value.
      return unanswered || !deepEqual(left, right);
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
      return !unanswered && Array.isArray(right) && right.some((r) => deepEqual(r, left));
    case "contains":
      if (unanswered) return false;
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

function visibilityRules(def: FormDefinition, blockId: string) {
  return (def.logic ?? []).filter(
    (r): r is Extract<LogicRule, { target: string }> =>
      (r.effect === "show" || r.effect === "hide") && r.target === blockId,
  );
}

/** Show/hide rules against a scope as given. A matching `hide` wins; any `show` must match. */
function rulesAllow(def: FormDefinition, blockId: string, scope: EvalScope): boolean {
  const rules = visibilityRules(def, blockId);
  if (rules.some((r) => r.effect === "hide" && evaluate(r.when, scope))) return false;
  const shows = rules.filter((r) => r.effect === "show");
  return shows.length === 0 || shows.some((r) => evaluate(r.when, scope));
}

export interface PathResult {
  /** Block ids the respondent will step through, given the answers on the path. */
  path: string[];
  /** The ending reached by a jump, or the default ending. */
  ending: string | null;
}

export interface PathWalk extends PathResult {
  /**
   * The scope logic sees at a block: the values of the fields on the path
   * before it (and of the block itself, with `inclusive`), nothing else.
   */
  scopeAt(blockId: string, inclusive?: boolean): EvalScope;
}

/** One forward pass over the blocks. See `computePath`. */
export function walkPath(def: FormDefinition, scope: EvalScope): PathWalk {
  const list = steps(def);
  const index = new Map(list.map((b, i) => [b.id, i]));
  const position = new Map(def.blocks.map((b, i) => [b.id, i]));
  const jumps = (def.logic ?? []).filter(
    (r): r is Extract<LogicRule, { effect: "jump" }> => r.effect === "jump",
  );
  const defaultEnding = def.endings?.find((e) => e.id === "default")?.id ?? def.endings?.[0]?.id ?? null;

  // Values of the fields placed on the path so far. It only grows, so every
  // decision reads blocks already placed and the pass needs no fixed point.
  const placed = Object.create(null) as Record<string, Json | undefined>;
  const local: EvalScope = { values: placed, hidden: scope.hidden, fields: scope.fields };
  const path: string[] = [];
  const nextVisible = (from: number) => {
    for (let i = from; i < list.length; i++) if (rulesAllow(def, list[i]!.id, local)) return i;
    return list.length;
  };

  let ending = defaultEnding;
  let i = nextVisible(0);
  while (i < list.length) {
    const block = list[i]!;
    path.push(block.id);
    if (block.kind === "field") placed[block.id] = own(scope.values, block.id);
    const jump = jumps.find((r) => r.from === block.id && evaluate(r.when, local));
    if (jump) {
      if (typeof jump.to === "object") {
        ending = jump.to.ending;
        break;
      }
      const target = index.get(jump.to);
      if (target !== undefined && target > i) {
        i = nextVisible(target);
        continue;
      }
    }
    i = nextVisible(i + 1);
  }

  const scopeAt = (blockId: string, inclusive = false): EvalScope => {
    const at = position.get(blockId) ?? -1;
    const values = Object.create(null) as Record<string, Json | undefined>;
    for (const id of path) {
      const p = position.get(id)!;
      if (p > at || (p === at && !inclusive)) break;
      if (id in placed) values[id] = placed[id];
    }
    return { values, hidden: scope.hidden, fields: scope.fields };
  };
  return { path, ending, scopeAt };
}

/**
 * The respondent's path, derived from the answers on the path, so the client,
 * the server and a replay always agree. It is built in one forward pass: a
 * block's show/hide rules, and the jumps from it, see only the fields already
 * on the path before it (and, for a jump, the block itself). A field that is
 * hidden, jumped over or later in the form reads as unanswered, whatever
 * value it holds.
 *
 * A block jumped over is off the path and counts as hidden: it is not
 * validated and its value is cleared on submit. A jump never revisits a block;
 * a jump to an earlier block is ignored (the checker in `parseForm` reports it).
 */
export function computePath(def: FormDefinition, scope: EvalScope): PathResult {
  const { path, ending } = walkPath(def, scope);
  return { path, ending };
}

/**
 * Whether a block's show/hide rules let it be shown, ignoring jumps. The rules
 * read the answers on the path before the block, as in `computePath`. A block
 * with any `show` rule is hidden until one matches; a matching `hide` rule
 * always wins.
 */
export function ruleVisible(def: FormDefinition, blockId: string, scope: EvalScope): boolean {
  return rulesAllow(def, blockId, walkPath(def, scope).scopeAt(blockId));
}

export function fieldMap(def: FormDefinition): Map<string, FieldBlock> {
  const map = new Map<string, FieldBlock>();
  for (const block of def.blocks) if (block.kind === "field") map.set(block.id, block);
  return map;
}
