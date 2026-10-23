import { describe, expect, it } from "vitest";
import {
  COMPUTED_FIELD_TYPES,
  createForm,
  defineForm,
  f,
  formatCalculated,
  formulaInput,
  getFieldType,
  MAX_FORMULA_ITEMS,
  parseForm,
  replay,
  summarizeValue,
  validateField,
  when,
  type FieldBlock,
  type FormDefinition,
  type FormEvent,
  type Json,
} from "../index";
import { validateSubmission } from "../server";
import { coverage } from "../testing";

const worksheet = defineForm({
  id: "worksheet",
  title: "Weekly plan",
  blocks: [
    f.shortText("hours", { label: "Hours" }),
    f.shortText("rate", { label: "Rate" }),
    f.table("plan", { label: "Plan", columns: [{ key: "what", label: "What" }, { key: "cost", label: "Cost" }], maxRows: 5 }),
    f.calculated("pay", { label: "Pay", formula: "hours * rate", format: "number", decimals: 2 }),
    f.calculated("spend", { label: "Spend", formula: "sum(plan.cost)" }),
    f.calculated("left", { label: "Left over", formula: "pay - spend" }),
  ],
});
const def = worksheet.definition;

const calc = (props: Record<string, Json>): FieldBlock => ({ kind: "field", id: "c", key: "c", type: "calculated", label: "C", props });

describe("calculated field type", () => {
  it("is registered and opt-in", () => {
    expect(getFieldType("calculated")?.category).toBe("advanced");
    expect(COMPUTED_FIELD_TYPES).toEqual(["calculated"]);
  });

  it("is never required", () => {
    expect(validateField({ ...calc({ formula: "1" }), required: true }, undefined)).toBe(null);
  });

  it("formats numbers, percents and text", () => {
    expect(formatCalculated(12.5, calc({ formula: "x", decimals: 2 }))).toBe("12.50");
    expect(formatCalculated(0.256, calc({ formula: "x", format: "percent", decimals: 1 }))).toBe("25.6%");
    expect(formatCalculated(0.1 + 0.2, calc({ formula: "x" }))).toBe("0.3");
    expect(formatCalculated(true, calc({ formula: "x" }))).toBe("Yes");
    expect(formatCalculated(undefined, calc({ formula: "x" }))).toBe("");
    expect(summarizeValue(0.5, calc({ formula: "x", format: "percent" }))).toBe("50%");
  });
});

describe("engine", () => {
  it("works the values out from the answers, re-evaluating on change", () => {
    const engine = createForm(def);
    const v = () => engine.getState().values;
    expect(v().pay).toBeUndefined();
    expect(v().spend).toBe(0);
    engine.setValue("hours", "10");
    expect(v().pay).toBeUndefined();
    engine.setValue("rate", "12.345");
    expect(v().pay).toBe(123.45);
    engine.setValue("plan", [{ what: "Books", cost: "20" }, { what: "Bus", cost: "3.45" }]);
    expect(v().spend).toBe(23.45);
    expect(v().left).toBe(100);
    engine.setValue("hours", "");
    expect(v().pay).toBeUndefined();
    expect(v().left).toBeUndefined();
  });

  it("stores the value in the answers", () => {
    const engine = createForm(def, { initialValues: { hours: "2", rate: "3" } });
    expect(engine.answers()).toMatchObject({ pay: 6, spend: 0, left: 6 });
  });

  it("ignores setValue on a calculated field", () => {
    const engine = createForm(def);
    engine.setValue("pay", 999);
    expect(engine.getState().values.pay).toBeUndefined();
    expect(engine.getState().events).toEqual([]);
  });

  it("replays to the same values", () => {
    const engine = createForm(def);
    engine.setValue("hours", "4");
    engine.setValue("rate", "5");
    const again = replay(def, [...engine.getState().events, { type: "answer", field: "pay", value: 1 }]);
    expect(again.getState().values.pay).toBe(20);
  });

  it("reads hidden questions as blank, and logic can read calculated values", () => {
    const form = defineForm({
      id: "f",
      title: "F",
      blocks: [
        f.yesNo("extra", { label: "Extra?" }),
        f.shortText("bonus", { label: "Bonus" }),
        f.shortText("base", { label: "Base" }),
        f.calculated("total", { label: "Total", formula: "sum(base, bonus)" }),
        f.shortText("why", { label: "Why so high?" }),
      ],
      logic: [
        when("extra").is(false).hide("bonus"),
        when("total").greaterThan(100).show("why"),
      ],
    }).definition;
    const engine = createForm(form);
    engine.setValue("base", "50");
    engine.setValue("bonus", "70");
    expect(engine.getState().values.total).toBe(120);
    expect(engine.isVisible("why")).toBe(true);
    engine.setValue("extra", false);
    expect(engine.getState().values.total).toBe(50);
    expect(engine.isVisible("why")).toBe(false);
  });

  it("text format and choices", () => {
    const form = defineForm({
      id: "f",
      title: "F",
      blocks: [
        f.rating("score", { label: "Score", max: 10 }),
        f.calculated("band", { label: "Band", formula: "score >= 8 ? 'High' : 'Low'", format: "text" }),
        f.calculated("share", { label: "Share", formula: "score / 10", format: "percent" }),
      ],
    }).definition;
    const engine = createForm(form);
    engine.setValue("score", 9);
    expect(engine.answers()).toEqual({ score: 9, band: "High", share: 0.9 });
  });
});

describe("validateSubmission", () => {
  it("works the value out on the server and drops the client's", () => {
    const result = validateSubmission(def, { answers: { hours: "3", rate: "4", pay: 1000 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.answers.pay).toBe(12);
      expect(result.submission.ignored).toEqual([]);
    }
  });

  it("does the same from an event log", () => {
    const result = validateSubmission(def, {
      events: [
        { type: "answer", field: "hours", value: "3" },
        { type: "answer", field: "rate", value: "4" },
        { type: "answer", field: "pay", value: 1000 },
        { type: "submit" },
      ],
    });
    expect(result.ok && result.submission.answers.pay).toBe(12);
  });
});

describe("parseForm", () => {
  const withFormula = (formula: string, extra: Partial<FieldBlock> = {}): FormDefinition => ({
    ...def,
    blocks: [...def.blocks, { kind: "field", id: "x", key: "x", type: "calculated", label: "X", props: { formula }, ...extra }],
  });
  const issues = (d: unknown) => {
    const r = parseForm(d);
    return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
  };

  it("accepts good formulas", () => {
    expect(parseForm(def).ok).toBe(true);
    expect(issues(withFormula("left / 2 + avg(plan.cost)"))).toEqual([]);
  });

  it("reports a missing or broken formula", () => {
    expect(issues(withFormula(""))).toEqual(["blocks[6].props.formula: A calculated field needs a formula."]);
    expect(issues(withFormula("1 +"))).toEqual([
      'blocks[6].props.formula: Expected a number, an answer or "(", but the formula ends there. (at character 4)',
    ]);
  });

  it("reports unknown keys, columns, self and later references", () => {
    expect(issues(withFormula("nope + 1"))).toEqual([
      'blocks[6].props.formula: The formula uses "nope", which is not the answer name of a question in this form.',
    ]);
    expect(issues(withFormula("plan"))).toEqual(['blocks[6].props.formula: "plan" is a table: name one of its columns, like plan.what.']);
    expect(issues(withFormula("sum(plan.price)"))).toEqual(['blocks[6].props.formula: The table "plan" has no column "price".']);
    expect(issues(withFormula("hours.x"))).toEqual(['blocks[6].props.formula: "hours" is not a table, so it has no column "x".']);
    expect(issues(withFormula("x + 1"))).toEqual(["blocks[6].props.formula: The formula uses this field's own value."]);
    const later: FormDefinition = { ...def, blocks: [def.blocks[3]!, ...def.blocks.filter((_, i) => i !== 3)] };
    expect(issues({ ...later, blocks: later.blocks.map((b) => (b.id === "pay" ? { ...b, props: { formula: "left" } } : b)) })).toEqual([
      'blocks[0].props.formula: The formula uses "left", a calculated field that comes after this one; move it earlier.',
    ]);
  });

  it("warns when logic compares a calculated value with the wrong kind of literal", () => {
    const warnings = (format: string | undefined, value: Json) => {
      const form = defineForm({
        id: "w",
        title: "W",
        blocks: [
          f.shortText("base", { label: "Base" }),
          f.calculated("total", { label: "Total", formula: "base", ...(format ? { format: format as "text" } : {}) }),
          f.shortText("why", { label: "Why?" }),
        ],
        logic: [when("total").is(value).show("why")],
      }).definition;
      const r = parseForm(form);
      return r.ok ? r.warnings.map((w) => w.message) : ["not ok"];
    };
    expect(warnings("number", "high")).toEqual(['"total" holds a number, but "high" is not one; this comparison is never true.']);
    expect(warnings("number", 5)).toEqual([]);
    expect(warnings("text", "high")).toEqual([]);
    expect(warnings("text", 5)).toEqual(['"total" holds a string, but 5 is not one; this comparison is never true.']);
    // Without a format a formula may give a number or text.
    expect(warnings(undefined, "high")).toEqual([]);
    expect(warnings(undefined, 5)).toEqual([]);
  });

  it("checks format and decimals, and warns on required", () => {
    expect(issues({ ...def, blocks: [calc({ formula: "1", format: "money", decimals: 11 })] })).toEqual([
      "blocks[0].props.format: Must be number, percent or text.",
      "blocks[0].props.decimals: Must be a whole number from 0 to 10.",
    ]);
    const r = parseForm(withFormula("1", { required: true }));
    expect(r.ok && r.warnings.map((w) => w.message)).toEqual(["A calculated field is worked out, not answered, so it is never required."]);
  });
});

describe("coverage", () => {
  it("does not ask for samples for calculated fields", () => {
    const report = coverage(def);
    expect(report.unsampledFields).toEqual([]);
  });
});

describe("unknown props (for a host's own use, such as where an answer goes)", () => {
  const form: FormDefinition = {
    schemaVersion: 1,
    id: "f",
    title: "F",
    blocks: [
      { kind: "field", id: "type", key: "type", type: "short-text", label: "Type", props: { person_column: "mbti" } },
      {
        kind: "field",
        id: "plan",
        key: "plan",
        type: "table",
        label: "Plan",
        props: { columns: [{ key: "commit", label: "Commit" }], creates_task: { from: "commit", due_in_days: 7 }, person_column: "goals" },
      },
    ],
  };

  it("are accepted, kept and ignored by validation and the engine", () => {
    const parsed = parseForm(form);
    expect(parsed).toMatchObject({ ok: true, warnings: [] });
    const engine = createForm(form);
    engine.setValue("type", "INTJ");
    engine.setValue("plan", [{ commit: "Call Sam" }]);
    expect(engine.submit()).toBe(true);
    const result = validateSubmission(form, { answers: { type: "INTJ", plan: [{ commit: "Call Sam" }] } });
    expect(result.ok && result.submission.answers).toEqual({ type: "INTJ", plan: [{ commit: "Call Sam" }] });
  });
});

describe("large submissions", () => {
  const big = defineForm({
    id: "big",
    title: "Big",
    blocks: [
      f.shortText("a", { label: "A" }),
      f.shortText("b", { label: "B" }),
      f.table("t", { label: "T", columns: [{ key: "c", label: "C" }], maxRows: 100_000 }),
      f.calculated("total", { label: "Total", formula: "sum(t.c)" }),
    ],
  }).definition;
  const ids = { a: "a", b: "b", t: "t", total: "total" };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ c: String(i % 10) }));
  /** One big table answer, then many alternating answers to the other questions (so compaction keeps them). */
  const events = (tableRows: number, others: number, withSteps = false): FormEvent[] => {
    const out: FormEvent[] = [{ type: "answer", field: ids.t, value: rows(tableRows) }];
    for (let i = 0; i < others; i++) {
      out.push({ type: "answer", field: i % 2 ? ids.a : ids.b, value: `v${i}` });
      if (withSteps) out.push({ type: "back" });
    }
    out.push({ type: "submit" });
    return out;
  };
  const timed = <T,>(run: () => T): [T, number] => {
    const start = performance.now();
    const result = run();
    return [result, performance.now() - start];
  };

  it("replays many events over a big table in well under a second", () => {
    const [engine, ms] = timed(() => replay(big, events(10_000, 9_000)));
    expect(engine.getState().values[ids.total]).toBe(45_000);
    expect(ms).toBeLessThan(1000);
  });

  it("validates a big submission on the server in well under a second", () => {
    const [result, ms] = timed(() => validateSubmission(big, { events: events(10_000, 9_000) }));
    expect(result.ok && result.submission.answers[ids.total]).toBe(45_000);
    expect(ms).toBeLessThan(1000);
  });

  it("works a formula out again only when an answer it reads changes, so steps between answers stay cheap", () => {
    const [result, ms] = timed(() => validateSubmission(big, { events: events(10_000, 4_000, true) }));
    expect(result.ok && result.submission.answers[ids.total]).toBe(45_000);
    expect(ms).toBeLessThan(1000);
  });

  it(`reads a list or table of more than ${MAX_FORMULA_ITEMS} items as blank`, () => {
    const [engine, ms] = timed(() => replay(big, events(50_000, 9_000)));
    expect(engine.getState().values[ids.total]).toBe(0);
    expect(ms).toBeLessThan(1000);
    expect(formulaInput(rows(MAX_FORMULA_ITEMS + 1), "c")).toBe(null);
    expect(formulaInput(Array.from({ length: MAX_FORMULA_ITEMS + 1 }, () => 1))).toBe(null);
    expect((formulaInput(rows(MAX_FORMULA_ITEMS), "c") as unknown[]).length).toBe(MAX_FORMULA_ITEMS);
  });

  it("prefilled answers settle once and match a replay", () => {
    const engine = createForm(big, { initialValues: { [ids.t]: rows(100), [ids.a]: "x" } });
    expect(engine.getState().values[ids.total]).toBe(450);
    expect(replay(big, engine.getState().events).getState().values).toEqual(engine.getState().values);
  });
});
