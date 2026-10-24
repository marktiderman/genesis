import { describe, expect, it } from "vitest";
import {
  answerSnapshots,
  answersFromSnapshots,
  choiceKind,
  contentText,
  createForm,
  getContentType,
  getFieldType,
  isBuiltInFieldType,
  isChoiceField,
  listContentTypes,
  parseForm,
  prefillFromLink,
  registerContentType,
  registerFieldType,
  validateField,
  VALIDATOR_FAILED_MESSAGE,
  type Block,
  type FieldBlock,
  type FieldTypeManifest,
  type FormDefinition,
} from "../index";
import { validateSubmission } from "../server";

const form = (id: string, blocks: Block[], extra: Partial<FormDefinition> = {}): FormDefinition => ({
  schemaVersion: 1,
  id,
  title: id,
  blocks,
  endings: [{ id: "default", title: "Thanks" }],
  ...extra,
});
const field = (id: string, type: string, extra: Partial<FieldBlock> = {}): FieldBlock => ({
  kind: "field", id, key: id, type, label: id, ...extra,
});

// A host's own choice kind: a row of picture cards, one pick.
registerFieldType({
  type: "test/cards",
  label: "Cards",
  category: "choice",
  value: { json: true },
  operators: ["eq", "neq", "answered", "empty"],
  a11y: { semantics: "group" },
  choice: { multiple: false },
  literal: "string",
  checkProps: (props, check) => check.optionalInt(props.columns, "columns", 1),
  validate: (value, f) =>
    typeof value === "string" && ((f.props?.options as { value: string }[] | undefined) ?? []).some((o) => o.value === value)
      ? null
      : "Pick a card.",
});

describe("the field registry", () => {
  it("marks the built-ins and their answer shapes", () => {
    expect(isBuiltInFieldType("email")).toBe(true);
    expect(isBuiltInFieldType("test/cards")).toBe(false);
    expect(choiceKind("multi-choice")).toEqual({ multiple: true });
    expect(choiceKind("dropdown")).toEqual({ multiple: false });
    expect(choiceKind("short-text")).toBeUndefined();
    expect(isChoiceField(field("c", "test/cards"))).toBe(true);
    expect(isChoiceField({ kind: "content", id: "c", type: "text", text: "" })).toBe(false);
  });

  it("refuses to replace a built-in unless asked", () => {
    const email = getFieldType("email")!;
    expect(() => registerFieldType({ ...email })).toThrow(/built-in field type/);
    // Replacing it with the same definition, deliberately, is allowed (and changes nothing here).
    expect(() => registerFieldType({ ...email }, { replace: true })).not.toThrow();
    expect(validateField(field("e", "email"), "nope")).toBe("Enter an email address like name@example.com.");
  });

  it("refuses malformed manifests", () => {
    expect(() => registerFieldType({ type: "" } as never)).toThrow(/needs a `type`/);
    expect(() => registerFieldType({ type: "test/no-ops", value: { json: true } } as never)).toThrow(/operators/);
    expect(() =>
      registerFieldType({ type: "test/bad-choice", label: "x", category: "choice", value: { json: true }, operators: [], a11y: { semantics: "group" }, choice: {} as never }),
    ).toThrow(/multiple/);
  });

  it("keeps a frozen copy, so changing the object later changes nothing", () => {
    const manifest: FieldTypeManifest = {
      type: "test/mutable", label: "M", category: "text", value: { json: true }, operators: ["answered"], a11y: { semantics: "control" },
      validate: () => null,
    };
    registerFieldType(manifest);
    manifest.validate = () => "changed";
    manifest.operators.push("eq");
    expect(validateField(field("m", "test/mutable"), "x")).toBeNull();
    expect(getFieldType("test/mutable")!.operators).toEqual(["answered"]);
    expect(Object.isFrozen(getFieldType("test/mutable"))).toBe(true);
  });

  it("refuses an answer whose validator throws, on the client and the server", () => {
    registerFieldType({
      type: "test/throws", label: "T", category: "text", value: { json: true }, operators: ["answered"], a11y: { semantics: "control" },
      validate: () => {
        throw new Error("boom");
      },
    });
    expect(validateField(field("t", "test/throws"), "x")).toBe(VALIDATOR_FAILED_MESSAGE);
    const def = form("throws", [field("t", "test/throws")]);
    expect(validateSubmission(def, { answers: { t: "x" } })).toEqual({ ok: false, errors: { t: VALIDATOR_FAILED_MESSAGE } });
  });

  it("reports a props check that throws as one issue", () => {
    registerFieldType({
      type: "test/props-throw", label: "P", category: "text", value: { json: true }, operators: [], a11y: { semantics: "control" },
      checkProps: () => {
        throw new Error("boom");
      },
    });
    const parsed = parseForm(form("p", [field("p", "test/props-throw")]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues).toEqual([{ path: "blocks[0].props", message: "These settings couldn't be checked." }]);
  });

  it("gives a host's choice kind everything a built-in choice gets", () => {
    const def = form("cards", [
      field("pick", "test/cards", {
        props: { options: [{ value: "a", label: "Apple" }], optionsFrom: { source: "host", key: "cards" }, prefill: { param: "pick" }, columns: 0 },
      }),
      field("after", "short-text"),
    ], { logic: [{ id: "r", when: { op: "eq", left: { field: "pick" }, right: { value: 3 } }, effect: "hide", target: "after" }] });
    const parsed = parseForm(def);
    // Its own props check, and the literal check from its answer shape; no "only choice questions" warnings.
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues).toEqual([{ path: "blocks[0].props.columns", message: "Must be a whole number of 1 or more." }]);
      expect(parsed.warnings.map((w) => w.message)).toEqual(['"pick" holds a string, but 3 is not one; this comparison is never true.']);
    }
    const ok = { ...def, blocks: [{ ...def.blocks[0]!, props: { ...(def.blocks[0] as FieldBlock).props, columns: 2 } } as FieldBlock, def.blocks[1]!], logic: [] };
    const hostOptions = { cards: [{ value: "b", label: "Banana" }] };
    expect(prefillFromLink(createForm(ok, { hostOptions }).definition, { pick: "b" })).toEqual({ pick: "b" });
    const checked = validateSubmission(ok, { answers: { pick: "b" } }, { hostOptions });
    expect(checked.ok && checked.submission.answers).toEqual({ pick: "b" });
    const engine = createForm(ok, { hostOptions });
    expect(answerSnapshots(engine.definition, { pick: "b" })).toEqual({ pick: { value: "b", label: "Banana" } });
    expect(answersFromSnapshots(engine.definition, { pick: { value: "gone", label: "banana" } }).answers).toEqual({ pick: "b" });
  });

  it("checks a host choice kind's answers against its options when it brings no validator", () => {
    registerFieldType({
      type: "test/plain-pick", label: "Pick", category: "choice", value: { json: true },
      operators: ["eq", "answered", "empty"], a11y: { semantics: "group" }, choice: { multiple: false },
    });
    registerFieldType({
      type: "test/plain-picks", label: "Picks", category: "choice", value: { json: true },
      operators: ["contains", "answered", "empty"], a11y: { semantics: "group" }, choice: { multiple: true },
    });
    const one = field("one", "test/plain-pick", { props: { options: [{ value: "a", label: "Apple" }] } });
    const many = field("many", "test/plain-picks", { props: { options: [{ value: "a" }, { value: "b" }], other: true } });
    const def = form("plain", [one, many]);
    expect(validateSubmission(def, { answers: { one: { evil: true } } })).toEqual({ ok: false, errors: { one: "Choose one of the options." } });
    expect(validateSubmission(def, { answers: { one: "z" } }).ok).toBe(false);
    expect(validateSubmission(def, { answers: { many: ["a", "a"] } }).ok).toBe(false);
    const ok = validateSubmission(def, { answers: { one: "a", many: ["b", "typed"] } });
    expect(ok.ok && ok.submission.answers).toEqual({ one: "a", many: ["b", "typed"] });
    expect(getFieldType("test/plain-pick")!.summarize!("a", one)).toBe("Apple");
  });

  it("keeps built-ins out of reach of a caller who changes what getFieldType returns", () => {
    const single = getFieldType("single-choice")!;
    expect(() => {
      (single.choice as { multiple: boolean }).multiple = true;
    }).toThrow();
    single.operators.push("lt");
    expect(getFieldType("single-choice")!.operators).not.toContain("lt");
    expect(() => {
      (single.a11y as { semantics: string }).semantics = "control";
    }).toThrow();
    expect(choiceKind("single-choice")).toEqual({ multiple: false });
  });

  it("never throws from parseForm or snapshots when a kind's literal or snapshot hooks throw", () => {
    const boom = () => {
      throw new Error("boom");
    };
    registerFieldType({
      type: "test/hooks-throw", label: "H", category: "advanced", value: { json: true }, operators: ["eq", "answered"], a11y: { semantics: "control" },
      literal: boom, snapshot: boom, fromSnapshot: boom,
    });
    registerFieldType({
      type: "test/hooks-malformed", label: "H", category: "advanced", value: { json: true }, operators: ["answered"], a11y: { semantics: "control" },
      fromSnapshot: () => ({}) as never,
    });
    const def = form("hooks", [field("h", "test/hooks-throw"), field("m", "test/hooks-malformed"), field("after", "short-text")], {
      logic: [{ id: "r", when: { op: "eq", left: { field: "h" }, right: { value: 1 } }, effect: "hide", target: "after" }],
    });
    expect(parseForm(def).ok).toBe(true);
    expect(answerSnapshots(def, { h: "x" })).toEqual({});
    expect(answersFromSnapshots(def, { h: { value: "x" }, m: { value: "y" } })).toEqual({ answers: {}, missing: {} });
  });

  it("uses a non-choice kind's own snapshot hooks", () => {
    registerFieldType({
      type: "test/place", label: "Place", category: "advanced", value: { json: true }, operators: ["answered"], a11y: { semantics: "control" },
      snapshot: (value) => ({ value: String(value), label: `Place ${String(value)}` }),
      fromSnapshot: (raw) =>
        raw && typeof raw === "object" && "value" in raw && (raw as { value: unknown }).value !== "gone"
          ? { value: (raw as { value: string }).value, missing: [] }
          : { missing: [{ value: "gone", label: "Gone" }] },
    });
    const def = form("place", [field("where", "test/place"), field("empty", "test/place")]);
    expect(answerSnapshots(def, { where: "p1", empty: "" })).toEqual({ where: { value: "p1", label: "Place p1" } });
    expect(answersFromSnapshots(def, { where: { value: "p1" }, empty: { value: "gone" } })).toEqual({
      answers: { where: "p1" },
      missing: { empty: [{ value: "gone", label: "Gone" }] },
    });
  });
});

describe("the content registry", () => {
  it("has the built-ins, and a host registers more", () => {
    expect(getContentType("heading")?.label).toBe("Heading");
    expect(() => registerContentType({ type: "text", label: "Text" })).toThrow(/built-in content type/);
    registerContentType({
      type: "test/message",
      label: "Message",
      checkProps: (props, check) => check.optionalText(props.tone, "tone"),
      text: (block) => `Note: ${block.text}`,
    });
    expect(listContentTypes().map((c) => c.type)).toContain("test/message");
    const block = { kind: "content" as const, id: "m", type: "test/message", text: "Hello", props: { tone: 3 } };
    expect(contentText(block)).toBe("Note: Hello");
    expect(contentText({ kind: "content", id: "h", type: "heading", text: "Hi" })).toBe("Hi");
    const parsed = parseForm(form("message", [block]));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues).toEqual([{ path: "blocks[0].props.tone", message: "Must be text." }]);
    expect(parseForm(form("message", [{ ...block, props: { tone: "calm" } }])).ok).toBe(true);
    // An unknown kind names every registered one.
    const unknown = parseForm(form("unknown", [{ kind: "content", id: "u", type: "test/nope", text: "" }]));
    expect(!unknown.ok && unknown.issues[0]!.message).toBe("Must be heading, text or test/message.");
  });
});
