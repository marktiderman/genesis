import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { codemodById, codemodInstallNote, codemodsFor } from "../src/upgrade/codemods.js";
import { runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
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

  it("moves a name escaped in a regular expression, anchored in a mapper key, or in a declare module", () => {
    expect(rewriteFeaturesSpecifiers("exclude: [/@marktiderman\\/genesis-features/]")).toBe("exclude: [/@marktiderman\\/genesis-config/]");
    expect(rewriteFeaturesSpecifiers('{ "^@marktiderman/genesis-features(.*)$": "<rootDir>/x$1" }')).toBe('{ "^@marktiderman/genesis-config(.*)$": "<rootDir>/x$1" }');
    expect(rewriteFeaturesSpecifiers('declare module "@marktiderman/genesis-features/gate" {}')).toBe('declare module "@marktiderman/genesis-config/gate" {}');
  });

  it("leaves other packages and exact pins of the old one alone", () => {
    const text = "import x from \"@marktiderman/genesis-features-extra\";\n- '@marktiderman/genesis-features@0.10.0'\n";
    expect(rewriteFeaturesSpecifiers(text)).toBe(text);
  });
});

describe("renameFeaturesDependency", () => {
  it("renames the key in place, with the new range, keeping the indent", () => {
    const raw = `{\n    "name": "app",\n    "dependencies": {\n        "@marktiderman/genesis-core": "^2.0.0",\n        "@marktiderman/genesis-features": "^0.10.0",\n        "zod": "^4.0.0"\n    }\n}\n`;
    const next = renameFeaturesDependency(raw, () => "^0.10.1");
    expect(next).toBe(`{\n    "name": "app",\n    "dependencies": {\n        "@marktiderman/genesis-core": "^2.0.0",\n        "@marktiderman/genesis-config": "^0.10.1",\n        "zod": "^4.0.0"\n    }\n}\n`);
  });

  it("drops the old entry when genesis-config is already in any dependency field, and keeps workspace ranges", () => {
    const both = JSON.stringify({ devDependencies: { "@marktiderman/genesis-config": "^0.10.1", "@marktiderman/genesis-features": "^0.10.0" } });
    expect(JSON.parse(renameFeaturesDependency(both, () => "x"))).toEqual({ devDependencies: { "@marktiderman/genesis-config": "^0.10.1" } });
    const across = JSON.stringify({ dependencies: { "@marktiderman/genesis-features": "^0.10.0" }, devDependencies: { "@marktiderman/genesis-config": "^0.10.1" } });
    expect(JSON.parse(renameFeaturesDependency(across, () => "x"))).toEqual({ dependencies: {}, devDependencies: { "@marktiderman/genesis-config": "^0.10.1" } });
    const ws = JSON.stringify({ peerDependencies: { "@marktiderman/genesis-features": "workspace:^" } });
    expect(JSON.parse(renameFeaturesDependency(ws, () => "x"))).toEqual({ peerDependencies: { "@marktiderman/genesis-config": "workspace:^" } });
  });

  it("renames overrides, pnpm.overrides and resolutions keys, moving their values to genesis-config's range", () => {
    const raw = JSON.stringify({
      overrides: { "@marktiderman/genesis-features": "0.11.0" },
      pnpm: { overrides: { "@marktiderman/genesis-features@<0.10": "^0.11.0", other: "1.0.0" } },
      resolutions: { "**/@marktiderman/genesis-features": "0.11.0", "@marktiderman/genesis-features-extra": "1", linked: "link:../x" },
    });
    expect(JSON.parse(renameFeaturesDependency(raw, () => "^0.13.0"))).toEqual({
      overrides: { "@marktiderman/genesis-config": "0.13.0" },
      pnpm: { overrides: { "@marktiderman/genesis-config@<0.10": "^0.13.0", other: "1.0.0" } },
      resolutions: { "**/@marktiderman/genesis-config": "0.13.0", "@marktiderman/genesis-features-extra": "1", linked: "link:../x" },
    });
  });

  it("never leaves an override pinning genesis-config to an alias version", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-features": "^0.11.0" }, pnpm: { overrides: { "@marktiderman/genesis-features": "0.11.0" } } }),
      "pnpm-workspace.yaml": "catalog:\n  \"@marktiderman/genesis-features\": ^0.11.0 # shared\noverrides:\n  '@marktiderman/genesis-features': 0.11.0\n",
    });
    await codemodById(ID)!.run({ root, dryRun: false, log: () => {}, wanted: (name) => (name === "@marktiderman/genesis-config" ? "0.13.0" : null) });
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.dependencies).toEqual({ "@marktiderman/genesis-config": "^0.13.0" });
    expect(pkg.pnpm.overrides).toEqual({ "@marktiderman/genesis-config": "0.13.0" });
    expect(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")).toBe("catalog:\n  \"@marktiderman/genesis-config\": ^0.13.0 # shared\noverrides:\n  '@marktiderman/genesis-config': 0.13.0\n");
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

  it("rewrites tsconfig paths and pnpm-workspace.yaml overrides, keeps exact pins, and lists what's left", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-features": "^0.10.0" } }),
      "tsconfig.json": '{\n  // paths\n  "compilerOptions": { "paths": { "@marktiderman/genesis-features/*": ["./x/*"] } }\n}\n',
      "pnpm-workspace.yaml": "overrides:\n  '@marktiderman/genesis-features': 0.10.0\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.10.0'\n",
      "README.md": "Install `@marktiderman/genesis-features`.\n",
    });
    const logs: string[] = [];
    const changed = await codemodById(ID)!.run({ root, dryRun: false, log: (m) => logs.push(m), wanted: () => "0.11.2" });
    expect(changed.sort()).toEqual(["package.json", "pnpm-workspace.yaml", "tsconfig.json"]);
    expect(readFileSync(path.join(root, "tsconfig.json"), "utf8")).toContain('"@marktiderman/genesis-config/*"');
    expect(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")).toBe("overrides:\n  '@marktiderman/genesis-config': 0.11.2\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.10.0'\n");
    expect(logs.join("\n")).toMatch(/check by hand:\n {4}- \[ \] pnpm-workspace\.yaml\n {4}- \[ \] README\.md/);
  });

  it("says to install after editing a workspace package's package.json", () => {
    expect(codemodInstallNote("/nowhere", ["packages/web/package.json"], false)).toMatch(/Not installed yet/);
    expect(codemodInstallNote("/nowhere", ["src/a.ts"], false)).toBeNull();
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

describe("genesis upgrade moves an app off genesis-features", () => {
  const lookup = (packages: Record<string, string>): ReleaseLookup => ({ release: () => ({ version: "2.0.0", packages }), latest: () => null });

  it("with nothing of the new release installed yet, writes the release's genesis-config range", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-features": "^0.9.1" } }, null, 2) + "\n",
      // What an app on 0.9.1 has installed: the old package, which doesn't depend on genesis-config.
      "node_modules/@marktiderman/genesis-features/package.json": JSON.stringify({ name: "@marktiderman/genesis-features", version: "0.9.1", dependencies: { zod: "^4.0.0" } }),
      "src/gate.ts": 'import { featureOn } from "@marktiderman/genesis-features/gate";\n',
    });
    const report = await runUpgrade({ root, lookup: lookup({ "@marktiderman/genesis-features": "0.11.0", "@marktiderman/genesis-config": "0.11.2" }), install: false, doctor: false });
    expect(report.codemods.map((c) => c.id)).toContain(ID);
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).dependencies).toEqual({ "@marktiderman/genesis-config": "^0.11.2" });
    expect(readFileSync(path.join(root, "src/gate.ts"), "utf8")).toBe('import { featureOn } from "@marktiderman/genesis-config/gate";\n');
  });

  it("runs for an app already on the alias, though the release crosses no version", async () => {
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-features": "^0.11.0" } }, null, 2) + "\n",
      "node_modules/@marktiderman/genesis-features/package.json": JSON.stringify({ name: "@marktiderman/genesis-features", version: "0.11.0", dependencies: { "@marktiderman/genesis-config": "^0.11.2" } }),
      "src/a.ts": 'import { defineBlock } from "@marktiderman/genesis-features/blocks";\n',
    });
    const report = await runUpgrade({ root, lookup: lookup({ "@marktiderman/genesis-features": "0.11.0", "@marktiderman/genesis-config": "0.11.2" }), install: false, doctor: false });
    expect(report.codemods.map((c) => c.id)).toEqual([ID]);
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).dependencies).toEqual({ "@marktiderman/genesis-config": "^0.11.2" });
    expect(readFileSync(path.join(root, "src/a.ts"), "utf8")).toContain("@marktiderman/genesis-config/blocks");
  });
});
