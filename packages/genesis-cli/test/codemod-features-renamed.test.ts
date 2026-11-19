import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { codemodById, codemodsFor } from "../src/upgrade/codemods.js";
import { renameFeaturesDependency, rewriteFeaturesSpecifiers } from "../src/upgrade/rename-features.js";

const ID = "genesis-features-renamed-genesis-config";

function app(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-features-renamed-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}

describe("rewriteFeaturesSpecifiers", () => {
  it("moves the package and every subpath, in every quote style", () => {
    const text = [
      'import { defineFeatures } from "@marktiderman/genesis-features";',
      "import { featureOn } from '@marktiderman/genesis-features/gate';",
      'import { FeatureGate } from "@marktiderman/genesis-features/gate/react";',
      'export * from "@marktiderman/genesis-features/blocks";',
      "const node = await import(`@marktiderman/genesis-features/node`);",
      'vi.mock("@marktiderman/genesis-features/react");',
    ].join("\n");
    expect(rewriteFeaturesSpecifiers(text)).toBe(text.replaceAll("@marktiderman/genesis-features", "@marktiderman/genesis-config"));
  });

  it("leaves other packages and prose alone", () => {
    const text = 'import x from "@marktiderman/genesis-features-extra";\n// see @marktiderman/genesis-features in the docs\n';
    expect(rewriteFeaturesSpecifiers(text)).toBe(text);
  });
});

describe("renameFeaturesDependency", () => {
  it("renames the key in place, with the new range, keeping the indent", () => {
    const raw = `{\n    "name": "app",\n    "dependencies": {\n        "@marktiderman/genesis-core": "^2.0.0",\n        "@marktiderman/genesis-features": "^0.10.0",\n        "zod": "^4.0.0"\n    }\n}\n`;
    const next = renameFeaturesDependency(raw, () => "^0.10.1");
    expect(next).toBe(`{\n    "name": "app",\n    "dependencies": {\n        "@marktiderman/genesis-core": "^2.0.0",\n        "@marktiderman/genesis-config": "^0.10.1",\n        "zod": "^4.0.0"\n    }\n}\n`);
  });

  it("drops the old entry when genesis-config is already there, and keeps workspace ranges", () => {
    const both = JSON.stringify({ devDependencies: { "@marktiderman/genesis-config": "^0.10.1", "@marktiderman/genesis-features": "^0.10.0" } });
    expect(JSON.parse(renameFeaturesDependency(both, () => "x"))).toEqual({ devDependencies: { "@marktiderman/genesis-config": "^0.10.1" } });
    const ws = JSON.stringify({ peerDependencies: { "@marktiderman/genesis-features": "workspace:^" } });
    expect(JSON.parse(renameFeaturesDependency(ws, () => "x"))).toEqual({ peerDependencies: { "@marktiderman/genesis-config": "workspace:^" } });
  });

  it("returns the text unchanged when there's nothing to rename", () => {
    const raw = '{ "dependencies": { "left-pad": "1" } }';
    expect(renameFeaturesDependency(raw, () => "x")).toBe(raw);
  });
});

describe("the genesis-features → genesis-config codemod", () => {
  it("is registered for genesis-features 0.10.0, the first alias release", () => {
    const mod = codemodById(ID)!;
    expect(mod.package).toBe("@marktiderman/genesis-features");
    expect(mod.version).toBe("0.10.0");
    expect(codemodsFor([{ name: "@marktiderman/genesis-features", from: "^0.9.1", to: "^0.10.0" } as never]).map((m) => m.id)).toContain(ID);
    expect(codemodsFor([{ name: "@marktiderman/genesis-features", from: "^0.10.0", to: "^0.11.0" } as never]).map((m) => m.id)).not.toContain(ID);
  });

  it("rewrites an app's imports and package.json, with the installed genesis-config's range", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-features": "^0.10.0" } }, null, 2) + "\n",
      "node_modules/@marktiderman/genesis-config/package.json": JSON.stringify({ name: "@marktiderman/genesis-config", version: "0.10.3" }),
      "node_modules/@marktiderman/genesis-features/package.json": JSON.stringify({ name: "@marktiderman/genesis-features", version: "0.10.0", dependencies: { "@marktiderman/genesis-config": "^0.10.1" } }),
      "features.ts": 'import { defineFeatures } from "@marktiderman/genesis-features";\nexport const features = defineFeatures({});\n',
      "src/gate.tsx": 'import { FeatureGate } from "@marktiderman/genesis-features/gate/react";\n',
      "src/plain.ts": "export const x = 1;\n",
    });
    const logs: string[] = [];
    const changed = await codemodById(ID)!.run({ root, dryRun: false, log: (m) => logs.push(m) });
    expect(changed.sort()).toEqual(["features.ts", "package.json", "src/gate.tsx"]);
    expect(readFileSync(path.join(root, "features.ts"), "utf8")).toContain('from "@marktiderman/genesis-config"');
    expect(readFileSync(path.join(root, "src/gate.tsx"), "utf8")).toContain('from "@marktiderman/genesis-config/gate/react"');
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).dependencies).toEqual({ "@marktiderman/genesis-config": "^0.10.3" });
    expect(logs.join("\n")).toContain("keep their format");
  });

  it("falls back to the alias's own range, and changes nothing in a dry run", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", devDependencies: { "@marktiderman/genesis-features": "0.10.0" } }),
      "node_modules/@marktiderman/genesis-features/package.json": JSON.stringify({ name: "@marktiderman/genesis-features", version: "0.10.0", dependencies: { "@marktiderman/genesis-config": "^0.10.1" } }),
      "packages/web/package.json": JSON.stringify({ name: "web", dependencies: { "@marktiderman/genesis-features": "^0.10.0" } }),
    });
    const dry = await codemodById(ID)!.run({ root, dryRun: true, log: () => {} });
    expect(dry.sort()).toEqual(["package.json", "packages/web/package.json"]);
    expect(readFileSync(path.join(root, "package.json"), "utf8")).toContain("genesis-features");
    await codemodById(ID)!.run({ root, dryRun: false, log: () => {} });
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).devDependencies).toEqual({ "@marktiderman/genesis-config": "^0.10.1" });
    expect(JSON.parse(readFileSync(path.join(root, "packages/web/package.json"), "utf8")).dependencies).toEqual({ "@marktiderman/genesis-config": "^0.10.1" });
  });
});
