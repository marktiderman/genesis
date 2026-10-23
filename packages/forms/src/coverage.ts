/**
 * Symbolic path coverage. Each field gets a small finite domain (its valid
 * values, "unanswered" when allowed, and boundary values pulled from the
 * conditions); a depth-first search answers the fields in path order, so only
 * combinations a respondent could actually produce are explored.
 */
import { canonicalJson } from "./hash";
import { choiceOptions, getFieldType, isEmptyValue } from "./fields";
import { evaluate, fieldMap, steps, walkPath, type EvalScope, type PathWalk } from "./logic";
import type { Condition, FieldBlock, FormDefinition, Json } from "./types";
import { validateField } from "./validate";

export interface CoverageOptions {
  /** Stop after this many explored states and report `truncated`. Default 5000. */
  maxStates?: number;
  /** Fix the hidden inputs instead of enumerating the values the logic compares them with. */
  hidden?: Record<string, Json>;
  /** Most options of a multi-choice field to try one by one. Default 12. */
  maxOptions?: number;
}

export interface EndingCoverage {
  reached: boolean;
  /** Answers (by key) of one completed response that reaches this ending. */
  witness?: Record<string, Json>;
  /** Hidden inputs that witness needs, when the logic reads any. */
  witnessHidden?: Record<string, Json>;
  /**
   * Set when coverage found this ending only on paths through required fields
   * with no sample value (a plugin type without `samples`), so it could not
   * build a completed response: the keys of those fields. `reached` stays false.
   */
  needsSamples?: string[];
}

export interface CoverageReport {
  endings: Record<string, EndingCoverage>;
  /** Keys (or block ids, for content) of blocks no completed response steps through. */
  unreachableBlocks: string[];
  /** Rules whose condition never held in a completed response (a jump also needs its `from` on the path). */
  rulesNeverFired: string[];
  /** Keys of fields coverage had no valid answer for: give their type `samples`. */
  unsampledFields: string[];
  /** Completed responses explored. */
  pathsExplored: number;
  truncated: boolean;
}

type Value = Json | undefined;

/**
 * One value to try for a field. `placeholder` marks a stand-in for a required
 * answer with no known valid value: it steers the logic down each branch, but
 * a path through it is not a response anyone could submit.
 */
interface Candidate {
  value: Value;
  placeholder?: true;
}

/** A non-empty stand-in answer, so `answered` branches are explored too. */
const SOME_ANSWER: Json = { "genesis-forms/unsampled": true };

/** Values each field or hidden input is compared with, anywhere in the logic. */
function boundaries(def: FormDefinition) {
  const fields = new Map<string, Value[]>();
  const hidden = new Map<string, Value[]>();
  const add = (map: Map<string, Value[]>, name: string, values: Value[]) =>
    map.set(name, [...(map.get(name) ?? []), ...values]);
  const visit = (c: Condition) => {
    if ("all" in c) return c.all.forEach(visit);
    if ("any" in c) return c.any.forEach(visit);
    if ("not" in c) return visit(c.not);
    const right = c.right && "value" in c.right ? c.right.value : undefined;
    let values: Value[] = [];
    if (typeof right === "number") values = [right - 1, right, right + 1];
    else if (Array.isArray(right) && c.op === "in") values = right;
    else if (right !== undefined) values = [right];
    if ("field" in c.left) add(fields, c.left.field, values);
    else if ("hidden" in c.left) add(hidden, c.left.hidden, [undefined, ...values]);
  };
  for (const rule of def.logic ?? []) visit(rule.when);
  return { fields, hidden };
}

function dedupe(values: Value[]): Value[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = v === undefined ? "\u0000undefined" : canonicalJson(v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function domainOf(field: FieldBlock, extra: Value[], maxOptions: number): Candidate[] {
  const options = choiceOptions(field).map((o) => o.value);
  let base: Value[];
  switch (field.type) {
    case "rating": {
      const max = typeof field.props?.max === "number" ? field.props.max : 5;
      base = Array.from({ length: max }, (_, i) => i + 1);
      break;
    }
    case "nps":
      base = Array.from({ length: 11 }, (_, i) => i);
      break;
    case "yes-no":
      base = [true, false];
      break;
    case "single-choice":
    case "dropdown":
      base = options;
      break;
    case "multi-choice": {
      const singles = options.slice(0, maxOptions).map((o) => [o]);
      base = [...singles, options];
      // `contains` compares with a single option: try each as a one-item answer.
      extra = extra.map((v) => (typeof v === "string" ? [v] : v));
      break;
    }
    case "list":
      base = getFieldType(field.type)?.samples?.(field) ?? [];
      // `contains` compares with one item: try each as a one-item list.
      extra = extra.map((v) => (typeof v === "string" ? [v] : v));
      break;
    case "email":
      base = ["ada@example.com"];
      break;
    case "phone":
      base = ["+1 555 010 0199"];
      break;
    case "short-text":
    case "long-text":
      base = ["sample"];
      break;
    default:
      base = getFieldType(field.type)?.samples?.(field) ?? [];
  }
  // Unanswered first, so witnesses stay as short as possible.
  const candidates = dedupe([undefined, ...base, ...extra]);
  const valid = candidates.filter((v) => validateField(field, v) === null);
  const domain: Candidate[] = valid.map((value) => ({ value }));
  if (valid.some((v) => !isEmptyValue(v, field))) return domain;
  // A type with no known valid answer (a plugin without samples) must neither
  // dead-end the search nor hide the branches an answer would take: also try
  // the values the logic compares it with and some answer, as placeholders.
  const invalid = dedupe([...candidates, SOME_ANSWER]).filter((v) => !valid.includes(v));
  return [...domain, ...invalid.map((value): Candidate => ({ value, placeholder: true }))];
}

export function coverage(form: FormDefinition | { definition: FormDefinition }, opts: CoverageOptions = {}): CoverageReport {
  const def = "definition" in form ? form.definition : form;
  const maxStates = opts.maxStates ?? 5000;
  const fields = fieldMap(def);
  const bounds = boundaries(def);
  const domains = new Map([...fields.values()].map((f) => [f.id, domainOf(f, bounds.fields.get(f.id) ?? [], opts.maxOptions ?? 12)]));
  const stepIds = steps(def).map((b) => b.id);

  const endings: Record<string, EndingCoverage> = {};
  for (const e of def.endings ?? []) endings[e.id] = { reached: false };
  const reachedBlocks = new Set<string>();
  const fired = new Set<string>();
  let states = 0;
  let paths = 0;
  let truncated = false;

  const keyOf = (id: string) => fields.get(id)?.key ?? id;
  const unsampled = new Set<string>();

  const terminal = (scope: EvalScope, walk: PathWalk, placeholders: Set<string>) => {
    const { path, ending } = walk;
    // Placeholders try every branch the logic can take on them, so blocks
    // and rules count as reachable, assuming a valid answer takes that branch.
    for (const id of path) reachedBlocks.add(id);
    for (const rule of def.logic ?? []) {
      if (fired.has(rule.id)) continue;
      if (rule.effect === "jump" && !path.includes(rule.from)) continue;
      // Each rule sees the answers on the path before the block it applies to.
      const at = rule.effect === "jump" ? walk.scopeAt(rule.from, true) : walk.scopeAt(rule.target);
      if (evaluate(rule.when, at)) fired.add(rule.id);
    }
    // A path through a placeholder is not a response anyone could submit.
    const missing = path.filter((id) => placeholders.has(id)).map(keyOf);
    if (missing.length) {
      for (const key of missing) unsampled.add(key);
      if (ending !== null && !endings[ending]?.reached) (endings[ending] ??= { reached: false }).needsSamples ??= missing;
      return;
    }
    paths++;
    if (ending === null) return;
    const entry = (endings[ending] ??= { reached: false });
    if (entry.reached) return;
    entry.reached = true;
    delete entry.needsSamples;
    const witness: Record<string, Json> = {};
    for (const id of path) {
      const v = scope.values[id];
      if (fields.has(id) && v !== undefined) witness[keyOf(id)] = v;
    }
    entry.witness = witness;
    const hidden = Object.fromEntries(
      Object.entries(scope.hidden).filter((e): e is [string, Json] => e[1] !== undefined),
    );
    if (Object.keys(hidden).length) entry.witnessHidden = hidden;
  };

  const explore = (
    values: Record<string, Value>,
    assigned: Set<string>,
    hidden: Record<string, Value>,
    placeholders: Set<string>,
  ) => {
    if (truncated) return;
    if (++states > maxStates) {
      truncated = true;
      return;
    }
    const scope: EvalScope = { values, hidden, fields };
    const walk = walkPath(def, scope);
    const next = walk.path.find((id) => fields.has(id) && !assigned.has(id));
    if (next === undefined) return terminal(scope, walk, placeholders);
    const nextAssigned = new Set(assigned).add(next);
    for (const { value, placeholder } of domains.get(next) ?? [{ value: undefined }]) {
      explore({ ...values, [next]: value }, nextAssigned, hidden, placeholder ? new Set(placeholders).add(next) : placeholders);
      if (truncated) return;
    }
  };

  // Hidden inputs the logic reads: fixed by the caller, or enumerated up front.
  const hiddenNames = [...bounds.hidden.keys()];
  const enumerateHidden = (i: number, hidden: Record<string, Value>) => {
    if (truncated) return;
    if (opts.hidden || i === hiddenNames.length) return explore({}, new Set(), opts.hidden ?? hidden, new Set());
    const name = hiddenNames[i]!;
    for (const v of dedupe(bounds.hidden.get(name)!)) enumerateHidden(i + 1, { ...hidden, [name]: v });
  };
  enumerateHidden(0, {});

  return {
    endings,
    unreachableBlocks: stepIds.filter((id) => !reachedBlocks.has(id)).map(keyOf),
    rulesNeverFired: (def.logic ?? []).filter((r) => !fired.has(r.id)).map((r) => r.id),
    unsampledFields: [...unsampled],
    pathsExplored: paths,
    truncated,
  };
}
