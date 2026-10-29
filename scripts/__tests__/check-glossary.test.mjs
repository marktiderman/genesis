import { describe, expect, it } from "vitest";
import { bannedTerms, findBanned } from "../check-glossary.mjs";

const glossary = `
## Structure

| Term | Definition | Don't use |
|---|---|---|
| **package** | one published npm package. | library, lib (as a noun), kit. |
| **group** | a catalog category. | "Domain blocks", "Platform services", and \`category\` (as a package field). |
| **primitive** | a reusable capability. | service (as a kind), capability (as a layer), and "primitive" for UI atoms. |
| **foundation** | the layer every app needs. |  |

Prose with | a pipe | is not a table row.
`;

describe("check-glossary", () => {
  const banned = bannedTerms(glossary);

  it("reads plain and quoted synonyms, and skips ones that depend on context", () => {
    expect(banned).toEqual([
      { word: "library", term: "package" },
      { word: "kit", term: "package" },
      { word: "domain blocks", term: "group" },
      { word: "platform services", term: "group" },
    ]);
  });

  it("matches whole words only", () => {
    const words = (text) => findBanned(text, banned).map((b) => b.word);
    expect(words("A UI kit for apps")).toEqual(["kit"]);
    expect(words("The starter-kit preset")).toEqual([]);
    expect(words("Domain blocks and libraries")).toEqual(["domain blocks"]);
  });
});
