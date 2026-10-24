// @feat:forms-engine
import { describe, expect, it } from "vitest";
import { carryAnswers, type FormDefinition } from "../index";

const field = (id: string, key: string) => ({ kind: "field" as const, id, key, type: "short-text", label: key });

const v1: FormDefinition = {
  schemaVersion: 1,
  id: "check-in",
  title: "Check-in",
  blocks: [field("f1", "name"), field("f2", "mood"), field("f3", "dropped")],
};
// A later version: new field ids, a field gone, two added, the order changed.
const v2: FormDefinition = {
  schemaVersion: 1,
  id: "check-in",
  title: "Check-in",
  blocks: [field("n1", "mood"), field("n2", "name"), field("n3", "email"), field("n4", "new")],
};

describe("carryAnswers", () => {
  it("moves answers to the other version's field ids by key, dropping fields it doesn't have", () => {
    expect(carryAnswers(v1, v2, { f1: "Sam", f2: "good", f3: "gone" })).toEqual({ n1: "good", n2: "Sam" });
  });

  it("fills fields the answers leave out from extra, by key, never over an answer", () => {
    expect(carryAnswers(v1, v2, { f1: "Sam" }, { email: "sam@x.test", name: "Other", new: null, mood: undefined })).toEqual({
      n2: "Sam",
      n3: "sam@x.test",
    });
  });

  it("carries within one version unchanged", () => {
    expect(carryAnswers(v1, v1, { f1: "Sam", f2: 3 })).toEqual({ f1: "Sam", f2: 3 });
  });
});
