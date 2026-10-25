import { defineConfig } from "tsup";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { buildCatalog } from "./src/blocks/catalog";
import { PACKED_GITIGNORE, STARTER_EXCLUDE, walk } from "./src/blocks/walk";

/**
 * What the CLI carries with it, so a published CLI works outside the monorepo:
 * dist/genesis-catalog.json (every Genesis package's version and block
 * manifests), dist/templates (templates/eas, maestro, ci) and dist/starter
 * (the files of apps/genesis-rn-starter an app owns), each the version this
 * CLI is released with.
 */
function bundleAssets() {
  writeFileSync("dist/genesis-catalog.json", `${JSON.stringify(buildCatalog(".."), null, 2)}\n`);
  rmSync("dist/templates", { recursive: true, force: true });
  cpSync("../../templates", "dist/templates", { recursive: true });
  const starter = "../../apps/genesis-rn-starter";
  rmSync("dist/starter", { recursive: true, force: true });
  if (existsSync(starter)) {
    for (const rel of walk(starter, STARTER_EXCLUDE)) {
      const to = `dist/starter/${rel.replace(/(^|\/)\.gitignore$/, `$1${PACKED_GITIGNORE}`)}`;
      mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true });
      cpSync(`${starter}/${rel}`, to);
    }
    // The monorepo's pnpm settings (hoisted layout, allowed builds, one React); init drops its workspace list.
    cpSync("../../pnpm-workspace.yaml", "dist/starter/pnpm-workspace.yaml");
  }
  console.log("  assets ✔ catalog, templates, starter");
}

// Two passes: library code (no shebang) + the CLI entry (with shebang).
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      scaffolder: "src/scaffolder.ts",
      doctor: "src/doctor/index.ts",
      vite: "src/vite.ts",
      expo: "src/expo.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    external: ["commander", "postgres", "jiti", /^@marktiderman\//, /^@expo\//, "vite"],
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander", "postgres", "jiti", /^@marktiderman\//, /^@expo\//, "vite"],
    onSuccess: async () => bundleAssets(),
  },
]);
