/**
 * Guards two properties of the BUILT declarations that no source-level check
 * can see:
 *
 * 1. The root entry's types carry the promoted schema model themselves. The
 *    switchboard imports it from genesis-core's source by relative path (see
 *    src/core-schema.ts) precisely so tsup inlines it; a "tidy" switch to the
 *    package name would leave `@marktiderman/genesis-core/schema` in the
 *    .d.ts and break consumers that never installed the optional peer.
 * 2. The old names stay deprecated aliases in the emitted declarations.
 *
 * Requires a build (`pnpm --filter @marktiderman/genesis-switchboard build`).
 * Skips with a message when `dist/` is absent.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const hasBuild = existsSync(join(dist, "index.d.ts"));
const describeBuilt = hasBuild ? describe : describe.skip;

if (!hasBuild) {
  console.warn("[published-types] dist/ not built — skipping. Run: pnpm --filter @marktiderman/genesis-switchboard build");
}

describeBuilt("published declarations", () => {
  // `data-provider` is the one subpath that deliberately references
  // genesis-core (its `DataProvider` type) — see src/index.ts.
  const declarationFiles = hasBuild
    ? readdirSync(dist).filter((f) => /\.d\.c?ts$/.test(f) && !f.startsWith("data-provider."))
    : [];

  it("never reference genesis-core outside the data-provider subpath", () => {
    expect(declarationFiles.length).toBeGreaterThan(0);
    for (const file of declarationFiles) {
      const text = readFileSync(join(dist, file), "utf8");
      // A module specifier, not prose: the deprecation notes NAME the package.
      expect(text, file).not.toMatch(/(?:from|import\()\s*["']@marktiderman\/genesis-core|core\/src\//);
    }
  });

  it("keep the old schema names as deprecated aliases", () => {
    const all = declarationFiles.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
    for (const name of ["FieldType", "FieldSchema", "DataRow", "ResourceContract"]) {
      const pattern = new RegExp(`@deprecated(?:(?!\\*/)[\\s\\S])*\\*/\\s*type ${name}\\b`);
      expect(all, name).toMatch(pattern);
    }
  });
});
