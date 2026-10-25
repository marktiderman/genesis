// @feat:cli-add
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { accountBlock, tenantFeaturesBlock } from "../../supabase/src/blocks";
import { blocksOfInstalled } from "../src/blocks/discover.js";
import { appPath, readPackageFile } from "../src/blocks/files.js";
import { declarationFields, ManifestError, parseManifest, rawBlocksOf, safeRelative } from "../src/blocks/manifest.js";
import { fakePackage, makeApp, PACKAGES, tempDir } from "./blocks-helpers.js";

const pkgJson = (folder: string) => JSON.parse(readFileSync(path.join(PACKAGES, folder, "package.json"), "utf8")) as Record<string, unknown>;

describe("block manifests", () => {
  it("accepts plain package paths only", () => {
    expect(safeRelative("migrations/0001_x.sql")).toBe("migrations/0001_x.sql");
    for (const bad of ["../x.sql", "migrations/../../x", "/etc/passwd", "a\\b", "a//b", "./a", "~/x", "C:/x", "-rf", ""]) expect(safeRelative(bad), bad).toBeNull();
  });

  it("refuses a manifest that reaches outside its package, names a non-Genesis package, or misnames a migration", () => {
    const bad = (raw: unknown) => {
      try {
        parseManifest("@marktiderman/genesis-fixture", "fixture-notes", raw);
        return [];
      } catch (err) {
        expect(err).toBeInstanceOf(ManifestError);
        return (err as ManifestError).problems;
      }
    };
    expect(bad({ migrations: [{ file: "../../../etc/passwd" }] }).join()).toMatch(/not a plain path/);
    expect(bad({ migrations: [{ package: "left-pad", file: "migrations/0001_x.sql" }] }).join()).toMatch(/Genesis package/);
    expect(bad({ migrations: [{ file: "migrations/x.sql" }] }).join()).toMatch(/NNNN_name\.sql/);
    expect(bad({ functions: [{ dir: "functions/../../x" }] }).join()).toMatch(/not a plain path/);
    expect(bad({ routes: [{ path: "/a/../../b" }] }).join()).toMatch(/path like/);
    expect(bad({ skills: ["skills/x/README.md"] }).join()).toMatch(/SKILL\.md/);
    expect(bad({ requires: ["fixture-notes"] }).join()).toMatch(/can't require itself/);
    expect(bad({ install: ["--registry=evil"] }).join()).toMatch(/package name/);
    expect(() => parseManifest("left-pad", "x", {})).toThrow(/only Genesis packages/);
  });

  it("reads a file only inside its package, even through a symlink", () => {
    const root = tempDir();
    const outside = path.join(root, "secret.txt");
    writeFileSync(outside, "secret");
    const dir = fakePackage(root, "@marktiderman/genesis-fixture", {}, { "migrations/0001_a.sql": "select 1;" });
    symlinkSync(outside, path.join(dir, "migrations", "0002_b.sql"));
    expect(readPackageFile(dir, "migrations/0001_a.sql")).toBe("select 1;");
    expect(() => readPackageFile(dir, "migrations/0002_b.sql")).toThrow(/outside the package/);
    expect(() => readPackageFile(dir, "../secret.txt")).toThrow(/plain path/);
  });

  it("writes only inside the app, never through a symlinked folder", () => {
    const root = makeApp();
    const elsewhere = tempDir();
    symlinkSync(elsewhere, path.join(root, "supabase"), "dir");
    expect(() => appPath(root, "supabase/migrations/x.sql")).toThrow(/outside the app/);
    expect(() => appPath(root, "../x")).toThrow(/plain path/);
    expect(appPath(root, ".eas/workflows/e2e.yml")).toContain(".eas");
  });

  it("genesis-supabase's package.json manifest says what its defineBlock declarations say", () => {
    const raw = rawBlocksOf(pkgJson("supabase"));
    for (const block of [accountBlock, tenantFeaturesBlock]) {
      const fromJson = parseManifest("@marktiderman/genesis-supabase", block.id, raw[block.id]);
      const fromDecl = parseManifest("@marktiderman/genesis-supabase", block.id, declarationFields(block));
      expect(fromJson.migrations, block.id).toEqual(fromDecl.migrations);
      expect(fromJson.requires).toEqual(fromDecl.requires);
      expect(fromJson.platforms).toEqual(fromDecl.platforms);
      expect(fromJson.routes).toEqual(fromDecl.routes);
    }
  });

  it("every workspace manifest is valid and names files its package ships", () => {
    for (const folder of ["supabase", "native"]) {
      const pkg = pkgJson(folder);
      for (const [id, raw] of Object.entries(rawBlocksOf(pkg))) {
        const m = parseManifest(pkg["name"] as string, id, raw);
        const dirOf = (name: string) => path.join(PACKAGES, name.replace("@marktiderman/genesis-", ""));
        for (const mig of m.migrations) {
          expect(readPackageFile(dirOf(mig.package), mig.file), `${id} ${mig.file}`).not.toBeNull();
          if (mig.test) expect(readPackageFile(dirOf(mig.package), mig.test), `${id} ${mig.test}`).not.toBeNull();
        }
        for (const fn of m.functions) expect(readPackageFile(dirOf(fn.package), `${fn.dir}/index.ts`), `${id} ${fn.dir}`).not.toBeNull();
        // Shipped: the folders are in the package's files.
        const files = (pkgJson(dirOf(m.migrations[0]?.package ?? m.package).split("/").pop()!)["files"] as string[]) ?? [];
        if (m.migrations.length) expect(files).toContain("migrations");
      }
    }
  });

  it("an installed package's ./blocks declarations win over its package.json for what both say", async () => {
    const root = makeApp();
    fakePackage(
      root,
      "@marktiderman/genesis-fixture",
      {
        type: "module",
        exports: { "./blocks": "./blocks.mjs" },
        genesis: { blocks: { "fixture-notes": { migrations: [{ file: "migrations/0009_stale.sql" }], steps: ["From package.json."] } } },
      },
      {
        "blocks.mjs": 'export const notes = Object.freeze({ id: "fixture-notes", contributes: { migrations: [{ package: "@marktiderman/genesis-fixture", file: "migrations/0001_fixture_notes.sql" }] } });\n',
      },
    );
    const [manifest] = await blocksOfInstalled(path.join(root, "node_modules/@marktiderman/genesis-fixture"));
    expect(manifest!.migrations).toEqual([{ package: "@marktiderman/genesis-fixture", file: "migrations/0001_fixture_notes.sql" }]);
    expect(manifest!.steps).toEqual(["From package.json."]);
  });
});
