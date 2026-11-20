/** @feat:settings-core */
/**
 * The CommonJS build (`require` condition), as Expo's config plugin and other CJS consumers load it.
 * Reads dist/, so it needs `pnpm build` first, as the repo's other built-output tests do; it fails
 * rather than skips without it.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(__dirname, "..", "..");
const require = createRequire(join(pkgDir, "package.json"));

describe("the CommonJS build", () => {
  it("is built", () => {
    expect(existsSync(join(pkgDir, "dist", "index.cjs")), "run pnpm build first").toBe(true);
  });

  it("shares one class across entries, so instanceof holds between them", () => {
    const root = require("@marktiderman/genesis-config") as Record<string, unknown>;
    const gate = require("@marktiderman/genesis-config/gate") as Record<string, unknown>;
    const settings = require("@marktiderman/genesis-config/settings") as Record<string, unknown>;
    expect(typeof root.FeatureOff).toBe("function");
    expect(root.FeatureOff).toBe(gate.FeatureOff);
    expect(typeof root.SettingsError).toBe("function");
    expect(root.SettingsError).toBe(settings.SettingsError);
    const SettingsError = settings.SettingsError as new (m: string) => Error;
    expect(new SettingsError("x")).toBeInstanceOf(root.SettingsError as typeof Error);
  });

  it("gives a node10 CommonJS consumer the CommonJS types: main's, and each subpath's", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
      main: string;
      types: string;
      typesVersions: { "*": Record<string, string[]> };
      exports: Record<string, unknown>;
    };
    expect(pkg.main).toBe("./dist/index.cjs");
    expect(pkg.types).toBe("./dist/index.d.cts");
    const subpaths = Object.keys(pkg.exports).filter((k) => k !== "." && k !== "./package.json").map((k) => k.slice(2));
    expect(Object.keys(pkg.typesVersions["*"]).sort()).toEqual(subpaths.sort());
    for (const [sub, [file]] of Object.entries(pkg.typesVersions["*"])) {
      const conditions = pkg.exports[`./${sub}`] as { require?: { types: string }; types?: string };
      expect(file, sub).toBe(conditions.require?.types ?? conditions.types);
      expect(existsSync(join(pkgDir, file!)), file).toBe(true);
    }
  });
});
