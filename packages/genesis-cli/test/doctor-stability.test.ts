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
  });

  it("finds named imports from Genesis packages, with aliases and type imports", () => {
    const code = `import { Button, OldButton as Legacy } from "@marktiderman/genesis-ui";\nimport type { Fresh } from "@marktiderman/genesis-ui/data";\nimport { x } from "left-pad";\n`;
    expect(genesisNamedImports(code)).toEqual([
      { pkg: "@marktiderman/genesis-ui", names: ["Button", "OldButton"], line: 1 },
      { pkg: "@marktiderman/genesis-ui", names: ["Fresh"], line: 2 },
    ]);
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
  });
});
