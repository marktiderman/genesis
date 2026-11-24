import { describe, expect, it } from "@jest/globals";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WORKBENCH_SECTIONS, workbenchScreens } from "@/workbench/registry";
import { SECTION_ROUTE } from "@/workbench/section-index";

describe("the showcase registry", () => {
  it("gives every screen a unique, URL-safe id", () => {
    const ids = workbenchScreens.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("has a tab for every section, and every screen is in one", () => {
    for (const section of WORKBENCH_SECTIONS) expect(existsSync(join(__dirname, "../../src/app/(app)", SECTION_ROUTE[section], "[id].tsx"))).toBe(true);
    for (const s of workbenchScreens) expect(WORKBENCH_SECTIONS).toContain(s.section);
  });

  it("says what each screen shows: a summary and the exports it covers", () => {
    for (const s of workbenchScreens) {
      expect(s.summary.length).toBeGreaterThan(10);
      expect(s.covers.length).toBeGreaterThan(0);
    }
  });
});
