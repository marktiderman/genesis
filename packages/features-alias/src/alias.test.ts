import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as configRoot from "@marktiderman/genesis-config";
import * as configBlocks from "@marktiderman/genesis-config/blocks";
import * as configGate from "@marktiderman/genesis-config/gate";
import * as configNode from "@marktiderman/genesis-config/node";
import * as aliasRoot from "./index";
import * as aliasBlocks from "./blocks";
import * as aliasGate from "./gate";
import * as aliasNode from "./node";

describe("@marktiderman/genesis-features (deprecated alias)", () => {
  it.each([
    ["root", aliasRoot, configRoot],
    ["/blocks", aliasBlocks, configBlocks],
    ["/gate", aliasGate, configGate],
    ["/node", aliasNode, configNode],
  ] as const)("%s re-exports exactly what genesis-config exports, as the same values", (_, alias, config) => {
    expect(Object.keys(alias).sort()).toEqual(Object.keys(config).sort());
    for (const key of Object.keys(config)) expect((alias as Record<string, unknown>)[key]).toBe((config as Record<string, unknown>)[key]);
  });

  it("has the same subpaths as genesis-config, and says it's deprecated", () => {
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, unknown>; deprecated?: string };
    const config = JSON.parse(readFileSync(new URL("../../features/package.json", import.meta.url), "utf8")) as { name: string; exports: Record<string, unknown> };
    expect(config.name).toBe("@marktiderman/genesis-config");
    expect(Object.keys(own.exports)).toEqual(Object.keys(config.exports));
    expect(own.deprecated).toMatch(/@marktiderman\/genesis-config/);
  });
});
