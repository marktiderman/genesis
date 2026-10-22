import { describe, expect, it } from "vitest";
import {
  createForm,
  defineForm,
  f,
  fingerprint,
  formatTimestamp,
  getFieldType,
  isEmptyValue,
  normalizeValue,
  parseForm,
  parseTimestamp,
  summarizeValue,
  validateField,
  when,
  type FieldBlock,
  type Json,
} from "../index";
import { validateSubmission } from "../server";
import { coverage } from "../testing";

const field = (type: string, props?: Record<string, Json>): FieldBlock => ({
  kind: "field",
  id: "q",
  key: "q",
  type,
  label: "Q",
  ...(props ? { props } : {}),
});

const smacColumns: { key: string; label: string; long?: boolean }[] = [
  { key: "say", label: "Say" },
  { key: "mean", label: "Mean", long: true },
  { key: "apply", label: "Apply", long: true },
  { key: "commit", label: "Commit" },
];
const smac: Record<string, Json> = { columns: smacColumns as Json };

describe("list", () => {
  const list = field("list", { min: 2, max: 3, itemMaxLength: 5 });

  it("is empty without a non-blank item", () => {
    expect(isEmptyValue(undefined, list)).toBe(true);
    expect(isEmptyValue([], list)).toBe(true);
    expect(isEmptyValue(["", "  "], list)).toBe(true);
    expect(isEmptyValue(["", "a"], list)).toBe(false);
  });

  it("validates the shape, item length and count, ignoring blanks", () => {
    expect(validateField(list, "a")).toMatch(/list/);
    expect(validateField(list, ["a", 1] as Json)).toMatch(/list/);
    expect(validateField(list, ["a", "toolong"])).toMatch(/under 5 characters/);
    expect(validateField(list, ["a", ""])).toMatch(/at least 2 items/);
    expect(validateField(list, ["a", "b", "c", "d"])).toMatch(/at most 3 items/);
    expect(validateField(list, ["a", " ", "b", "", "c"])).toBeNull();
    expect(validateField(field("list"), Array.from({ length: 11 }, () => "x"))).toMatch(/at most 10/);
  });

  it("normalizes and summarizes", () => {
    expect(normalizeValue([" a ", "", "b"], list)).toEqual(["a", "b"]);
    expect(summarizeValue([" a ", "", "b"], list)).toBe("a; b");
  });

  it("supports contains like multi-choice", () => {
    expect(getFieldType("list")!.operators).toContain("contains");
    const def = defineForm({
      id: "kalm",
      title: "KALM",
      blocks: [f.list("keep", { label: "Keep" }), f.shortText("why", { label: "Why?" })],
      logic: [when("keep").includes("coffee").show("why")],
    });
    const form = createForm(def.definition);
    form.setValue("keep", ["tea", "coffee"]);
    expect(form.getState().path).toContain("why");
    form.setValue("keep", ["tea"]);
    expect(form.getState().path).not.toContain("why");
  });
});

describe("rows", () => {
  const rows = field("rows", { ...smac, minRows: 1, maxRows: 2 });

  it("is empty without a row that has an answer", () => {
    expect(isEmptyValue([], rows)).toBe(true);
    expect(isEmptyValue([{ say: " " }, {}], rows)).toBe(true);
    expect(isEmptyValue([{ say: "x" }], rows)).toBe(false);
  });

  it("validates columns, cells and row count", () => {
    expect(validateField(field("rows"), [{ say: "x" }])).toMatch(/no columns/);
    expect(validateField(rows, [["x"]] as Json)).toMatch(/Fill in the rows/);
    expect(validateField(rows, [{ other: "x" }])).toMatch(/column/);
    expect(validateField(rows, [{ say: 1 }] as Json)).toMatch(/text/);
    expect(validateField(rows, [{ say: "x".repeat(2001) }])).toMatch(/2000/);
    expect(validateField(rows, [{ say: "a" }, { say: "b" }, { say: "c" }])).toMatch(/at most 2 rows/);
    expect(validateField(field("rows", { ...smac, minRows: 2 }), [{ say: "a" }, {}])).toMatch(/at least 2 rows/);
    expect(validateField(rows, [{ say: "a", mean: "b" }, { say: "" }])).toBeNull();
  });

  it("normalizes and summarizes", () => {
    const value: Json = [{ say: " Hi ", mean: "", apply: "x" }, { say: " " }];
    expect(normalizeValue(value, rows)).toEqual([{ say: "Hi", mean: "", apply: "x" }]);
    expect(summarizeValue([{ say: "A", mean: "B" }, { apply: "C" }], rows)).toBe("Say: A · Mean: B / Apply: C");
  });
});

describe("timestamp-notes", () => {
  const notes = field("timestamp-notes", { maxNotes: 2, textMaxLength: 10 });

  it("formats and parses times", () => {
    expect(formatTimestamp(83.9)).toBe("1:23");
    expect(formatTimestamp(3723)).toBe("1:02:03");
    expect(formatTimestamp(-1)).toBe("0:00");
    expect(parseTimestamp("1:23")).toBe(83);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("83.5")).toBe(83.5);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("1:2")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("25:00:00")).toBeNull();
  });

  it("validates times, text and count", () => {
    expect(isEmptyValue([{ at: 1, text: " " }], notes)).toBe(true);
    expect(validateField(notes, [{ at: -1, text: "a" }])).toMatch(/time/);
    expect(validateField(notes, [{ at: 86401, text: "a" }])).toMatch(/time/);
    expect(validateField(notes, [{ at: "1", text: "a" }] as Json)).toMatch(/time/);
    expect(validateField(notes, [{ at: 1, text: "x".repeat(11) }])).toMatch(/under 10/);
    expect(validateField(notes, [1, 2, 3].map((at) => ({ at, text: "a" })))).toMatch(/at most 2 notes/);
    expect(validateField(notes, [{ at: 1, text: "a" }, { at: 2, text: "" }, { at: 3, text: "b" }])).toBeNull();
  });

  it("normalizes in time order and summarizes", () => {
    const value = [{ at: 90, text: " later " }, { at: 5, text: "first" }, { at: 7, text: "" }];
    expect(normalizeValue(value, notes)).toEqual([{ at: 5, text: "first" }, { at: 90, text: "later" }]);
    expect(summarizeValue(value, notes)).toBe("0:05 first; 1:30 later");
  });
});

describe("highlights", () => {
  const text = "Iron sharpens iron.";
  const hl = field("highlights", { text, maxHighlights: 2 });
  const iron = { start: 0, end: 4, quote: "Iron", note: "me" };

  it("needs a note on each highlight", () => {
    expect(validateField(hl, [{ ...iron, note: " " }])).toBe("Add a note to each highlight.");
  });

  it("checks offsets and quotes against the text, when known", () => {
    expect(validateField(hl, [iron])).toBeNull();
    expect(validateField(hl, [{ ...iron, quote: "iron" }])).toMatch(/match/);
    expect(validateField(hl, [{ start: 18, end: 22, quote: "x!!!", note: "n" }])).toMatch(/match/);
    expect(validateField(hl, [{ ...iron, end: 0 }])).toMatch(/passage/);
    expect(validateField(hl, [{ ...iron, note: "x".repeat(1001) }])).toMatch(/1000/);
    expect(validateField(hl, [iron, iron, iron])).toMatch(/at most 2/);
    // Without a text, only the shape is checked.
    expect(validateField(field("highlights"), [{ ...iron, quote: "Wxyz" }])).toBeNull();
    expect(validateField(field("highlights"), [{ ...iron, quote: "Wx" }])).toMatch(/passage/);
  });

  it("normalizes and summarizes", () => {
    const later = { start: 14, end: 18, quote: "iron", note: " you " };
    expect(normalizeValue([later, iron], hl)).toEqual([iron, { ...later, note: "you" }]);
    expect(summarizeValue([iron, later], hl)).toBe('"Iron" — me; "iron" — you');
    expect(isEmptyValue([], hl)).toBe(true);
  });
});

describe("worksheet forms", () => {
  const worksheet = defineForm({
    id: "worksheet",
    title: "Worksheet",
    blocks: [
      f.list("kalm", { label: "KALM", required: true, max: 4 }),
      f.rows("smac", { label: "SMACtalk", columns: smacColumns, maxRows: 3 }),
      f.timestampNotes("moments", { label: "Moments" }),
      f.highlights("verse", { label: "Verse", text: "Iron sharpens iron." }),
    ],
    endings: [{ id: "default", title: "Done" }],
  });

  it("parses and fingerprints", () => {
    const parsed = parseForm(worksheet.definition);
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings).toEqual([]);
    expect(fingerprint(worksheet.definition)).toMatch(/^[0-9a-f]{14}$/);
  });

  it("reports malformed props", () => {
    const def = structuredClone(worksheet.definition) as { blocks: { props?: Record<string, Json> }[] };
    def.blocks[0]!.props = { min: 5, max: 2 };
    def.blocks[1]!.props = { columns: [{ key: "a", label: "A" }, { key: "a", label: "B" }, { key: "__proto__", label: "C" }] };
    def.blocks[2]!.props = { maxNotes: 0 };
    def.blocks[3]!.props = { text: 3 };
    const parsed = parseForm(def);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const messages = parsed.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
    expect(messages).toMatch(/props\.min: Can't be more/);
    expect(messages).toMatch(/Duplicate column key "a"/);
    expect(messages).toMatch(/reserved/);
    expect(messages).toMatch(/maxNotes/);
    expect(messages).toMatch(/props\.text: Must be text/);
    const noColumns = structuredClone(worksheet.definition) as { blocks: { props?: Record<string, Json> }[] };
    noColumns.blocks[1]!.props = { columns: [] };
    expect(parseForm(noColumns).ok).toBe(false);
  });

  it("round-trips through the engine and validateSubmission", () => {
    const form = createForm(worksheet.definition);
    form.setValue("kalm", [" Keep going ", ""]);
    form.setValue("smac", [{ say: "S", mean: "M" }, { say: "" }]);
    form.setValue("moments", [{ at: 70, text: "b" }, { at: 3, text: " a " }]);
    form.setValue("verse", [{ start: 0, end: 4, quote: "Iron", note: "n" }]);
    expect(form.submit()).toBe(true);
    const answers = form.answers();
    expect(answers).toEqual({
      kalm: ["Keep going"],
      smac: [{ say: "S", mean: "M" }],
      moments: [{ at: 3, text: "a" }, { at: 70, text: "b" }],
      verse: [{ start: 0, end: 4, quote: "Iron", note: "n" }],
    });
    const result = validateSubmission(worksheet.definition, { events: form.getState().events });
    expect(result.ok && result.submission.answers).toEqual(answers);
    const bad = validateSubmission(worksheet.definition, { answers: { kalm: ["x"], verse: [{ start: 0, end: 4, quote: "Iron", note: "" }] } });
    expect(bad.ok).toBe(false);
  });

  it("has samples, so coverage reaches the ending", () => {
    const report = coverage(worksheet.definition);
    expect(report.unsampledFields).toEqual([]);
    expect(report.endings.default?.reached).toBe(true);
  });
});
