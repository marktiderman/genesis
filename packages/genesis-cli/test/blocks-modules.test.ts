// @feat:package-layering
// Every module's install line (`genesis.module.install`, "genesis add <block>") resolves:
// `genesis add --dry-run` finds the block in the workspace and plans it without errors.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { runAdd } from "../src/blocks/add.js";
import { expoApp, linkWorkspacePackage, NOW, PACKAGES } from "./blocks-helpers.js";

interface Pkg {
  name: string;
  genesis?: { module?: { install: string; blocks: string[] } };
}
const workspace = readdirSync(PACKAGES)
  .filter((dir) => existsSync(path.join(PACKAGES, dir, "package.json")))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(path.join(PACKAGES, dir, "package.json"), "utf8")) as Pkg }));
const modules = workspace.filter((w) => w.pkg.genesis?.module);

describe("modules", () => {
  it("the workspace has modules", () => {
    expect(modules.map((m) => m.dir).sort()).toEqual(["product", "sites", "support"]);
  });

  it.each(modules.map((m) => [m.pkg.name, m] as const))("%s installs with genesis add --dry-run", async (_name, m) => {
    const root = expoApp();
    for (const w of workspace) if (w.pkg.name.startsWith("@marktiderman/")) linkWorkspacePackage(root, w.pkg.name, w.dir);
    const block = m.pkg.genesis!.module!.install.split(/\s+/)[2]!;
    const report = await runAdd({ root, block, dryRun: true, yes: false, install: false, featuresBuild: false, now: NOW });
    expect(report.block.id).toBe(block);
    expect(report.block.package).toBe(m.pkg.name);
  });
});
