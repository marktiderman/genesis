// @feat:stability-tags
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { genesisNamedImports, stabilityTagsIn } from "../src/doctor/stability.js";

describe("stability tags", () => {
  it("reads top-level declarations' tags, not members'", () => {
    const dts = `/**
 * Old button.
 * @deprecated Use \`Button\`.
 */
declare function OldButton(): void;
/** @stability Beta */
declare const Fresh: number;
/** @stability Stable */
export interface Settled {
  /** @deprecated a prop */
  old?: string;
}
declare function Untagged(): void;
`;
    const tags = stabilityTagsIn(dts);
    expect(tags.get("OldButton")).toEqual({ stability: "deprecated", note: "Use `Button`." });
    expect(tags.get("Fresh")).toEqual({ stability: "beta" });
    expect(tags.get("Settled")).toEqual({ stability: "stable" });
    expect(tags.has("old")).toBe(false);
    expect(tags.has("Untagged")).toBe(false);
    const prose = stabilityTagsIn("/**\n * See the `@deprecated` block below.\n * @stability Beta\n */\ndeclare function Empty(): void;\n");
    expect(prose.get("Empty")).toEqual({ stability: "beta" });
    const long = stabilityTagsIn("/**\n * @deprecated Import `X` from `@marktiderman/genesis-ui/layout`\n *   instead.\n * @see docs\n */\ndeclare const X: number;\n");
    expect(long.get("X")?.note).toBe("Import `X` from `@marktiderman/genesis-ui/layout` instead.");
  });

  it("finds named imports from Genesis packages, with aliases and type imports", () => {
    const code = `import { Button, OldButton as Legacy } from "@marktiderman/genesis-ui";\nimport type { Fresh } from "@marktiderman/genesis-ui/data";\nimport { x } from "left-pad";\n`;
    expect(genesisNamedImports(code)).toEqual([
      { pkg: "@marktiderman/genesis-ui", specifier: "@marktiderman/genesis-ui", names: ["Button", "OldButton"], line: 1 },
      { pkg: "@marktiderman/genesis-ui", specifier: "@marktiderman/genesis-ui/data", names: ["Fresh"], line: 2 },
    ]);
  });

  it("reads tags on named re-exports, by the exported name", () => {
    const dts = `/** @deprecated Use \`New\`. */\nexport { Old } from "./old";\n/** @stability Beta */\nexport type { A, B as Bee } from "./ab";\nexport { Plain } from "./plain";\n`;
    const tags = stabilityTagsIn(dts);
    expect(tags.get("Old")).toEqual({ stability: "deprecated", note: "Use `New`." });
    expect(tags.get("A")).toEqual({ stability: "beta" });
    expect(tags.get("Bee")).toEqual({ stability: "beta" });
    expect(tags.has("B")).toBe(false);
    expect(tags.has("Plain")).toBe(false);
  });

  it("ignores import examples inside strings and comments", () => {
    const code = [
      'const example = "import { OldList } from \'@marktiderman/genesis-ui\'";',
      "const doc = `import { OldList } from \"@marktiderman/genesis-ui\"`;",
      '// import { OldList } from "@marktiderman/genesis-ui";',
      'import { Button } from "@marktiderman/genesis-ui";',
    ].join("\n");
    expect(genesisNamedImports(code)).toEqual([{ pkg: "@marktiderman/genesis-ui", specifier: "@marktiderman/genesis-ui", names: ["Button"], line: 4 }]);
  });

  it("finds the tags genesis-ui actually publishes", () => {
    const dist = path.resolve(__dirname, "../../ui/dist");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const full = path.join(d, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (f.endsWith(".d.ts")) files.push(full);
      }
    };
    walk(dist);
    const kinds = new Set(files.flatMap((f) => [...stabilityTagsIn(readFileSync(f, "utf8")).values()].map((t) => t.stability)));
    expect(kinds.has("beta")).toBe(true);
  });
});

describe("checkStabilityImports", () => {
  it("warns on a deprecated import and notes a beta one, from the installed package's declarations", async () => {
    const { checkStabilityImports } = await import("../src/doctor/stability.js");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(path.join(tmpdir(), "genesis-stability-"));
    const pkg = path.join(root, "node_modules/@marktiderman/genesis-widgets");
    mkdirSync(path.join(pkg, "dist"), { recursive: true });
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0" }));
    writeFileSync(path.join(pkg, "dist/index.d.ts"), "/** @deprecated Use `NewList`. */\ndeclare function OldList(): void;\n/** @stability Beta */\ndeclare function NewList(): void;\n");
    const findings: Array<{ rule: string; level?: string; message: string }> = [];
    checkStabilityImports({
      root,
      files: [{ path: "src/a.tsx", ext: ".tsx", code: 'import { OldList, NewList, Plain } from "@marktiderman/genesis-widgets";\n' }],
      report: (f: { rule: string; level?: string; message: string }) => findings.push(f),
    } as never);
    expect(findings).toEqual([
      expect.objectContaining({ rule: "deprecated-import", level: "warn", message: "OldList from @marktiderman/genesis-widgets is deprecated and goes at the next major: Use `NewList`." }),
      expect.objectContaining({ rule: "beta-import", level: "info" }),
    ]);

    // A deprecated alias on one subpath doesn't mark the real declaration on another.
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0", exports: { "./data": { types: "./dist/data.d.ts" }, "./layout": { types: "./dist/layout.d.ts" } } }));
    writeFileSync(path.join(pkg, "dist/data.d.ts"), "/** @deprecated Import `Shell` from `/layout`. */\ndeclare const Shell: number;\n");
    writeFileSync(path.join(pkg, "dist/shell-chunk.d.ts"), "declare function Shell(): void;\n");
    writeFileSync(path.join(pkg, "dist/layout.d.ts"), "export { Shell } from './shell-chunk';\n");
    const second: Array<{ rule: string }> = [];
    checkStabilityImports({
      root,
      files: [
        { path: "src/b.tsx", ext: ".tsx", code: 'import { Shell } from "@marktiderman/genesis-widgets/layout";\n' },
        { path: "src/c.tsx", ext: ".tsx", code: 'import { Shell } from "@marktiderman/genesis-widgets/data";\n' },
      ],
      report: (f: { rule: string }) => second.push(f),
    } as never);
    expect(second.map((f) => f.rule)).toEqual(["deprecated-import"]);

    // A tag on a named re-export marks the name, though its source declaration has none.
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0", exports: { ".": { types: "./dist/index.d.ts" } } }));
    writeFileSync(path.join(pkg, "dist/old.d.ts"), "declare function Old(): void;\n");
    writeFileSync(path.join(pkg, "dist/index.d.ts"), "/** @deprecated Use `New`. */\nexport { Old } from './old';\n");
    const third: Array<{ rule: string; subject?: string; message: string }> = [];
    checkStabilityImports({
      root,
      files: [{ path: "src/d.tsx", ext: ".tsx", code: 'import { Old } from "@marktiderman/genesis-widgets";\n' }],
      report: (f: { rule: string; subject?: string; message: string }) => third.push(f),
    } as never);
    expect(third).toEqual([expect.objectContaining({ rule: "deprecated-import", subject: "Old", message: "Old from @marktiderman/genesis-widgets is deprecated and goes at the next major: Use `New`." })]);
  });
});

describe("deprecated-import under --base", () => {
  it("ratchets by default: warns in changed files, info in untouched ones", async () => {
    const { runDoctor } = await import("../src/doctor/index.js");
    const { makeApp } = await import("./doctor-helpers.js");
    const root = makeApp(null, {
      "package.json": JSON.stringify({ name: "app", dependencies: { "@marktiderman/genesis-widgets": "1.0.0" } }),
      "node_modules/@marktiderman/genesis-widgets/package.json": JSON.stringify({ name: "@marktiderman/genesis-widgets", version: "1.0.0" }),
      "node_modules/@marktiderman/genesis-widgets/dist/index.d.ts": "/** @deprecated Use `NewList`. */\ndeclare function OldList(): void;\n",
      "src/changed.tsx": 'import { OldList } from "@marktiderman/genesis-widgets";\nexport const A = OldList;\n',
      "src/untouched.tsx": 'import { OldList } from "@marktiderman/genesis-widgets";\nexport const B = OldList;\n',
    });
    const result = await runDoctor({ root, config: {}, base: "origin/main", changedFiles: ["src/changed.tsx"] });
    const levels = result.findings.filter((f) => f.rule === "deprecated-import").map((f) => `${f.level} ${f.file}`).sort();
    expect(levels).toEqual(["info src/untouched.tsx", "warn src/changed.tsx"]);
  });
});

describe("deprecated-import for a whole package", () => {
  const run = async (root: string, code: string) => {
    const { checkStabilityImports } = await import("../src/doctor/stability.js");
    const findings: Array<{ rule: string; level?: string; subject?: string; line?: number; message: string }> = [];
    checkStabilityImports({ root, files: [{ path: "src/a.tsx", ext: ".tsx", code }], report: (f: never) => findings.push(f) } as never);
    return findings;
  };

  it("finds every kind of import of a Genesis package", async () => {
    const { genesisImportSpecifiers } = await import("../src/doctor/stability.js");
    const code = [
      'import { a } from "@marktiderman/genesis-features";',
      'import * as g from "@marktiderman/genesis-features/gate";',
      'import "@marktiderman/genesis-features/react";',
      'export { b } from "@marktiderman/genesis-features/blocks";',
      'const n = await import("@marktiderman/genesis-features/node");',
      'const r = require("@marktiderman/genesis-ui");',
      'const s = "import x from \'@marktiderman/genesis-features\'";',
    ].join("\n");
    expect(genesisImportSpecifiers(code).map((i) => `${i.line} ${i.specifier}`)).toEqual([
      "1 @marktiderman/genesis-features",
      "2 @marktiderman/genesis-features/gate",
      "3 @marktiderman/genesis-features/react",
      "4 @marktiderman/genesis-features/blocks",
      "5 @marktiderman/genesis-features/node",
      "6 @marktiderman/genesis-ui",
    ]);
  });

  it("flags genesis-features, renamed to genesis-config, once per import, even when it isn't installed", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(path.join(tmpdir(), "genesis-renamed-"));
    const findings = await run(root, 'import { featureOn, gateSnapshot } from "@marktiderman/genesis-features/gate";\nimport type { BlockDef } from "@marktiderman/genesis-config/blocks";\n');
    expect(findings).toEqual([
      expect.objectContaining({ rule: "deprecated-import", level: "warn", line: 1, subject: "@marktiderman/genesis-features/gate", message: expect.stringContaining("renamed to @marktiderman/genesis-config") }),
    ]);
  });

  it("reads npm's deprecated notice from an installed package", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(path.join(tmpdir(), "genesis-deprecated-pkg-"));
    const pkg = path.join(root, "node_modules/@marktiderman/genesis-features");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@marktiderman/genesis-features", version: "0.10.0", deprecated: "Renamed to @marktiderman/genesis-config." }));
    const findings = await run(root, 'import { defineFeatures } from "@marktiderman/genesis-features";\n');
    expect(findings).toEqual([expect.objectContaining({ rule: "deprecated-import", message: "@marktiderman/genesis-features is deprecated: Renamed to @marktiderman/genesis-config." })]);
  });
});
