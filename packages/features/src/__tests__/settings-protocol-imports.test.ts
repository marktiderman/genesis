// @feat:settings-screen
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every module `entry` reaches through relative imports, with the bare specifiers each imports. */
function graph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    const bare: string[] = [];
    seen.set(file, bare);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const spec = (m[1] ?? m[2])!;
      if (spec.startsWith(".")) {
        const base = path.resolve(path.dirname(file), spec);
        visit([`${base}.ts`, `${base}.tsx`].find((f) => { try { readFileSync(f); return true; } catch { return false; } })!);
      } else bare.push(spec);
    }
  };
  visit(path.join(SRC, entry));
  return seen;
}

describe("/settings-protocol stays light", () => {
  it("reaches no zod, React, DOM library or Node built-in, through any import", () => {
    const modules = graph("settings-protocol.ts");
    expect([...modules.keys()].map((f) => path.basename(f)).sort()).toContain("settings.ts");
    for (const [file, specs] of modules) {
      for (const spec of specs) {
        expect(spec, `${path.basename(file)} imports ${spec}`).not.toMatch(/^(?:zod|react|react-dom|lucide-react|@marktiderman\/genesis-ui|node:)/);
      }
    }
  });
});
