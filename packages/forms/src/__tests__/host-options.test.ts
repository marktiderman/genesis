import { describe, expect, it } from "vitest";
import {
  choiceOptions,
  createForm,
  defineForm,
  f,
  optionsSource,
  parseForm,
  replay,
  summarizeValue,
  when,
  withHostOptions,
  type FieldBlock,
  type FormDefinition,
} from "../index";
import { validateSubmission } from "../server";

const coaches = [
  { value: "c-ada", label: "Ada" },
  { value: "c-sam", label: "Sam" },
];

const form = defineForm({
  id: "coach-pick",
  title: "Who coached you?",
  blocks: [
    f.singleChoice("coach", { label: "Your coach", required: true, optionsFrom: { source: "host", key: "coaches" } }),
    f.multiChoice("helpers", {
      label: "Who else helped?",
      options: [{ value: "nobody", label: "Nobody" }],
      optionsFrom: { source: "host", key: "coaches" },
    }),
    f.dropdown("room", { label: "Room", options: [{ value: "a", label: "Room A" }] }),
  ],
});
const def = form.definition;

const fieldOf = (d: FormDefinition, key: string) =>
  d.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!;

describe("optionsFrom", () => {
  it("is stored on the field's props by the f helpers, with no empty options list", () => {
    expect(fieldOf(def, "coach").props).toEqual({ optionsFrom: { source: "host", key: "coaches" } });
    expect(optionsSource(fieldOf(def, "helpers"))).toEqual({ source: "host", key: "coaches" });
    expect(optionsSource(fieldOf(def, "room"))).toBeUndefined();
  });

  it("parses, and a malformed one is an issue", () => {
    expect(parseForm(def).ok).toBe(true);
    const bad = structuredClone(def);
    fieldOf(bad, "coach").props = { optionsFrom: { source: "server", key: "coaches" } };
    const parsed = parseForm(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0]!.path).toBe("blocks[0].props.optionsFrom");
  });

  it("warns on a type that isn't a choice", () => {
    const d = structuredClone(def);
    d.blocks.push({ kind: "field", id: "t", key: "t", type: "short-text", label: "T", props: { optionsFrom: { source: "host", key: "x" } } });
    const parsed = parseForm(d);
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.map((w) => w.path)).toContain("blocks[3].props.optionsFrom");
  });

  it("doesn't flag a rule comparing with a value only the app supplies", () => {
    const withRule = defineForm({
      id: "r",
      title: "R",
      blocks: [
        f.singleChoice("coach", { label: "Coach", optionsFrom: { source: "host", key: "coaches" } }),
        f.shortText("why", { label: "Why?" }),
      ],
      logic: [when("coach").is("c-ada").show("why")],
    });
    expect(parseForm(withRule.definition).warnings).toEqual([]);
  });
});

describe("withHostOptions", () => {
  it("adds the host's list after the field's own options, each value once", () => {
    const resolved = withHostOptions(def, { coaches: [...coaches, { value: "nobody", label: "Dup" }] });
    expect(choiceOptions(fieldOf(resolved, "coach"))).toEqual([...coaches, { value: "nobody", label: "Dup" }]);
    // "nobody" is the field's own option already: it keeps its own label.
    expect(choiceOptions(fieldOf(resolved, "helpers"))).toEqual([{ value: "nobody", label: "Nobody" }, ...coaches]);
    expect(fieldOf(resolved, "room")).toBe(fieldOf(def, "room"));
    // The input is untouched.
    expect(fieldOf(def, "coach").props?.options).toBeUndefined();
  });

  it("returns the same definition when nothing comes from the host", () => {
    expect(withHostOptions(def, undefined)).toBe(def);
    expect(withHostOptions(def, { other: coaches })).toBe(def);
    const plain = defineForm({ id: "p", title: "P", blocks: [f.dropdown("d", { label: "D", options: [{ value: "a" }] })] }).definition;
    expect(withHostOptions(plain, { coaches })).toBe(plain);
  });

  it("drops malformed host entries and never reads inherited keys", () => {
    const resolved = withHostOptions(def, {
      coaches: [{ value: "" }, { value: 3 }, null, { value: "ok", label: 5 }, { value: "ok" }] as never,
    });
    expect(choiceOptions(fieldOf(resolved, "coach"))).toEqual([{ value: "ok" }]);
    const proto = defineForm({
      id: "x",
      title: "X",
      blocks: [f.singleChoice("c", { label: "C", optionsFrom: { source: "host", key: "constructor" } })],
    }).definition;
    expect(withHostOptions(proto, {})).toBe(proto);
  });
});

describe("the engine with hostOptions", () => {
  it("shows the host's options and accepts only them", () => {
    const engine = createForm(def, { hostOptions: { coaches } });
    expect(choiceOptions(engine.field("coach")!)).toEqual(coaches);
    engine.setValue("coach", "c-zed");
    expect(engine.submit()).toBe(false);
    expect(engine.getState().errors["coach"]).toBe("Choose one of the options.");
    engine.setValue("coach", "c-sam");
    expect(engine.submit()).toBe(true);
    expect(summarizeValue("c-sam", engine.field("coach")!)).toBe("Sam");
  });

  it("without the list, a field offers its own options only", () => {
    const engine = createForm(def);
    expect(engine.definition).toBe(def);
    engine.setValue("helpers", ["c-ada"]);
    engine.setValue("coach", "c-ada");
    expect(engine.submit()).toBe(false);
    expect(Object.keys(engine.getState().errors).sort()).toEqual(["coach", "helpers"]);
  });

  it("replays against the same lists", () => {
    const engine = createForm(def, { hostOptions: { coaches } });
    engine.setValue("coach", "c-ada");
    const again = replay(def, engine.getState().events, { hostOptions: { coaches } });
    expect(again.getState().values["coach"]).toBe("c-ada");
    expect(again.submit()).toBe(true);
  });
});

describe("validateSubmission with hostOptions", () => {
  it("accepts a value the server supplies", () => {
    const result = validateSubmission(def, { answers: { coach: "c-ada", helpers: ["nobody", "c-sam"] } }, { hostOptions: { coaches } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.submission.answers).toEqual({ coach: "c-ada", helpers: ["nobody", "c-sam"] });
  });

  it("refuses a value the server does not supply now (a coach who left, a made-up id)", () => {
    const now = { coaches: [coaches[1]!] };
    const result = validateSubmission(def, { answers: { coach: "c-ada" } }, { hostOptions: now });
    expect(result).toEqual({ ok: false, errors: { coach: "Choose one of the options." } });
    const many = validateSubmission(def, { answers: { coach: "c-sam", helpers: ["c-ada"] } }, { hostOptions: now });
    expect(many).toEqual({ ok: false, errors: { helpers: "Choose from the options." } });
  });

  it("refuses every host value when the server passes no list", () => {
    const result = validateSubmission(def, { answers: { coach: "c-ada" } });
    expect(result.ok).toBe(false);
  });

  it("checks replayed events against the server's lists too", () => {
    const engine = createForm(def, { hostOptions: { coaches: [...coaches, { value: "c-fake" }] } });
    engine.setValue("coach", "c-fake");
    engine.submit();
    const result = validateSubmission(def, { events: engine.getState().events }, { hostOptions: { coaches } });
    expect(result).toEqual({ ok: false, errors: { coach: "Choose one of the options." } });
  });

  it("checks drafts' formats against them", () => {
    const result = validateSubmission(def, { answers: { coach: "c-zed" } }, { complete: false, hostOptions: { coaches } });
    expect(result).toEqual({ ok: false, errors: { coach: "Choose one of the options." } });
  });
});
