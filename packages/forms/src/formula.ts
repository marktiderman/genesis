/**
 * A small, safe formula language for `calculated` fields. It is parsed and
 * evaluated here, never with `eval` or `Function`, and it can only read the
 * answers it names.
 *
 * - Numbers: `12`, `0.5`. Text: `"High"` or `'High'`.
 * - Answers by key: `hours`, and one column of a table: `plan.cost`.
 * - Arithmetic: `+ - * /` (also `− × ÷`), unary minus, parentheses.
 * - Comparisons: `== != < <= > >=` (also `= ≠ ≤ ≥`), giving true or false.
 * - A choice: `cond ? a : b`.
 * - `sum(...)`, `avg(...)`, `min(...)`, `max(...)` over numbers, lists and
 *   table columns. Blanks and text that is not a number are skipped.
 *
 * An unanswered question reads as blank: arithmetic with a blank is blank
 * (so a total stays empty until its answers are in), and so is dividing by
 * zero. Text that holds a number ("12") counts as that number; yes / no
 * counts as 1 / 0.
 */
import type { Json } from "./types";

export type FormulaValue = number | string | boolean | null | FormulaValue[];

/** An answer a formula reads: `key`, or `key.column` for one column of a table. */
export interface FormulaRef {
  key: string;
  column?: string;
}

type BinaryOp = "+" | "-" | "*" | "/" | "==" | "!=" | "<" | "<=" | ">" | ">=";

export const FORMULA_FUNCTIONS = ["sum", "avg", "min", "max"] as const;
export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "ref"; key: string; column?: string; at: number }
  | { kind: "unary"; op: "-"; arg: FormulaNode }
  | { kind: "binary"; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { kind: "if"; test: FormulaNode; then: FormulaNode; else: FormulaNode }
  | { kind: "call"; fn: FormulaFunction; args: FormulaNode[] };

export type FormulaParseResult =
  | { ok: true; ast: FormulaNode; refs: FormulaRef[] }
  | { ok: false; message: string; /** Character offset of the problem. */ at: number };

/** Longest formula accepted. */
export const MAX_FORMULA_LENGTH = 2000;
/** Deepest nesting of parentheses, calls and operators. */
const MAX_DEPTH = 64;

type Token =
  | { t: "num"; v: number; at: number }
  | { t: "str"; v: string; at: number }
  | { t: "id"; v: string; at: number }
  | { t: "op"; v: string; at: number }
  | { t: "end"; at: number };

const OP_ALIASES: Record<string, string> = { "−": "-", "×": "*", "÷": "/", "≠": "!=", "≤": "<=", "≥": ">=", "=": "==" };
const TWO_CHAR = new Set(["==", "!=", "<=", ">="]);
const ONE_CHAR = new Set(["+", "-", "*", "/", "<", ">", "(", ")", "?", ":", ",", ".", "=", "−", "×", "÷", "≠", "≤", "≥"]);
const COMPARISONS = new Set(["==", "!=", "<", "<=", ">", ">="]);

class FormulaError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

const isIdStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdPart = (c: string) => isIdStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    const at = i;
    if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
      while (isDigit(source[i] ?? "")) i++;
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (isDigit(source[i] ?? "")) i++;
      }
      tokens.push({ t: "num", v: Number(source.slice(at, i)), at });
      continue;
    }
    if (isIdStart(c)) {
      while (isIdPart(source[i] ?? "")) i++;
      tokens.push({ t: "id", v: source.slice(at, i), at });
      continue;
    }
    if (c === '"' || c === "'" || c === "“") {
      const close = c === "“" ? "”" : c;
      const end = source.indexOf(close, i + 1);
      if (end === -1) throw new FormulaError("This text has no closing quote.", at);
      tokens.push({ t: "str", v: source.slice(i + 1, end), at });
      i = end + 1;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (TWO_CHAR.has(two)) {
      tokens.push({ t: "op", v: two, at });
      i += 2;
      continue;
    }
    if (ONE_CHAR.has(c)) {
      tokens.push({ t: "op", v: OP_ALIASES[c] ?? c, at });
      i++;
      continue;
    }
    throw new FormulaError(`"${c}" can't be used in a formula.`, at);
  }
  tokens.push({ t: "end", at: source.length });
  return tokens;
}

/**
 * Parse a formula. Never throws: a mistake comes back as `{ ok: false,
 * message, at }`, with the character offset of the problem.
 */
export function parseFormula(source: string): FormulaParseResult {
  if (typeof source !== "string" || source.trim() === "") return { ok: false, message: "Write a formula.", at: 0 };
  if (source.length > MAX_FORMULA_LENGTH) {
    return { ok: false, message: `Keep the formula under ${MAX_FORMULA_LENGTH} characters.`, at: MAX_FORMULA_LENGTH };
  }
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch (e) {
    const err = e as FormulaError;
    return { ok: false, message: err.message, at: err.at };
  }
  let pos = 0;
  const refs: FormulaRef[] = [];
  const peek = () => tokens[pos]!;
  const isOp = (v: string) => {
    const tok = peek();
    return tok.t === "op" && tok.v === v;
  };
  const expect = (v: string, message: string) => {
    if (!isOp(v)) throw new FormulaError(message, peek().at);
    pos++;
  };
  const describe = (tok: Token) => (tok.t === "end" ? "the formula ends there" : `found "${String(tok.v)}"`);
  const guard = (depth: number) => {
    if (depth > MAX_DEPTH) throw new FormulaError("The formula is nested too deeply.", peek().at);
  };

  const ternary = (depth: number): FormulaNode => {
    guard(depth);
    const test = comparison(depth + 1);
    if (!isOp("?")) return test;
    pos++;
    const then = ternary(depth + 1);
    expect(":", "A `?` needs a `:` and the other value: `test ? a : b`.");
    const otherwise = ternary(depth + 1);
    return { kind: "if", test, then, else: otherwise };
  };
  const comparison = (depth: number): FormulaNode => {
    const left = additive(depth + 1);
    const tok = peek();
    if (tok.t !== "op" || !COMPARISONS.has(tok.v)) return left;
    pos++;
    const right = additive(depth + 1);
    const next = peek();
    if (next.t === "op" && COMPARISONS.has(next.v)) {
      throw new FormulaError("Compare two values at a time; combine comparisons with `? :`.", next.at);
    }
    return { kind: "binary", op: tok.v as BinaryOp, left, right };
  };
  const additive = (depth: number): FormulaNode => {
    let left = multiplicative(depth + 1);
    for (let tok = peek(); tok.t === "op" && (tok.v === "+" || tok.v === "-"); tok = peek()) {
      pos++;
      left = { kind: "binary", op: tok.v as BinaryOp, left, right: multiplicative(depth + 1) };
    }
    return left;
  };
  const multiplicative = (depth: number): FormulaNode => {
    let left = unary(depth + 1);
    for (let tok = peek(); tok.t === "op" && (tok.v === "*" || tok.v === "/"); tok = peek()) {
      pos++;
      left = { kind: "binary", op: tok.v as BinaryOp, left, right: unary(depth + 1) };
    }
    return left;
  };
  const unary = (depth: number): FormulaNode => {
    guard(depth);
    if (isOp("-")) {
      pos++;
      return { kind: "unary", op: "-", arg: unary(depth + 1) };
    }
    if (isOp("+")) {
      pos++;
      return unary(depth + 1);
    }
    return primary(depth + 1);
  };
  const primary = (depth: number): FormulaNode => {
    const tok = peek();
    if (tok.t === "num") {
      pos++;
      return { kind: "number", value: tok.v };
    }
    if (tok.t === "str") {
      pos++;
      return { kind: "text", value: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      pos++;
      const inner = ternary(depth + 1);
      expect(")", "A `(` has no matching `)`.");
      return inner;
    }
    if (tok.t === "id") {
      pos++;
      if (isOp("(")) {
        if (!(FORMULA_FUNCTIONS as readonly string[]).includes(tok.v)) {
          throw new FormulaError(`There is no function "${tok.v}"; use ${FORMULA_FUNCTIONS.join(", ")}.`, tok.at);
        }
        pos++;
        const args: FormulaNode[] = [];
        if (!isOp(")")) {
          args.push(ternary(depth + 1));
          while (isOp(",")) {
            pos++;
            args.push(ternary(depth + 1));
          }
        }
        expect(")", `"${tok.v}(" has no matching ")".`);
        if (!args.length) throw new FormulaError(`${tok.v}() needs something to work on.`, tok.at);
        return { kind: "call", fn: tok.v as FormulaFunction, args };
      }
      if (isOp(".")) {
        pos++;
        const column = peek();
        if (column.t !== "id") throw new FormulaError(`Name a column after "${tok.v}.".`, column.at);
        pos++;
        refs.push({ key: tok.v, column: column.v });
        return { kind: "ref", key: tok.v, column: column.v, at: tok.at };
      }
      refs.push({ key: tok.v });
      return { kind: "ref", key: tok.v, at: tok.at };
    }
    throw new FormulaError(`Expected a number, an answer or "(", but ${describe(tok)}.`, tok.at);
  };

  try {
    const ast = ternary(0);
    const rest = peek();
    if (rest.t !== "end") throw new FormulaError(`Expected an operator such as + or *, but ${describe(rest)}.`, rest.at);
    return { ok: true, ast, refs };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, message: e.message, at: e.at };
    return { ok: false, message: "The formula is nested too deeply.", at: 0 };
  }
}

/** The answers a formula names, each once (none when it doesn't parse). */
export function formulaRefs(source: string): FormulaRef[] {
  const parsed = parseFormula(source);
  if (!parsed.ok) return [];
  const seen = new Set<string>();
  return parsed.refs.filter((r) => {
    const id = `${r.key}\u0000${r.column ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * The formula with every reference to the answer `from` renamed to `to`.
 * Column names, function names and text are left alone. Returned unchanged
 * when it has a character a formula can't hold.
 */
export function renameFormulaKey(source: string, from: string, to: string): string {
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch {
    return source;
  }
  let out = "";
  let last = 0;
  tokens.forEach((tok, i) => {
    if (tok.t !== "id" || tok.v !== from) return;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (prev?.t === "op" && prev.v === ".") return;
    if (next?.t === "op" && next.v === "(") return;
    out += source.slice(last, tok.at) + to;
    last = tok.at + from.length;
  });
  return out + source.slice(last);
}

// ── Evaluation ───────────────────────────────────────────────────────────────

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** A value as a number: numbers, numeric text ("1,200" too), yes / no as 1 / 0. Anything else is blank (`null`). */
export function formulaNumber(v: FormulaValue | Json | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "");
    return t.length <= 64 && NUMERIC.test(t) ? finite(Number(t)) : null;
  }
  return null;
}

const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);
/** A list in arithmetic is blank: add one up with `sum(...)`. */
const scalar = (v: FormulaValue): FormulaValue => (Array.isArray(v) ? null : v);

function truthy(v: FormulaValue): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim() !== "";
  return v.length > 0;
}

function numbersIn(values: FormulaValue[], out: number[] = []): number[] {
  for (const v of values) {
    if (Array.isArray(v)) numbersIn(v, out);
    else {
      const n = formulaNumber(v);
      if (n !== null) out.push(n);
    }
  }
  return out;
}

function compare(op: BinaryOp, a: FormulaValue, b: FormulaValue): boolean {
  const blank = (v: FormulaValue) => v === null || Array.isArray(v) || (typeof v === "string" && v.trim() === "");
  // A blank equals nothing: `!=` holds and every other comparison fails.
  if (blank(a) || blank(b)) return op === "!=";
  const x = formulaNumber(a);
  const y = formulaNumber(b);
  if (x !== null && y !== null) {
    if (op === "==") return x === y;
    if (op === "!=") return x !== y;
    if (op === "<") return x < y;
    if (op === "<=") return x <= y;
    if (op === ">") return x > y;
    return x >= y;
  }
  // Text is equal or not; it has no order.
  if (op === "==") return String(a) === String(b);
  if (op === "!=") return String(a) !== String(b);
  return false;
}

/** Reads an answer for `evaluateFormula`: its value, or `null` when unanswered or unknown. */
export type FormulaReader = (ref: FormulaRef) => FormulaValue;

/** Evaluate a parsed formula. Never throws; a value it can't work out is `null`. */
export function evaluateFormula(ast: FormulaNode, read: FormulaReader): FormulaValue {
  const run = (node: FormulaNode): FormulaValue => {
    switch (node.kind) {
      case "number":
      case "text":
        return node.value;
      case "ref":
        return read(node.column !== undefined ? { key: node.key, column: node.column } : { key: node.key });
      case "unary": {
        const n = formulaNumber(scalar(run(node.arg)));
        return n === null ? null : -n;
      }
      case "if":
        return truthy(run(node.test)) ? run(node.then) : run(node.else);
      case "call": {
        const nums = numbersIn(node.args.map(run));
        const total = nums.reduce((a, b) => a + b, 0);
        if (node.fn === "sum") return finite(total);
        if (!nums.length) return null;
        if (node.fn === "avg") return finite(total / nums.length);
        return nums.reduce((a, b) => (node.fn === "min" ? Math.min(a, b) : Math.max(a, b)));
      }
      case "binary": {
        const a = run(node.left);
        const b = run(node.right);
        if (node.op === "+" || node.op === "-" || node.op === "*" || node.op === "/") {
          const x = formulaNumber(scalar(a));
          const y = formulaNumber(scalar(b));
          if (x === null || y === null) return null;
          if (node.op === "+") return finite(x + y);
          if (node.op === "-") return finite(x - y);
          if (node.op === "*") return finite(x * y);
          return y === 0 ? null : finite(x / y);
        }
        return compare(node.op, a, b);
      }
    }
  };
  try {
    return run(ast);
  } catch {
    return null;
  }
}
