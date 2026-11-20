import { describe, expect, it } from "vitest";
import { checkSetupFields, defineSetupStep, SetupStepError } from "../setup";

const step = defineSetupStep({
  id: "github.issues",
  title: "Open a GitHub issue for each report",
  needs: [{ name: "GITHUB_TOKEN", store: "edge" }],
  fields: [
    { name: "repo", label: "Repository", pattern: "[a-z]+/[a-z]+", setting: "githubRepo" },
    { name: "note", label: "Note", optional: true },
  ],
  links: [{ label: "Token", url: "https://github.com/settings/personal-access-tokens/new" }],
  instructions: ["Make a fine-grained token."],
});

describe("defineSetupStep", () => {
  it("returns the step frozen, with its lists filled", () => {
    expect(Object.isFrozen(step)).toBe(true);
    expect(Object.isFrozen(step.fields)).toBe(true);
    expect(step.tools).toEqual([]);
    expect(step.needs).toEqual([{ name: "GITHUB_TOKEN", store: "edge" }]);
  });

  it.each([
    [{ id: "Bad Id", title: "t", instructions: ["x"] }, /id must look like/],
    [{ id: "a.b", title: "", instructions: ["x"] }, /needs a title/],
    [{ id: "a.b", title: "t", instructions: [] }, /at least one instruction/],
    [{ id: "a.b", title: "t", instructions: ["x"], needs: [{ name: "lower", store: "edge" }] }, /UPPER_CASE/],
    [{ id: "a.b", title: "t", instructions: ["x"], needs: [{ name: "A_B", store: "vault" }] }, /edge or ci/],
    [{ id: "a.b", title: "t", instructions: ["x"], links: [{ label: "x", url: "http://x" }] }, /https URL/],
    [{ id: "a.b", title: "t", instructions: ["x"], fields: [{ name: "a", label: "A" }, { name: "a", label: "B" }] }, /two fields/],
    [{ id: "a.b", title: "t", instructions: ["x"], fields: [{ name: "a", label: "A", pattern: "(" }] }, /isn't a regular expression/],
  ] as const)("refuses %j", (spec, message) => {
    expect(() => defineSetupStep(spec as never)).toThrow(message);
    expect(() => defineSetupStep(spec as never)).toThrow(SetupStepError);
  });
});

describe("checkSetupFields", () => {
  it("returns trimmed values that match their whole pattern", () => {
    expect(checkSetupFields(step, { repo: " acme/app " })).toEqual({ repo: "acme/app" });
  });

  it("refuses a missing required field, a value off its pattern, an unknown field and a non-object", () => {
    expect(() => checkSetupFields(step, {})).toThrow(/Repository is required/);
    expect(() => checkSetupFields(step, { repo: "acme/app; rm" })).toThrow(/doesn't look right/);
    expect(() => checkSetupFields(step, { repo: "acme/app", token: "x" })).toThrow(/no field "token"/);
    expect(() => checkSetupFields(step, ["x"])).toThrow(/must be an object/);
  });
});
