// @feat:forms-studio
import { describe, expect, it } from "vitest";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { answerCell, answerColumns, answersByKey, toCsv } from "../answers";

const v1 = {
  schemaVersion: 1,
  id: "class",
  title: "Class",
  blocks: [
    { kind: "field", id: "f1", key: "overall", type: "rating", label: "How was class?" },
    { kind: "field", id: "f2", key: "old_q", type: "text", label: "Retired question" },
  ],
} as unknown as FormDefinition;

const v2 = {
  schemaVersion: 1,
  id: "class",
  title: "Class",
  blocks: [
    { kind: "field", id: "f3", key: "name", type: "text", label: "Your name" },
    {
      kind: "field",
      id: "f1",
      key: "overall",
      type: "rating",
      label: "How was {{class|class}} today?",
    },
    {
      kind: "field",
      id: "f4",
      key: "liked",
      type: "multi-choice",
      label: "What did you like?",
      props: {
        options: [
          { value: "a", label: "Coaching" },
          { value: "b", label: "Music" },
        ],
      },
    },
    { kind: "field", id: "f5", key: "back", type: "yes-no", label: "Coming back?" },
  ],
} as unknown as FormDefinition;

describe("answerColumns", () => {
  it("orders by the newest definition, adds older-only keys after, and skips the given keys", () => {
    expect(answerColumns([v2, v1], new Set(["name"]))).toEqual([
      { key: "overall", label: "How was class today?" },
      { key: "liked", label: "What did you like?" },
      { key: "back", label: "Coming back?" },
      { key: "old_q", label: "Retired question" },
    ]);
  });
});

describe("answersByKey and answerCell", () => {
  it("keys answers by field key and formats options, yes/no and lists", () => {
    expect(answersByKey(v2, { f1: 4, f4: ["a", "b"], f5: false })).toEqual({
      overall: 4,
      liked: "Coaching, Music",
      back: "No",
    });
  });

  it("reads an older version's answers under the same key", () => {
    expect(answersByKey(v1, { f1: 2, f2: "hi" })).toEqual({ overall: 2, old_q: "hi" });
  });

  it("never shows a structured value as [object Object]", () => {
    const field = { kind: "field", id: "r", key: "plan", type: "table", label: "Plan" } as never;
    expect(String(answerCell(field, [{ a: 1 }]))).not.toContain("[object Object]");
    expect(String(answerCell(field, { a: 1 }))).not.toContain("[object Object]");
  });

  it("shows a consent as Agreed, not true", () => {
    const field = { kind: "field", id: "c", key: "c", type: "consent", label: "Photos" } as never;
    expect(answerCell(field, true)).toBe("Agreed");
    expect(answerCell(field, false)).toBe("Didn't agree");
  });

  it("keeps ratings as numbers, so a Sheet can sort and average them", () => {
    const field = {
      kind: "field",
      id: "o",
      key: "overall",
      type: "rating",
      label: "Overall",
    } as never;
    expect(answerCell(field, 4)).toBe(4);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines and ends lines with CRLF", () => {
    expect(toCsv(["Day", "Note"], [["2026-10-22", 'said "hi", then\nleft']])).toBe(
      'Day,Note\r\n2026-10-22,"said ""hi"", then\nleft"\r\n',
    );
  });

  it("defuses text a spreadsheet would run as a formula, but keeps numbers", () => {
    expect(toCsv(["A", "B", "C", "D"], [['=HYPERLINK("x")', "@SUM(1)", "-5 is low", -5]])).toBe(
      'A,B,C,D\r\n"\'=HYPERLINK(""x"")",\'@SUM(1),\'-5 is low,-5\r\n',
    );
  });
});
