import { describe, expect, it } from "vitest";
import {
  defineForm,
  f,
  getFieldType,
  isOtherValue,
  otherOption,
  OTHER_MAX_LENGTH,
  parseForm,
  summarizeValue,
  type FieldBlock,
  type FormDefinition,
} from "../index";
import { validateSubmission } from "../server";

const form = defineForm({
  id: "areas",
  title: "Facilities",
  blocks: [
    f.multiChoice("areas", {
      label: "Which area?",
      options: [
        { value: "cleanliness", label: "Cleanliness" },
        { value: "parking", label: "Parking" },
      ],
      other: true,
    }),
    f.singleChoice("where", {
      label: "Where?",
      options: [{ value: "front", label: "Front desk" }],
      other: { label: "Somewhere else" },
    }),
    f.singleChoice("plain", { label: "Plain", options: [{ value: "a" }] }),
  ],
});
const def = form.definition as FormDefinition;
const fieldOf = (key: string) => def.blocks.find((b) => b.kind === "field" && b.key === key) as FieldBlock;
const check = (key: string, value: unknown) => getFieldType(fieldOf(key).type)!.validate!(value as never, fieldOf(key));

describe('an "Other" answer', () => {
  it("is declared with `other`, named or not", () => {
    expect(otherOption(fieldOf("areas"))).toEqual({ label: "Other" });
    expect(otherOption(fieldOf("where"))).toEqual({ label: "Somewhere else" });
    expect(otherOption(fieldOf("plain"))).toBeNull();
    expect(parseForm(def).ok).toBe(true);
  });

  it("takes typed text on a single choice, and still the options", () => {
    expect(check("where", "front")).toBeNull();
    expect(check("where", "The squat rack")).toBeNull();
    expect(isOtherValue(fieldOf("where"), "The squat rack")).toBe(true);
    expect(isOtherValue(fieldOf("where"), "front")).toBe(false);
  });

  it("refuses typed text where the question has no Other", () => {
    expect(check("plain", "anything")).toBe("Choose one of the options.");
  });

  it("refuses blank or overlong text", () => {
    expect(check("where", "   ")).toBe("Choose one of the options.");
    expect(check("where", "x".repeat(OTHER_MAX_LENGTH + 1))).toBe("Choose one of the options.");
    expect(check("where", "x".repeat(OTHER_MAX_LENGTH))).toBeNull();
  });

  it("is one more item on a multiple choice, at most one", () => {
    expect(check("areas", ["parking", "Lockers"])).toBeNull();
    expect(check("areas", ["Lockers"])).toBeNull();
    expect(check("areas", ["Lockers", "Mats"])).toBe("Choose from the options.");
    expect(check("areas", ["parking", "parking"])).toBe("Choose from the options.");
  });

  it("reads as the typed text in summaries", () => {
    expect(summarizeValue(["parking", "Lockers"], fieldOf("areas"))).toBe("Parking, Lockers");
  });

  it("is accepted by the server", () => {
    const ok = validateSubmission(def, { answers: { areas: ["cleanliness", "Lockers"], where: "Lobby" } });
    expect(ok.ok).toBe(true);
    const bad = validateSubmission(def, { answers: { plain: "made up" } });
    expect(bad.ok).toBe(false);
  });

  it("is checked in parseForm", () => {
    const wrong = { ...def, blocks: [{ ...fieldOf("plain"), props: { options: [{ value: "a" }], other: "yes" } }] };
    const parsed = parseForm(wrong);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0]!.path).toBe("blocks[0].props.other");
  });
});
