import { describe, expect, it } from "vitest";
import { parseForm, type FieldBlock, type FormDefinition, type LogicRule } from "@marktiderman/genesis-forms";
import { analyze, structureFingerprint } from "../analyze";
import { diffDefinitions } from "../diff";
import { historyReducer } from "../history";
import * as ops from "../ops";
import { visitFeedback } from "./fixtures";

const field = (def: FormDefinition, id: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === id)!;
const options = (def: FormDefinition, id: string) => field(def, id).props!.options as { value: string; label: string }[];

const base = (): FormDefinition => ({
  schemaVersion: 1,
  id: "f",
  title: "T",
  blocks: [
    {
      kind: "field",
      id: "q_a",
      key: "a",
      type: "single-choice",
      label: "A",
      props: { options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }] },
    },
    { kind: "field", id: "q_b", key: "b", type: "short-text", label: "B" },
  ],
  logic: [{ id: "r1", effect: "show", target: "q_b", when: { op: "in", left: { field: "q_a" }, right: { value: ["x", "y"] } } }],
  endings: [{ id: "default", title: "Thanks {{field:a}}" }],
});

describe("analyze when coverage is truncated", () => {
  it("reports one info and no path warnings", () => {
    let d = visitFeedback();
    for (let i = 0; i < 2; i++) d = ops.insertBlock(d, ops.createField(d, { type: i % 2 ? "yes-no" : "rating", label: `Extra ${i}` }));
    const a = analyze(d);
    expect(a.coverage?.truncated).toBe(true);
    expect(a.findings.filter((f) => f.level === "warning")).toEqual([]);
    expect(a.findings.filter((f) => f.level === "info")).toHaveLength(1);
    expect(a.canPublish).toBe(true);
  });

  it("reuses coverage while only wording changes", () => {
    const d = visitFeedback();
    const first = analyze(d).coverage;
    const reworded = ops.updateBlock(d, "q_rating", { label: "How was it?" });
    expect(structureFingerprint(reworded)).toBe(structureFingerprint(d));
    expect(analyze(reworded).coverage).toBe(first);
    expect(structureFingerprint(ops.updateBlock(d, "q_rating", { required: false }))).not.toBe(structureFingerprint(d));
  });

  it("warns about missing wording", () => {
    let d = ops.updateBlock(base(), "q_b", { label: "" });
    d = ops.updateEnding(d, "default", { title: "" });
    d = ops.setOptions(d, "q_a", [{ value: "x", label: "" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }]);
    const messages = analyze(d).findings.filter((f) => f.level === "warning").map((f) => f.message);
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/"b" has no wording/), expect.stringMatching(/option .* no label/i), expect.stringMatching(/no title/)]),
    );
  });
});

describe("option values", () => {
  it("never reuse a removed option's value", () => {
    let d = ops.insertBlock(ops.emptyForm("f"), ops.createField(ops.emptyForm(), { type: "single-choice" }));
    const id = d.blocks[0]!.id;
    d = ops.setOptions(d, id, [{ value: "option_1", label: "Bad" }, { value: "option_2", label: "Good" }]);
    const published = d;
    d = ops.setOptions(d, id, [{ value: "option_1", label: "Bad" }]);
    d = ops.setOptions(d, id, [...options(d, id), { label: "Option 2" }]);
    const added = options(d, id)[1]!;
    expect(added.value).not.toBe("option_2");
    d = ops.setOptions(d, id, [options(d, id)[0]!, { value: added.value, label: "Terrible" }]);
    const kinds = diffDefinitions(published, d).map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["option-removed", "option-added"]));
  });

  it("say that a relabel shows on earlier answers", () => {
    const d = ops.setOptions(base(), "q_a", [{ value: "x", label: "Ex" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }]);
    const change = diffDefinitions(base(), d).find((c) => c.kind === "option-label-changed");
    expect(change?.message).toMatch(/earlier answers .* new label/);
  });

  it("leave an 'is one of' list, and drop the rule only when it empties", () => {
    let d = ops.setOptions(base(), "q_a", [{ value: "x", label: "X" }, { value: "z", label: "Z" }]);
    expect(d.logic?.[0]?.when).toEqual({ op: "in", left: { field: "q_a" }, right: { value: ["x"] } });
    d = ops.setOptions(d, "q_a", [{ value: "z", label: "Z" }]);
    expect(d.logic).toBeUndefined();
    expect(parseForm(d).ok).toBe(true);
  });
});

describe("recall", () => {
  it("covers endings and the introduction", () => {
    let d = ops.updateForm(base(), { description: "About {{field:a|it}}" });
    d = ops.updateEnding(d, "default", { description: "You said {{field:a}}" });
    d = ops.updateBlock(d, "q_a", { key: "answer" });
    expect(d.endings?.[0]).toMatchObject({ title: "Thanks {{field:answer}}", description: "You said {{field:answer}}" });
    expect(d.description).toBe("About {{field:answer|it}}");
    d = ops.removeBlock(d, "q_a");
    expect(d.endings?.[0]).toMatchObject({ title: "Thanks " });
    expect(d.description).toBe("About it");
  });
});

describe("removeBlock", () => {
  const withJump = (): FormDefinition => {
    const d = base();
    d.blocks.push({ kind: "page-break", id: "p" }, { kind: "field", id: "q_c", key: "c", type: "short-text", label: "C" });
    d.logic = [{ id: "j", effect: "jump", from: "q_a", to: "q_b", when: { op: "eq", left: { field: "q_a" }, right: { value: "x" } } }];
    return d;
  };

  it("sends a jump to the removed block on to the next step", () => {
    const d = ops.removeBlock(withJump(), "q_b");
    expect((d.logic?.[0] as Extract<LogicRule, { effect: "jump" }>).to).toBe("q_c");
    expect(parseForm(d).ok).toBe(true);
  });

  it("or to the default ending when it was the last", () => {
    let d = ops.removeBlock(withJump(), "q_c");
    d = ops.updateRule(d, "j", { ...(d.logic![0] as Extract<LogicRule, { effect: "jump" }>), to: "q_b" });
    d = ops.removeBlock(d, "q_b");
    expect((d.logic?.[0] as Extract<LogicRule, { effect: "jump" }>).to).toEqual({ ending: "default" });
  });

  it("still removes show/hide rules on it", () => {
    expect(ops.removeBlock(base(), "q_b").logic).toBeUndefined();
  });
});

describe("type changes", () => {
  it("keep options and fitting rules between single and multiple choice", () => {
    let d = ops.addRule(base(), { id: "r2", effect: "hide", target: "q_b", when: { op: "answered", left: { field: "q_a" } } });
    d = ops.updateBlock(d, "q_a", { type: "multi-choice" });
    expect(options(d, "q_a").map((o) => o.value)).toEqual(["x", "y", "z"]);
    expect(d.logic?.map((r) => r.id)).toEqual(["r2"]);
    expect(parseForm(d).ok).toBe(true);
  });

  it("of a hidden input drop the rules that no longer fit", () => {
    let d = ops.addHidden(base(), { name: "owner" });
    d = ops.addRule(d, { id: "h1", effect: "hide", target: "q_b", when: { op: "in", left: { hidden: "owner" }, right: { value: ["ann"] } } });
    d = ops.addRule(d, { id: "h2", effect: "hide", target: "q_b", when: { op: "answered", left: { hidden: "owner" } } });
    d = ops.updateHidden(d, "owner", { type: "boolean" });
    expect(d.logic?.map((r) => r.id)).toEqual(["r1", "h2"]);
  });
});

describe("hidden inputs", () => {
  it("store identifying only when true", () => {
    let d = ops.addHidden(base(), { name: "member", identifying: true });
    expect(d.hidden?.[0]).toMatchObject({ name: "member", identifying: true });
    d = ops.updateHidden(d, "member", { identifying: false });
    expect(d.hidden?.[0]).not.toHaveProperty("identifying");
    expect(parseForm(d).ok).toBe(true);
  });
});

describe("reserved names", () => {
  it("are never produced", () => {
    expect(field(ops.updateBlock(base(), "q_b", { key: "constructor" }), "q_b").key).toBe("constructor_2");
    expect(ops.addHidden(base(), { name: "constructor" }).hidden?.[0]?.name).toBe("constructor_2");
    expect(ops.uniqueName("toString", [])).toBe("toString_2");
    expect(parseForm(ops.updateBlock(base(), "q_b", { key: "constructor" })).ok).toBe(true);
  });
});

describe("diff", () => {
  it("breaks on a smaller scale, a server input from the link, a new form id", () => {
    const rating = ops.insertBlock(ops.emptyForm("f"), { kind: "field", id: "q_r", key: "r", type: "rating", label: "R", props: { max: 10 } });
    expect(diffDefinitions(rating, ops.updateBlock(rating, "q_r", { props: { max: 5 } }))[0]).toMatchObject({ breaking: true });
    expect(diffDefinitions(rating, ops.updateBlock(rating, "q_r", { props: { max: 10 } }))).toEqual([]);
    const server = ops.addHidden(base(), { name: "member", source: "server" });
    const change = diffDefinitions(server, ops.updateHidden(server, "member", { source: "url" }));
    expect(change).toEqual([expect.objectContaining({ kind: "hidden-changed", breaking: true })]);
    expect(diffDefinitions(base(), { ...base(), id: "other" })).toEqual([expect.objectContaining({ kind: "form-id-changed", breaking: true })]);
  });

  it("reports wording alongside other changes, and option reorders", () => {
    let d = ops.updateForm(base(), { title: "T2", description: "now with a privacy notice" });
    d = ops.updateBlock(d, "q_b", { description: "new" });
    d = ops.updateEnding(d, "default", { description: "Bye" });
    d = ops.setOptions(d, "q_a", [{ value: "z", label: "Z" }, { value: "x", label: "X" }, { value: "y", label: "Y" }]);
    const changes = diffDefinitions(base(), d);
    expect(changes.map((c) => c.kind).sort()).toEqual(["option-reordered", "text-changed", "title-changed"]);
    expect(changes.find((c) => c.kind === "text-changed")?.message).toMatch(/introduction.*question descriptions.*endings/);
    expect(changes.every((c) => !c.breaking)).toBe(true);
  });

  it("ignores key order", () => {
    const d = base();
    const shuffled = { ...d, logic: [{ when: d.logic![0]!.when, target: "q_b", effect: "show", id: "r1" } as LogicRule] };
    expect(diffDefinitions(d, shuffled)).toEqual([]);
  });
});

describe("no-op edits", () => {
  it("return the same definition", () => {
    const d = base();
    expect(ops.updateSettings(d, { anonymous: false })).toBe(d);
    expect(ops.moveBlock(d, "q_a", 0)).toBe(d);
    expect(ops.moveBlock(d, "q_b", 9)).toBe(d);
    expect(ops.updateForm(d, { title: "T" })).toBe(d);
    expect(ops.updateBlock(d, "q_b", { label: "B" })).toBe(d);
    expect(ops.updateBlock(d, "q_b", { key: "B" })).toBe(d);
    expect(ops.setOptions(d, "q_a", options(d, "q_a"))).toBe(d);
    expect(ops.updateEnding(d, "default", { title: d.endings![0]!.title })).toBe(d);
    expect(ops.updateRule(d, "r1", d.logic![0]!)).toBe(d);
  });

  it("add no undo step", () => {
    const s = { past: [], present: base(), future: [] };
    expect(historyReducer(s, { type: "apply", edit: (d) => ops.updateSettings(d, { anonymous: false }) })).toBe(s);
    expect(historyReducer(s, { type: "apply", edit: (d) => ops.moveBlock(d, "q_a", 0) })).toBe(s);
  });
});
