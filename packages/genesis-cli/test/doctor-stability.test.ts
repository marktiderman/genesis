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
