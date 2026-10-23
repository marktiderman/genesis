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
  MAX_SETTLE_ITEMS,
  MAX_FORM_FORMULA_LENGTH,
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
import { workStats } from "../calculated";
import { MAX_REPLAY_WORK, validateSubmission } from "../server";
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

  it(`caps the form's formulas at ${MAX_FORM_FORMULA_LENGTH} characters together`, () => {
    const long = Array.from({ length: 120 }, () => "sum(plan.cost)").join("+");
    const withMany = (n: number): FormDefinition => ({
      ...def,
      blocks: [...def.blocks, ...Array.from({ length: n }, (_, k): FieldBlock => ({ kind: "field", id: `k${k}`, key: `k${k}`, type: "calculated", label: "K", props: { formula: long } }))],
    });
    const fits = Math.floor((MAX_FORM_FORMULA_LENGTH - 60) / long.length);
    expect(issues(withMany(fits))).toEqual([]);
    expect(issues(withMany(fits + 2))).toEqual([
      `blocks[${6 + fits}].props.formula: The form's formulas together are over ${MAX_FORM_FORMULA_LENGTH} characters; shorten some, or work part out once in an earlier calculated field.`,
    ]);
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
  /**
   * Runs it, returning the result, the time taken and the work counted. The
   * tests check the work, which is the same everywhere; the time is only a
   * loose bound (CI runs 5 to 8 times slower) that unbounded work would still pass.
   */
  const timed = <T,>(run: () => T): [T, number, Omit<typeof workStats, "reset">] => {
    workStats.reset();
    const start = performance.now();
    const result = run();
    const ms = performance.now() - start;
    const { reset: _reset, ...work } = workStats;
    return [result, ms, { ...work }];
  };

  /** Loose: unbounded work (the bugs these guard against) took 20 s to minutes. */
  const SANITY_MS = 15_000;

  it("replays many events over a big table, reading the table and working the formula out once each", () => {
    const [engine, ms, work] = timed(() => replay(big, events(10_000, 9_000)));
    expect(engine.getState().values[ids.total]).toBe(45_000);
    expect(work).toMatchObject({ listBuilds: 1 });
    expect(work.formulaRuns).toBeLessThanOrEqual(2);
    expect(ms).toBeLessThan(SANITY_MS);
  });

  it("validates a big submission on the server with the same bounded work", () => {
    const [result, ms, work] = timed(() => validateSubmission(big, { events: events(10_000, 9_000) }));
    expect(result.ok && result.submission.answers[ids.total]).toBe(45_000);
    expect(work).toMatchObject({ listBuilds: 1 });
    expect(work.formulaRuns).toBeLessThanOrEqual(2);
    expect(ms).toBeLessThan(SANITY_MS);
  });

  it("works a formula out again only when an answer it reads changes, so steps between answers stay cheap", () => {
    const [result, ms, work] = timed(() => validateSubmission(big, { events: events(10_000, 4_000, true) }));
    expect(result.ok && result.submission.answers[ids.total]).toBe(45_000);
    expect(work).toMatchObject({ listBuilds: 1 });
    expect(work.formulaRuns).toBeLessThanOrEqual(2);
    expect(ms).toBeLessThan(SANITY_MS);
  });

  it(`leaves a formula blank when it reads a list or table of more than ${MAX_FORMULA_ITEMS} items`, () => {
    const [engine, ms, work] = timed(() => replay(big, events(50_000, 9_000)));
    // Blank, not 0 or a partial total, and the table is never read.
    expect(engine.getState().values[ids.total]).toBe(undefined);
    expect(engine.answers()).not.toHaveProperty(ids.total);
    expect(work.listBuilds).toBe(0);
    expect(ms).toBeLessThan(SANITY_MS);
    expect(formulaInput(rows(MAX_FORMULA_ITEMS + 1), "c")).toBe(null);
    expect(formulaInput(Array.from({ length: MAX_FORMULA_ITEMS + 1 }, () => 1))).toBe(null);
    expect((formulaInput(rows(MAX_FORMULA_ITEMS), "c") as unknown[]).length).toBe(MAX_FORMULA_ITEMS);
  });

  it("stays fast when a step changes an answer the formulas read (an invoice, alternating the tax rate)", () => {
    const invoice: FormDefinition = {
      schemaVersion: 1,
      id: "invoice",
      title: "Invoice",
      blocks: [
        { kind: "field", id: "items", key: "items", type: "table", label: "Items", props: { columns: [{ key: "qty", label: "Qty" }, { key: "price", label: "Price" }], maxRows: 10_000 } },
        { kind: "field", id: "rate", key: "rate", type: "number", label: "Tax rate" },
        { kind: "field", id: "net", key: "net", type: "calculated", label: "Net", props: { formula: "sum(items.price)" } },
        { kind: "field", id: "tax", key: "tax", type: "calculated", label: "Tax", props: { formula: "sum(items.price) * rate" } },
        { kind: "field", id: "total", key: "total", type: "calculated", label: "Total", props: { formula: "sum(items.price) + sum(items.price) * rate" } },
        { kind: "field", id: "avg", key: "avg", type: "calculated", label: "Average", props: { formula: "avg(items.price) * (1 + rate)" } },
        { kind: "field", id: "units", key: "units", type: "calculated", label: "Units", props: { formula: "sum(items.qty) + max(items.qty) - min(items.qty)" } },
      ],
    };
    const evs: FormEvent[] = [{ type: "answer", field: "items", value: Array.from({ length: 10_000 }, (_, i) => ({ qty: 1, price: i })) }];
    for (let i = 0; i < 4_995; i++) {
      evs.push({ type: "answer", field: "rate", value: i % 2 ? 0.1 : 0.2 });
      evs.push({ type: "back" });
    }
    evs.push({ type: "submit" });
    expect(JSON.stringify({ events: evs }).length).toBeGreaterThan(400_000);
    const [result, ms, work] = timed(() => validateSubmission(invoice, { events: evs }, { complete: false }));
    expect(result.ok && result.submission.answers).toMatchObject({ net: 49_995_000, rate: 0.2, units: 10_000 });
    // Each column is read once, and no rule reads a total, so the five formulas
    // are worked out at the start and the end, not on each of the 4,995 steps.
    expect(work).toMatchObject({ listBuilds: 2 });
    expect(work.formulaRuns).toBeLessThanOrEqual(10);
    expect(ms).toBeLessThan(SANITY_MS);
  });

  it(`leaves a formula blank when it reads answers past ${MAX_SETTLE_ITEMS} items in all, across every formula`, () => {
    const lists = Array.from({ length: 6 }, (_, k) => f.list(`l${k}`, { label: `L${k}` }));
    const form = defineForm({
      id: "many",
      title: "Many",
      blocks: [
        ...lists,
        f.calculated("first", { label: "First", formula: "sum(l0, l1, l2, l3, l4)" }),
        f.calculated("again", { label: "Again", formula: "sum(l0) + sum(l5)" }),
      ],
    }).definition;
    const items = Array.from({ length: MAX_SETTLE_ITEMS / 5 }, () => "1");
    const engine = createForm(form);
    for (let k = 0; k < 6; k++) engine.setValue(`l${k}`, items);
    // l0 to l4 use the whole allowance; l0 is counted once, and l5 is past it,
    // so "again" is blank rather than the partial total sum(l0).
    expect(engine.getState().values.first).toBe(MAX_SETTLE_ITEMS);
    expect(engine.getState().values.again).toBe(undefined);
    expect(replay(form, engine.getState().events).getState().values).toEqual(engine.getState().values);
  });

  it(`doesn't count an answer over ${MAX_FORMULA_ITEMS} items against the allowance`, () => {
    const form = defineForm({
      id: "over",
      title: "Over",
      blocks: [
        f.list("huge", { label: "Huge" }),
        ...Array.from({ length: 5 }, (_, k) => f.list(`l${k}`, { label: `L${k}` })),
        f.calculated("big", { label: "Big", formula: "sum(huge)" }),
        f.calculated("rest", { label: "Rest", formula: "sum(l0, l1, l2, l3, l4)" }),
      ],
    }).definition;
    const engine = createForm(form);
    engine.setValue("huge", Array.from({ length: MAX_FORMULA_ITEMS + 1 }, () => "1"));
    for (let k = 0; k < 5; k++) engine.setValue(`l${k}`, Array.from({ length: MAX_SETTLE_ITEMS / 5 }, () => "1"));
    expect(engine.getState().values.big).toBe(undefined);
    expect(engine.getState().values.rest).toBe(MAX_SETTLE_ITEMS);
  });

  it("works a list out again for each new answer array (answers are never changed in place)", () => {
    const form = defineForm({
      id: "grow",
      title: "Grow",
      blocks: [f.list("xs", { label: "Xs" }), f.shortText("other", { label: "Other" }), f.calculated("n", { label: "N", formula: "sum(xs)" })],
    }).definition;
    const engine = createForm(form);
    const xs = ["1", "2"];
    engine.setValue("xs", xs);
    expect(engine.getState().values.n).toBe(3);
    engine.setValue("xs", [...xs, "3"]);
    expect(engine.getState().values.n).toBe(6);
    // The engine keeps answers as given and never changes them.
    const stored = engine.getState().values.xs as string[];
    expect(stored).toEqual(["1", "2", "3"]);
    engine.setValue("other", "x");
    expect(engine.getState().values.xs).toBe(stored);
    expect(engine.getState().values.n).toBe(6);
  });

  it("stays bounded with many calculated fields: 400 over a 10k-row table, 5k steps", () => {
    const blocks: FieldBlock[] = [
      { kind: "field", id: "t", key: "t", type: "table", label: "T", props: { maxRows: 10_000, columns: [{ key: "a", label: "A" }, { key: "b", label: "B" }] } },
      { kind: "field", id: "n", key: "n", type: "number", label: "N" },
    ];
    for (let k = 0; k < 400; k++) {
      blocks.push({ kind: "field", id: `c${k}`, key: `c${k}`, type: "calculated", label: "C", props: { formula: `sum(t.a)+avg(t.b)*n+${k}` } });
    }
    const form: FormDefinition = { schemaVersion: 1, id: "many-fields", title: "Many", blocks };
    expect(parseForm(form).ok).toBe(true);
    // The same with a rule reading a total: every step then works every formula out.
    const why: FieldBlock = { kind: "field", id: "why", key: "why", type: "short-text", label: "Why" };
    const ruled: FormDefinition = {
      ...form,
      blocks: [...blocks, why],
      logic: [{ id: "r", effect: "show", target: "why", when: { op: "gte", left: { field: "c0" }, right: { value: 0 } } }],
    };
    const evs: FormEvent[] = [{ type: "answer", field: "t", value: Array.from({ length: 10_000 }, (_, i) => ({ a: 1, b: i })) }];
    for (let i = 0; i < 2_499; i++) {
      evs.push({ type: "answer", field: "n", value: (i % 2) + 1 });
      evs.push({ type: i % 4 < 2 ? "next" : "back" });
    }
    evs.push({ type: "answer", field: "n", value: 2 }, { type: "back" }, { type: "submit" });
    // 5,000 steps over 402 blocks walk the path for about 1M units of replay
    // work: refused by default, having stopped at the limit.
    const [refused, refusedMs, refusedWork] = timed(() => validateSubmission(form, { events: evs }, { complete: false }));
    expect(refused).toMatchObject({ ok: false, errors: { "": expect.stringMatching(/^Too much work/) } });
    expect(refusedWork.lastReplayWork).toBeGreaterThan(MAX_REPLAY_WORK);
    expect(refusedWork.lastReplayWork).toBeLessThanOrEqual(MAX_REPLAY_WORK + blocks.length);
    expect(refusedMs).toBeLessThan(SANITY_MS);
    const expected = { c0: 10_000 + 4_999.5 * 2, c399: 10_000 + 4_999.5 * 2 + 399 };
    // With the rule, 500 steps are enough to show each settle stays linear.
    const short = [...evs.slice(0, 1_001), { type: "answer", field: "n", value: 2 }, { type: "back" }, { type: "submit" }] as FormEvent[];
    for (const [def, log] of [[form, evs], [ruled, short]] as const) {
      const [result, ms, work] = timed(() => validateSubmission(def, { events: [...log] }, { complete: false, maxReplayWork: 1e9 }));
      expect(result.ok && result.submission.answers).toMatchObject(expected);
      // The answers are copied at most once per settle, never once per field (O(fields²)).
      expect(work.answerCopies).toBeLessThanOrEqual(work.settles);
      expect(work.formulaRuns).toBeLessThanOrEqual(400 * work.settles);
      expect(work.listBuilds).toBe(2);
      if (def === ruled) expect(work.settles).toBeGreaterThan(500);
      expect(ms).toBeLessThan(SANITY_MS);
    }
  }, 60_000);

  it("counts a table's rows once against the allowance, however many of its columns are read", () => {
    const columns = Array.from({ length: 6 }, (_, k) => ({ key: `k${k}`, label: `K${k}` }));
    const form: FormDefinition = {
      schemaVersion: 1,
      id: "cols",
      title: "Cols",
      blocks: [
        { kind: "field", id: "t", key: "t", type: "table", label: "T", props: { maxRows: 10_000, columns } },
        { kind: "field", id: "c", key: "c", type: "calculated", label: "C", props: { formula: columns.map((c) => `sum(t.${c.key})`).join("+") } },
      ],
    };
    const row = Object.fromEntries(columns.map((c) => [c.key, "1"]));
    const result = validateSubmission(form, { events: [{ type: "answer", field: "t", value: Array.from({ length: 10_000 }, () => ({ ...row })) }, { type: "submit" }] });
    expect(result.ok && result.submission.answers.c).toBe(60_000);
  });

  it("leaves a total blank, not partial, when six 10k-row tables pass the allowance (Gate's case)", () => {
    const blocks: FieldBlock[] = Array.from({ length: 6 }, (_, k): FieldBlock => ({
      kind: "field", id: `t${k}`, key: `t${k}`, type: "table", label: "T", props: { maxRows: 10_000, columns: [{ key: "c", label: "C" }] },
    }));
    blocks.push({ kind: "field", id: "n", key: "n", type: "number", label: "N" });
    blocks.push({ kind: "field", id: "c", key: "c", type: "calculated", label: "C", props: { formula: "sum(t0.c)+sum(t1.c)+sum(t2.c)+sum(t3.c)+sum(t4.c)+sum(t5.c)+n" } });
    const form: FormDefinition = { schemaVersion: 1, id: "six", title: "Six", blocks };
    const evs: FormEvent[] = blocks.slice(0, 6).map((b) => ({ type: "answer", field: b.id, value: Array.from({ length: 10_000 }, () => ({ c: 1 })) }));
    evs.push({ type: "answer", field: "n", value: 1 }, { type: "submit" });
    const result = validateSubmission(form, { events: evs }, { complete: false });
    expect(result.ok).toBe(true);
    expect(result.ok && result.submission.answers).not.toHaveProperty("c");
    // Five tables fit: 50,000 rows.
    const five = validateSubmission(form, { events: evs.filter((e) => e.type !== "answer" || e.field !== "t5") }, { complete: false });
    expect(five.ok && five.submission.answers.c).toBe(50_001);
  });

  it("never returns stale totals for a caller's array changed between calls (Gate's case)", () => {
    const form: FormDefinition = {
      schemaVersion: 1,
      id: "mut",
      title: "Mut",
      blocks: [
        { kind: "field", id: "t", key: "t", type: "table", label: "T", props: { maxRows: 100, columns: [{ key: "c", label: "C" }] } },
        { kind: "field", id: "c", key: "c", type: "calculated", label: "C", props: { formula: "sum(t.c)" } },
      ],
    };
    const rows: Record<string, Json>[] = [{ c: 1 }, { c: 2 }];
    const total = () => {
      const r = validateSubmission(form, { events: [{ type: "answer", field: "t", value: rows }, { type: "submit" }] }, { complete: false });
      return r.ok ? r.submission.answers.c : r.errors;
    };
    expect(total()).toBe(3);
    rows.push({ c: 100 });
    expect(total()).toBe(103);
    rows[0]!.c = 50;
    expect(total()).toBe(152);
    // The same through an engine: setValue with the array it holds works it out again, and a new engine reads it afresh.
    const held: Record<string, Json>[] = [{ c: 1 }];
    const engine = createForm(form);
    engine.setValue("t", held);
    expect(engine.getState().values.c).toBe(1);
    held.push({ c: 5 });
    engine.setValue("t", held);
    expect(engine.getState().values.c).toBe(6);
    const fresh = createForm(form);
    fresh.setValue("t", held);
    expect(fresh.getState().values.c).toBe(6);
  });

  it("a replay that steps through calculated fields gives the live engine's state, with and without logic on them", () => {
    for (const logic of [[], [when("total").greaterThan(10).show("why")]]) {
      const form = defineForm({
        id: "steps",
        title: "Steps",
        blocks: [
          f.shortText("a", { label: "A" }),
          f.calculated("total", { label: "Total", formula: "a * 2" }),
          f.shortText("why", { label: "Why?" }),
        ],
        logic,
      }).definition;
      const live = createForm(form, { clock: () => undefined });
      live.setValue("a", "3");
      live.next();
      live.next();
      live.back();
      live.setValue("a", "8");
      live.next();
      const again = replay(form, live.getState().events);
      expect(again.getState()).toEqual(live.getState());
      expect(again.getState().values.total).toBe(16);
    }
  });

  it("prefilled answers settle once and match a replay", () => {
    const engine = createForm(big, { initialValues: { [ids.t]: rows(100), [ids.a]: "x" } });
    expect(engine.getState().values[ids.total]).toBe(450);
    expect(replay(big, engine.getState().events).getState().values).toEqual(engine.getState().values);
  });
});
