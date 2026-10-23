// @feat:forms-engine
import { describe, expect, it } from "vitest";
import {
  createForm,
  dateLimits,
  defineForm,
  f,
  isEmptyValue,
  isIsoDate,
  numberLimits,
  parseForm,
  ratingDisplay,
  REQUIRED_MESSAGE,
  scaleLabels,
  summarizeValue,
  validateField,
  when,
  type FieldBlock,
  type FormDefinition,
} from "../index";
import { publicDefinition, validateSubmission } from "../server";
import { coverage } from "../testing";

const form = defineForm({
  id: "types",
  title: "New types",
  blocks: [
    f.dropdown("class", {
      label: "Which class?",
      required: true,
      options: [{ value: "am", label: "6am" }, { value: "pm", label: "6pm" }],
    }),
    f.number("guests", { label: "How many guests?", min: 0, max: 10, step: 1 }),
    f.number("weight", { label: "Weight", step: 0.1 }),
    f.date("visit", { label: "When did you visit?", min: "2026-01-01", max: "2026-12-31" }),
    f.consent("terms", { label: "Terms", text: "I agree to the terms", required: true }),
    f.rating("overall", { label: "Overall", lowLabel: "Poor", highLabel: "Great", display: "stars" }),
    f.nps("recommend", { label: "Recommend us?", lowLabel: "Never" }),
  ],
  logic: [when("guests").greaterThan(5).hide("weight")],
});
const def = form.definition;
const field = (key: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!;

describe("f builders", () => {
  it("write the canonical props, leaving unset ones out", () => {
    expect(field("class").props).toEqual({ options: [{ value: "am", label: "6am" }, { value: "pm", label: "6pm" }] });
    expect(field("guests").props).toEqual({ min: 0, max: 10, step: 1 });
    expect(field("weight").props).toEqual({ step: 0.1 });
    expect(field("visit").props).toEqual({ min: "2026-01-01", max: "2026-12-31" });
    expect(field("terms").props).toEqual({ text: "I agree to the terms" });
    expect(field("overall").props).toEqual({ max: 5, lowLabel: "Poor", highLabel: "Great", display: "stars" });
    expect(field("recommend").props).toEqual({ lowLabel: "Never" });
    expect(f.rating("r", { label: "R" }).props).toEqual({ max: 5 });
    expect(f.nps("n", { label: "N" }).props).toBeUndefined();
    expect(f.consent("c", { label: "C" }).props).toBeUndefined();
  });
});

describe("dropdown", () => {
  it("accepts one of its options and summarizes the label", () => {
    expect(validateField(field("class"), "am")).toBeNull();
    expect(validateField(field("class"), "noon")).toMatch(/Choose one/);
    expect(validateField(field("class"), undefined)).toBe(REQUIRED_MESSAGE);
    expect(summarizeValue("pm", field("class"))).toBe("6pm");
  });

  it("warns when logic compares it with a value that is not an option", () => {
    const bad: FormDefinition = {
      ...def,
      logic: [{ id: "r", when: { op: "eq", left: { field: "class" }, right: { value: "noon" } }, effect: "hide", target: "guests" }],
    };
    const parsed = parseForm(bad);
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.map((w) => w.message).join()).toMatch(/not an option/);
  });
});

describe("number", () => {
  it("checks range and step", () => {
    const guests = field("guests");
    expect(validateField(guests, 3)).toBeNull();
    expect(validateField(guests, 11)).toBe("Enter a number from 0 to 10.");
    expect(validateField(guests, 2.5)).toBe("Enter a whole number.");
    expect(validateField(guests, "3")).toBe("Enter a number.");
    expect(validateField(field("weight"), 72.3)).toBeNull();
    expect(validateField(field("weight"), 0.30000000000000004)).toBeNull();
    expect(validateField(field("weight"), 72.35)).toBe("Enter a number in steps of 0.1.");
    expect(validateField(f.number("x", { label: "X", min: 5 }), 4)).toBe("Enter 5 or more.");
    expect(validateField(f.number("x", { label: "X", max: 5 }), 6)).toBe("Enter 5 or less.");
    expect(summarizeValue(3, guests)).toBe("3");
    expect(numberLimits(guests)).toEqual({ min: 0, max: 10, step: 1 });
  });

  it("drives ordering logic", () => {
    const engine = createForm(def);
    engine.setValue("guests", 6);
    expect(engine.getState().path).not.toContain("weight");
    engine.setValue("guests", 2);
    expect(engine.getState().path).toContain("weight");
  });

  it("rejects props that are not numbers, a step of 0 and a min above the max", () => {
    const withProps = (props: Record<string, unknown>) =>
      parseForm({ ...def, logic: [], blocks: [{ kind: "field", id: "n", key: "n", type: "number", label: "N", props }] });
    expect(withProps({ min: 1, max: 2, step: 0.5 }).ok).toBe(true);
    const issues = (props: Record<string, unknown>) => {
      const r = withProps(props);
      return r.ok ? [] : r.issues.map((i) => i.path);
    };
    expect(issues({ min: "1" })).toEqual(["blocks[0].props.min"]);
    expect(issues({ step: 0 })).toEqual(["blocks[0].props.step"]);
    expect(issues({ min: 5, max: 1 })).toEqual(["blocks[0].props.min"]);
  });
});

describe("date", () => {
  it("accepts real calendar days within its range", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-10-22")).toBe(false);
    const visit = field("visit");
    expect(validateField(visit, "2026-10-22")).toBeNull();
    expect(validateField(visit, "2025-12-31")).toBe("Choose a date from 2026-01-01 to 2026-12-31.");
    expect(validateField(visit, "22/10/2026")).toMatch(/Enter a date/);
    expect(dateLimits(visit)).toEqual({ min: "2026-01-01", max: "2026-12-31" });
    expect(summarizeValue("2026-10-22", visit)).toBe("2026-10-22");
  });

  it("rejects limits that are not dates, or in the wrong order", () => {
    const parsed = parseForm({
      ...def,
      logic: [],
      blocks: [{ kind: "field", id: "d", key: "d", type: "date", label: "D", props: { min: "2026-12-01", max: "2026-01-01" } }],
    });
    expect(parsed.ok).toBe(false);
    const bad = parseForm({
      ...def,
      logic: [],
      blocks: [{ kind: "field", id: "d", key: "d", type: "date", label: "D", props: { min: "soon" } }],
    });
    expect(bad.ok ? [] : bad.issues.map((i) => i.path)).toEqual(["blocks[0].props.min"]);
  });
});

describe("consent", () => {
  it("must be checked when required; unchecked is unanswered", () => {
    const terms = field("terms");
    expect(isEmptyValue(false, terms)).toBe(true);
    expect(isEmptyValue(undefined, terms)).toBe(true);
    expect(validateField(terms, false)).toBe(REQUIRED_MESSAGE);
    expect(validateField(terms, true)).toBeNull();
    expect(validateField(terms, "yes")).toBe("Check the box to agree.");
    expect(validateField({ ...terms, required: false }, undefined)).toBeNull();
    expect(summarizeValue(true, terms)).toBe("Agreed");
  });
});

describe("rating labels and display", () => {
  it("reads and summarizes the end labels", () => {
    const overall = field("overall");
    expect(scaleLabels(overall)).toEqual({ low: "Poor", high: "Great" });
    expect(ratingDisplay(overall)).toBe("stars");
    expect(ratingDisplay(f.rating("r", { label: "R" }))).toBe("numbers");
    expect(summarizeValue(1, overall)).toBe("1/5 (Poor)");
    expect(summarizeValue(3, overall)).toBe("3/5");
    expect(summarizeValue(5, overall)).toBe("5/5 (Great)");
    expect(summarizeValue(0, field("recommend"))).toBe("0/10 (Never)");
    expect(summarizeValue(10, field("recommend"))).toBe("10/10");
  });

  it("rejects an unknown display and labels that are not text", () => {
    const withProps = (props: Record<string, unknown>) =>
      parseForm({ ...def, logic: [], blocks: [{ kind: "field", id: "r", key: "r", type: "rating", label: "R", props }] });
    const paths = (props: Record<string, unknown>) => {
      const r = withProps(props);
      return r.ok ? [] : r.issues.map((i) => i.path);
    };
    expect(paths({ max: 5, display: "stars", lowLabel: "Poor" })).toEqual([]);
    expect(paths({ display: "emoji" })).toEqual(["blocks[0].props.display"]);
    expect(paths({ lowLabel: 1 })).toEqual(["blocks[0].props.lowLabel"]);
  });
});

describe("on the server", () => {
  const answers = { class: "am", guests: 2, weight: 70.5, visit: "2026-10-22", terms: true, overall: 4, recommend: 9 };

  it("accepts a full response and keeps every value", () => {
    const result = validateSubmission(def, { answers });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.answers).toEqual(answers);
  });

  it("rejects unchecked consent and values of the wrong shape", () => {
    const result = validateSubmission(def, { answers: { ...answers, terms: false, guests: "2", visit: "2026-02-30" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["guests", "terms", "visit"]);
  });

  it("publishes every prop the renderer needs", () => {
    expect(publicDefinition(def)).toEqual(def);
  });

  it("finds a valid answer for every new type when exploring paths", () => {
    const report = coverage(def);
    expect(report.unsampledFields).toEqual([]);
    expect(report.endings.default?.reached ?? true).toBe(true);
    expect(report.unreachableBlocks).toEqual([]);
  });
});
