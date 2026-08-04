/**
 * Guards the `/data` -> `/layout` deprecation aliases for `AppShell` and
 * `PageHeader`.
 *
 * WHY THIS TEST EXISTS
 *
 * A deprecation whose only job is to be READ by a consumer is worthless if the
 * consumer's editor never shows it, and nothing else in this repo would notice.
 * TypeScript does NOT propagate a JSDoc `@deprecated` written above an
 * `export { X } from "./y"` statement to the symbol an importer sees: hovering
 * the import yields no tag and no migration note. Only a local re-binding
 * (`const AppShell = AppShellImpl`) carries it through.
 *
 * So `data/index.ts` uses local bindings on purpose. That is easy to "tidy"
 * back into a re-export later — the source still LOOKS annotated either way,
 * the build stays green, and the deprecation silently stops working. This test
 * asserts the property that actually matters, against the REAL emitted
 * declarations in `dist/`, using the same language service an editor runs.
 *
 * Requires a build (`pnpm --filter @marktiderman/genesis-ui build`). Skips
 * with a clear message when `dist/` is absent so a bare `vitest run` in a
 * clean tree does not fail for an unrelated reason.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const dataDts = join(pkgRoot, "dist/components/data/index.d.ts");
const hasBuild = existsSync(dataDts);

const describeBuilt = hasBuild ? describe : describe.skip;

if (!hasBuild) {
  console.warn(
    `[deprecated-aliases] dist/ not built — skipping. Run: pnpm --filter @marktiderman/genesis-ui build`,
  );
}

/**
 * Ask the TypeScript language service what a CONSUMER sees when it imports
 * `name` from the built `/data` declarations — exactly what an editor hover
 * would show.
 */
function consumerTagsFor(name: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "genesis-deprecation-"));
  const consumer = join(dir, "consumer.ts");
  // Reference the IMPORTED symbol directly. Aliasing it through a local
  // (`declare const probe: typeof X`) would report the local's own empty
  // JSDoc and pass/fail for the wrong reason.
  const source = [
    `import { ${name} } from ${JSON.stringify(dataDts.replace(/\.d\.ts$/, ""))};`,
    `void ${name};`,
  ].join("\n");
  writeFileSync(consumer, source);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [consumer],
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) =>
      existsSync(f)
        ? ts.ScriptSnapshot.fromString(readFileSync(f, "utf8"))
        : undefined,
    getCurrentDirectory: () => dir,
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noResolve: false,
    }),
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host);
  // Probe the *use* site, which is where an editor reports deprecation.
  const offset = source.lastIndexOf(`void ${name};`) + "void ".length;
  const info = service.getQuickInfoAtPosition(consumer, offset + 1);
  return (info?.tags ?? []).map((t) => t.name);
}

// Spinning up a TypeScript language service and importing the whole built
// `/data` barrel are both far slower than a render test. Under `pnpm test`,
// where every package's suite runs at once, they comfortably exceed vitest's
// 5s default and fail for load rather than for cause — so each gets an
// explicit, generous budget.
const SLOW = 60_000;

describeBuilt("deprecated /data aliases", () => {
  for (const name of ["AppShell", "PageHeader"] as const) {
    it(
      `surfaces @deprecated to a consumer importing ${name} from /data`,
      () => {
        expect(consumerTagsFor(name)).toContain("deprecated");
      },
      SLOW,
    );

    it(`keeps a migration note pointing at /layout for ${name}`, () => {
      const dts = readFileSync(dataDts, "utf8");
      // The note has to survive into the shipped declarations, not just live
      // in src/. Matching the emitted text keeps the pointer honest.
      const block = dts.slice(0, dts.indexOf(`${name}:`) + 1);
      expect(block).toContain("@marktiderman/genesis-ui/layout");
      expect(dts).toMatch(new RegExp(`@deprecated[\\s\\S]{0,400}?${name}`));
    });
  }

  it(
    "still exports both aliases as values from /data",
    async () => {
      const mod = await import(
        /* @vite-ignore */ join(pkgRoot, "dist/components/data/index.js")
      );
      expect(typeof mod.AppShell).toBe("function");
      expect(typeof mod.PageHeader).toBe("function");
    },
    SLOW,
  );
});
