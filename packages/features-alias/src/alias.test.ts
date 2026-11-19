import { readdirSync, readFileSync } from "node:fs";
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

  it("ships each subpath's types as one re-export of the same subpath, nothing else (no zod in /blocks or /gate)", () => {
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, { types?: string } | string> };
    const dist = new URL("../dist/", import.meta.url);
    const files = readdirSync(dist).filter((f) => f.endsWith(".d.ts"));
    for (const [subpath, target] of Object.entries(own.exports)) {
      if (typeof target === "string") continue;
      const file = target.types!.replace("./dist/", "");
      const text = readFileSync(new URL(file, dist), "utf8");
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(specifiers, file).toEqual([`@marktiderman/genesis-config${subpath === "." ? "" : subpath.slice(1)}`]);
      expect(text.split("\n").filter((l) => l.trim() && !/^\s*(?:\/\*\*|\*|\*\/)/.test(l)), file).toEqual([`export * from "@marktiderman/genesis-config${subpath === "." ? "" : subpath.slice(1)}";`]);
      expect(text, file).toMatch(/@deprecated/);
    }
    expect(files.length).toBe(Object.keys(own.exports).length - 1);
  });
});
