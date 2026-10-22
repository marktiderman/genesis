/**
 * "Why is this hidden?" A structured trace of one block's visibility, for
 * devtools and tests. Pure: it reads a definition and values, never an engine's
 * internals, so it explains a stored response as well as a live one.
 */
import type { FormEngine } from "./engine";
import { choiceOptions, isEmptyValue } from "./fields";
import { evaluate, fieldMap, own, ruleVisible, steps, walkPath, withheld, type EvalScope, type PathWalk } from "./logic";
import type { Condition, FieldBlock, FormDefinition, Json, LogicRule, Operand } from "./types";
import { validateField, type FieldValidator } from "./validate";

export interface ExplainInput {
  definition: FormDefinition;
  values: Record<string, Json | undefined>;
  hidden?: Record<string, Json | undefined>;
}

export interface RuleTrace {
  ruleId: string;
  effect: "show" | "hide";
  /** The rule's condition, evaluated against the current values. */
  matched: boolean;
  /** "Hidden because contact_me is not Yes." */
  sentence: string;
}

export interface JumpTrace {
  ruleId: string;
  /** Block id the jump fired from. */
  from: string;
  to: string | { ending: string };
  sentence: string;
}

export interface FieldValidation {
  /** `not-checked`: the field is hidden, so it is neither validated nor stored. */
  status: "valid" | "invalid" | "unanswered" | "not-checked";
  message?: string;
}

export interface Explanation {
  blockId: string;
  /** The field key, or the block id for content. */
  key: string;
  kind: "field" | "content" | "page-break";
  /** On the respondent's path given the answers so far. */
  onPath: boolean;
  /** Visible by show/hide rules alone (ignoring jumps). */
  ruleVisible: boolean;
  /** What the respondent sees: on the path and rule-visible. */
  visible: boolean;
  /** The jump that carried the path past this block, if any. */
  skippedBy?: JumpTrace;
  /** Every show/hide rule targeting this block, in definition order. */
  rules: RuleTrace[];
  /** Fields only. */
  validation?: FieldValidation;
  /** One plain-English line: the main reason. */
  summary: string;
}

export interface ExplainOptions {
  validators?: Record<string, FieldValidator>;
}

type JumpRule = Extract<LogicRule, { effect: "jump" }>;
type VisibilityRule = Extract<LogicRule, { target: string }>;

/** Explain a block's visibility. `blockId` may also be a field key. */
export function explain(
  source: FormEngine | ExplainInput,
  blockId: string,
  options: ExplainOptions = {},
): Explanation {
  const input: ExplainInput =
    "getState" in source
      ? { definition: source.definition, values: source.getState().values, hidden: source.getState().hidden }
      : source;
  const def = input.definition;
  const fields = fieldMap(def);
  const scope: EvalScope = { values: input.values, hidden: input.hidden ?? {}, fields };

  const block =
    def.blocks.find((b) => b.id === blockId) ??
    def.blocks.find((b) => b.kind === "field" && b.key === blockId);
  if (!block) throw new Error(`explain: no block "${blockId}".`);
  const id = block.id;
  const nameOf = (bid: string) => {
    const b = def.blocks.find((x) => x.id === bid);
    return b?.kind === "field" ? b.key : bid;
  };
  const key = nameOf(id);
  // Logic reads only the answers on the path before a block.
  const walk = walkPath(def, scope);
  const at = walk.scopeAt(id);

  const rules: RuleTrace[] = (def.logic ?? [])
    .filter((r): r is VisibilityRule => (r.effect === "show" || r.effect === "hide") && r.target === id)
    .map((r) => {
      const matched = evaluate(r.when, at);
      const cond = describeCondition(r.when, def, fields);
      const sentence =
        r.effect === "hide"
          ? matched
            ? `Hidden because ${cond}.`
            : `Would be hidden if ${cond}.`
          : matched
            ? `Shown because ${cond}.`
            : `Hidden until ${cond}.`;
      return { ruleId: r.id, effect: r.effect, matched, sentence };
    });

  const { path } = walk;
  const onPath = path.includes(id);
  const visibleByRules = ruleVisible(def, id, scope);
  const skippedBy = onPath ? undefined : findSkippingJump(def, walk, id, nameOf);
  const visible = onPath && visibleByRules;

  let validation: FieldValidation | undefined;
  if (block.kind === "field") {
    const value = own(input.values, id);
    if (!visible) validation = { status: "not-checked" };
    else {
      const message = validateField(block, value, { custom: options.validators?.[id] });
      if (message) validation = { status: "invalid", message };
      else validation = { status: isEmptyValue(value, block) ? "unanswered" : "valid" };
    }
  }

  let summary: string;
  if (block.kind === "page-break") summary = "Page breaks are never on the path; they only group blocks into pages.";
  else if (visible) summary = rules.find((r) => r.effect === "show" && r.matched)?.sentence ?? "Visible: no rule hides it.";
  else if (block.kind === "field" && withheld(def, block)) {
    summary = "Not asked: the form is anonymous and this field identifies the respondent.";
  } else if (!visibleByRules) {
    summary =
      rules.find((r) => r.effect === "hide" && r.matched)?.sentence ??
      rules.find((r) => r.effect === "show")?.sentence ??
      "Hidden by logic.";
  } else if (skippedBy) summary = skippedBy.sentence;
  else summary = "Not on the path.";

  return {
    blockId: id,
    key,
    kind: block.kind,
    onPath,
    ruleVisible: visibleByRules,
    visible,
    ...(skippedBy ? { skippedBy } : {}),
    rules,
    ...(validation ? { validation } : {}),
    summary,
  };
}

/** The effective jump on the path that passes over `id`, mirroring `computePath`. */
function findSkippingJump(
  def: FormDefinition,
  walk: PathWalk,
  id: string,
  nameOf: (id: string) => string,
): JumpTrace | undefined {
  const list = steps(def);
  const index = new Map(list.map((b, i) => [b.id, i]));
  const at = index.get(id);
  if (at === undefined) return undefined;
  const jumps = (def.logic ?? []).filter((r): r is JumpRule => r.effect === "jump");
  for (const from of walk.path) {
    const i = index.get(from)!;
    if (i >= at) break;
    const scope = walk.scopeAt(from, true);
    const jump = jumps.find((r) => r.from === from && evaluate(r.when, scope));
    if (!jump) continue;
    const cond = describeCondition(jump.when, def, fieldMap(def));
    if (typeof jump.to === "object") {
      return {
        ruleId: jump.id,
        from,
        to: jump.to,
        sentence: `Skipped: ${nameOf(from)} jumps to the "${jump.to.ending}" ending because ${cond}.`,
      };
    }
    const target = index.get(jump.to);
    if (target !== undefined && target > i && at < target) {
      return {
        ruleId: jump.id,
        from,
        to: jump.to,
        sentence: `Skipped: ${nameOf(from)} jumps to ${nameOf(jump.to)} because ${cond}.`,
      };
    }
  }
  return undefined;
}

const OPS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  in: "is one of",
  contains: "includes",
  answered: "is answered",
  empty: "is unanswered",
};

function describeValue(value: Json | undefined, field?: FieldBlock): string {
  if (value === undefined || value === null) return "nothing";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const label = field ? choiceOptions(field).find((o) => o.value === value)?.label : undefined;
    return `"${label ?? value}"`;
  }
  if (Array.isArray(value)) return value.map((v) => describeValue(v, field)).join(", ");
  return JSON.stringify(value);
}

function describeOperand(operand: Operand, def: FormDefinition, fields: Map<string, FieldBlock>): string {
  if ("field" in operand) return fields.get(operand.field)?.key ?? operand.field;
  if ("hidden" in operand) return `the ${operand.hidden} input`;
  return describeValue(operand.value);
}

/** A condition as a plain-English clause: `contact_me is not Yes`. */
export function describeCondition(
  condition: Condition,
  def: FormDefinition,
  fields: Map<string, FieldBlock> = fieldMap(def),
): string {
  const group = (c: Condition) => {
    const text = describeCondition(c, def, fields);
    return "all" in c || "any" in c ? `(${text})` : text;
  };
  if ("all" in condition) return condition.all.map(group).join(" and ");
  if ("any" in condition) return condition.any.map(group).join(" or ");
  if ("not" in condition) return `it is not the case that ${group(condition.not)}`;
  const left = describeOperand(condition.left, def, fields);
  const op = OPS[condition.op] ?? condition.op;
  if (!condition.right) return `${left} ${op}`;
  const field = "field" in condition.left ? fields.get(condition.left.field) : undefined;
  const right =
    "value" in condition.right
      ? describeValue(condition.right.value, field)
      : describeOperand(condition.right, def, fields);
  return `${left} ${op} ${right}`;
}
