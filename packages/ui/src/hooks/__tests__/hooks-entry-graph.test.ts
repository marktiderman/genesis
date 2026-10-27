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

/**
 * True when a statement brings in nothing at runtime: `import { type A, type B } from`.
 * A default or namespace import beside the braces (`import RP, { type X } from`) is a value.
 */
export function isTypeOnly(statement: string): boolean {
  const head = statement.replace(/\s+from\s+["'][^"']+["']\s*$/, "").replace(/^\s*(?:import|export)\s+/, "");
  const braces = head.match(/\{([^}]*)\}/);
  if (!braces) return false;
  const outside = head.replace(braces[0], "").replace(/,/g, "").trim();
  if (outside) return false;
  return braces[1]!.split(",").every((part) => !part.trim() || /^type\s/.test(part.trim()));
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
      if (isTypeOnly(match[0])) continue;
      const target = resolveImport(file, match[1]!);
      if (target) queue.push(target);
    }
  }
  return seen;
}

describe("isTypeOnly", () => {
  it("treats only all-type braces as type-only", () => {
    expect(isTypeOnly('import { type A, type B } from "./x"')).toBe(true);
    expect(isTypeOnly('import { type A, b } from "./x"')).toBe(false);
    expect(isTypeOnly('import RP, { type X } from "./ResourcePage"')).toBe(false);
    expect(isTypeOnly('import * as RP from "./ResourcePage"')).toBe(false);
    expect(isTypeOnly('export { type A } from "./x"')).toBe(true);
    expect(isTypeOnly('export * from "./x"')).toBe(false);
  });
});

describe("the /hooks entry", () => {
  it("does not load ResourcePage or its markup", () => {
    const graph = [...valueGraph(resolve(SRC, "hooks/index.ts"))].map((f) => f.slice(SRC.length + 1));
    expect(graph).toContain("components/data/use-resource-table.ts");
    for (const markup of ["components/data/ResourcePage.tsx", "components/data/DataPageShell.tsx", "components/data/ConfirmDeleteDialog.tsx"]) {
      expect(graph).not.toContain(markup);
    }
  });
});
