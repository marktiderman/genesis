/**
 * scripts/check-package-layers.mjs: reads every package's genesis metadata,
 * dependencies and source imports, and fails on a wrong-way dependency or a
 * module whose docs or skill is missing. The last test runs it on the repo,
 * so CI's script tests enforce it too.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackageLayers, moduleFileProblems, readWorkspace } from "../check-package-layers.mjs";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const { packageLayerProblems } = await import(pathToFileURL(path.join(REPO, "packages/features/dist/index.js")).href);

function fixture(packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-layers-"));
  for (const [dir, { json, files = {} }] of Object.entries(packages)) {
    fs.mkdirSync(path.join(root, "packages", dir), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", dir, "package.json"), JSON.stringify(json));
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, "packages", dir, file)), { recursive: true });
      fs.writeFileSync(path.join(root, "packages", dir, file), text);
    }
  }
  return root;
}

const base = () => ({
  ui: { json: { name: "@marktiderman/genesis-ui", genesis: { layer: "foundation", group: "core" } } },
  chat: {
    json: { name: "@marktiderman/genesis-chat", dependencies: { "@marktiderman/genesis-ui": "workspace:^" }, genesis: { layer: "primitive", group: "collaboration" } },
  },
  sites: {
    json: {
      name: "@marktiderman/genesis-sites",
      files: ["dist", "SKILL.md"],
      genesis: {
        layer: "module",
        group: "modules",
        module: { name: "Sites", summary: "Sites.", blocks: ["sites"], install: "genesis add sites", docs: "README.md", skill: "SKILL.md" },
        blocks: { sites: {} },
      },
    },
    files: { "README.md": "# sites\n", "SKILL.md": "---\nname: s\n---\n" },
  },
});

const problemsOf = (root) => {
  const pkgs = readWorkspace(root);
  return [...packageLayerProblems(pkgs.map((p) => p.layer)), ...moduleFileProblems(root, pkgs)];
};

describe("check-package-layers", () => {
  it("passes a workspace that points down", () => {
    expect(problemsOf(fixture(base()))).toEqual([]);
  });

  it("catches a planted upward import in source, even when package.json doesn't declare it", () => {
    const pkgs = base();
    pkgs.ui.files = { "src/index.ts": 'export { ChatPanel } from "@marktiderman/genesis-chat/web";\n', "src/__tests__/x.test.ts": 'import "@marktiderman/genesis-sites";\n' };
    expect(problemsOf(fixture(pkgs))).toEqual([
      "@marktiderman/genesis-ui (foundation) uses @marktiderman/genesis-chat (primitive): a foundation package depends only on foundation packages",
    ]);
  });

  it("catches a module whose skill is missing or doesn't ship", () => {
    const missing = base();
    missing.sites.files = { "README.md": "# sites\n" };
    expect(problemsOf(fixture(missing))).toEqual(["@marktiderman/genesis-sites genesis.module.skill: SKILL.md doesn't exist in the package"]);
    const unshipped = base();
    unshipped.sites.json.files = ["dist"];
    expect(problemsOf(fixture(unshipped))).toEqual([
      '@marktiderman/genesis-sites genesis.module.skill: SKILL.md isn\'t in the package\'s "files", so it doesn\'t ship',
    ]);
  });

  it("passes on this repo", async () => {
    const { pkgs, problems } = await checkPackageLayers(REPO);
    expect(problems).toEqual([]);
    expect(pkgs.length).toBeGreaterThan(20);
  });
});
