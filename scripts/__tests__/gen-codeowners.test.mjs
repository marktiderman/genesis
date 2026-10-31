// @feat:package-owners
import { describe, expect, it } from "vitest";
import { codeowners } from "../gen-codeowners.mjs";

describe("gen-codeowners", () => {
  it("writes the default owner, then one line per package, sorted", () => {
    const { text, problems } = codeowners([
      { dir: "ui", owner: "@acme/web" },
      { dir: "core", owner: "@octocat" },
    ]);
    expect(problems).toEqual([]);
    expect(text.split("\n").slice(2)).toEqual(["* @marktiderman", "", "/packages/core/ @octocat", "/packages/ui/ @acme/web", ""]);
  });

  it("names a package with no owner", () => {
    expect(codeowners([{ dir: "chat" }]).problems).toEqual(['packages/chat: set "genesis": { "owner": "@handle" } in its package.json']);
  });
});
