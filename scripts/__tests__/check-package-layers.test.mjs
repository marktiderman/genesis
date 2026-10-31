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

  it("counts an optional peer only when it is in peerDependencies and not also a dependency", () => {
    const pkgs = base();
    pkgs.chat.json = {
      ...pkgs.chat.json,
      peerDependencies: { "@marktiderman/genesis-media": "^1", "@marktiderman/genesis-ai": "^1" },
      dependencies: { ...pkgs.chat.json.dependencies, "@marktiderman/genesis-ai": "^1" },
      peerDependenciesMeta: { "@marktiderman/genesis-media": { optional: true }, "@marktiderman/genesis-ai": { optional: true }, "@marktiderman/genesis-x": { optional: true } },
    };
    const chat = readWorkspace(fixture(pkgs)).find((p) => p.json.name === "@marktiderman/genesis-chat");
    expect(chat.layer.optionalPeers).toEqual(["@marktiderman/genesis-media"]);
  });

  it("reads static value imports, not type-only imports or import()", () => {
    const pkgs = base();
    pkgs.chat.files = {
      "src/a.ts": [
        'import type { A } from "@marktiderman/genesis-media";',
        'import { type B, type C } from "@marktiderman/genesis-media/forms";',
        'const m = await import("@marktiderman/genesis-media/chat");',
        'import { upload } from "@marktiderman/genesis-media/uploads";',
        'export { x } from "@marktiderman/genesis-ui";',
        'import "@marktiderman/genesis-ui/styles.css";',
      ].join("\n"),
    };
    const chat = readWorkspace(fixture(pkgs)).find((p) => p.json.name === "@marktiderman/genesis-chat");
    expect(chat.layer.valueImports).toEqual(["@marktiderman/genesis-media/uploads", "@marktiderman/genesis-ui", "@marktiderman/genesis-ui/styles.css"]);
  });

  it("passes on this repo", async () => {
    const { pkgs, problems } = await checkPackageLayers(REPO);
    expect(problems).toEqual([]);
    expect(pkgs.length).toBeGreaterThan(20);
  });
});
