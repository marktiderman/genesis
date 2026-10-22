// @feat:forms-engine
import { describe, expect, it } from "vitest";
import { createForm, parseForm, replay, registerFieldType } from "../index";
import { simulate } from "../testing";
import { eventFeedback } from "./fixtures";

describe("defineForm", () => {
  it("produces canonical JSON that parses cleanly", () => {
    const def = eventFeedback.toJSON();
    expect(def.hidden).toEqual([
      { name: "session", type: "string", source: "server" },
      { name: "owner", type: "string", source: "server" },
      { name: "utm", type: "string", source: "url" },
    ]);
    expect(def.logic?.[2]).toMatchObject({ effect: "jump", from: "overall", to: "improve" });
    const parsed = parseForm(def);
    expect(parsed.ok).toBe(true);
  });

  it("has a stable fingerprint", () => {
    expect(eventFeedback.hash()).toBe(eventFeedback.hash());
    expect(eventFeedback.hash()).toMatch(/^[0-9a-f]{14}$/);
  });

  it("throws on a rule that names an unknown key", async () => {
    const { defineForm, f, when } = await import("../index");
    expect(() =>
      defineForm({ id: "x", title: "x", blocks: [f.yesNo("a", { label: "A" })], logic: [when("nope").is(1).hide("a")] }),
    ).toThrow(/no field with key "nope"/);
  });
});

describe("parseForm", () => {
  it("reports unknown types, bad references and operators that don't fit", () => {
    const result = parseForm({
      schemaVersion: 1,
      id: "bad",
      title: "Bad",
      blocks: [
        { kind: "field", id: "a", key: "a", type: "rating", label: "A" },
        { kind: "field", id: "b", key: "b", type: "nope", label: "B" },
      ],
      logic: [
        { id: "r1", when: { op: "contains", left: { field: "a" }, right: { value: 1 } }, effect: "hide", target: "zzz" },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/Unknown field type "nope"/);
    expect(messages).toMatch(/No block "zzz"/);
    expect(messages).toMatch(/"contains" does not apply to a rating field/);
  });

  it("reports malformed entries instead of throwing", () => {
    const result = parseForm({
      schemaVersion: 1,
      id: "m",
      title: "M",
      blocks: [{ kind: "content", id: "c" }, { kind: "field", id: "a", key: "a", type: "yes-no", label: "A" }],
      hidden: [null],
      logic: [{ id: "r1" }, { id: "r2", when: { op: "eq" }, effect: "hide", target: "a" }, { id: "r3", when: { all: [null] }, effect: "hide", target: "a" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/content|Required text/);
    expect(messages).toMatch(/hidden input needs a name/);
    expect(messages).toMatch(/needs an id and a `when`/);
    expect(messages).toMatch(/needs an `op` and a `left`/);
    expect(messages).toMatch(/condition must be an object/);
  });

  it("warns about backward jumps", () => {
    const result = parseForm({
      schemaVersion: 1,
      id: "w",
      title: "W",
      blocks: [
        { kind: "field", id: "a", key: "a", type: "yes-no", label: "A" },
        { kind: "field", id: "b", key: "b", type: "yes-no", label: "B" },
      ],
      logic: [{ id: "r1", when: { op: "eq", left: { field: "b" }, right: { value: true } }, effect: "jump", from: "b", to: "a" }],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings[0]?.message).toMatch(/only go forward/);
  });
});

describe("logic and navigation", () => {
  it("hides follow-up fields until the respondent asks for contact", () => {
    const sim = simulate(eventFeedback).answer({ overall: 5 });
    expect(sim.visibleKeys()).toEqual(["overall", "went_well", "improve", "contact_me"]);
    sim.answer({ contact_me: true });
    expect(sim.visibleKeys()).toEqual(["overall", "went_well", "improve", "contact_me", "name", "email"]);
  });

  it("skips 'what went well' after a low rating, and treats it as hidden", () => {
    const sim = simulate(eventFeedback).answer({ overall: 2, went_well: ["hosting"] });
    expect(sim.pathKeys()).toEqual(["overall", "improve", "contact_me"]);
    expect(sim.engine.answers()).toEqual({ overall: 2 });
  });

  it("steps forward and back along the path in focus layout", () => {
    const form = createForm(eventFeedback.definition, { clock: () => undefined });
    expect(form.next()).toBe(false);
    expect(form.getState().errors.overall).toMatch(/needs an answer/);
    form.setValue("overall", 3);
    expect(form.next()).toBe(true);
    expect(form.getState().current).toBe("improve");
    form.back();
    expect(form.getState().current).toBe("overall");
  });

  it("requires name and email only when they are shown", () => {
    const sim = simulate(eventFeedback).answer({ overall: 5 });
    expect(sim.submit()).toBe("default");
    const asked = simulate(eventFeedback).answer({ overall: 5, contact_me: true });
    expect(() => asked.submit()).toThrow(/name/);
    asked.answer({ name: "Ada", email: "not-an-email" });
    expect(() => asked.submit()).toThrow(/email address/);
    asked.answer({ email: "ada@example.com" });
    expect(asked.submit()).toBe("default");
  });

  it("recalls hidden inputs with a fallback", () => {
    const withOwner = createForm(eventFeedback.definition, { hidden: { owner: "Sam" } });
    expect(withOwner.text(withOwner.field("contact_me")!.label)).toBe("Want Sam to follow up with you?");
    const without = createForm(eventFeedback.definition);
    expect(without.text(without.field("contact_me")!.label)).toBe("Want someone to follow up with you?");
  });

  it("notifies subscribers and rebuilds identical state from the event log", () => {
    const form = createForm(eventFeedback.definition, { clock: () => undefined });
    let calls = 0;
    form.subscribe(() => calls++);
    form.setValue("overall", 4);
    form.next();
    form.setValue("contact_me", false);
    form.submit();
    expect(calls).toBeGreaterThan(0);
    const again = replay(eventFeedback.definition, form.getState().events);
    expect(again.getState().values).toEqual(form.getState().values);
    expect(again.getState().status).toBe("completed");
    expect(again.answers()).toEqual(form.answers());
  });
});

describe("field types", () => {
  it("rejects a non-JSON type without converters", () => {
    expect(() =>
      registerFieldType({
        type: "test/date",
        label: "Date",
        category: "date",
        value: { json: false } as never,
        operators: [],
        a11y: { semantics: "control" },
      }),
    ).toThrow(/serialize and deserialize/);
  });

  it("validates ratings in range", () => {
    const form = createForm(eventFeedback.definition);
    form.setValue("overall", 9);
    expect(form.submit()).toBe(false);
    expect(form.getState().errors.overall).toMatch(/1 to 5/);
  });
});
