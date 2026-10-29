// @feat:export-prefix-rules
import { describe, expect, it } from "vitest";
import { prefixProblems } from "../check-export-prefixes.mjs";

const diff = (file, ...lines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;

describe("check-export-prefixes", () => {
  it("fails an added build/new/make export in package source, and nothing else", () => {
    expect(prefixProblems(diff("packages/ui/src/a.ts", "export function buildRows() {}", "export const createRows = () => 1;", "function buildLocal() {}"))).toEqual([
      "packages/ui/src/a.ts: new export buildRows uses the retired prefix build*; use define* (a declaration) or to*/resolve* (a pure result) (docs/FRAMEWORK.md, rule 7)",
    ]);
    expect(prefixProblems(diff("packages/ui/src/__tests__/a.test.ts", "export function buildFixture() {}"))).toEqual([]);
    expect(prefixProblems(diff("apps/sample/app/a.ts", "export function newThing() {}"))).toEqual([]);
    expect(prefixProblems(diff("packages/core/src/b.ts", "export async function makeClient() {}"))).toHaveLength(1);
  });

  it("leaves an existing export alone when its line changes or moves", () => {
    const edited = "diff --git a/packages/chat/src/rows.ts b/packages/chat/src/rows.ts\n--- a/packages/chat/src/rows.ts\n+++ b/packages/chat/src/rows.ts\n@@ -45 +45 @@\n-export function buildThreadRows(items) {\n+export function buildThreadRows(items, options) {\n";
    expect(prefixProblems(edited)).toEqual([]);
  });
});
