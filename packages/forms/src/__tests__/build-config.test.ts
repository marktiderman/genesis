// @feat:forms-destinations
// `pnpm --filter @marktiderman/genesis-forms build` works on a fresh clone: the
// shared runner is bundled from genesis-supabase's source, not its dist
// (which only exists once genesis-supabase has been built). The tests read
// the same source, and the built bundle holds one copy of it and imports
// no Genesis package.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tsup.config";
import vitestConfig from "../../vitest.config";

const RUNNER = "@marktiderman/genesis-supabase/runner";
const SOURCE = /supabase[\\/]src[\\/]runner\.ts$/;
const root = join(__dirname, "../..");
const dist = join(root, "dist");

describe("the forms build", () => {
  it("reads the genesis-supabase runner from source, for the bundle, the types and the tests", () => {
    const options = (Array.isArray(config) ? config[0] : config) as { esbuildOptions?: (o: { alias?: Record<string, string> }) => void };
    const esbuild: { alias?: Record<string, string> } = {};
    options.esbuildOptions?.(esbuild);
    const target = esbuild.alias?.[RUNNER];
    expect(target).toMatch(SOURCE);
    expect(existsSync(target!)).toBe(true);
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { compilerOptions: { paths?: Record<string, string[]> } };
    const mapped = tsconfig.compilerOptions.paths?.[RUNNER]?.[0];
    expect(mapped).toMatch(SOURCE);
    expect(mapped && existsSync(join(root, mapped))).toBe(true);
    const aliases = (vitestConfig as { resolve?: { alias?: Record<string, string> } }).resolve?.alias;
    expect(aliases?.[RUNNER]).toBe(target);
  });

  // CI builds before it tests; a fresh local checkout without dist skips this one.
  it.skipIf(!existsSync(dist))("bundles one copy of the runner and imports no Genesis package, in the JS or the types", () => {
    const files = readdirSync(dist).filter((name) => /\.(c?js|d\.c?ts)$/.test(name));
    expect(files.some((name) => name.endsWith(".d.ts"))).toBe(true);
    expect(files.some((name) => name.endsWith(".d.cts"))).toBe(true);
    for (const name of files) {
      const text = readFileSync(join(dist, name), "utf8");
      // Static imports, require() and inline type imports (`import("…")`, which tsup's dts can emit).
      expect(text, name).not.toMatch(/(from|require\(|import\()\s*["']@marktiderman\/genesis-(notifications|supabase)/);
      if (/^destinations\.c?js$/.test(name)) expect(text.match(/function createRunner\(/g), name).toHaveLength(1);
    }
  });
});
