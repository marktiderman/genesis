import { describe, expect, it } from "vitest";
import { adrProblems, isBatchHead } from "../check-adr-required.mjs";

describe("check-adr-required", () => {
  it("passes a pull request with no new package", () => {
    expect(adrProblems(["packages/ui/src/new.tsx", "docs/GUIDE.md"])).toEqual([]);
  });

  it("asks a new package for an ADR, and takes one added or linked", () => {
    const added = ["packages/billing/package.json", "packages/billing/src/index.ts"];
    expect(adrProblems(added)).toHaveLength(1);
    expect(adrProblems([...added, "docs/adr/0012-billing.md"])).toEqual([]);
    expect(adrProblems(added, "Accepted in ADR 0012.")).toEqual([]);
    expect(adrProblems(added, "See docs/adr/0012-billing.md")).toEqual([]);
    expect(adrProblems([...added, "docs/adr/TEMPLATE.md"])).toHaveLength(1);
  });

  it("leaves a batch moving up alone", () => {
    expect(isBatchHead("staging/2026-10-29/c")).toBe(true);
    expect(isBatchHead("prestage/sites")).toBe(true);
    expect(isBatchHead("feat/billing")).toBe(false);
  });
});
