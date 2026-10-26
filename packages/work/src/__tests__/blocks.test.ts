import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contentPacksBlock, customFieldsBlock, metricsBlock, pursuitsBlock, sessionsBlock, statusUpdatesBlock } from "../blocks";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("genesis-work blocks", () => {
  const blocks = [pursuitsBlock, metricsBlock, statusUpdatesBlock, sessionsBlock, customFieldsBlock, contentPacksBlock];

  it("every migration and its pgTAP test exists", () => {
    for (const block of blocks) {
      for (const m of block.contributes?.migrations ?? []) {
        expect(existsSync(join(root, m.file)), m.file).toBe(true);
        expect(m.test && existsSync(join(root, m.test)), m.test).toBe(true);
      }
    }
  });

  it("every table lives in the genesis_work schema, none in public", () => {
    for (const block of blocks) {
      for (const m of block.contributes?.migrations ?? []) {
        const sql = readFileSync(join(root, m.file), "utf8");
        expect(sql).not.toMatch(/create (table|view) public\./);
        expect(sql).not.toMatch(/alter table public\./);
        expect(sql).toMatch(/genesis_work\./);
      }
    }
  });

  it("the package.json blocks match the code", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(Object.keys(pkg.genesis.blocks).sort()).toEqual(blocks.map((b) => b.id).sort());
  });
});
