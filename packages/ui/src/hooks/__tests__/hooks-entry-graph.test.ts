/**
 * The `/hooks` entry stays free of page markup: importing `useResourceTable`
 * (or any hook) must not load ResourcePage.tsx and the components it renders.
 * Walks the value imports (not `import type`) from `src/hooks/index.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Relative modules reachable through value imports and re-exports. */
function valueGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  // `import x from "./a"`, `import { a, type B } from "./a"`, `export { a } from "./a"`,
  // `export * from "./a"`, `import "./a"`; skips `import type` / `export type`.
  const pattern = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["'](\.[^"']+)["']/gm;
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      // `import { type A, type B } from` brings in nothing at runtime.
      const clause = match[0].match(/\{([^}]*)\}/)?.[1];
      if (clause && clause.split(",").every((part) => !part.trim() || /^type\s/.test(part.trim()))) continue;
      const target = resolveImport(file, match[1]!);
      if (target) queue.push(target);
    }
  }
  return seen;
}

describe("the /hooks entry", () => {
  it("does not load ResourcePage or its markup", () => {
    const graph = [...valueGraph(resolve(SRC, "hooks/index.ts"))].map((f) => f.slice(SRC.length + 1));
    expect(graph).toContain("components/data/use-resource-table.ts");
    for (const markup of ["components/data/ResourcePage.tsx", "components/data/DataPageShell.tsx", "components/data/ConfirmDeleteDialog.tsx"]) {
      expect(graph).not.toContain(markup);
    }
  });
});
