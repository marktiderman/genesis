import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  formulaNumber,
  formulaRefs,
  parseFormula,
  renameFormulaKey,
  type FormulaRef,
  type FormulaValue,
} from "../index";

const run = (source: string, values: Record<string, FormulaValue> = {}) => {
  const parsed = parseFormula(source);
  if (!parsed.ok) throw new Error(`${source}: ${parsed.message}`);
  return evaluateFormula(parsed.ast, (ref: FormulaRef) => {
    const v = values[ref.column === undefined ? ref.key : `${ref.key}.${ref.column}`];
    return v === undefined ? null : v;
  });
};

describe("parseFormula", () => {
  it("parses numbers, answers, columns, operators, calls and choices", () => {
    const parsed = parseFormula("sum(plan.cost) + hours * (rate - 1) >= 10 ? 'big' : \"small\"");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.refs).toEqual([{ key: "plan", column: "cost" }, { key: "hours" }, { key: "rate" }]);
  });

  it.each([
    ["", "Write a formula."],
    ["1 +", "Expected a number, an answer or \"(\", but the formula ends there."],
    ["(1 + 2", "A `(` has no matching `)`."],
    ["1 2", "Expected an operator such as + or *, but found \"2\"."],
    ["a ? b", "A `?` needs a `:` and the other value: `test ? a : b`."],
    ["pow(2, 3)", 'There is no function "pow"; use sum, avg, min, max.'],
    ["sum()", "sum() needs something to work on."],
    ["a < b < c", "Compare two values at a time; combine comparisons with `? :`."],
    ["a & b", '"&" can\'t be used in a formula.'],
    ["'open", "This text has no closing quote."],
    ["plan.", 'Name a column after "plan.".'],
  ])("reports %j clearly", (source, message) => {
    const parsed = parseFormula(source);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toBe(message);
  });

  it("points at the offending character", () => {
    const parsed = parseFormula("1 + $");
    expect(parsed).toMatchObject({ ok: false, at: 4 });
  });

  it("refuses deep nesting and long input without throwing", () => {
    expect(parseFormula("(".repeat(5000) + "1" + ")".repeat(5000)).ok).toBe(false);
    expect(parseFormula("-".repeat(5000) + "1").ok).toBe(false);
    expect(parseFormula("1+".repeat(1500) + "1").ok).toBe(false);
  });

  it("counts nesting per parenthesis, call, sign or `? :`, not per operator", () => {
    expect(run("(".repeat(60) + "1 + 2 * 3" + ")".repeat(60))).toBe(7);
    expect(run("sum(".repeat(30) + "1" + ")".repeat(30))).toBe(1);
    expect(parseFormula("(".repeat(70) + "1" + ")".repeat(70)).ok).toBe(false);
    expect(parseFormula("1 + 2 * 3 - 4 / 2 == 5 ? 1 : 0").ok).toBe(true);
  });

  it("refuses a number too large to hold", () => {
    const parsed = parseFormula("9".repeat(400) + " + 1");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed).toMatchObject({ message: "This number is too large.", at: 0 });
    expect(run("1" + "0".repeat(300))).toBe(1e300);
    expect(parseFormula("1e400")).toMatchObject({ ok: false, message: "Write a number in digits only, like 1000000.", at: 0 });
  });

  it("never evaluates JavaScript", () => {
    for (const source of ["constructor.constructor('x')()", "a[0]", "`x`", "a; b", "a => a", "this", "globalThis.x()"]) {
      const parsed = parseFormula(source);
      if (parsed.ok) expect(evaluateFormula(parsed.ast, () => null)).toBe(null);
    }
    expect(parseFormula("constructor.constructor('x')()").ok).toBe(false);
  });
});

describe("evaluateFormula", () => {
  it("does arithmetic with precedence, unicode operators and unary minus", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) × 3")).toBe(9);
    expect(run("10 ÷ 4 − 1")).toBe(1.5);
    expect(run("-a + 5", { a: 2 })).toBe(3);
    expect(run("2 * -3")).toBe(-6);
  });

  it("treats blanks as blank, and division by zero as blank", () => {
    expect(run("a + 1")).toBe(null);
    expect(run("a / b", { a: 1, b: 0 })).toBe(null);
    expect(run("a * 2", { a: "not a number" })).toBe(null);
  });

  it("reads numeric text and yes / no", () => {
    expect(run("a + b", { a: "12", b: " 1,200 " })).toBe(1212);
    expect(run("yes * 5", { yes: true })).toBe(5);
    expect(formulaNumber("1e3")).toBe(1000);
    expect(formulaNumber("12abc")).toBe(null);
  });

  it("compares numbers and text", () => {
    expect(run("a > 3", { a: 4 })).toBe(true);
    expect(run("a <= 3", { a: "4" })).toBe(false);
    expect(run("a = 'intj'", { a: "intj" })).toBe(true);
    expect(run("a ≠ 'intj'", { a: "enfp" })).toBe(true);
    expect(run("a == 1")).toBe(false);
    expect(run("a != 1")).toBe(true);
    expect(run("a < 'b'", { a: "a" })).toBe(false);
  });

  it("chooses with ? :, right to left", () => {
    expect(run("score >= 8 ? 'High' : score >= 4 ? 'Medium' : 'Low'", { score: 5 })).toBe("Medium");
    expect(run("a ? 1 : 2")).toBe(2);
    expect(run("items ? 1 : 2", { items: ["x"] })).toBe(1);
  });

  it("aggregates lists and table columns, skipping blanks and text", () => {
    const values = { "plan.cost": ["10", "", "x", "5.5"], goals: ["1", "2", "3"], a: 4 };
    expect(run("sum(plan.cost)", values)).toBe(15.5);
    expect(run("avg(goals)", values)).toBe(2);
    expect(run("min(goals, a)", values)).toBe(1);
    expect(run("max(goals, a, 9)", values)).toBe(9);
    expect(run("sum(missing)")).toBe(0);
    expect(run("avg(missing)")).toBe(null);
    expect(run("max()".replace("()", "(missing)"))).toBe(null);
  });

  it("does not do arithmetic on a whole list", () => {
    expect(run("goals + 1", { goals: ["1"] })).toBe(null);
  });
});

describe("formulaRefs and renameFormulaKey", () => {
  it("lists each answer once", () => {
    expect(formulaRefs("a + a + b.c + b.c")).toEqual([{ key: "a" }, { key: "b", column: "c" }]);
    expect(formulaRefs("1 +")).toEqual([]);
  });

  it("renames answers but not columns, functions or text", () => {
    expect(renameFormulaKey("sum(cost) + cost + plan.cost + 'cost'", "cost", "price")).toBe("sum(price) + price + plan.cost + 'cost'");
    expect(renameFormulaKey("sum(a)", "sum", "total")).toBe("sum(a)");
    expect(renameFormulaKey("hours*rate", "hours", "time")).toBe("time*rate");
    expect(renameFormulaKey("a $ b", "a", "c")).toBe("a $ b");
  });
});
