/** Regression tests for the engine hardening review: one block per finding. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  coerceHidden,
  createForm,
  defineForm,
  evaluate,
  f,
  isFormEvent,
  isSensitive,
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
import { afterClass } from "./sample-forms";

const field = (id: string, type: string, extra: Partial<FieldBlock> = {}): FieldBlock => ({
  kind: "field",
  id,
  key: id,
  type,
  label: id,
  ...extra,
});
const raw = (blocks: FormDefinition["blocks"], rest: Partial<FormDefinition> = {}): FormDefinition => ({
  schemaVersion: 1,
  id: "t",
  title: "T",
  blocks,
  ...rest,
});

describe("1. clearHiddenValues: false keeps only valid hidden values", () => {
  const form = defineForm({
    id: "keep",
    title: "Keep",
    settings: { clearHiddenValues: false },
    blocks: [
      f.yesNo("likes", { label: "?" }),
      f.rating("score", { label: "s", required: true }),
      f.shortText("why", { label: "w", maxLength: 10 }),
      f.shortText("note", { label: "n" }),
    ],
    logic: [
      when("likes").is(false).show("why"),
      when("likes").is(true).hide("note"),
      when("likes").is(true).jumpTo({ ending: "end" }),
    ],
    endings: [{ id: "end", title: "E" }],
  });

  it("drops unvalidated values of hidden and jumped-over fields, on submit and in drafts", () => {
    const answers = { likes: true, score: { evil: 1 }, why: "x".repeat(1000), note: "kept" } as Record<string, Json>;
    for (const complete of [true, false]) {
      const result = validateSubmission(form.definition, { answers }, { complete });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.submission.answers).toEqual({ likes: true, note: "kept" });
    }
  });

  it("keeps a valid hidden value", () => {
    const result = validateSubmission(form.definition, { answers: { likes: true, score: 4 } });
    expect(result.ok && result.submission.answers).toEqual({ likes: true, score: 4 });
  });
});

describe("2. email validation", () => {
  const def = raw([field("email", "email")]);

  it("rejects addresses over 254 characters and hostile input in linear time", () => {
    expect(validateField(def.blocks[0] as FieldBlock, `${"a".repeat(250)}@x.io`)).toMatch(/email address/);
    const hostile = `a@${".".repeat(50_000)}@`;
    const start = performance.now();
    expect(validateSubmission(def, { answers: { email: hostile } }).ok).toBe(false);
    expect(validateField(def.blocks[0] as FieldBlock, `a@${"a.".repeat(50_000)}`)).toMatch(/email/);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("accepts what the old pattern accepted", () => {
    const check = (v: string) => validateField(def.blocks[0] as FieldBlock, v);
    for (const ok of ["a@b.co", "a.b+c@d.e.f", "x@y.zz", "a@b.c."]) expect(check(ok), ok).toBeNull();
    for (const bad of ["a@b", "a@.b", "a@b.", "@b.co", "a b@c.de", "a@b@c.de", "a@"]) expect(check(bad), bad).not.toBeNull();
  });

  it("validates and stores the trimmed value, on the client and the server", () => {
    const engine = createForm(def);
    engine.setValue("email", "   x@y.zz   ");
    expect(engine.answers()).toEqual({ email: "x@y.zz" });
    const result = validateSubmission(def, { answers: { email: "   x@y.zz   " } });
    expect(result.ok && result.submission.answers).toEqual({ email: "x@y.zz" });
  });
});

describe("3. long event logs", () => {
  const def = raw([field("a", "short-text"), field("b", "short-text")]);
  const alternating = (n: number): FormEvent[] =>
    Array.from({ length: n }, (_, i) => ({ type: "answer", field: i % 2 ? "a" : "b", value: String(i) }));

  it("replays 40 000 events in linear time and logs the same events", () => {
    const events = alternating(40_000);
    const start = performance.now();
    const engine = replay(def, events);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(engine.getState().events).toEqual(events);
    // The log is the engine's own copy: live events after a replay still notify.
    let calls = 0;
    engine.subscribe(() => calls++);
    engine.setValue("a", "live");
    expect(calls).toBe(1);
    expect(engine.getState().events).toHaveLength(40_001);
  });

  it("compacts before enforcing maxEvents", () => {
    const keystrokes: FormEvent[] = Array.from({ length: 40_000 }, (_, i) => ({ type: "answer", field: "a", value: "x".repeat(i % 50) }));
    expect(validateSubmission(def, { events: keystrokes }, { complete: false }).ok).toBe(true);
    const tooMany = validateSubmission(def, { events: alternating(10_001) }, { complete: false });
    expect(tooMany).toEqual({ ok: false, errors: { "": expect.stringMatching(/Too many events: 10001.*limit is 10000/) } });
    expect(validateSubmission(def, { events: alternating(20) }, { complete: false, maxEvents: 10 }).ok).toBe(false);
  });
});

describe("4. logic reads only the answers on the path", () => {
  const form = defineForm({
    id: "chain",
    title: "Chain",
    blocks: [f.yesNo("a", { label: "a" }), f.yesNo("b", { label: "b" }), f.shortText("c", { label: "c", required: true })],
    logic: [when("a").is(true).show("b"), when("b").is(true).show("c")],
  });

  it("a hidden field's stale value does not show later blocks, on the client or the server", () => {
    const engine = createForm(form.definition);
    engine.setValue("a", true);
    engine.setValue("b", true);
    expect(engine.getState().path).toEqual(["a", "b", "c"]);
    engine.setValue("a", false);
    expect(engine.getState().path).toEqual(["a"]);
    expect(engine.submit()).toBe(true);
    const server = validateSubmission(form.definition, { answers: { a: false, b: true } });
    expect(server.ok && server.submission.answers).toEqual({ a: false });
  });

  it("a jumped-over field's value does not drive logic", () => {
    const def = defineForm({
      id: "jump",
      title: "Jump",
      blocks: [f.yesNo("skip", { label: "s" }), f.yesNo("x", { label: "x" }), f.shortText("y", { label: "y" })],
      logic: [when("skip").is(true).jumpTo("y"), when("x").is(true).hide("y")],
    }).definition;
    const engine = createForm(def);
    engine.setValue("x", true);
    engine.setValue("skip", true);
    expect(engine.getState().path).toEqual(["skip", "y"]);
  });

  it("a later field reads as unanswered, and parseForm warns about it", () => {
    const def = raw([field("a", "short-text"), field("b", "yes-no")], {
      logic: [{ id: "r1", when: { op: "eq", left: { field: "b" }, right: { value: true } }, effect: "hide", target: "a" }],
    });
    const engine = createForm(def);
    engine.setValue("b", true);
    expect(engine.isVisible("a")).toBe(true);
    const parsed = parseForm(def);
    expect(parsed.warnings.map((w) => w.message).join()).toMatch(/Reads "b", which does not come before "a"/);
  });
});

describe("5. initialValues are logged", () => {
  it("records prefilled answers as leading answer events that replay and the server agree on", () => {
    const def = raw([field("email", "email", { required: true }), field("ok", "yes-no")]);
    const engine = createForm(def, { initialValues: { email: "me@x.io", bogus: 1 }, clock: () => undefined });
    expect(engine.getState().events).toEqual([{ type: "answer", field: "email", value: "me@x.io", source: "prefill" }]);
    engine.setValue("ok", true);
    expect(engine.submit()).toBe(true);
    const again = replay(def, engine.getState().events);
    expect(again.getState()).toEqual(engine.getState());
    const server = validateSubmission(def, { events: engine.getState().events });
    expect(server.ok && server.submission.answers).toEqual({ email: "me@x.io", ok: true });
  });
});

describe("6. coerceHidden", () => {
  const def = raw([field("q1", "short-text"), field("q2", "short-text", { required: true })], {
    hidden: [
      { name: "score", type: "number", source: "url" },
      { name: "coach", type: "string", source: "server" },
    ],
    logic: [{ id: "r1", when: { op: "gt", left: { hidden: "score" }, right: { value: 3 } }, effect: "show", target: "q2" }],
  });

  it("types url inputs on the client exactly as the server does", () => {
    const engine = createForm(def, { hidden: { score: "5" } });
    expect(engine.getState().hidden.score).toBe(5);
    expect(engine.getState().path).toEqual(["q1", "q2"]);
    expect(engine.submit()).toBe(false);
    const server = validateSubmission(def, { events: engine.getState().events, hidden: { score: "5" } });
    expect(server.ok).toBe(false);
    expect(Object.keys((server as { errors: object }).errors)).toEqual(["q2"]);
  });

  it("filters by source and reports what it drops", () => {
    expect(coerceHidden(def, { score: "7", coach: "Sam", nope: 1 }, { sources: ["url"] })).toEqual({
      values: { score: 7 },
      ignored: ["coach", "nope"],
    });
  });
});

describe("7. unknown field types", () => {
  it("validateField rejects a value for a type with no manifest", () => {
    expect(validateField(field("sig", "acme/missing"), { huge: "x" })).toMatch(/Unknown field type/);
    expect(validateField(field("sig", "acme/missing"), undefined)).toBeNull();
  });

  it("validateSubmission rejects a definition that does not parse", () => {
    const def = raw([field("sig", "signatur")]);
    const result = validateSubmission(def, { answers: { sig: { nested: [[[1]]] } } });
    expect(result).toEqual({ ok: false, errors: { "": expect.stringMatching(/Invalid form definition.*signatur/) } });
  });
});

describe("8. malformed submissions", () => {
  const def = afterClass.definition;
  const malformed = [
    null,
    "x",
    [],
    { events: [null] },
    { events: {} },
    { events: "x" },
    { events: [{ type: "answer" }] },
    { events: [{ type: "answer", field: "overall", value: () => 1 }] },
    { events: [{ type: "next", at: "soon" }] },
    { answers: null },
    { answers: [] },
    { hidden: "abc" },
    { answers: { overall: Number.NaN } },
    { answers: { overall: new Date() } },
  ];

  it.each(malformed.map((m, i) => [i, m]))("malformed input %i is rejected without throwing", (_i, input) => {
    expect(validateSubmission(def, input as never)).toEqual({ ok: false, errors: { "": "Malformed submission." } });
  });

  it("survives a deeply nested value", () => {
    let deep: Json = 1;
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(() => validateSubmission(def, { answers: { improve: deep } })).not.toThrow();
  });

  it("exports isFormEvent", () => {
    expect(isFormEvent({ type: "answer", field: "a", value: 1, source: "prefill" })).toBe(true);
    expect(isFormEvent({ type: "answer", field: "a", value: 1, source: "typed" })).toBe(false);
    expect(isFormEvent({ type: "submit", at: 3 })).toBe(true);
    expect(isFormEvent({ type: "focus" })).toBe(false);
  });
});

describe("9. package exports", () => {
  it("gives require consumers .d.cts types and import consumers .d.ts types", () => {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    for (const [subpath, name] of [[".", "index"], ["./server", "server"], ["./testing", "testing"]] as const) {
      expect(pkg.exports[subpath], subpath).toEqual({
        import: { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` },
        require: { types: `./dist/${name}.d.cts`, default: `./dist/${name}.cjs` },
      });
    }
  });
});

describe("10. Object.prototype names", () => {
  it("parseForm rejects them as ids, keys, hidden names and ending ids", () => {
    const result = parseForm(
      raw([field("constructor", "short-text"), { ...field("q", "yes-no"), key: "toString" }], {
        hidden: [{ name: "__proto__", type: "string", source: "url" }],
        endings: [{ id: "valueOf", title: "E" }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path)).toEqual(["blocks[0].id", "blocks[1].key", "hidden[0].name", "endings[0].id"]);
  });

  it("an unparsed definition with such ids does not read inherited properties as answers or errors", () => {
    const def = raw([field("constructor", "short-text"), field("toString", "yes-no")]);
    const engine = createForm(def);
    expect(engine.answers()).toEqual({});
    expect(engine.submit()).toBe(true);
    expect(engine.text("{{field:constructor|none}}")).toBe("none");
  });
});

describe("11 and A. parseForm on hostile input", () => {
  const yesNo = field("q", "yes-no");
  const hostile: unknown[] = [
    raw([], { endings: "x" as never }),
    raw([], { endings: [null] as never }),
    raw([], { endings: [{ id: 3, title: "t" }] as never }),
    raw([yesNo], { logic: [{ id: "r", when: { op: "answered", left: { field: "q" } }, effect: "jump", from: "q", to: null } as never] }),
    raw([yesNo], {
      hidden: [{ name: "x", type: "string", source: "url" }],
      logic: [{ id: "r", when: { op: "nope", left: { hidden: "x" } }, effect: "explode", target: "q" } as never],
    }),
    raw([yesNo], { logic: [{ id: "r", when: { op: "eq", left: { field: 5 } }, effect: "hide", target: "q" } as never] }),
  ];

  it.each(hostile.map((d, i) => [i, d]))("case %i returns issues", (_i, def) => {
    expect(() => parseForm(def)).not.toThrow();
    expect(parseForm(def).ok).toBe(false);
  });

  it("checks operators on hidden operands too", () => {
    const result = parseForm(
      raw([yesNo], {
        hidden: [{ name: "x", type: "string", source: "url" }],
        logic: [{ id: "r", when: { op: "like" as never, left: { hidden: "x" } }, effect: "hide", target: "q" }],
      }),
    );
    expect(!result.ok && result.issues.map((i) => i.message)).toEqual(['Unknown operator "like".']);
  });

  it("requires text where the renderer expects text", () => {
    const result = parseForm({
      ...raw(
        [
          { ...yesNo, label: 1 as never, description: {} as never },
          { kind: "content", id: "c", type: "text", text: [] as never },
          field("pick", "single-choice", { props: { options: [{ value: "a", label: 2 }, { label: "no value" }] } }),
        ],
        { endings: [{ id: "default", title: {} as never, description: 3 as never }] },
      ),
      title: {},
      description: 4,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path).sort()).toEqual(
      [
        "title",
        "description",
        "blocks[0].label",
        "blocks[0].description",
        "blocks[1].text",
        "blocks[2].props.options[0].label",
        "blocks[2].props.options[1]",
        "endings[0].title",
        "endings[0].description",
      ].sort(),
    );
  });

  it("survives a deeply nested condition", () => {
    let when: unknown = { op: "answered", left: { field: "q" } };
    for (let i = 0; i < 50_000; i++) when = { not: when };
    const result = parseForm(raw([yesNo], { logic: [{ id: "r", when, effect: "hide", target: "q" } as never] }));
    expect(!result.ok && result.issues[0]?.message).toMatch(/nested too deeply/);
  });

  test.prop([fc.jsonValue({ maxDepth: 6 })], { numRuns: 300 })("arbitrary JSON never throws", (value) => {
    parseForm(value);
  });

  const block = fc.record(
    {
      kind: fc.constantFrom("field", "content", "page-break", "x"),
      id: fc.oneof(fc.constantFrom("a", "b", "constructor"), fc.jsonValue({ maxDepth: 1 })),
      key: fc.oneof(fc.constantFrom("a", "b"), fc.jsonValue({ maxDepth: 1 })),
      type: fc.oneof(fc.constantFrom("yes-no", "rating", "single-choice", "heading"), fc.jsonValue({ maxDepth: 1 })),
      label: fc.jsonValue({ maxDepth: 1 }),
      text: fc.jsonValue({ maxDepth: 1 }),
      props: fc.jsonValue({ maxDepth: 3 }),
    },
    { requiredKeys: [] },
  );
  const definition = fc.record(
    {
      schemaVersion: fc.constantFrom(1, 2),
      id: fc.jsonValue({ maxDepth: 1 }),
      title: fc.jsonValue({ maxDepth: 1 }),
      description: fc.jsonValue({ maxDepth: 1 }),
      blocks: fc.oneof(fc.array(block, { maxLength: 4 }), fc.jsonValue({ maxDepth: 2 })),
      hidden: fc.jsonValue({ maxDepth: 3 }),
      logic: fc.oneof(
        fc.array(
          fc.record(
            {
              id: fc.jsonValue({ maxDepth: 1 }),
              when: fc.jsonValue({ maxDepth: 4 }),
              effect: fc.constantFrom("show", "hide", "jump", "x"),
              target: fc.constantFrom("a", "b", 1),
              from: fc.constantFrom("a", "b", null),
              to: fc.jsonValue({ maxDepth: 2 }),
            },
            { requiredKeys: [] },
          ),
          { maxLength: 3 },
        ),
        fc.jsonValue({ maxDepth: 3 }),
      ),
      endings: fc.jsonValue({ maxDepth: 3 }),
    },
    { requiredKeys: [] },
  );
  test.prop([definition], { numRuns: 500 })("definition-shaped JSON never throws", (value) => {
    parseForm(value);
  });
});

describe("12. strict server coercion", () => {
  const def = raw([field("m", "multi-choice", { props: { options: [{ value: "a" }, { value: "b" }] } })], {
    hidden: [
      { name: "n", type: "number", source: "url" },
      { name: "s", type: "string", source: "url" },
      { name: "b", type: "boolean", source: "host" },
    ],
  });
  const hiddenOf = (hidden: Record<string, Json>) => {
    const result = validateSubmission(def, { answers: {}, hidden });
    return result.ok ? result.submission : null;
  };

  it("accepts only primitives, never treats blank text as a number, and caps strings", () => {
    expect(hiddenOf({ n: "", s: { a: 1 }, b: [] })).toMatchObject({ hidden: {}, ignored: ["hidden.n", "hidden.s", "hidden.b"] });
    expect(hiddenOf({ n: [], s: [1, 2], b: 1 })?.hidden).toEqual({});
    expect(hiddenOf({ n: "  ", s: "x".repeat(1001) })?.hidden).toEqual({});
    expect(hiddenOf({ n: true })?.hidden).toEqual({});
    expect(hiddenOf({ n: " 4 ", s: "x".repeat(1000), b: "true" })?.hidden).toEqual({ n: 4, s: "x".repeat(1000), b: true });
    expect(hiddenOf({ s: 5 })?.hidden).toEqual({ s: "5" });
  });

  it("rejects repeated multi-choice options", () => {
    expect(validateSubmission(def, { answers: { m: Array<Json>(200_000).fill("a") } }).ok).toBe(false);
    expect(validateSubmission(def, { answers: { m: ["a", "a"] } }).ok).toBe(false);
    expect(validateSubmission(def, { answers: { m: ["b", "a"] } }).ok).toBe(true);
  });
});

describe("13. defineForm validates", () => {
  it("throws with every issue listed", () => {
    expect(() =>
      defineForm({
        id: "d",
        title: "D",
        blocks: [f.shortText("name", { label: "First" }), f.shortText("name", { label: "Last" }), f.custom("signatur", "sig", { label: "x" })],
      }),
    ).toThrow(/Duplicate id "name"[\s\S]*Duplicate key "name"[\s\S]*Unknown field type "signatur"/);
  });

  it("lets rules show, hide and jump to content blocks by id", () => {
    const form = defineForm({
      id: "c",
      title: "C",
      blocks: [f.yesNo("q", { label: "q" }), f.text("thanks", "Thanks!"), f.heading("later", "Later"), f.yesNo("z", { label: "z" })],
      logic: [when("q").is(true).show("thanks"), when("q").is(false).jumpTo("later"), when("q").is(true).hide("later")],
    });
    expect(form.definition.logic?.map((r) => ("target" in r ? r.target : r.to))).toEqual(["thanks", "later", "later"]);
    expect(() =>
      defineForm({ id: "x", title: "x", blocks: [f.text("c", "C")], logic: [when("c").isAnswered().show("c")] }),
    ).toThrow(/no field with key "c"/);
  });
});

describe("14. eq and neq treat empty values as unanswered", () => {
  const def = raw([field("q", "short-text"), field("y", "yes-no")]);
  const scope = (values: Record<string, Json | undefined>) => ({
    values,
    hidden: {},
    fields: new Map(def.blocks.map((b) => [b.id, b as FieldBlock])),
  });

  it("a cleared field equals nothing, and is not anything", () => {
    for (const value of [undefined, null, "", "  "]) {
      expect(evaluate({ op: "eq", left: { field: "q" }, right: { value: null } }, scope({ q: value }))).toBe(false);
      expect(evaluate({ op: "eq", left: { field: "q" }, right: { value: value ?? null } }, scope({ q: value }))).toBe(false);
      expect(evaluate({ op: "neq", left: { field: "q" }, right: { value: "x" } }, scope({ q: value }))).toBe(true);
      expect(evaluate({ op: "neq", left: { field: "q" }, right: { value: null } }, scope({ q: value }))).toBe(true);
      expect(evaluate({ op: "in", left: { field: "q" }, right: { value: [null, ""] } }, scope({ q: value }))).toBe(false);
    }
    expect(evaluate({ op: "eq", left: { field: "y" }, right: { value: false } }, scope({ y: false }))).toBe(true);
    expect(evaluate({ op: "neq", left: { field: "y" }, right: { value: false } }, scope({ y: false }))).toBe(false);
  });
});

describe("B. sensitive fields", () => {
  it("normalizes the option onto the block, and reads props.sensitive as an alias", () => {
    const ssn = f.shortText("ssn", { label: "SSN", sensitive: true });
    expect(ssn.sensitive).toBe(true);
    expect(isSensitive(ssn)).toBe(true);
    expect(isSensitive(f.custom("short-text", "legacy", { label: "L", props: { sensitive: true } }))).toBe(true);
    expect(isSensitive(f.shortText("name", { label: "Name" }))).toBe(false);
    expect(isSensitive(f.text("c", "C"))).toBe(false);
    expect(parseForm(raw([{ ...field("x", "short-text"), sensitive: "yes" as never }])).ok).toBe(false);
  });
});

describe("C. phone field", () => {
  const phone = f.phone("phone", { label: "Phone" });

  it("accepts 7 to 15 digits with common separators, trimmed", () => {
    for (const ok of ["+1 (555) 010-0199", "555.0100", " 0201234567 ", "+441234567890123"]) {
      expect(validateField(phone, ok), ok).toBeNull();
    }
    for (const bad of ["123456", "+1234567890123456", "555-CALL-NOW", "1+5550100199", "555 0100 x12", 5550100199, `${"1".repeat(10)}${" ".repeat(30)}1`]) {
      expect(validateField(phone, bad as Json), String(bad)).toMatch(/7 to 15 digits/);
    }
  });

  it("is linear on hostile input and stores the trimmed value", () => {
    const start = performance.now();
    expect(validateField(phone, "(".repeat(100_000))).not.toBeNull();
    expect(performance.now() - start).toBeLessThan(50);
    const def = defineForm({ id: "p", title: "P", blocks: [phone] }).definition;
    const result = validateSubmission(def, { answers: { phone: "  555 0100 199 " } });
    expect(result.ok && result.submission.answers).toEqual({ phone: "555 0100 199" });
  });

  it("has tel input hints, its operators, and a coverage domain", async () => {
    const { getFieldType } = await import("../index");
    const { coverage } = await import("../testing");
    const manifest = getFieldType("phone")!;
    expect(manifest.a11y).toEqual({ semantics: "control", autocomplete: "tel", inputMode: "tel" });
    expect(manifest.operators.sort()).toEqual(["answered", "empty", "eq", "neq"]);
    expect(manifest.summarize?.("+1 555 0100", phone)).toBe("+1 555 0100");
    expect(parseForm(raw([phone], { logic: [{ id: "r", when: { op: "gt", left: { field: "phone" }, right: { value: 1 } }, effect: "hide", target: "phone" }] })).ok).toBe(false);
    const form = defineForm({
      id: "cov",
      title: "Cov",
      blocks: [f.phone("phone", { label: "Phone", required: true }), f.yesNo("ok", { label: "ok" })],
      logic: [when("phone").isAnswered().jumpTo({ ending: "called" })],
      endings: [{ id: "default", title: "D" }, { id: "called", title: "C" }],
    });
    expect(coverage(form).endings.called).toMatchObject({ reached: true, witness: { phone: "+1 555 010 0199" } });
  });
});

describe("D. anonymous forms withhold identifying fields", () => {
  const build = (anonymous: boolean) =>
    defineForm({
      id: "contact",
      title: "Contact",
      blocks: [
        f.rating("overall", { label: "Overall", required: true }),
        f.shortText("name", { label: "Name", required: true, identifying: true }),
        f.email("email", { label: "Email", required: true, identifying: true }),
        f.phone("phone", { label: "Phone", required: true, identifying: true }),
      ],
      settings: { anonymous },
    }).definition;

  it("asks for identifying fields only when the form is not anonymous", () => {
    const named = createForm(build(false));
    expect(named.getState().path).toEqual(["overall", "name", "email", "phone"]);
    named.setValue("overall", 4);
    expect(named.submit()).toBe(false);
    expect(Object.keys(named.getState().errors)).toEqual(["name", "email", "phone"]);

    const anon = createForm(build(true));
    expect(anon.getState().path).toEqual(["overall"]);
    anon.setValue("overall", 4);
    anon.setValue("name", "Ada");
    expect(anon.isVisible("name")).toBe(false);
    expect(anon.submit()).toBe(true);
    expect(anon.answers()).toEqual({ overall: 4 });
  });

  it("the server drops identifying values and lists them in ignored", () => {
    const answers = { overall: 5, name: "Ada", email: "ada@example.com", phone: "+1 555 010 0199" };
    const fromAnswers = validateSubmission(build(true), { answers });
    expect(fromAnswers.ok && fromAnswers.submission).toMatchObject({ answers: { overall: 5 }, ignored: ["name", "email", "phone"] });
    const events: FormEvent[] = [
      ...Object.entries(answers).map(([field, value]): FormEvent => ({ type: "answer", field, value })),
      { type: "answer", field: "name", value: "Bob" },
      { type: "submit" },
    ];
    const fromEvents = validateSubmission(build(true), { events });
    expect(fromEvents.ok && fromEvents.submission).toMatchObject({ answers: { overall: 5 }, ignored: ["name", "email", "phone"] });
    const kept = validateSubmission({ ...build(true), settings: { anonymous: true, clearHiddenValues: false } }, { answers });
    expect(kept.ok && kept.submission.answers).toEqual({ overall: 5 });
    const named = validateSubmission(build(false), { answers });
    expect(named.ok && named.submission.answers).toEqual(answers);
  });

  it("records no timestamps, whatever clock is passed", () => {
    const anon = createForm(build(true), { clock: () => 42 });
    anon.setValue("overall", 3);
    anon.next();
    expect(anon.getState().events.every((e) => e.at === undefined)).toBe(true);
    const named = createForm(build(false), { clock: () => 42 });
    named.setValue("overall", 3);
    expect(named.getState().events[0]?.at).toBe(42);
  });

  it("is off by default, and parseForm checks the flag", () => {
    const def = build(false);
    delete def.settings;
    expect(createForm(def).getState().path).toContain("name");
    expect(parseForm(raw([{ ...field("x", "short-text"), identifying: 1 as never }])).ok).toBe(false);
  });
});

describe("settings, layout and meta are checked (CodeRabbit round 4)", () => {
  const base = { schemaVersion: 1, id: "s", title: "S", blocks: [] };
  it("rejects a mistyped anonymous setting instead of collecting identifying fields", () => {
    const r = parseForm({ ...base, settings: { anonymous: "true" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain("settings.anonymous");
  });
  it("rejects an unknown layout mode, a non-object settings and non-JSON meta", () => {
    expect(parseForm({ ...base, layout: { mode: "paged" } }).ok).toBe(false);
    expect(parseForm({ ...base, layout: {} }).ok).toBe(false);
    expect(parseForm({ ...base, settings: [] }).ok).toBe(false);
    expect(parseForm({ ...base, meta: "x" }).ok).toBe(false);
    expect(parseForm({ ...base, hidden: [{ name: "n", type: "string", source: "url", sensitive: "yes" }] }).ok).toBe(false);
  });
  it("accepts well-typed settings, layout, meta and a sensitive hidden input", () => {
    const r = parseForm({
      ...base,
      layout: { mode: "focus" },
      settings: { anonymous: true, clearHiddenValues: false },
      meta: { owner: "x" },
      hidden: [{ name: "member", type: "string", source: "server", sensitive: true }],
    });
    expect(r.ok).toBe(true);
  });
  it("defineForm carries sensitive hidden inputs", () => {
    const form = defineForm({
      id: "h",
      title: "H",
      hidden: { member: f.hidden.string({ source: "server", sensitive: true }), coach: f.hidden.string({ source: "server" }) },
      blocks: [f.rating("r", { label: "R" })],
    });
    expect(form.definition.hidden).toEqual([
      { name: "member", type: "string", source: "server", sensitive: true },
      { name: "coach", type: "string", source: "server" },
    ]);
  });
});

describe("release review (CodeRabbit on #40)", () => {
  it("rejects jumps from or to a page break", () => {
    const def = {
      schemaVersion: 1, id: "pb", title: "PB",
      blocks: [
        { kind: "field", id: "a", key: "a", type: "yes-no", label: "A" },
        { kind: "page-break", id: "s2" },
        { kind: "field", id: "b", key: "b", type: "yes-no", label: "B" },
      ],
      logic: [{ id: "j1", effect: "jump", from: "a", to: "s2", when: { op: "eq", left: { field: "a" }, right: { value: true } } }],
    };
    const r = parseForm(def);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain("logic[0].to");
    const r2 = parseForm({ ...def, logic: [{ ...def.logic[0], from: "s2", to: "b" }] });
    expect(r2.ok).toBe(false);
  });
  it("summarizes a non-array multi-choice value without throwing", () => {
    const field = { kind: "field", id: "m", key: "m", type: "multi-choice", label: "M", props: { options: ["x"] } } as never;
    expect(summarizeValue("x" as never, field)).toBe("x");
  });
});

describe("coverage with a plugin field (CodeRabbit on #40)", () => {
  it("doesn't dead-end at a required field whose type has no sample values", async () => {
    const { registerFieldType } = await import("../index");
    const { coverage } = await import("../testing");
    registerFieldType({
      type: "test-signature", label: "Signature", category: "advanced", value: { json: true },
      operators: ["answered", "empty"], a11y: { semantics: "control" },
      validate: (v) => (typeof v === "string" && v.startsWith("sig:") ? null : "Sign here."),
      summarize: (v) => String(v),
    } as never);
    const form = defineForm({
      id: "plug", title: "Plug",
      blocks: [f.custom("test-signature", "sig", { label: "Sign", required: true }), f.yesNo("after", { label: "After" })],
      endings: [{ id: "default", title: "Done" }],
    });
    const report = coverage(form);
    expect(report.unreachableBlocks).toEqual([]);
    expect(report.endings.default?.reached).toBe(true);
  });
});
