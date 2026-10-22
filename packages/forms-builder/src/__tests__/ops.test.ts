import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import {
  addEnding,
  addHidden,
  addRule,
  analyze,
  createField,
  diffDefinitions,
  duplicateBlock,
  emptyForm,
  insertBlock,
  isUnchanged,
  moveBlock,
  removeBlock,
  removeEnding,
  removeHidden,
  setOptions,
  slugKey,
  TEMPLATES,
  updateBlock,
  updateHidden,
  updateSettings,
  useBuilderHistory,
} from "../index";

const field = (def: FormDefinition, id: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === id)!;

function sample(): FormDefinition {
  let def = emptyForm("f", "Test");
  def = insertBlock(def, { kind: "field", id: "q_rating", key: "rating", type: "rating", label: "Rating", props: { max: 5 } });
  def = insertBlock(def, {
    kind: "field",
    id: "q_pick",
    key: "pick",
    type: "single-choice",
    label: "Pick",
    props: { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  });
  def = insertBlock(def, { kind: "field", id: "q_why", key: "why", type: "long-text", label: "Why?" });
  return addRule(def, { id: "r1", effect: "show", target: "q_why", when: { op: "lte", left: { field: "q_rating" }, right: { value: 2 } } });
}

describe("ops", () => {
  it("slugs keys", () => {
    expect(slugKey("How was class?")).toBe("how_was_class");
    expect(slugKey("Café — déjà vu")).toBe("cafe_deja_vu");
    expect(slugKey("1st")).toBe("q_1st");
    expect(slugKey("???")).toBe("question");
  });

  it("creates fields with unique keys and valid defaults", () => {
    let def = emptyForm("f");
    for (let i = 0; i < 3; i++) def = insertBlock(def, createField(def, { type: "single-choice", label: "Pick one" }));
    expect(def.blocks.map((b) => (b as FieldBlock).key)).toEqual(["pick_one", "pick_one_2", "pick_one_3"]);
    expect(parseForm(def).ok).toBe(true);
  });

  it("keeps every edit valid", () => {
    let def = sample();
    expect(parseForm(def).ok).toBe(true);
    def = moveBlock(def, "q_why", 0);
    def = duplicateBlock(def, "q_pick");
    def = updateBlock(def, "q_rating", { required: true, description: "" });
    expect(field(def, "q_rating").required).toBe(true);
    expect("description" in field(def, "q_rating")).toBe(false);
    expect(parseForm(def).ok).toBe(true);
  });

  it("dedupes a renamed key and drops rules when a type changes", () => {
    let def = updateBlock(sample(), "q_why", { key: "rating" });
    expect(field(def, "q_why").key).toBe("rating_2");
    def = updateBlock(def, "q_rating", { type: "yes-no" });
    expect(def.logic).toBeUndefined();
    expect(field(def, "q_rating").props).toBeUndefined();
    expect(parseForm(def).ok).toBe(true);
  });

  it("removes rules that point at a removed block", () => {
    expect(removeBlock(sample(), "q_rating").logic).toBeUndefined();
    expect(removeBlock(sample(), "q_pick").logic).toHaveLength(1);
  });

  it("keeps option values and drops rules comparing a removed one", () => {
    let def = addRule(sample(), { id: "r2", effect: "hide", target: "q_why", when: { op: "eq", left: { field: "q_pick" }, right: { value: "b" } } });
    def = setOptions(def, "q_pick", [{ value: "a", label: "Apple" }, { label: "Cherry" }]);
    expect(field(def, "q_pick").props?.options).toEqual([{ value: "a", label: "Apple" }, { value: "cherry", label: "Cherry" }]);
    expect(def.logic?.map((r) => r.id)).toEqual(["r1"]);
  });

  it("keeps the default ending and drops jumps to a removed one", () => {
    let def = addEnding(sample(), "Bye");
    def = addRule(def, { id: "j", effect: "jump", from: "q_rating", to: { ending: "bye" }, when: { op: "eq", left: { field: "q_rating" }, right: { value: 5 } } });
    expect(removeEnding(def, "default")).toBe(def);
    const out = removeEnding(def, "bye");
    expect(out.endings?.map((e) => e.id)).toEqual(["default"]);
    expect(out.logic?.map((r) => r.id)).toEqual(["r1"]);
  });

  it("renames hidden inputs everywhere they are used", () => {
    let def = addHidden(sample(), { name: "coach" });
    def = updateBlock(def, "q_why", { label: "Why, {{hidden:coach|friend}}?" });
    def = addRule(def, { id: "h", effect: "hide", target: "q_pick", when: { op: "eq", left: { hidden: "coach" }, right: { value: "x" } } });
    def = updateHidden(def, "coach", { name: "Coach Name" });
    expect(def.hidden?.[0]?.name).toBe("coach_name");
    expect(field(def, "q_why").label).toBe("Why, {{hidden:coach_name|friend}}?");
    expect(JSON.stringify(def.logic)).toContain('"hidden":"coach_name"');
    expect(parseForm(def).ok).toBe(true);
    def = removeHidden(def, "coach_name");
    expect(def.hidden).toBeUndefined();
    expect(def.logic?.map((r) => r.id)).toEqual(["r1"]);
  });

  it("stores only non-default settings", () => {
    let def = updateSettings(sample(), { anonymous: true });
    expect(def.settings).toEqual({ anonymous: true });
    def = updateSettings(def, { anonymous: false, clearHiddenValues: true });
    expect(def.settings).toBeUndefined();
  });
});

describe("templates", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is valid", (_id, t) => {
    const def = t.create();
    expect(parseForm(def).ok).toBe(true);
    if (t.id !== "blank") expect(analyze(def).canPublish).toBe(true);
    expect(t.create().id).not.toBe(def.id);
  });
});

describe("analyze", () => {
  it("blocks publishing an empty form", () => {
    const a = analyze(emptyForm("f"));
    expect(a.canPublish).toBe(false);
    expect(a.findings[0]?.message).toMatch(/at least one question/);
  });

  it("maps parse errors to the block", () => {
    const def = sample();
    const bad = { ...def, blocks: def.blocks.map((b) => (b.id === "q_pick" ? { ...field(def, "q_pick"), type: "no-such-type" } : b)) };
    const a = analyze(bad);
    expect(a.canPublish).toBe(false);
    expect(a.findings.some((f) => f.ref?.kind === "block" && f.ref.id === "q_pick")).toBe(true);
  });

  it("warns about a rule that can never fire", () => {
    const def = addRule(sample(), { id: "never", effect: "hide", target: "q_why", when: { op: "gt", left: { field: "q_rating" }, right: { value: 9 } } });
    expect(analyze(def).findings.some((f) => f.ref?.kind === "rule" && f.ref.id === "never")).toBe(true);
  });
});

describe("diff", () => {
  it("flags breaking changes", () => {
    const before = sample();
    let after = removeBlock(before, "q_why");
    after = updateBlock(after, "q_rating", { key: "score" });
    after = setOptions(after, "q_pick", [{ value: "a", label: "A" }]);
    const kinds = diffDefinitions(before, after).filter((c) => c.breaking).map((c) => c.kind).sort();
    expect(kinds).toEqual(["field-key-changed", "field-removed", "option-removed"]);
  });

  it("reports wording-only changes as safe", () => {
    const before = sample();
    const after = updateBlock(before, "q_why", { placeholder: "Tell us" });
    expect(diffDefinitions(before, after)).toEqual([{ kind: "text-changed", breaking: false, message: "Wording or details changed." }]);
    expect(isUnchanged(before, structuredClone(before))).toBe(true);
  });
});

describe("history", () => {
  it("undoes, redoes and coalesces typing", () => {
    const { result } = renderHook(() => useBuilderHistory(sample()));
    act(() => result.current.apply((d) => updateBlock(d, "q_why", { label: "W" }), "label"));
    act(() => result.current.apply((d) => updateBlock(d, "q_why", { label: "Wh" }), "label"));
    act(() => result.current.apply((d) => updateBlock(d, "q_why", { required: true })));
    act(() => result.current.undo());
    expect(field(result.current.value, "q_why").label).toBe("Wh");
    act(() => result.current.undo());
    expect(field(result.current.value, "q_why").label).toBe("Why?");
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(field(result.current.value, "q_why").label).toBe("Wh");
  });
});
